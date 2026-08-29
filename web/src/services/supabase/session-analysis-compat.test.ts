import { describe, expect, it } from 'vitest';

import { normalizeSessionAnalysisRow } from '@/services/supabase/session-analysis-compat';
import type { SessionAnalysisRow } from '@/types/database';

function createLegacyRow(overrides: Partial<SessionAnalysisRow> = {}): SessionAnalysisRow {
  return {
    id: 'analysis-1',
    user_id: 'user-1',
    session_id: 'session-1',
    transcript_id: null,
    status: 'completed',
    analysis_version: 'legacy',
    score_overall: 76,
    summary: {},
    metrics: {},
    recommendations: {},
    category_scores_json: {},
    detected_patterns_json: [],
    priority_intervention_json: {},
    session_summary: 'legacy',
    last_error: null,
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeSessionAnalysisRow', () => {
  it('mappt Legacy-0..100-Scores deterministisch auf 0..5', () => {
    const row = createLegacyRow({
      category_scores_json: {
        grammatical_accuracy: 0,
        lexical_appropriateness: 20,
        fluency: 40,
        intelligibility: 60,
        coherence_and_sentence_structure: 80,
        register_and_naturalness: 100,
        interactional_competence: 76,
      },
    });

    const normalized = normalizeSessionAnalysisRow(row);
    const scores = normalized.category_scores_json as Record<string, { score: number } | undefined>;
    const expectCategoryScore = (category: string, expected: number) => {
      const entry = scores[category];
      expect(entry).toBeDefined();
      expect(entry?.score).toBe(expected);
    };

    expectCategoryScore('grammatical_accuracy', 0);
    expectCategoryScore('lexical_appropriateness', 1);
    expectCategoryScore('fluency', 2);
    expectCategoryScore('intelligibility', 3);
    expectCategoryScore('coherence_and_sentence_structure', 4);
    expectCategoryScore('register_and_naturalness', 5);
    expectCategoryScore('interactional_competence', 4);
  });
});
