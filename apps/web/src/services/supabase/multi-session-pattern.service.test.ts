import { describe, expect, it } from 'vitest';

import {
  deriveLearnerReadiness,
  evaluateFocusEvidence,
  normalizeLegacyProbabilityScale,
  parseFocusTopicSelectorOutput,
  parseMultiSessionPatternOutput,
  shouldActivateNewFocus,
} from '@/services/supabase/multi-session-pattern.service';
import { validateWithSchema } from '@/services/ai/json-schema-validator';
import type { JsonSchema } from '@/services/ai/types';

describe('multi-session diagnosis parsing and scoring', () => {
  it('normalisiert Legacy-0..100 nur über Legacy-Normalisierung auf 0.0..1.0', () => {
    expect(normalizeLegacyProbabilityScale(0.75)).toBe(0.75);
    expect(normalizeLegacyProbabilityScale(80)).toBe(0.8);
    expect(normalizeLegacyProbabilityScale(100)).toBe(1);
    expect(normalizeLegacyProbabilityScale(150)).toBeNull();
    expect(normalizeLegacyProbabilityScale(-5)).toBeNull();
  });

  it('übernimmt supporting_sessions und normalisiert recurrence/confidence nur im Legacy-Pfad', () => {
    const parsed = parseMultiSessionPatternOutput({
      enough_data: true,
      stable_patterns: [
        {
          pattern_key: 'coherence_and_sentence_structure',
          label: 'Kohärenz',
          description: 'Beschreibung',
          recurrence: 80,
          confidence: 0.7,
          supporting_sessions: ['s1', 's2', 's3'],
          communicative_impact: 'high',
          evidence: ['e1'],
          performance_conditions: {
            speech_mode: 'dialog',
            spontaneity: 'spontaneous',
            task_complexity: 'medium',
            register_pressure: 'medium',
            consistent_condition_count: 2,
          },
        },
      ],
    }, { allowLegacyScores: true });

    expect(parsed.stable_patterns[0]?.supporting_sessions).toEqual(['s1', 's2', 's3']);
    expect(parsed.stable_patterns[0]?.recurrence).toBe(0.8);
    expect(parsed.stable_patterns[0]?.confidence).toBe(0.7);
  });

  it('unter 3 Sessions ergibt insufficient_evidence in zentraler Evidenzfunktion', () => {
    const decision = evaluateFocusEvidence({
      sessionsAnalyzed: 2,
      recurrence: 0.8,
      confidence: 0.9,
      communicativeImpact: 'high',
      learnerReadiness: 0.7,
    });
    expect(decision.selectionStatus).toBe('insufficient_evidence');
  });

  it('3 Sessions mit schwacher recurrence ergeben insufficient_evidence', () => {
    const decision = evaluateFocusEvidence({
      sessionsAnalyzed: 3,
      recurrence: 0.4,
      confidence: 0.9,
      communicativeImpact: 'high',
      learnerReadiness: 0.7,
    });
    expect(decision.selectionStatus).toBe('insufficient_evidence');
  });

  it('3-5 Sessions mit starker recurrence/confidence/high impact ergeben selected', () => {
    const decision = evaluateFocusEvidence({
      sessionsAnalyzed: 4,
      recurrence: 0.8,
      confidence: 0.82,
      communicativeImpact: 'high',
      learnerReadiness: 0.66,
    });
    expect(decision.selectionStatus).toBe('selected');
  });

  it('Befund K P0 #3: weniger als 2 konsistente Performanzbedingungen ergeben insufficient_evidence', () => {
    const decision = evaluateFocusEvidence({
      sessionsAnalyzed: 4,
      recurrence: 0.8,
      confidence: 0.82,
      communicativeImpact: 'high',
      learnerReadiness: 0.66,
      performanceConditionConsistency: 1,
    });
    expect(decision.selectionStatus).toBe('insufficient_evidence');
  });

  it('Befund K P0 #3: >= 2 konsistente Performanzbedingungen blockieren nicht', () => {
    const decision = evaluateFocusEvidence({
      sessionsAnalyzed: 4,
      recurrence: 0.8,
      confidence: 0.82,
      communicativeImpact: 'high',
      learnerReadiness: 0.66,
      performanceConditionConsistency: 2,
    });
    expect(decision.selectionStatus).toBe('selected');
  });

  it('leitet learner_readiness regelbasiert ab und bleibt in 0.0..1.0', () => {
    const readiness = deriveLearnerReadiness({
      sessionsAnalyzed: 4,
      llmSuggestedReadiness: 0.9,
      currentMasteryLevel: 2,
      stablePatterns: [
        {
          pattern_key: 'p1',
          label: 'P1',
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
        {
          pattern_key: 'p2',
          label: 'P2',
          description: 'd',
          recurrence: 0.52,
          confidence: 0.66,
          supporting_sessions: ['s1', 's2'],
          communicative_impact: 'medium',
          evidence: ['e2'],
          performance_conditions: {
            speech_mode: 'monolog',
            spontaneity: 'prepared',
            task_complexity: 'low',
            register_pressure: 'low',
            consistent_condition_count: 2,
          },
        },
      ],
    });

    expect(readiness).toBeGreaterThanOrEqual(0);
    expect(readiness).toBeLessThanOrEqual(1);
  });
});

describe('focus topic selector model', () => {
  it('selection_status=insufficient_evidence erlaubt focus_topic=null', () => {
    const parsed = parseFocusTopicSelectorOutput({
      selection_status: 'insufficient_evidence',
      focus_topic: null,
      reason: 'Nicht genug Evidenz',
      evidence_summary: {
        sessions_analyzed: 2,
        strongest_pattern_key: null,
        recurrence: 0.3,
        confidence: 0.4,
        communicative_impact: null,
        learner_readiness: 0.2,
      },
    });

    expect(parsed.selection_status).toBe('insufficient_evidence');
    expect(parsed.focus_topic).toBeNull();
  });

  it('ungültige Skalen werden ohne Legacy-Pfad abgelehnt', () => {
    expect(() =>
      parseFocusTopicSelectorOutput({
        selection_status: 'insufficient_evidence',
        focus_topic: null,
        reason: 'x',
        evidence_summary: {
          sessions_analyzed: 3,
          strongest_pattern_key: null,
          recurrence: 80,
          confidence: 0.8,
          communicative_impact: null,
          learner_readiness: 0.3,
        },
      }),
    ).toThrow('Score 80 liegt außerhalb des erlaubten Bereichs 0.0..1.0.');
  });

  it('selection_status=selected verlangt focus_topic != null', () => {
    expect(() =>
      parseFocusTopicSelectorOutput({
        selection_status: 'selected',
        focus_topic: null,
        reason: 'x',
        evidence_summary: {
          sessions_analyzed: 4,
          strongest_pattern_key: 'p1',
          recurrence: 0.7,
          confidence: 0.8,
          communicative_impact: 'high',
          learner_readiness: 0.6,
        },
      }),
    ).toThrow('Bei selected muss focus_topic ein Objekt sein.');
  });

  it('focus_topic.topic_key="insufficient_evidence" ist nicht mehr erlaubt als Sondermodell', () => {
    expect(() =>
      parseFocusTopicSelectorOutput({
        selection_status: 'selected',
        focus_topic: {
          topic_key: 'insufficient_evidence',
          label: 'Bad',
          short_explanation: 'Bad',
          reason: 'Bad',
          source_pattern_key: 'p1',
        },
        reason: 'x',
        evidence_summary: {
          sessions_analyzed: 4,
          strongest_pattern_key: 'p1',
          recurrence: 0.7,
          confidence: 0.8,
          communicative_impact: 'high',
          learner_readiness: 0.6,
        },
      }),
    ).toThrow('focus_topic_selector.focus_topic.topic_key darf nicht "insufficient_evidence" sein.');
  });
});

describe('single active focus decision guard', () => {
  it('neuer Fokus darf nur bei selected aktiviert werden', () => {
    expect(shouldActivateNewFocus({ selectionStatus: 'selected', reason: 'ok', score: 0.8 })).toBe(true);
  });

  it('insufficient_evidence erzeugt keinen neuen Fokus', () => {
    expect(shouldActivateNewFocus({ selectionStatus: 'insufficient_evidence', reason: 'x', score: 0.3 })).toBe(false);
  });
});
  it('neues Schema lehnt recurrence: 80 ab', () => {
    // Prompt-Text/Schema lebt ausschließlich in der DB (docs/prompt-operations-model.md) --
    // dieses Fixture bildet nur den Ausschnitt nach, der hier tatsächlich getestet wird
    // (recurrence als 0.0-1.0-Zahl, nicht als 0-100-Legacy-Skala), statt vom immer leeren
    // statischen `promptRegistry`-Fallback abzuhängen.
    const stablePatternSchema: JsonSchema = {
      type: 'object',
      required: ['pattern_key', 'label', 'description', 'recurrence', 'confidence', 'supporting_sessions', 'communicative_impact', 'evidence'],
      properties: {
        pattern_key: { type: 'string' },
        label: { type: 'string' },
        description: { type: 'string' },
        recurrence: { type: 'number', minimum: 0, maximum: 1 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        supporting_sessions: { type: 'array', items: { type: 'string' } },
        communicative_impact: { type: 'string', enum: ['low', 'medium', 'high'] },
        evidence: { type: 'array', items: { type: 'string' } },
      },
    };
    const outputSchema: JsonSchema = {
      type: 'object',
      required: ['enough_data', 'stable_patterns'],
      properties: {
        enough_data: { type: 'boolean' },
        stable_patterns: { type: 'array', items: stablePatternSchema },
      },
    };

    const validationErrors = validateWithSchema(outputSchema, {
      enough_data: true,
      stable_patterns: [
        {
          pattern_key: 'p1',
          label: 'P1',
          description: 'd',
          recurrence: 80,
          confidence: 0.8,
          supporting_sessions: ['s1'],
          communicative_impact: 'high',
          evidence: ['e1'],
        },
      ],
    });
    expect(validationErrors.length).toBeGreaterThan(0);
  });
