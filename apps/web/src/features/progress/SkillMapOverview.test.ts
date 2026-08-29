import { describe, expect, it } from 'vitest';

import {
  buildSkillMapMatrix,
  deriveSkillMapDataState,
  hasTrend,
  toFivePointMeterWidth,
} from '@/features/progress/SkillMapOverview';
import {
  SESSION_ANALYSIS_CATEGORIES,
  type SessionAnalysisCategory,
} from '@/services/supabase/session-analysis.service';
import type { SessionAnalysisRow } from '@/types/database';

function createAnalysisRow(
  id: string,
  scores: Partial<Record<SessionAnalysisCategory, number>> = {},
): SessionAnalysisRow {
  return {
    id: `analysis-${id}`,
    user_id: 'user-1',
    session_id: `session-${id}`,
    transcript_id: null,
    status: 'completed',
    analysis_version: 'v1',
    score_overall: null,
    summary: {},
    metrics: {},
    recommendations: {},
    category_scores_json: scores,
    detected_patterns_json: [],
    priority_intervention_json: {},
    session_summary: 'ok',
    last_error: null,
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
  };
}

describe('SkillMapOverview logic', () => {
  it('liefert Anzeige-Text im /5-Schema und korrekte Balkenbreite', () => {
    const matrix = buildSkillMapMatrix([
      createAnalysisRow('latest', { grammatical_accuracy: 4 }),
      createAnalysisRow('first', { grammatical_accuracy: 2 }),
    ]);
    const grammar = matrix.find((entry) => entry.category === 'grammatical_accuracy');

    expect(grammar?.latest).toBe(4);
    expect(`${grammar?.latest}/5`).toBe('4/5');
    expect(grammar?.latest).not.toBeNull();
    expect(toFivePointMeterWidth(grammar!.latest as number)).toBe('80%');
  });

  it('markiert 0 Datenpunkte als empty ohne Werte-, Balken- oder Delta-Platzhalterpfade', () => {
    const analyses = [createAnalysisRow('empty-1'), createAnalysisRow('empty-2')];
    const matrix = buildSkillMapMatrix(analyses);

    expect(deriveSkillMapDataState(analyses, matrix)).toBe('empty');
    expect(matrix.every((entry) => entry.pointCount === 0)).toBe(true);
    expect(matrix.every((entry) => entry.latest === null && entry.average === null && entry.delta === null)).toBe(true);
    expect(matrix.every((entry) => hasTrend(entry) === false)).toBe(true);
  });

  it('markiert 1 Session mit Scores als preliminary und liefert noch keinen numerischen Trend', () => {
    const analyses = [
      createAnalysisRow('single', {
        grammatical_accuracy: 4,
        fluency: 3,
      }),
    ];
    const matrix = buildSkillMapMatrix(analyses);

    expect(deriveSkillMapDataState(analyses, matrix)).toBe('preliminary');

    const grammar = matrix.find((entry) => entry.category === 'grammatical_accuracy');
    expect(grammar?.latest).toBe(4);
    expect(grammar?.average).toBe(4);
    expect(hasTrend(grammar!)).toBe(false);
  });

  it('markiert 2+ Sessions mit stabilen Messpunkten als ready und berechnet Delta aus erstem vs letztem Wert', () => {
    const analyses = [
      createAnalysisRow('latest', { grammatical_accuracy: 5, fluency: 3 }),
      createAnalysisRow('older', { grammatical_accuracy: 2, fluency: 4 }),
      createAnalysisRow('oldest', { grammatical_accuracy: 1, fluency: 2 }),
    ];
    const matrix = buildSkillMapMatrix(analyses);

    expect(deriveSkillMapDataState(analyses, matrix)).toBe('ready');

    const grammar = matrix.find((entry) => entry.category === 'grammatical_accuracy');
    expect(grammar?.first).toBe(1);
    expect(grammar?.latest).toBe(5);
    expect(grammar?.delta).toBe(4);
    expect(hasTrend(grammar!)).toBe(true);
  });

  it('liefert kein Delta pro Skill mit nur einem Messpunkt, auch wenn andere Skills mehrere Punkte haben', () => {
    const analyses = [
      createAnalysisRow('latest', {
        grammatical_accuracy: 4,
        intelligibility: 5,
      }),
      createAnalysisRow('older', {
        grammatical_accuracy: 2,
      }),
      createAnalysisRow('oldest', {
        grammatical_accuracy: 1,
      }),
    ];
    const matrix = buildSkillMapMatrix(analyses);

    expect(deriveSkillMapDataState(analyses, matrix)).toBe('ready');

    const grammar = matrix.find((entry) => entry.category === 'grammatical_accuracy');
    const intelligibility = matrix.find((entry) => entry.category === 'intelligibility');

    expect(hasTrend(grammar!)).toBe(true);
    expect(grammar?.delta).toBe(3);

    expect(intelligibility?.pointCount).toBe(1);
    expect(intelligibility?.delta).toBe(0);
    expect(hasTrend(intelligibility!)).toBe(false);
  });

  it('erzeugt bei fehlenden Scores keine Fake-Balken-/Skillwerte', () => {
    const analyses = [
      createAnalysisRow('mixed', {
        lexical_appropriateness: 3,
      }),
    ];
    const matrix = buildSkillMapMatrix(analyses);

    const withScore = matrix.filter((entry) => entry.pointCount > 0);
    const withoutScore = matrix.filter((entry) => entry.pointCount === 0);

    expect(withScore).toHaveLength(1);
    expect(withScore[0]?.category).toBe('lexical_appropriateness');
    expect(withoutScore).toHaveLength(SESSION_ANALYSIS_CATEGORIES.length - 1);
    expect(withoutScore.every((entry) => entry.latest === null && entry.average === null)).toBe(true);
  });
});
