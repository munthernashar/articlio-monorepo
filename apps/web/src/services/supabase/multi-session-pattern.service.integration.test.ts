import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FocusTopicRow, SessionAnalysisRow } from '@/types/database';

type PatternRow = {
  id: string;
  user_id: string;
  pattern_type: string;
  status: 'active' | 'resolved' | 'ignored';
  evidence: Record<string, unknown>;
};

type FakeDb = {
  sessionAnalyses: SessionAnalysisRow[];
  focusTopics: FocusTopicRow[];
  detectedPatterns: PatternRow[];
};

const fakeDb: FakeDb = {
  sessionAnalyses: [],
  focusTopics: [],
  detectedPatterns: [],
};

function resetDb() {
  fakeDb.sessionAnalyses = [];
  fakeDb.focusTopics = [];
  fakeDb.detectedPatterns = [];
}

// `isAiEligibleSession()` (aufgerufen von `loadCompletedSessionAnalyses()`) filtert auf
// Basis der gejointen `conversation_sessions`-Zeile -- ohne sie werden alle Analysen
// verworfen und `detectAndPersist()` bricht schon an der Sessions-Mindestanzahl ab.
function createAnalysis(id: string, sessionId: string): SessionAnalysisRow & { conversation_sessions: { status: string; metadata: Record<string, unknown> } } {
  return {
    id,
    user_id: 'user-1',
    session_id: sessionId,
    transcript_id: null,
    status: 'completed',
    analysis_version: 'v1',
    score_overall: 3,
    summary: {},
    metrics: {},
    recommendations: [],
    category_scores_json: {},
    detected_patterns_json: [{ pattern_key: 'coherence_and_sentence_structure' }],
    priority_intervention_json: { pattern_key: 'coherence_and_sentence_structure' },
    session_summary: 's',
    last_error: null,
    created_at: `2026-04-2${id}T00:00:00.000Z`,
    updated_at: `2026-04-2${id}T00:00:00.000Z`,
    conversation_sessions: { status: 'completed', metadata: {} },
  };
}

function makeSupabaseMock() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const inFilters: Record<string, unknown[]> = {};
      let neqTopicKey: string | null = null;
      let pendingFocusTopicUpdate: Record<string, unknown> | null = null;
      const applyPendingFocusTopicUpdate = () => {
        if (table !== 'focus_topics' || !pendingFocusTopicUpdate) return;
        const updatePayload = pendingFocusTopicUpdate;
          fakeDb.focusTopics = fakeDb.focusTopics.map((row) => {
            if (row.user_id !== filters.user_id) return row;
            if (filters.status && row.status !== filters.status) return row;
            if (inFilters.status && !inFilters.status.includes(row.status)) return row;
            if (neqTopicKey && row.topic_key === neqTopicKey) return row;
            return {
              ...row,
              ...updatePayload,
              metadata: updatePayload.metadata ?? row.metadata,
          } as FocusTopicRow;
        });
        pendingFocusTopicUpdate = null;
      };
      return {
        then(onFulfilled: (value: { data: null; error: null }) => unknown) {
          applyPendingFocusTopicUpdate();
          return Promise.resolve(onFulfilled({ data: null, error: null }));
        },
        select() {
          return this;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return this;
        },
        neq(key: string, value: unknown) {
          if (key === 'topic_key') neqTopicKey = String(value);
          return this;
        },
        in(key: string, values: unknown[]) {
          inFilters[key] = values;
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        returns() {
          if (table === 'session_analyses') {
            return Promise.resolve({ data: fakeDb.sessionAnalyses, error: null });
          }
          if (table === 'detected_patterns') {
            return Promise.resolve({ data: fakeDb.detectedPatterns.filter((p) => p.status === 'active'), error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          if (table === 'detected_patterns') {
            const row = fakeDb.detectedPatterns.find(
              (p) => p.user_id === filters.user_id && p.pattern_type === filters.pattern_type && p.status === 'active',
            );
            return Promise.resolve({ data: row ? { id: row.id } : null, error: null });
          }
          if (table === 'focus_topics') {
            const row = fakeDb.focusTopics.find(
              (f) => f.user_id === filters.user_id && f.topic_key === filters.topic_key,
            );
            return Promise.resolve({ data: row ?? null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update(payload: Record<string, unknown>) {
          pendingFocusTopicUpdate = payload;
          return this;
        },
        insert(payload: Record<string, unknown>) {
          if (table === 'detected_patterns') {
            fakeDb.detectedPatterns.push({
              id: `pattern-${fakeDb.detectedPatterns.length + 1}`,
              user_id: String(payload.user_id),
              pattern_type: String(payload.pattern_type),
              status: (payload.status as PatternRow['status']) ?? 'active',
              evidence: (payload.evidence as Record<string, unknown>) ?? {},
            });
          }
          return Promise.resolve({ error: null });
        },
        upsert(payload: Record<string, unknown>) {
          if (table === 'focus_topics') {
            const idx = fakeDb.focusTopics.findIndex(
              (row) => row.user_id === payload.user_id && row.topic_key === payload.topic_key,
            );
            const row = {
              id: idx >= 0 ? fakeDb.focusTopics[idx]!.id : `focus-${fakeDb.focusTopics.length + 1}`,
              created_at: idx >= 0 ? fakeDb.focusTopics[idx]!.created_at : '2026-04-24T00:00:00.000Z',
              updated_at: '2026-04-24T00:00:00.000Z',
              ...payload,
            } as FocusTopicRow;
            if (idx >= 0) fakeDb.focusTopics[idx] = row;
            else fakeDb.focusTopics.push(row);
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: row, error: null });
                  },
                };
              },
            };
          }
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

let promptCall = 0;
const executePromptMock = vi.fn(async ({ promptKey }: { promptKey: string }) => {
  promptCall += 1;
  if (promptKey === 'multi_session_pattern_detection') {
    return {
      ok: true,
      output: {
        enough_data: true,
        stable_patterns: [
          {
            pattern_key: 'coherence_and_sentence_structure',
            label: 'Kohärenz',
            description: 'd',
            recurrence: 0.8,
            confidence: 0.8,
            supporting_sessions: ['s1', 's2', 's3'],
            communicative_impact: 'high',
            evidence: ['e1'],
            performance_conditions: {
              speech_mode: 'dialog',
              spontaneity: 'spontaneous',
              task_complexity: 'medium',
              register_pressure: 'medium',
              consistent_condition_count: 3,
            },
          },
        ],
      },
    };
  }

  if (promptCall % 2 === 0) {
    return {
      ok: true,
      output: {
        selection_status: 'selected',
        focus_topic: {
          topic_key: 'coherence_focus',
          label: 'Kohärenz',
          short_explanation: 'x',
          reason: 'x',
          source_pattern_key: 'coherence_and_sentence_structure',
        },
        reason: 'sufficient',
        evidence_summary: {
          sessions_analyzed: 3,
          strongest_pattern_key: 'coherence_and_sentence_structure',
          recurrence: 0.8,
          confidence: 0.8,
          communicative_impact: 'high',
          learner_readiness: 0.7,
        },
      },
    };
  }

  return {
    ok: true,
    output: {
      selection_status: 'insufficient_evidence',
      focus_topic: null,
      reason: 'not enough',
      evidence_summary: {
        sessions_analyzed: 3,
        strongest_pattern_key: null,
        recurrence: 0.4,
        confidence: 0.5,
        communicative_impact: null,
        learner_readiness: 0.3,
      },
    },
  };
});

vi.mock('@/services/supabase/client', () => ({
  supabaseClient: makeSupabaseMock(),
}));

vi.mock('@/services/ai/ai-orchestrator.service', () => ({
  aiOrchestratorService: {
    executePrompt: executePromptMock,
  },
}));

vi.mock('@/services/supabase/app-settings.service', () => ({
  appSettingsService: {
    getSettings: vi.fn(async () => ({
      minSessionsForDiagnosis: 3,
      featureFlags: {
        multi_session_patterns: true,
        focus_topic_selection: true,
      },
    })),
    isFeatureEnabled: vi.fn((settings: { featureFlags: Record<string, boolean> }, key: string) => settings.featureFlags[key] === true),
  },
}));

describe('multiSessionPatternService single-active-focus integration', () => {
  beforeEach(() => {
    promptCall = 0;
    resetDb();
    fakeDb.sessionAnalyses = [createAnalysis('1', 's1'), createAnalysis('2', 's2'), createAnalysis('3', 's3')];
  });

  it('A) selected: deaktiviert alten aktiven Fokus und setzt neuen als einzigen aktiven Fokus', async () => {
    const oldFocus = {
      id: 'focus-old',
      user_id: 'user-1',
      status: 'in_training',
      topic_key: 'old_focus',
      title: 'Old',
      description: null,
      priority: 2,
      confidence: 0.6,
      mastery_level: 2,
      source_pattern_id: null,
      metadata: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    } satisfies FocusTopicRow;
    fakeDb.focusTopics = [oldFocus];

    const { multiSessionPatternService } = await import('@/services/supabase/multi-session-pattern.service');
    await multiSessionPatternService.detectAndPersist('user-1');

    const active = fakeDb.focusTopics.filter((f) => f.status === 'in_training');
    expect(active).toHaveLength(1);
    expect(active[0]?.topic_key).toBe('coherence_focus');
    expect(fakeDb.focusTopics.find((f) => f.id === 'focus-old')?.status).toBe('beobachtet');
  });

  it('B) insufficient_evidence: erzeugt keinen neuen Fokus und deaktiviert bestehenden nicht', async () => {
    const oldFocus = {
      id: 'focus-old',
      user_id: 'user-1',
      status: 'in_training',
      topic_key: 'old_focus',
      title: 'Old',
      description: null,
      priority: 2,
      confidence: 0.6,
      mastery_level: 2,
      source_pattern_id: null,
      metadata: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    } satisfies FocusTopicRow;
    fakeDb.focusTopics = [oldFocus];

    promptCall = 1;
    const { multiSessionPatternService } = await import('@/services/supabase/multi-session-pattern.service');
    await multiSessionPatternService.detectAndPersist('user-1');

    const active = fakeDb.focusTopics.filter((f) => f.status === 'in_training');
    expect(active).toHaveLength(1);
    expect(active[0]?.topic_key).toBe('old_focus');
  });

  it('C) wiederholter gleicher Fokus erzeugt kein Duplikat', async () => {
    const existing = {
      id: 'focus-existing',
      user_id: 'user-1',
      status: 'in_training',
      topic_key: 'coherence_focus',
      title: 'Kohärenz',
      description: null,
      priority: 3,
      confidence: 0.8,
      mastery_level: 3,
      source_pattern_id: null,
      metadata: {},
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    } satisfies FocusTopicRow;
    fakeDb.focusTopics = [existing];

    const { multiSessionPatternService } = await import('@/services/supabase/multi-session-pattern.service');
    await multiSessionPatternService.detectAndPersist('user-1');

    expect(fakeDb.focusTopics.filter((f) => f.topic_key === 'coherence_focus')).toHaveLength(1);
    expect(fakeDb.focusTopics.filter((f) => f.status === 'in_training')).toHaveLength(1);
  });

  it('D) Reaktivierung/Deaktivierung schreibt eindeutige Transition-Historie', async () => {
    const oldPrimary = {
      id: 'focus-old',
      user_id: 'user-1',
      status: 'in_training',
      topic_key: 'old_focus',
      title: 'Alt',
      description: null,
      priority: 2,
      confidence: 0.6,
      mastery_level: 2,
      source_pattern_id: null,
      metadata: { status_history: [] },
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    } satisfies FocusTopicRow;

    const reactivatedTopic = {
      id: 'focus-coherence',
      user_id: 'user-1',
      status: 'beobachtet',
      topic_key: 'coherence_focus',
      title: 'Kohärenz',
      description: null,
      priority: 3,
      confidence: 0.7,
      mastery_level: 1,
      source_pattern_id: null,
      metadata: { status_history: [] },
      created_at: '2026-04-19T00:00:00.000Z',
      updated_at: '2026-04-19T00:00:00.000Z',
    } satisfies FocusTopicRow;

    fakeDb.focusTopics = [oldPrimary, reactivatedTopic];

    const { multiSessionPatternService } = await import('@/services/supabase/multi-session-pattern.service');
    await multiSessionPatternService.detectAndPersist('user-1');

    const deactivated = fakeDb.focusTopics.find((item) => item.id === 'focus-old');
    expect(deactivated?.status).toBe('beobachtet');
    const deactivatedHistory = (deactivated?.metadata as { status_history?: Array<Record<string, unknown>> })?.status_history ?? [];
    expect(deactivatedHistory).toHaveLength(1);
    expect(deactivatedHistory[0]).toMatchObject({
      from: 'in_training',
      to: 'beobachtet',
      reason: 'single_active_focus_constraint_enforced',
      source: 'multi_session_pattern.service',
    });

    const reactivated = fakeDb.focusTopics.find((item) => item.id === 'focus-coherence');
    expect(reactivated?.status).toBe('in_training');
    const reactivatedHistory = (reactivated?.metadata as { status_history?: Array<Record<string, unknown>> })?.status_history ?? [];
    expect(reactivatedHistory).toHaveLength(1);
    expect(reactivatedHistory[0]).toMatchObject({
      from: 'beobachtet',
      to: 'in_training',
      reason: 'selected_by_focus_topic_selector',
      source: 'multi_session_pattern.service',
    });
  });

});
