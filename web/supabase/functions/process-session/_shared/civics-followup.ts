import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchActivePromptDefinition, renderPromptTemplate, runGuardedJsonPrompt } from './prompt-runtime.ts';

// Bug-Fix Nachtrag (28.08.2026): civics_explanation_check lief bislang clientseitig in
// NewSessionPage.tsx (runCivicsEvaluationIfApplicable), synchron im Session-Flow -- war vom
// Tab-Lebensdauer-Bug der anderen drei Prompts nicht betroffen, blieb aber client-seitig hängen.
// Voraussetzung für den Server-Port fehlte: welche civics_exam_questions-Zeile zu einer Session
// gehört, lebte nur im React-State. Jetzt behoben, indem NewSessionPage.tsx die Frage-ID beim
// Sessionstart in conversation_sessions.metadata.civicsQuestionId persistiert (siehe
// session.service.ts) -- diese Datei liest sie von dort und lässt bei jedem session_transcripts-
// Erfolg still durchlaufen, wenn keine Frage-ID gesetzt ist (normale generische Session).

type CivicsExamQuestionRow = {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  topic_category: string | null;
};

function getCorrectAnswerText(question: CivicsExamQuestionRow): string {
  switch (question.correct_option) {
    case 'a':
      return question.option_a;
    case 'b':
      return question.option_b;
    case 'c':
      return question.option_c;
    case 'd':
      return question.option_d;
    default:
      return question.option_a;
  }
}

function extractCivicsQuestionId(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = metadata.civicsQuestionId;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export type CivicsFollowUpResult = { ran: boolean; reason?: string };

export async function runCivicsExplanationCheckIfApplicable(params: {
  serviceClient: SupabaseClient;
  userId: string;
  sessionId: string;
  traceId: string;
}): Promise<CivicsFollowUpResult> {
  const { serviceClient, userId, sessionId, traceId } = params;

  const { data: session } = await serviceClient
    .from('conversation_sessions')
    .select('metadata')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();

  const civicsQuestionId = extractCivicsQuestionId(session?.metadata ?? null);
  if (!civicsQuestionId) return { ran: false, reason: 'no_civics_question_id' };

  const { data: question } = await serviceClient
    .from('civics_exam_questions')
    .select('id, question_text, option_a, option_b, option_c, option_d, correct_option, topic_category')
    .eq('id', civicsQuestionId)
    .maybeSingle<CivicsExamQuestionRow>();

  if (!question) return { ran: false, reason: 'civics_question_not_found' };

  const { data: transcript } = await serviceClient
    .from('session_transcripts')
    .select('cleaned_transcript')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle<{ cleaned_transcript: string | null }>();

  if (!transcript?.cleaned_transcript) return { ran: false, reason: 'no_cleaned_transcript' };

  const promptDefinition = await fetchActivePromptDefinition(serviceClient, 'civics_explanation_check');
  const renderedPrompt = renderPromptTemplate(promptDefinition.user_prompt_template, {
    question_text: question.question_text,
    option_a: question.option_a,
    option_b: question.option_b,
    option_c: question.option_c,
    option_d: question.option_d,
    correct_answer_text: getCorrectAnswerText(question),
    topic_category: question.topic_category ?? 'Allgemein',
    cleaned_transcript: transcript.cleaned_transcript,
  });

  const output = await runGuardedJsonPrompt({
    serviceClient,
    userId,
    sessionId,
    traceId,
    promptDefinition,
    renderedUserPrompt: renderedPrompt,
  });

  const isFactuallyCorrect = output.is_factually_correct;
  const factualFeedback = output.factual_feedback;
  const languageQualityScore = output.language_quality_score;
  const languageCefrBand = output.language_cefr_band;
  const languageJustification = output.language_justification;

  if (
    typeof isFactuallyCorrect !== 'boolean' ||
    typeof factualFeedback !== 'string' ||
    typeof languageQualityScore !== 'number' ||
    typeof languageCefrBand !== 'string' ||
    typeof languageJustification !== 'string'
  ) {
    throw new Error('civics_explanation_check_invalid_output');
  }

  const { error: insertError } = await serviceClient.from('civics_practice_attempts').insert({
    user_id: userId,
    question_id: question.id,
    session_id: sessionId,
    is_factually_correct: isFactuallyCorrect,
    factual_feedback: factualFeedback,
    language_quality_score: languageQualityScore,
    language_cefr_band: languageCefrBand,
    language_justification: languageJustification,
  });

  if (insertError) throw new Error(`civics_practice_attempt_insert_failed_${insertError.message}`);

  return { ran: true };
}
