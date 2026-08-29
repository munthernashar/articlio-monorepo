import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';
import type {
  CoachInterpretReflectionInput,
  CoachInterpretReflectionOutput,
  CoachNextStepInput,
  CoachNextStepOutput,
  CoachNextTaskSuggestion,
  CoachSessionCompletionInput,
  CoachSessionCompletionOutput,
  CoachSessionPlanInput,
  CoachSessionPlanOutput,
  CoachTrainingRecommendationInput,
  CoachTrainingRecommendationOutput,
} from '@/services/coach/coach.types';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => isNonEmptyString(item)) : [];
}

function parseNextTaskSuggestion(value: unknown): CoachNextTaskSuggestion | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const nextTask = value as Record<string, unknown>;
  const mode = typeof nextTask.mode === 'string' ? nextTask.mode : undefined;
  const prompt = typeof nextTask.prompt === 'string' ? nextTask.prompt : undefined;
  const preferredInput = typeof nextTask.preferredInput === 'string' ? nextTask.preferredInput : undefined;
  return { mode, prompt, preferredInput };
}

export class CoachRuntimeService {
  async getTrainingRecommendation(
    input: CoachTrainingRecommendationInput,
  ): Promise<CoachTrainingRecommendationOutput> {
    try {
      const result = await aiOrchestratorService.executePrompt<Record<string, unknown>>({
        promptKey: 'coach_training_recommendation',
        variables: {
          learner_profile_json: JSON.stringify(input.learnerProfile),
          pattern_summary_json: JSON.stringify(input.patternSummary),
          available_time: input.availableTime,
        },
      });

      const output = result.output;
      if (
        output &&
        isNonEmptyString(output.recommendation) &&
        isNonEmptyString(output.rationale) &&
        isNonEmptyString(output.practice_format) &&
        isNonEmptyString(output.time_scope)
      ) {
        return {
          recommendation: output.recommendation,
          rationale: output.rationale,
          practiceFormat: output.practice_format,
          timeScope: output.time_scope,
        };
      }
    } catch (error) {
      console.error('[CoachRuntimeService] Prompt-Ausführung fehlgeschlagen', {
        promptKey: 'coach_training_recommendation',
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
      throw error;
    }
    throw new Error('Ungültige Prompt-Antwort für coach_training_recommendation.');
  }

  async createSessionPlan(input: CoachSessionPlanInput): Promise<CoachSessionPlanOutput> {
    try {
      const result = await aiOrchestratorService.executePrompt<Record<string, unknown>>({
        promptKey: 'coach_session_plan',
        variables: {
          learner_level: input.learnerLevel,
          focus_topic: input.focusTopic,
          observed_patterns_json: JSON.stringify(input.observedPatterns),
          recent_notes: input.recentNotes,
          learning_goal_context: input.learningGoalContext,
        },
      });

      const output = result.output;
      if (
        output &&
        isNonEmptyString(output.objective) &&
        toStringArray(output.priorities).length > 0 &&
        isNonEmptyString(output.session_focus) &&
        isNonEmptyString(output.success_signal)
      ) {
        const tasks = Array.isArray(output.tasks)
          ? output.tasks.filter((task): task is Record<string, unknown> => Boolean(task) && typeof task === 'object').map((task) => ({
            mode: typeof task.mode === 'string' ? task.mode : undefined,
            prompt: typeof task.prompt === 'string' ? task.prompt : undefined,
            transition: typeof task.transition === 'string' ? task.transition : undefined,
            preferredInput: typeof task.preferredInput === 'string' ? task.preferredInput : undefined,
          }))
          : undefined;

        return {
          objective: output.objective,
          priorities: toStringArray(output.priorities),
          sessionFocus: output.session_focus,
          successSignal: output.success_signal,
          tasks,
        };
      }
    } catch (error) {
      console.error('[CoachRuntimeService] Prompt-Ausführung fehlgeschlagen', {
        promptKey: 'coach_session_plan',
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
      throw error;
    }
    throw new Error('Ungültige Prompt-Antwort für coach_session_plan.');
  }

  async getNextStep(input: CoachNextStepInput): Promise<CoachNextStepOutput> {
    try {
      const result = await aiOrchestratorService.executePrompt<Record<string, unknown>>({
        promptKey: 'coach_next_step',
        variables: {
          session_goal: input.sessionGoal,
          learner_turn: input.learnerTurn,
          context_json: JSON.stringify(input.context),
          learning_goal_context: input.learningGoalContext,
        },
      });

      const output = result.output;
      const validStepTypes = ['clarify', 'practice', 'transfer', 'review'] as const;
      const stepType = output?.step_type;
      if (
        output &&
        typeof stepType === 'string' &&
        validStepTypes.includes(stepType as (typeof validStepTypes)[number]) &&
        isNonEmptyString(output.coach_message) &&
        isNonEmptyString(output.learner_action) &&
        isNonEmptyString(output.reason)
      ) {
        return {
          stepType: stepType as CoachNextStepOutput['stepType'],
          coachMessage: output.coach_message,
          learnerAction: output.learner_action,
          reason: output.reason,
          followupQuestion: typeof output.followup_question === 'string' ? output.followup_question : undefined,
          nextTask: parseNextTaskSuggestion(output.next_task),
        };
      }
    } catch (error) {
      console.error('[CoachRuntimeService] Prompt-Ausführung fehlgeschlagen', {
        promptKey: 'coach_next_step',
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
      throw error;
    }
    throw new Error('Ungültige Prompt-Antwort für coach_next_step.');
  }

  async completeSession(input: CoachSessionCompletionInput): Promise<CoachSessionCompletionOutput> {
    try {
      const result = await aiOrchestratorService.executePrompt<Record<string, unknown>>({
        promptKey: 'coach_session_completion',
        variables: {
          session_goal: input.sessionGoal,
          session_findings_json: JSON.stringify(input.sessionFindings),
          current_state: input.currentState,
          learning_goal_context: input.learningGoalContext,
        },
      });

      const output = result.output;
      const validStatuses = ['completed', 'partially_completed', 'not_completed'] as const;
      const completionStatus = output?.completion_status;
      if (
        output &&
        typeof completionStatus === 'string' &&
        validStatuses.includes(completionStatus as (typeof validStatuses)[number]) &&
        isNonEmptyString(output.summary) &&
        isNonEmptyString(output.retained_strength) &&
        isNonEmptyString(output.remaining_focus) &&
        isNonEmptyString(output.next_session_hint)
      ) {
        return {
          completionStatus: completionStatus as CoachSessionCompletionOutput['completionStatus'],
          summary: output.summary,
          retainedStrength: output.retained_strength,
          remainingFocus: output.remaining_focus,
          nextSessionHint: output.next_session_hint,
        };
      }
    } catch (error) {
      console.error('[CoachRuntimeService] Prompt-Ausführung fehlgeschlagen', {
        promptKey: 'coach_session_completion',
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
      throw error;
    }
    throw new Error('Ungültige Prompt-Antwort für coach_session_completion.');
  }

  async interpretReflection(
    input: CoachInterpretReflectionInput,
  ): Promise<CoachInterpretReflectionOutput> {
    try {
      const result = await aiOrchestratorService.executePrompt<Record<string, unknown>>({
        promptKey: 'coach_reflection_interpreter',
        variables: {
          learner_reflection: input.learnerReflection,
          learning_context: input.learningContext,
          recent_signals_json: JSON.stringify(input.recentSignals),
          learning_goal_context: input.learningGoalContext,
        },
      });

      const output = result.output;
      const validStates = ['stable', 'uncertain', 'overloaded', 'confident'] as const;
      const reflectionState = output?.reflection_state;
      if (
        output &&
        typeof reflectionState === 'string' &&
        validStates.includes(reflectionState as (typeof validStates)[number]) &&
        isNonEmptyString(output.interpreted_need) &&
        isNonEmptyString(output.supportive_response) &&
        isNonEmptyString(output.suggested_focus)
      ) {
        return {
          reflectionState: reflectionState as CoachInterpretReflectionOutput['reflectionState'],
          interpretedNeed: output.interpreted_need,
          supportiveResponse: output.supportive_response,
          suggestedFocus: output.suggested_focus,
        };
      }
    } catch (error) {
      console.error('[CoachRuntimeService] Prompt-Ausführung fehlgeschlagen', {
        promptKey: 'coach_reflection_interpreter',
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
      throw error;
    }
    throw new Error('Ungültige Prompt-Antwort für coach_reflection_interpreter.');
  }
}

export const coachRuntimeService = new CoachRuntimeService();
