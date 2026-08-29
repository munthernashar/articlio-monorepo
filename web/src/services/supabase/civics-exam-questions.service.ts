import { supabaseClient } from '@/services/supabase/client';
import type { CefrBand } from '@/services/supabase/session-analysis.service';

export type CivicsQuestionScope = 'general' | 'bundesland';
export type CivicsAnswerOption = 'a' | 'b' | 'c' | 'd';

export type CivicsExamQuestion = {
  id: string;
  externalNumber: string;
  scope: CivicsQuestionScope;
  bundesland: string | null;
  topicCategory: string | null;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: CivicsAnswerOption;
  sourceCitation: string;
};

export type CivicsPracticeAttemptInput = {
  userId: string;
  questionId: string;
  sessionId: string | null;
  isFactuallyCorrect: boolean;
  factualFeedback: string;
  languageQualityScore: number;
  languageCefrBand: CefrBand;
  languageJustification: string;
};

export type CivicsTopicCoverage = {
  coveredTopics: number;
  totalTopics: number;
};

export type CivicsPracticeAttemptResult = {
  id: string;
  isFactuallyCorrect: boolean;
  factualFeedback: string;
  languageQualityScore: number;
  languageCefrBand: CefrBand;
  languageJustification: string;
  createdAt: string;
  question: {
    externalNumber: string;
    questionText: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctOption: CivicsAnswerOption;
    topicCategory: string | null;
  };
};

type CivicsExamQuestionRow = {
  id: string;
  external_number: string;
  scope: string;
  bundesland: string | null;
  topic_category: string | null;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  source_citation: string;
};

function isCivicsAnswerOption(value: string): value is CivicsAnswerOption {
  return value === 'a' || value === 'b' || value === 'c' || value === 'd';
}

function isCivicsQuestionScope(value: string): value is CivicsQuestionScope {
  return value === 'general' || value === 'bundesland';
}

function mapRow(row: CivicsExamQuestionRow): CivicsExamQuestion | null {
  if (!isCivicsQuestionScope(row.scope) || !isCivicsAnswerOption(row.correct_option)) {
    return null;
  }

  return {
    id: row.id,
    externalNumber: row.external_number,
    scope: row.scope,
    bundesland: row.bundesland,
    topicCategory: row.topic_category,
    questionText: row.question_text,
    optionA: row.option_a,
    optionB: row.option_b,
    optionC: row.option_c,
    optionD: row.option_d,
    correctOption: row.correct_option,
    sourceCitation: row.source_citation,
  };
}

export function getCorrectAnswerText(question: CivicsExamQuestion): string {
  switch (question.correctOption) {
    case 'a':
      return question.optionA;
    case 'b':
      return question.optionB;
    case 'c':
      return question.optionC;
    case 'd':
      return question.optionD;
    default:
      return question.optionA;
  }
}

// Minimaler getypter Client für die beiden neuen Tabellen -- civics_exam_questions
// und civics_practice_attempts sind (wie billing_plan_catalog/learning_goal_catalog)
// nicht im generierten Database-Typ enthalten, gleiches Cast-Muster wie
// learning-goal-catalog.service.ts.
type CivicsQuestionRowsResult = Promise<{
  data: CivicsExamQuestionRow[] | null;
  error: { message: string } | null;
}>;

type CivicsClient = {
  from: (table: 'civics_exam_questions') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: boolean,
      ) => {
        or: (filter: string) => CivicsQuestionRowsResult & {
          order: (column: string, options: { ascending: boolean }) => CivicsQuestionRowsResult;
        };
      };
    };
  };
};

type CivicsAttemptsClient = {
  from: (table: 'civics_practice_attempts') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{
        data: Array<{ question_id: string; is_factually_correct: boolean | null; civics_exam_questions: { topic_category: string | null } | null }> | null;
        error: { message: string } | null;
      }>;
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  };
};

type CivicsAttemptWithQuestionRow = {
  id: string;
  is_factually_correct: boolean;
  factual_feedback: string;
  language_quality_score: number;
  language_cefr_band: string;
  language_justification: string;
  created_at: string;
  civics_exam_questions: {
    external_number: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: string;
    topic_category: string | null;
  } | null;
};

type CivicsAttemptForSessionClient = {
  from: (table: 'civics_practice_attempts') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => {
              maybeSingle: () => Promise<{ data: CivicsAttemptWithQuestionRow | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
};

export const civicsExamQuestionsService = {
  /**
   * Wählt eine noch nicht versuchte Frage für den Nutzer (bevorzugt neue
   * Themenbereiche gegenüber Wiederholungen), berücksichtigt landesspezifische
   * Fragen nur, wenn sie zum Bundesland des Nutzers passen. Gibt null zurück,
   * wenn keine passenden aktiven Fragen vorhanden sind (leerer Pool, z. B. vor
   * Phase E4).
   */
  async getNextQuestionForUser(userId: string, bundesland: string | null): Promise<CivicsExamQuestion | null> {
    const civicsClient = supabaseClient as unknown as CivicsClient;
    const bundeslandFilter = bundesland
      ? `scope.eq.general,and(scope.eq.bundesland,bundesland.eq.${bundesland})`
      : 'scope.eq.general';

    const { data: questionRows, error: questionsError } = await civicsClient
      .from('civics_exam_questions')
      .select('id, external_number, scope, bundesland, topic_category, question_text, option_a, option_b, option_c, option_d, correct_option, source_citation')
      .eq('is_active', true)
      .or(bundeslandFilter)
      .order('sort_order', { ascending: true });

    if (questionsError || !questionRows || questionRows.length === 0) {
      return null;
    }

    const attemptsClient = supabaseClient as unknown as CivicsAttemptsClient;
    const { data: attemptRows } = await attemptsClient
      .from('civics_practice_attempts')
      .select('question_id, is_factually_correct, civics_exam_questions(topic_category)')
      .eq('user_id', userId);

    const attemptedQuestionIds = new Set((attemptRows ?? []).map((entry) => entry.question_id));
    const coveredTopics = new Set(
      (attemptRows ?? [])
        .filter((entry) => entry.is_factually_correct)
        .map((entry) => entry.civics_exam_questions?.topic_category)
        .filter((topic): topic is string => Boolean(topic)),
    );

    const questions = questionRows.map(mapRow).filter((entry): entry is CivicsExamQuestion => entry !== null);
    const unattempted = questions.filter((question) => !attemptedQuestionIds.has(question.id));

    const candidatePool = unattempted.length > 0 ? unattempted : questions;

    // Innerhalb des Kandidaten-Pools Fragen aus noch nicht korrekt erklärten
    // Themenbereichen bevorzugen, damit sich die Übung über die Zeit auf
    // Themen-Abdeckung statt Wiederholung derselben Bereiche zubewegt.
    const uncoveredTopicCandidates = candidatePool.filter(
      (question) => !question.topicCategory || !coveredTopics.has(question.topicCategory),
    );
    const finalPool = uncoveredTopicCandidates.length > 0 ? uncoveredTopicCandidates : candidatePool;

    return finalPool[Math.floor(Math.random() * finalPool.length)] ?? null;
  },

  async recordAttempt(input: CivicsPracticeAttemptInput): Promise<void> {
    const attemptsClient = supabaseClient as unknown as CivicsAttemptsClient;
    const { error } = await attemptsClient.from('civics_practice_attempts').insert({
      user_id: input.userId,
      question_id: input.questionId,
      session_id: input.sessionId,
      is_factually_correct: input.isFactuallyCorrect,
      factual_feedback: input.factualFeedback,
      language_quality_score: input.languageQualityScore,
      language_cefr_band: input.languageCefrBand,
      language_justification: input.languageJustification,
    });

    if (error) {
      throw new Error(error.message);
    }
  },

  /**
   * Lädt den letzten civics_practice_attempts-Versuch zu einer konkreten Session (falls
   * vorhanden), inkl. der zugehörigen Frage -- für die Ergebnis-Anzeige in SessionDetailPage.
   */
  async getLatestAttemptForSession(sessionId: string, userId: string): Promise<CivicsPracticeAttemptResult | null> {
    const client = supabaseClient as unknown as CivicsAttemptForSessionClient;
    const { data, error } = await client
      .from('civics_practice_attempts')
      .select(
        'id, is_factually_correct, factual_feedback, language_quality_score, language_cefr_band, language_justification, created_at, civics_exam_questions(external_number, question_text, option_a, option_b, option_c, option_d, correct_option, topic_category)',
      )
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.civics_exam_questions) {
      return null;
    }

    const question = data.civics_exam_questions;
    if (!isCivicsAnswerOption(question.correct_option)) {
      return null;
    }

    return {
      id: data.id,
      isFactuallyCorrect: data.is_factually_correct,
      factualFeedback: data.factual_feedback,
      languageQualityScore: data.language_quality_score,
      languageCefrBand: data.language_cefr_band as CefrBand,
      languageJustification: data.language_justification,
      createdAt: data.created_at,
      question: {
        externalNumber: question.external_number,
        questionText: question.question_text,
        optionA: question.option_a,
        optionB: question.option_b,
        optionC: question.option_c,
        optionD: question.option_d,
        correctOption: question.correct_option,
        topicCategory: question.topic_category,
      },
    };
  },

  async getTopicCoverage(userId: string): Promise<CivicsTopicCoverage> {
    const civicsClient = supabaseClient as unknown as CivicsClient;
    const { data: questionRows } = await civicsClient
      .from('civics_exam_questions')
      .select('id, external_number, scope, bundesland, topic_category, question_text, option_a, option_b, option_c, option_d, correct_option, source_citation')
      .eq('is_active', true)
      .or('scope.eq.general,scope.eq.bundesland');

    const totalTopics = new Set(
      (questionRows ?? []).map((row) => row.topic_category).filter((topic): topic is string => Boolean(topic)),
    ).size;

    const attemptsClient = supabaseClient as unknown as CivicsAttemptsClient;
    const { data: attemptRows } = await attemptsClient
      .from('civics_practice_attempts')
      .select('question_id, is_factually_correct, civics_exam_questions(topic_category)')
      .eq('user_id', userId);

    const coveredTopics = new Set(
      (attemptRows ?? [])
        .filter((entry) => entry.is_factually_correct)
        .map((entry) => entry.civics_exam_questions?.topic_category)
        .filter((topic): topic is string => Boolean(topic)),
    ).size;

    return { coveredTopics, totalTopics };
  },
};
