import { describe, expect, it } from 'vitest';

import { extractCategoryScore, parseAndValidateSessionAnalysisOutput } from '@/services/supabase/session-analysis.service';

function createCategoryScoreFixture(score: number, confidence: number) {
  return {
    score,
    confidence,
    justification: 'ok',
    evidence: [],
    cefr_band_estimate: 'B1.1',
    can_do_evidence: ['Beleg eins', 'Beleg zwei'],
    limiting_factor: 'Testgrenze',
  };
}

function createSessionAnalysisFixture() {
  return {
    session_summary: 'Kurze technische Zusammenfassung.',
    category_scores: {
      grammatical_accuracy: createCategoryScoreFixture(4, 0.9),
      lexical_appropriateness: createCategoryScoreFixture(3, 0.8),
      coherence_and_sentence_structure: createCategoryScoreFixture(4, 0.8),
      register_and_naturalness: createCategoryScoreFixture(4, 0.9),
      fluency: createCategoryScoreFixture(3, 0.7),
      intelligibility: createCategoryScoreFixture(3, 0.7),
      interactional_competence: createCategoryScoreFixture(4, 0.8),
    },
    detected_patterns: [
      {
        pattern_key: 'dummy_pattern',
        label: 'Dummy Pattern',
        description: 'Technischer Platzhalter',
        frequency_estimate: 'low',
        communicative_impact: 'low',
        category: 'grammatical_accuracy',
      },
    ],
    priority_intervention: {
      pattern_key: 'dummy_pattern',
      label: 'Dummy Pattern',
      reason: 'Technische Priorisierung',
    },
  };
}

describe('parseAndValidateSessionAnalysisOutput', () => {
  it('akzeptiert einen technischen DB-Fake mit gültiger session_analysis Struktur', () => {
    const parsed = parseAndValidateSessionAnalysisOutput(createSessionAnalysisFixture());

    expect(parsed.session_summary.length).toBeGreaterThan(0);
    expect(Object.values(parsed.category_scores)).toHaveLength(7);
  });

  it('verwirft Dezimalwerte bei category_scores.*.score, wenn Integer erwartet wird', () => {
    const payload = structuredClone(createSessionAnalysisFixture()) as Record<string, unknown>;
    const categoryScores = payload.category_scores as Record<string, Record<string, unknown>>;
    const grammarScore = categoryScores.grammatical_accuracy;
    expect(grammarScore).toBeDefined();
    if (!grammarScore) {
      throw new Error('Testsetup: grammatical_accuracy fehlt im Fixture-Payload.');
    }
    grammarScore.score = 4.5;

    expect(() => parseAndValidateSessionAnalysisOutput(payload)).toThrow(
      'category_scores.grammatical_accuracy.score muss ein Integer zwischen 0 und 5 sein.',
    );
  });
});

describe('extractCategoryScore', () => {
  it('liest den Score aus dem neuen Objektmodell', () => {
    const score = extractCategoryScore(
      {
        grammatical_accuracy: {
          score: 4,
          confidence: 0.8,
          justification: 'stabil',
          evidence: [],
        },
      },
      'grammatical_accuracy',
    );

    expect(score).toBe(4);
  });

  it('liest den Score aus dem Legacy-Modell', () => {
    const score = extractCategoryScore(
      {
        grammatical_accuracy: 3,
      },
      'grammatical_accuracy',
    );

    expect(score).toBe(3);
  });

  it('gibt null für ungültiges Objektmodell ohne score zurück', () => {
    const score = extractCategoryScore(
      {
        grammatical_accuracy: {
          confidence: 0.8,
        },
      },
      'grammatical_accuracy',
    );

    expect(score).toBeNull();
  });

  it('ist robust gegenüber null, Arrays und Strings als category_scores', () => {
    expect(extractCategoryScore(null, 'grammatical_accuracy')).toBeNull();
    expect(extractCategoryScore([], 'grammatical_accuracy')).toBeNull();
    expect(extractCategoryScore('invalid', 'grammatical_accuracy')).toBeNull();
  });
});
