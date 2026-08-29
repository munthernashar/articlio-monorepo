import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';

type DailyPromptOutput = {
  title: string;
  prompt_text: string;
  rationale: string;
  difficulty: string;
  follow_up_questions: string[];
};

export type DailyPromptInput = {
  focusTopicTitle: string;
  germanLevel: string;
  recentSignal: string;
  learningGoalContext: string;
};

export const dailyPromptService = {
  async generateDailyPrompt(input: DailyPromptInput): Promise<DailyPromptOutput> {
    const result = await aiOrchestratorService.executePrompt<DailyPromptOutput>({
      promptKey: 'daily_prompt_generator',
      variables: {
        focus_topic_title: input.focusTopicTitle,
        german_level: input.germanLevel,
        recent_signal: input.recentSignal,
        learning_goal_context: input.learningGoalContext,
      },
    });

    if (!result.ok || !result.output) {
      throw new Error(result.errorMessage ?? 'Prompt daily_prompt_generator fehlgeschlagen.');
    }

    return result.output;
  },
};
