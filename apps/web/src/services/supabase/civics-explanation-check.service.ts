import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';
import { getCorrectAnswerText, type CivicsExamQuestion } from '@/services/supabase/civics-exam-questions.service';
import type { CefrBand } from '@/services/supabase/session-analysis.service';

export type CivicsExplanationCheckOutput = {
  isFactuallyCorrect: boolean;
  factualFeedback: string;
  languageQualityScore: number;
  languageJustification: string;
  languageCefrBand: CefrBand;
  encouragement: string;
};

type CivicsExplanationCheckPromptOutput = {
  is_factually_correct: boolean;
  factual_feedback: string;
  language_quality_score: number;
  language_justification: string;
  language_cefr_band: CefrBand;
  encouragement: string;
};

export const civicsExplanationCheckService = {
  async evaluate(params: {
    question: CivicsExamQuestion;
    cleanedTranscript: string;
    userId?: string;
    sessionId?: string;
  }): Promise<CivicsExplanationCheckOutput> {
    const { question, cleanedTranscript, userId, sessionId } = params;

    const result = await aiOrchestratorService.executePrompt<CivicsExplanationCheckPromptOutput>({
      promptKey: 'civics_explanation_check',
      variables: {
        question_text: question.questionText,
        option_a: question.optionA,
        option_b: question.optionB,
        option_c: question.optionC,
        option_d: question.optionD,
        correct_answer_text: getCorrectAnswerText(question),
        topic_category: question.topicCategory ?? 'Allgemein',
        cleaned_transcript: cleanedTranscript,
      },
      logging: userId ? { userId, sessionId: sessionId ?? null } : undefined,
      executionContext: sessionId
        ? { pipelineStep: 'civics_explanation_check', sessionId, featureName: 'civics_explanation_check' }
        : undefined,
    });

    if (!result.ok || !result.output) {
      throw new Error(result.errorMessage ?? 'Prompt civics_explanation_check fehlgeschlagen.');
    }

    const output = result.output;

    return {
      isFactuallyCorrect: output.is_factually_correct,
      factualFeedback: output.factual_feedback,
      languageQualityScore: output.language_quality_score,
      languageJustification: output.language_justification,
      languageCefrBand: output.language_cefr_band,
      encouragement: output.encouragement,
    };
  },
};
