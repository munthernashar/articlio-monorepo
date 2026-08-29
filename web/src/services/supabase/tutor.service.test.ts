import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FocusTopicRow, Json } from '@/types/database';

const dbState: {
  row: Pick<FocusTopicRow, 'status' | 'metadata'>;
  lastUpdate: Record<string, unknown> | null;
} = {
  row: {
    status: 'in_training',
    metadata: {},
  },
  lastUpdate: null,
};

const aiState: {
  output: Record<string, unknown> | null;
} = {
  output: null,
};

vi.mock('@/services/supabase/client', () => ({
  supabaseClient: {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single() {
          return Promise.resolve({ data: dbState.row, error: null });
        },
        update(payload: Record<string, unknown>) {
          dbState.lastUpdate = payload;
          return {
            eq() {
              return this;
            },
          };
        },
      };
    },
  },
}));

vi.mock('@/services/supabase/app-settings.service', () => ({
  appSettingsService: {
    getSettings: vi.fn(async () => ({
      tutorExplanationLanguage: 'de',
      feedbackHardness: 'balanced',
    })),
  },
}));

vi.mock('@/services/ai/ai-orchestrator.service', () => ({
  aiOrchestratorService: {
    executePrompt: vi.fn(async () => ({
      ok: true,
      output: aiState.output,
    })),
  },
}));

describe('tutorService.persistUnderstandingStatus', () => {
  beforeEach(() => {
    dbState.row = { status: 'in_training', metadata: {} };
    dbState.lastUpdate = null;
  });

  it('führt sufficient aus in_training nur bis teilweise_stabilisiert', async () => {
    const { tutorService } = await import('@/services/supabase/tutor.service');

    await tutorService.persistUnderstandingStatus({
      userId: 'user-1',
      focusTopicId: 'focus-1',
      status: 'sufficient',
      feedback: 'ok',
      nextStep: 'weiter',
    });

    expect(dbState.lastUpdate?.status).toBe('teilweise_stabilisiert');
  });


  it('setzt bei not_yet den Status auf in_training und ergänzt Verlaufseintrag', async () => {
    dbState.row = {
      status: 'stabil',
      metadata: { status_history: [] } as Json,
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');

    await tutorService.persistUnderstandingStatus({
      userId: 'user-1',
      focusTopicId: 'focus-1',
      status: 'not_yet',
      feedback: 'noch unsicher',
      nextStep: 'nochmal erklären',
    });

    expect(dbState.lastUpdate?.status).toBe('in_training');
    const metadata = dbState.lastUpdate?.metadata as Record<string, unknown>;
    expect(metadata.tutor).toMatchObject({
      understanding_status: 'not_yet',
      feedback: 'noch unsicher',
      next_step: 'nochmal erklären',
    });
    const history = metadata.status_history as Array<Record<string, unknown>>;
    expect(history.at(-1)).toMatchObject({
      from: 'stabil',
      to: 'in_training',
      reason: 'understanding_check:not_yet',
      source: 'tutor.service',
    });
  });

  it('erlaubt stabil-Transition aus teilweise_stabilisiert für sufficient und schreibt tutor-metadata', async () => {
    dbState.row = {
      status: 'teilweise_stabilisiert',
      metadata: { status_history: [] } as Json,
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');

    await tutorService.persistUnderstandingStatus({
      userId: 'user-1',
      focusTopicId: 'focus-1',
      status: 'sufficient',
      feedback: 'sicher',
      nextStep: 'monitoring',
    });

    expect(dbState.lastUpdate?.status).toBe('stabil');
    const metadata = dbState.lastUpdate?.metadata as Record<string, unknown>;
    expect(metadata.tutor).toMatchObject({
      understanding_status: 'sufficient',
      feedback: 'sicher',
      next_step: 'monitoring',
    });
    const history = metadata.status_history as Array<Record<string, unknown>>;
    expect(history.at(-1)).toMatchObject({
      from: 'teilweise_stabilisiert',
      to: 'stabil',
      reason: 'understanding_check:sufficient',
      source: 'tutor.service',
    });
  });

  it('belässt partial in teilweise_stabilisiert und aktualisiert tutor-metadata', async () => {
    dbState.row = {
      status: 'teilweise_stabilisiert',
      metadata: { status_history: [] } as Json,
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');

    await tutorService.persistUnderstandingStatus({
      userId: 'user-1',
      focusTopicId: 'focus-1',
      status: 'partial',
      feedback: 'teilweise sicher',
      nextStep: 'noch ein transferbeispiel',
    });

    expect(dbState.lastUpdate?.status).toBe('teilweise_stabilisiert');
    const metadata = dbState.lastUpdate?.metadata as Record<string, unknown>;
    expect(metadata.tutor).toMatchObject({
      understanding_status: 'partial',
      feedback: 'teilweise sicher',
      next_step: 'noch ein transferbeispiel',
    });
    const history = metadata.status_history as Array<Record<string, unknown>>;
    expect(history.at(-1)).toMatchObject({
      from: 'teilweise_stabilisiert',
      to: 'teilweise_stabilisiert',
      reason: 'understanding_check:partial',
      source: 'tutor.service',
    });
  });
});

describe('tutor prompt schema compatibility (public.prompt_definitions)', () => {
  const dbPromptFake = {
    tutor_explanation: {
      source: 'public.prompt_definitions',
      template: 'Dummy prompt: antworte kurz und technisch.',
      outputSchema: {
        type: 'object',
        required: ['check_question', 'examples', 'explanation', 'redirected_to_focus'],
        properties: {
          check_question: { type: 'string' },
          examples: {
            type: 'array',
            items: {
              type: 'object',
              required: ['incorrect', 'correct', 'why'],
            },
          },
          explanation: { type: 'string' },
          redirected_to_focus: { type: 'boolean' },
        },
      },
    },
    tutor_followup_answer: {
      source: 'public.prompt_definitions',
      outputSchema: {
        required: ['answer', 'next_question', 'redirected_to_focus', 'scope_ok'],
      },
    },
    understanding_check: {
      source: 'public.prompt_definitions',
      outputSchema: {
        properties: {
          next_step: { enum: ['clarification', 'transfer_ready'] },
          redirected_to_focus: { type: 'boolean' },
        },
      },
    },
  } as const;

  it('tutor_explanation-DB-Definition nutzt das erwartete Strukturmodell', () => {
    const prompt = dbPromptFake.tutor_explanation;
    const required = [...prompt.outputSchema.required].sort();

    expect(required).toEqual(['check_question', 'examples', 'explanation', 'redirected_to_focus']);
    expect(prompt.outputSchema.properties.redirected_to_focus).toEqual({ type: 'boolean' });
    expect((prompt.outputSchema.properties.examples.items.required as readonly string[]).slice().sort()).toEqual([
      'correct',
      'incorrect',
      'why',
    ]);
    expect(prompt.source).toBe('public.prompt_definitions');
    expect(prompt.template).toContain('Dummy prompt');
  });

  it('tutor_followup_answer-DB-Definition hat exakt die 4 Parser-Felder', () => {
    const prompt = dbPromptFake.tutor_followup_answer;
    const required = [...prompt.outputSchema.required].sort();
    expect(required).toEqual(['answer', 'next_question', 'redirected_to_focus', 'scope_ok']);
    expect(prompt.source).toBe('public.prompt_definitions');
  });

  it('understanding_check-DB-Definition begrenzt next_step auf clarification|transfer_ready', () => {
    const prompt = dbPromptFake.understanding_check;
    const nextStepSchema = prompt.outputSchema.properties.next_step;
    expect([...nextStepSchema.enum].sort()).toEqual(['clarification', 'transfer_ready']);
    expect(prompt.outputSchema.properties.redirected_to_focus).toEqual({ type: 'boolean' });
    expect(prompt.source).toBe('public.prompt_definitions');
  });
});


describe('tutor explanation parser guards', () => {
  beforeEach(() => {
    aiState.output = null;
  });

  it('reduziert bei Verstoß gegen Längen-/Meta-Regel auf kurzes kontrastives Format', async () => {
    aiState.output = {
      explanation:
        'Theorie: Erst die Regel. Dann die Ausnahme. Danach noch eine zweite Ausnahme. Zum Schluss eine Definition.',
      examples: [
        { incorrect: 'Ich gehe Kino.', correct: 'Ich gehe ins Kino.', why: 'Bei Orten braucht es den passenden Artikel.' },
        { incorrect: 'Ich warte dich.', correct: 'Ich warte auf dich.', why: 'Das Verb verlangt hier „auf“.' },
      ],
      check_question: 'Was fällt dir am Muster auf?',
      redirected_to_focus: false,
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');
    const result = await tutorService.generateExplanation({
      topicTitle: 'Präpositionen',
      topicDescription: 'alltag',
    });

    expect(result.explanation).toContain('Nicht: Ich gehe Kino.');
    expect(result.explanation).toContain('Besser: Ich gehe ins Kino.');
    expect(result.explanation).not.toContain('Theorie');
  });
});

describe('tutor understanding check guard rails', () => {
  beforeEach(() => {
    aiState.output = null;
  });

  it('erzwingt clarification wenn status nicht sufficient ist (blockiert transfer_ready)', async () => {
    aiState.output = {
      status: 'partial',
      feedback: 'Teilweise klar.',
      next_step: 'transfer_ready',
      redirected_to_focus: false,
      transfer_evidence: { reuse_demonstrated: false, context_variation: '' },
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');
    const result = await tutorService.runUnderstandingCheck({
      topicTitle: 'Präpositionen',
      topicDescription: 'alltag',
      explanationText: 'Kurz erklärt',
      dialogueJson: '[]',
    });

    expect(result.status).toBe('partial');
    expect(result.next_step).toBe('clarification');
  });

  it('lässt transfer_ready bei sufficient mit nachgewiesenem Transfer zu', async () => {
    aiState.output = {
      status: 'sufficient',
      feedback: 'Passt.',
      next_step: 'transfer_ready',
      redirected_to_focus: false,
      transfer_evidence: {
        reuse_demonstrated: true,
        context_variation: 'Neue Alltagssituation ohne Vorlage korrekt angewendet.',
      },
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');
    const result = await tutorService.runUnderstandingCheck({
      topicTitle: 'Präpositionen',
      topicDescription: 'alltag',
      explanationText: 'Kurz erklärt',
      dialogueJson: '[]',
    });

    expect(result.status).toBe('sufficient');
    expect(result.next_step).toBe('transfer_ready');
  });

  it('erzwingt auch bei ungültigem next_step für partial immer clarification (kein Transfer)', async () => {
    aiState.output = {
      status: 'partial',
      feedback: 'Noch nicht stabil.',
      next_step: 'invalid_step',
      redirected_to_focus: false,
      transfer_evidence: { reuse_demonstrated: false, context_variation: '' },
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');
    const result = await tutorService.runUnderstandingCheck({
      topicTitle: 'Präpositionen',
      topicDescription: 'alltag',
      explanationText: 'Kurz erklärt',
      dialogueJson: '[]',
    });

    expect(result.status).toBe('partial');
    expect(result.next_step).toBe('clarification');
  });

  it('Befund K P1 #5: sufficient ohne nachgewiesenen Transfer wird auf partial heruntergestuft', async () => {
    aiState.output = {
      status: 'sufficient',
      feedback: 'Klingt gut.',
      next_step: 'transfer_ready',
      redirected_to_focus: false,
      transfer_evidence: { reuse_demonstrated: false, context_variation: '' },
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');
    const result = await tutorService.runUnderstandingCheck({
      topicTitle: 'Präpositionen',
      topicDescription: 'alltag',
      explanationText: 'Kurz erklärt',
      dialogueJson: '[]',
    });

    expect(result.status).toBe('partial');
    expect(result.next_step).toBe('clarification');
  });

  it('Befund K P1 #5: sufficient mit reuse_demonstrated aber ohne context_variation wird heruntergestuft', async () => {
    aiState.output = {
      status: 'sufficient',
      feedback: 'Klingt gut.',
      next_step: 'transfer_ready',
      redirected_to_focus: false,
      transfer_evidence: { reuse_demonstrated: true, context_variation: '' },
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');
    const result = await tutorService.runUnderstandingCheck({
      topicTitle: 'Präpositionen',
      topicDescription: 'alltag',
      explanationText: 'Kurz erklärt',
      dialogueJson: '[]',
    });

    expect(result.status).toBe('partial');
  });
});

describe('tutor followup scope guard rails', () => {
  beforeEach(() => {
    aiState.output = null;
  });

  it('leitet Off-topic/Out-of-scope Follow-up nach Retry hart auf Fokus zurück', async () => {
    aiState.output = {
      answer: 'Lass uns stattdessen den Konjunktiv II lernen.',
      scope_ok: false,
      redirected_to_focus: false,
      next_question: 'Willst du eine neue Grammatikregel?',
    };

    const { tutorService } = await import('@/services/supabase/tutor.service');
    const result = await tutorService.generateFollowupAnswer({
      topicTitle: 'Präpositionen',
      topicDescription: 'alltag',
      explanationText: 'Kurz erklärt',
      learnerQuestion: 'Wie ist das mit Nebensätzen?',
      dialogueJson: '[]',
    });

    expect(result.scope_ok).toBe(false);
    expect(result.redirected_to_focus).toBe(true);
    expect(result.answer).toContain('Präpositionen');
  });
});
