import { appConfig } from '@/lib/config';
import type { CoachSessionState, CoachTaskMode, CoachTaskPlanItem, SessionMemory } from '@/services/coach/coach.types';
import { coachRuntimeService } from '@/services/coach/coach-runtime.service';
import type { TutorCyclePhase, TutorMessage } from '@/services/supabase/tutor.service';
import { checkCoachReadiness } from './coach-readiness';
import { isSafeTaskPrompt } from './coach-text-normalization';

export const SESSION_TASK_TOTAL = 5;
export const AI_TECHNICAL_ERROR_MESSAGE = 'Der KI-Coach konnte gerade keine Antwort erzeugen. Bitte versuche es erneut.';

const VALID_TASK_MODES: readonly CoachTaskMode[] = [
  'connect',
  'fill_connector',
  'rephrase',
  'free_response',
  'daily_situation',
  'explain_cause',
  'contrast',
  'continue_dialogue',
] as const;

export function isCoachTaskMode(mode: unknown): mode is CoachTaskMode {
  return typeof mode === 'string' && VALID_TASK_MODES.includes(mode as CoachTaskMode);
}

export function createInitialSessionState(taskPlan: CoachTaskPlanItem[] = []): CoachSessionState {
  return {
    totalTasks: SESSION_TASK_TOTAL,
    completedTasks: 0,
    currentPrompt: taskPlan[0]?.prompt ?? '',
    level: 1,
    taskPlan,
    currentMode: taskPlan[0]?.mode ?? 'connect',
    recommendedInput: taskPlan[0]?.recommendedInput ?? 'mixed',
  };
}

function mapAiTaskPlan(aiTasks: Array<Record<string, unknown>> | undefined): CoachTaskPlanItem[] {
  if (!aiTasks?.length) return [];
  const mapped = aiTasks
    .map((task): CoachTaskPlanItem | null => {
      if (!isCoachTaskMode(task.mode)) return null;
      const prompt = typeof task.prompt === 'string' ? task.prompt.trim() : '';
      const transition = typeof task.transition === 'string' ? task.transition.trim() : '';
      if (!prompt || !transition) return null;
      const preferredInput = task.preferredInput;
      const recommendedInput = preferredInput === 'text' || preferredInput === 'voice' || preferredInput === 'mixed' ? preferredInput : 'mixed';
      return { mode: task.mode, prompt, transition, recommendedInput };
    })
    .filter((item): item is CoachTaskPlanItem => Boolean(item));

  return mapped.slice(0, SESSION_TASK_TOTAL);
}

export async function createSessionState(
  topicTitle?: string,
  memory?: SessionMemory | null,
  learnerLevel?: string,
  learningGoalContext?: string,
): Promise<CoachSessionState> {
  const normalizedTopicTitle = topicTitle ?? '';
  if (!appConfig.features.enableAiCoachSessionPlan) {
    throw new Error(AI_TECHNICAL_ERROR_MESSAGE);
  }

  const readinessOk = await checkCoachReadiness('sessionPlan');
  if (!readinessOk) throw new Error(AI_TECHNICAL_ERROR_MESSAGE);

  try {
    const aiPlan = await coachRuntimeService.createSessionPlan({
      // Fallback A2 nur, wenn kein echtes Sprachniveau ermittelt werden konnte
      // (z. B. Onboarding-Profil ohne german_level) -- vorher hier hart auf 'A2'
      // codiert, unabhängig vom tatsächlichen Lernstand (Launch-Readiness-Audit
      // Zwölfter Nachtrag, Didaktik-Befund).
      learnerLevel: learnerLevel ?? 'A2',
      focusTopic: normalizedTopicTitle || 'Allgemeine Satzverknüpfung',
      observedPatterns: memory?.difficultTransitions ?? [],
      recentNotes: memory?.lastReflection ?? '',
      learningGoalContext: learningGoalContext ?? '',
    });
    const taskPlan = mapAiTaskPlan(aiPlan.tasks as Array<Record<string, unknown>> | undefined);
    if (!taskPlan.length) throw new Error(AI_TECHNICAL_ERROR_MESSAGE);
    return createInitialSessionState(taskPlan);
  } catch (error) {
    console.error('[CoachRuntime] coach_session_plan execution failed', error);
    throw new Error(AI_TECHNICAL_ERROR_MESSAGE);
  }
}

export function normalizeAiNextTask(nextTask: unknown): Pick<CoachTaskPlanItem, 'mode' | 'prompt' | 'recommendedInput'> | null {
  if (!nextTask || typeof nextTask !== 'object') return null;
  const candidate = nextTask as Record<string, unknown>;
  if (!isCoachTaskMode(candidate.mode)) return null;
  const prompt = typeof candidate.prompt === 'string' ? candidate.prompt.trim().replace(/\s+/g, ' ') : '';
  if (!isSafeTaskPrompt(prompt)) return null;
  const preferredInput = candidate.preferredInput;
  const recommendedInput = preferredInput === 'text' || preferredInput === 'voice' || preferredInput === 'mixed' ? preferredInput : 'mixed';
  return { mode: candidate.mode, prompt, recommendedInput };
}

export function normalizePhase(lastPhase: TutorCyclePhase | undefined): TutorCyclePhase {
  if (!lastPhase || lastPhase === 'explanation') {
    return 'clarification';
  }

  return lastPhase;
}

export function buildDialogueJson(messages: TutorMessage[]): string {
  return JSON.stringify(messages.slice(-10).map((message) => ({ role: message.role, type: message.type, text: message.text })));
}
