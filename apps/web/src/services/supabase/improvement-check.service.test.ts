import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/supabase/client', () => ({
  supabaseClient: {
    from: vi.fn(),
  },
}));

import {
  computeMasteryLevel,
  improvementCheckService,
  mapDecisionToCheckStatus,
  normalizeImprovementDecision,
  parseImprovementCheckPromptOutput,
} from '@/services/supabase/improvement-check.service';
import { applyFocusEvent } from '@/services/domain/focus-topic-transitions';
import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';
import { appSettingsService } from '@/services/supabase/app-settings.service';
import { supabaseClient } from '@/services/supabase/client';

vi.mock('@/services/ai/ai-orchestrator.service', () => ({
  aiOrchestratorService: {
    executePrompt: vi.fn(),
  },
}));

vi.mock('@/services/supabase/app-settings.service', async () => {
  const actual = await vi.importActual('@/services/supabase/app-settings.service');
  return {
    ...actual,
    appSettingsService: {
      getSettings: vi.fn(async () => ({
        improvementMinRecentSessions: 1,
        improvementMinConfidence: 0.6,
        improvementRequiredStreak: null,
      })),
    },
  };
});

describe('improvement-check decision mapping', () => {
  it('mappt improved/worsened/unchanged korrekt auf check-status', () => {
    expect(mapDecisionToCheckStatus('improved')).toBe('passed');
    expect(mapDecisionToCheckStatus('worsened')).toBe('failed');
    expect(mapDecisionToCheckStatus('unchanged')).toBe('skipped');
  });

  it('normalisiert auf insufficient_data bei zu niedriger confidence', () => {
    const decision = normalizeImprovementDecision({
      decision: 'improved',
      confidence: 0.4,
      previousDecisions: ['improved'],
      minConfidence: 0.6,
      requiredStreak: null,
    });

    expect(decision).toBe('insufficient_data');
    expect(mapDecisionToCheckStatus(decision)).toBe('skipped');
  });


  it('integriert Decision-Mapping mit Transition-Engine (improved/worsened/unchanged)', () => {
    const improvedStatus = applyFocusEvent('in_training', `improvement_${normalizeImprovementDecision({
      decision: 'improved',
      confidence: 0.95,
      previousDecisions: ['improved'],
      minConfidence: 0.6,
      requiredStreak: null,
    })}` as 'improvement_improved', {
      reason: 'check:improved',
      source: 'improvement_check.service',
    }).nextStatus;

    const worsenedStatus = applyFocusEvent('teilweise_stabilisiert', `improvement_${normalizeImprovementDecision({
      decision: 'worsened',
      confidence: 0.95,
      previousDecisions: ['unchanged'],
      minConfidence: 0.6,
      requiredStreak: null,
    })}` as 'improvement_worsened', {
      reason: 'check:worsened',
      source: 'improvement_check.service',
    }).nextStatus;

    const unchangedStatus = applyFocusEvent('stabil', `improvement_${normalizeImprovementDecision({
      decision: 'unchanged',
      confidence: 0.95,
      previousDecisions: ['improved'],
      minConfidence: 0.6,
      requiredStreak: null,
    })}` as 'improvement_unchanged', {
      reason: 'check:unchanged',
      source: 'improvement_check.service',
    }).nextStatus;

    expect(mapDecisionToCheckStatus('improved')).toBe('passed');
    expect(improvedStatus).toBe('teilweise_stabilisiert');

    expect(mapDecisionToCheckStatus('worsened')).toBe('failed');
    expect(worsenedStatus).toBe('wiederkehrend');

    expect(mapDecisionToCheckStatus('unchanged')).toBe('skipped');
    expect(unchangedStatus).toBe('stabil');
  });

  it('erzwingt requiredStreak: improved bleibt bis zur Streak unchanged', () => {
    const first = normalizeImprovementDecision({
      decision: 'improved',
      confidence: 0.9,
      previousDecisions: [],
      minConfidence: 0.6,
      requiredStreak: 2,
    });
    const second = normalizeImprovementDecision({
      decision: 'improved',
      confidence: 0.9,
      previousDecisions: ['improved'],
      minConfidence: 0.6,
      requiredStreak: 2,
    });

    expect(first).toBe('unchanged');
    expect(second).toBe('improved');
  });

  it('akzeptiert confidence im Standardpfad nur im Bereich 0..1', () => {
    const parsed = parseImprovementCheckPromptOutput({
      decision: 'improved',
      confidence: 80,
      rationale: 'test',
      focus_evidence: 'test',
      baseline_evidence: ['a'],
      current_evidence: ['b'],
      focus_topic_match: true,
      recommendation: 'test',
    });

    expect(parsed.confidence).toBe(0);
  });

  it('normalisiert confidence 0..100 nur im expliziten Legacy-Pfad', () => {
    const parsed = parseImprovementCheckPromptOutput({
      decision: 'improved',
      confidence: 80,
      confidence_scale: 'legacy_0_100',
      rationale: 'test',
      focus_evidence: 'test',
      baseline_evidence: ['a'],
      current_evidence: ['b'],
      focus_topic_match: true,
      recommendation: 'test',
    });

    expect(parsed.confidence).toBe(0.8);
  });

  it('parsed focus_topic_key und focus_topic_key_match explizit', () => {
    const parsed = parseImprovementCheckPromptOutput({
      decision: 'unchanged',
      confidence: 0.75,
      rationale: 'test',
      focus_evidence: 'test',
      baseline_evidence: ['a'],
      current_evidence: ['b'],
      focus_topic_key: 'coherence_sentence_linking',
      focus_topic_key_match: true,
      focus_topic_match: true,
      recommendation: 'test',
    });

    expect(parsed.focus_topic_key).toBe('coherence_sentence_linking');
    expect(parsed.focus_topic_key_match).toBe(true);
  });

  it('fallback für fehlenden focus_topic_key-match ist false/leer', () => {
    const parsed = parseImprovementCheckPromptOutput({
      decision: 'unchanged',
      confidence: 0.75,
      rationale: 'test',
      focus_evidence: 'test',
      baseline_evidence: ['a'],
      current_evidence: ['b'],
      focus_topic_match: true,
      recommendation: 'test',
    });

    expect(parsed.focus_topic_key).toBe('');
    expect(parsed.focus_topic_key_match).toBe(false);
  });
});

describe('improvement-check mastery level boundaries', () => {
  it('klemmt mastery am unteren Rand (0)', () => {
    const next = computeMasteryLevel({
      currentLevel: 0,
      currentDecision: 'worsened',
      averageRecentScore: 1,
      deltaToBaseline: -1,
      previousDecisions: ['worsened', 'worsened'],
    });

    expect(next).toBe(0);
  });

  it('klemmt mastery am oberen Rand (5)', () => {
    const next = computeMasteryLevel({
      currentLevel: 5,
      currentDecision: 'improved',
      averageRecentScore: 5,
      deltaToBaseline: 1,
      previousDecisions: ['improved', 'improved'],
    });

    expect(next).toBe(5);
  });


  it('steigt bei Verbesserung und sinkt bei Rückfall', () => {
    const increased = computeMasteryLevel({
      currentLevel: 2,
      currentDecision: 'improved',
      averageRecentScore: 4.5,
      deltaToBaseline: 0.6,
      previousDecisions: ['unchanged', 'improved'],
    });

    const decreased = computeMasteryLevel({
      currentLevel: 3,
      currentDecision: 'worsened',
      averageRecentScore: 2,
      deltaToBaseline: -0.8,
      previousDecisions: ['unchanged', 'worsened'],
    });

    expect(increased).toBeGreaterThan(2);
    expect(decreased).toBeLessThan(3);
  });

  it('insufficient_data verändert mastery nicht', () => {
    const next = computeMasteryLevel({
      currentLevel: 3,
      currentDecision: 'insufficient_data',
      averageRecentScore: 4,
      deltaToBaseline: 0.5,
      previousDecisions: ['improved', 'improved'],
    });

    expect(next).toBe(3);
  });
});

describe('improvement-check focus binding', () => {
  it('akzeptiert neues Schema mit focus_topic_key(+match) und übernimmt improved', async () => {
    const fromMock = vi.mocked(supabaseClient.from);
    const executePromptMock = vi.mocked(aiOrchestratorService.executePrompt);
    const getSettingsMock = vi.mocked(appSettingsService.getSettings);

    getSettingsMock.mockResolvedValue({
      improvementMinRecentSessions: 1,
      improvementMinConfidence: 0.6,
      improvementRequiredStreak: null,
    } as never);

    const insertedChecks: Array<Record<string, unknown>> = [];
    const updatedFocusTopics: Array<Record<string, unknown>> = [];

    const activeFocusTopic = {
      id: 'focus-1',
      user_id: 'user-1',
      status: 'in_training',
      topic_key: 'prep_dativ_akkusativ',
      title: 'Präpositionen',
      description: null,
      mastery_level: 2,
      metadata: {
        source_pattern_type: 'grammatical_accuracy',
        baseline: {
          analysis_id: 'analysis-0',
          created_at: '2026-04-10T00:00:00.000Z',
          category_score: 2,
        },
      },
    };

    const recentAnalyses = [
      {
        id: 'analysis-1',
        session_id: 'session-free-1',
        user_id: 'user-1',
        status: 'completed',
        created_at: '2026-04-20T00:00:00.000Z',
        category_scores_json: {
          grammatical_accuracy: {
            score: 3,
          },
        },
        detected_patterns_json: [
          {
            pattern_key: 'prep_dativ_akkusativ',
            label: 'Präpositionen',
            description: 'Artikelwahl bei Präpositionen',
            frequency_estimate: 'medium',
            communicative_impact: 'medium',
            category: 'grammatical_accuracy',
          },
        ],
        session_summary: 'summary',
        priority_intervention_json: {
          pattern_key: 'prep_dativ_akkusativ',
          label: 'Präpositionen',
          reason: 'häufig',
        },
        conversation_sessions: {
          source: 'free_speech',
        },
      },
    ];

    fromMock.mockImplementation(((table: string) => {
      if (table === 'focus_topics') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: activeFocusTopic, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updatedFocusTopics.push(payload);
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      }

      if (table === 'session_analyses') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                neq: () => ({
                  gt: () => ({
                    order: () => ({
                      returns: async () => ({ data: recentAnalyses, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'improvement_checks') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    returns: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            insertedChecks.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'session_analyses as baseline') {
        return {};
      }

      if (table === 'session_analyses') {
        return {};
      }

      throw new Error(`Unexpected table: ${table}`);
    }) as never);

    executePromptMock.mockResolvedValue({
      ok: true,
      output: {
        decision: 'improved',
        confidence: 0.95,
        rationale: 'sieht besser aus',
        focus_evidence: 'mehr korrekte Präpositionen',
        baseline_evidence: ['falsch 1'],
        current_evidence: ['richtig 1'],
        focus_topic_key: 'prep_dativ_akkusativ',
        focus_topic_key_match: true,
        focus_topic_match: true,
        recommendation: 'weiter so',
      },
    } as never);

    await improvementCheckService.runForActiveFocusTopic({
      userId: 'user-1',
      latestSessionId: 'session-1',
    });

    const resultPayload = insertedChecks[0]?.result_payload as Record<string, unknown>;
    expect(resultPayload.raw_decision).toBe('improved');
    expect(resultPayload.focus_bound_decision).toBe('improved');
    expect(resultPayload.decision).toBe('improved');
    expect(resultPayload.focus_topic_key_match).toBe(true);
    expect(resultPayload.focus_topic_match).toBe(true);
    expect(updatedFocusTopics).toHaveLength(1);
  });

  it('ignoriert Fremd-Pattern (focus_topic_key mismatch) und speichert decision=insufficient_data', async () => {
    const fromMock = vi.mocked(supabaseClient.from);
    const executePromptMock = vi.mocked(aiOrchestratorService.executePrompt);
    const getSettingsMock = vi.mocked(appSettingsService.getSettings);

    getSettingsMock.mockResolvedValue({
      improvementMinRecentSessions: 1,
      improvementMinConfidence: 0.6,
      improvementRequiredStreak: null,
    } as never);

    const insertedChecks: Array<Record<string, unknown>> = [];
    const updatedFocusTopics: Array<Record<string, unknown>> = [];

    const activeFocusTopic = {
      id: 'focus-1',
      user_id: 'user-1',
      status: 'in_training',
      topic_key: 'prep_dativ_akkusativ',
      title: 'Präpositionen',
      description: null,
      mastery_level: 2,
      metadata: {
        source_pattern_type: 'grammatical_accuracy',
        baseline: {
          analysis_id: 'analysis-0',
          created_at: '2026-04-10T00:00:00.000Z',
          category_score: 2,
        },
      },
    };

    const recentAnalyses = [
      {
        id: 'analysis-1',
        session_id: 'session-free-1',
        user_id: 'user-1',
        status: 'completed',
        created_at: '2026-04-20T00:00:00.000Z',
        category_scores_json: {
          grammatical_accuracy: {
            score: 3,
          },
        },
        detected_patterns_json: [
          {
            pattern_key: 'prep_dativ_akkusativ',
            label: 'Präpositionen',
            description: 'Artikelwahl bei Präpositionen',
            frequency_estimate: 'medium',
            communicative_impact: 'medium',
            category: 'grammatical_accuracy',
          },
        ],
        session_summary: 'summary',
        priority_intervention_json: {
          pattern_key: 'prep_dativ_akkusativ',
          label: 'Präpositionen',
          reason: 'häufig',
        },
        conversation_sessions: {
          source: 'free_speech',
        },
      },
    ];

    fromMock.mockImplementation(((table: string) => {
      if (table === 'focus_topics') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: activeFocusTopic, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updatedFocusTopics.push(payload);
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      }

      if (table === 'session_analyses') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                neq: () => ({
                  gt: () => ({
                    order: () => ({
                      returns: async () => ({ data: recentAnalyses, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'improvement_checks') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    returns: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            insertedChecks.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'session_analyses as baseline') {
        return {};
      }

      if (table === 'session_analyses') {
        return {};
      }

      throw new Error(`Unexpected table: ${table}`);
    }) as never);

    executePromptMock.mockResolvedValue({
      ok: true,
      output: {
        decision: 'improved',
        confidence: 0.95,
        rationale: 'sieht besser aus',
        focus_evidence: 'mehr korrekte Präpositionen',
        baseline_evidence: ['falsch 1'],
        current_evidence: ['richtig 1'],
        focus_topic_key: 'word_order_main_clause',
        focus_topic_key_match: true,
        focus_topic_match: true,
        recommendation: 'weiter so',
      },
    } as never);

    await improvementCheckService.runForActiveFocusTopic({
      userId: 'user-1',
      latestSessionId: 'session-1',
    });

    const resultPayload = insertedChecks[0]?.result_payload as Record<string, unknown>;
    expect(resultPayload.raw_decision).toBe('improved');
    expect(resultPayload.focus_bound_decision).toBe('insufficient_data');
    expect(resultPayload.decision).toBe('insufficient_data');
    expect(resultPayload.focus_topic_key_match).toBe(false);
    expect(resultPayload.focus_topic_match).toBe(false);
    expect(updatedFocusTopics).toHaveLength(1);
  });

  it('schließt eine Session mit Fortschrittsbeweis nicht aus, nur weil sie nicht mehr die Top-Priorität dieser Session war', async () => {
    // Regressionstest für den Zwölften Nachtrag des Launch-Readiness-Audits: eine
    // Session, deren priority_intervention (die dringendste Einzelpriorität) auf ein
    // ANDERES Muster zeigt, aber deren detected_patterns/category_scores weiterhin ein
    // echtes Signal zum aktuellen Fokus-Thema liefern, darf nicht als "keine Daten zu
    // diesem Fokus-Thema" ausgeschlossen werden -- genau das passiert bei einem
    // Lernenden, der sich gerade verbessert (das Fokus-Thema ist dann oft nicht mehr
    // das dringendste Problem der Session).
    const fromMock = vi.mocked(supabaseClient.from);
    const executePromptMock = vi.mocked(aiOrchestratorService.executePrompt);
    const getSettingsMock = vi.mocked(appSettingsService.getSettings);

    getSettingsMock.mockResolvedValue({
      improvementMinRecentSessions: 1,
      improvementMinConfidence: 0.6,
      improvementRequiredStreak: null,
    } as never);

    const insertedChecks: Array<Record<string, unknown>> = [];
    const updatedFocusTopics: Array<Record<string, unknown>> = [];

    const activeFocusTopic = {
      id: 'focus-1',
      user_id: 'user-1',
      status: 'in_training',
      topic_key: 'prep_dativ_akkusativ',
      title: 'Präpositionen',
      description: null,
      mastery_level: 2,
      metadata: {
        source_pattern_type: 'grammatical_accuracy',
        baseline: {
          analysis_id: 'analysis-0',
          created_at: '2026-04-10T00:00:00.000Z',
          category_score: 2,
        },
      },
    };

    const recentAnalyses = [
      {
        id: 'analysis-1',
        session_id: 'session-free-1',
        user_id: 'user-1',
        status: 'completed',
        created_at: '2026-04-20T00:00:00.000Z',
        category_scores_json: {
          grammatical_accuracy: {
            score: 4,
          },
        },
        detected_patterns_json: [
          {
            pattern_key: 'prep_dativ_akkusativ',
            label: 'Präpositionen',
            description: 'noch vereinzelt falsch',
            frequency_estimate: 'low',
            communicative_impact: 'low',
            category: 'grammatical_accuracy',
          },
        ],
        session_summary: 'summary',
        // Top-Priorität dieser Session ist bewusst ein ANDERES Muster --
        // der Lernende hat sich beim Fokus-Thema bereits verbessert.
        priority_intervention_json: {
          pattern_key: 'word_order_main_clause',
          label: 'Wortstellung',
          reason: 'jetzt dringlicher',
        },
        conversation_sessions: {
          source: 'free_speech',
        },
      },
    ];

    fromMock.mockImplementation(((table: string) => {
      if (table === 'focus_topics') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: activeFocusTopic, error: null }),
                  }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updatedFocusTopics.push(payload);
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      }

      if (table === 'session_analyses') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                neq: () => ({
                  gt: () => ({
                    order: () => ({
                      returns: async () => ({ data: recentAnalyses, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'improvement_checks') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    returns: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            insertedChecks.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'session_analyses as baseline') {
        return {};
      }

      throw new Error(`Unexpected table: ${table}`);
    }) as never);

    executePromptMock.mockResolvedValue({
      ok: true,
      output: {
        decision: 'improved',
        confidence: 0.95,
        rationale: 'sieht besser aus',
        focus_evidence: 'mehr korrekte Präpositionen',
        baseline_evidence: ['falsch 1'],
        current_evidence: ['richtig 1'],
        focus_topic_key: 'prep_dativ_akkusativ',
        focus_topic_key_match: true,
        focus_topic_match: true,
        recommendation: 'weiter so',
      },
    } as never);

    await improvementCheckService.runForActiveFocusTopic({
      userId: 'user-1',
      latestSessionId: 'session-1',
    });

    // Der entscheidende Punkt: der Prompt wurde überhaupt ausgeführt (die Session
    // wurde NICHT als "insufficient_data"/"nicht genug Daten" übersprungen), obwohl
    // ihre priority_intervention auf ein anderes Muster zeigte.
    expect(executePromptMock).toHaveBeenCalled();
    const resultPayload = insertedChecks[0]?.result_payload as Record<string, unknown>;
    expect(resultPayload.decision).toBe('improved');
    expect(resultPayload.reason).not.toBe('not_enough_focus_topic_sessions_after_hard_filter');
  });
});
