import { validateCoachPromptAvailability } from '@/services/coach/coach-prompt-readiness.service';

type CoachReadinessKey = 'sessionPlan' | 'nextStep' | 'dynamicNextStep' | 'completion' | 'reflection';

const READINESS_LOG_LABELS: Record<CoachReadinessKey, string> = {
  sessionPlan: 'Coach prompt readiness validation',
  nextStep: 'Next-step prompt readiness validation',
  dynamicNextStep: 'Dynamic next-step prompt readiness validation',
  completion: 'Session completion prompt readiness validation',
  reflection: 'Reflection prompt readiness validation',
};

const readinessPromises = new Map<CoachReadinessKey, Promise<boolean>>();

/** Cached per key, module-level (not per component instance) -- one readiness check per prompt kind for the lifetime of the page. */
export function checkCoachReadiness(key: CoachReadinessKey): Promise<boolean> {
  let cached = readinessPromises.get(key);
  if (!cached) {
    const label = READINESS_LOG_LABELS[key];
    cached = validateCoachPromptAvailability()
      .then((result) => {
        if (!result.ok) {
          console.error(`[CoachRuntime] ${label} failed`, result);
        }
        return result.ok;
      })
      .catch((error) => {
        console.error(`[CoachRuntime] ${label} error`, error);
        return false;
      });
    readinessPromises.set(key, cached);
  }
  return cached;
}
