import { describe, expect, it } from 'vitest';

import { validateCoachPromptAvailability } from '@/services/coach/coach-prompt-readiness.service';
import { coachRuntimeService } from '@/services/coach/coach-runtime.service';

const shouldRunSmokeTest = process.env.RUN_COACH_RUNTIME_SMOKE_TEST === 'true';

function expectNonEmptyString(value: unknown, fieldName: string): void {
  expect(typeof value, `${fieldName} muss ein String sein`).toBe('string');
  expect((value as string).trim().length, `${fieldName} darf nicht leer sein`).toBeGreaterThan(0);
}

describe.skipIf(!shouldRunSmokeTest)('coach runtime smoke test (supabase prompt_definitions)', () => {
  it('validiert Prompt-Verfügbarkeit und alle Runtime-Methoden mit Mock-Daten', async () => {
    const trainingPath = {
      id: 'tp_smoke_debug_01',
      title: 'Präsens in Alltagssituationen',
      focusTopic: 'Present tense in daily routines',
      reason: 'Sichere Satzstruktur in kurzen Dialogen festigen.',
      currentStrengthLabel: 'Basis stabil, Übergänge unsicher',
      recommendedFrequency: '3x pro Woche, 15 Minuten',
      lastPracticedAt: '2026-05-10T08:30:00.000Z',
      nextRecommendedAt: '2026-05-13T08:30:00.000Z',
      label: 'Gut zum Festigen' as const,
      recentWins: ['Verben korrekt konjugiert', 'Klarer Satzbeginn'],
      recentChallenges: ['Zeitmarker vergessen', 'Fragen mit do/does unsicher'],
      coachNote: 'Fokus auf kurze Frage-Antwort-Muster.',
      priorityScore: 84,
      skippedSessions: 0,
      developmentLine: 'stabil_aufbauend',
    };

    const sessionMemory = {
      pathKey: trainingPath.id,
      lastModes: ['connect', 'rephrase'] as const,
      stablePhrases: ['I usually start at nine.', 'I work from home on Fridays.'],
      difficultTransitions: ['after that', 'before I leave'],
      lastFreeResponseStyle: 'kurze_sätze_mit_pause',
      lastDailySituation: 'morning routine',
      transferReadiness: 0.58,
      sessionsCompleted: 4,
      lastReflection: 'Ich war sicher bei einfachen Aussagen, aber Fragen waren schwierig.',
      lastReflectionFocus: 'Fragesätze im Präsens',
      updatedAt: '2026-05-12T09:00:00.000Z',
    };

    const userAnswer = 'I wake up at seven. Then I make coffee and I go to work by bus.';
    const learnerReflection =
      'Ich konnte den Ablauf gut erklären, aber bei Rückfragen brauche ich mehr Zeit.';

    const availability = await validateCoachPromptAvailability();
    expect(availability.missingKeys).toEqual([]);
    expect(availability.invalidKeys).toEqual([]);

    const recommendation = await coachRuntimeService.getTrainingRecommendation({
      learnerProfile: {
        level: 'A2',
        nativeLanguage: 'de',
        goals: ['alltagssichere Gespräche', 'mehr Spontaneität'],
        trainingPath,
      },
      patternSummary: {
        strengths: sessionMemory.stablePhrases,
        frictionPoints: sessionMemory.difficultTransitions,
        recentContext: 'daily routine conversation',
      },
      availableTime: '15 minutes',
    });

    expectNonEmptyString(recommendation.recommendation, 'recommendation.recommendation');
    expectNonEmptyString(recommendation.rationale, 'recommendation.rationale');
    expectNonEmptyString(recommendation.practiceFormat, 'recommendation.practiceFormat');
    expectNonEmptyString(recommendation.timeScope, 'recommendation.timeScope');

    const plan = await coachRuntimeService.createSessionPlan({
      learnerLevel: 'A2',
      focusTopic: trainingPath.focusTopic,
      observedPatterns: [
        ...sessionMemory.stablePhrases,
        ...sessionMemory.difficultTransitions,
        'Fragesätze mit do/does',
      ],
      recentNotes: 'Kurze Antworten stabil, bei Übergängen und Rückfragen stockend.',
      learningGoalContext: '',
    });

    expectNonEmptyString(plan.objective, 'plan.objective');
    expect(plan.priorities.length).toBeGreaterThan(0);
    plan.priorities.forEach((priority, index) => expectNonEmptyString(priority, `plan.priorities[${index}]`));
    expectNonEmptyString(plan.sessionFocus, 'plan.sessionFocus');
    expectNonEmptyString(plan.successSignal, 'plan.successSignal');

    const nextStep = await coachRuntimeService.getNextStep({
      sessionGoal: plan.objective,
      learnerTurn: userAnswer,
      context: {
        sessionMemory,
        activePath: trainingPath,
        lastCoachPrompt: plan.tasks?.[0]?.prompt ?? 'Start with a short daily-routine summary.',
      },
      learningGoalContext: '',
    });

    expect(['clarify', 'practice', 'transfer', 'review']).toContain(nextStep.stepType);
    expectNonEmptyString(nextStep.coachMessage, 'nextStep.coachMessage');
    expectNonEmptyString(nextStep.learnerAction, 'nextStep.learnerAction');
    expectNonEmptyString(nextStep.reason, 'nextStep.reason');

    const completion = await coachRuntimeService.completeSession({
      sessionGoal: plan.objective,
      sessionFindings: {
        trainingPathId: trainingPath.id,
        completedTurns: 6,
        learnerSignals: ['mehr Sicherheit bei Aussagen', 'noch zögerlich bei Rückfragen'],
        lastStepType: nextStep.stepType,
      },
      currentState: 'learner completed a short transfer exercise and asked for recap',
      learningGoalContext: '',
    });

    expect(['completed', 'partially_completed', 'not_completed']).toContain(completion.completionStatus);
    expectNonEmptyString(completion.summary, 'completion.summary');
    expectNonEmptyString(completion.retainedStrength, 'completion.retainedStrength');
    expectNonEmptyString(completion.remainingFocus, 'completion.remainingFocus');
    expectNonEmptyString(completion.nextSessionHint, 'completion.nextSessionHint');

    const reflection = await coachRuntimeService.interpretReflection({
      learnerReflection,
      learningContext: `${trainingPath.focusTopic} / session goal: ${plan.objective}`,
      recentSignals: ['Fragen langsamer formuliert', 'hohe Motivation', 'gute Fehlerkorrektur'],
      learningGoalContext: '',
    });

    expect(['stable', 'uncertain', 'overloaded', 'confident']).toContain(reflection.reflectionState);
    expectNonEmptyString(reflection.interpretedNeed, 'reflection.interpretedNeed');
    expectNonEmptyString(reflection.supportiveResponse, 'reflection.supportiveResponse');
    expectNonEmptyString(reflection.suggestedFocus, 'reflection.suggestedFocus');
  }, 120_000);
});
