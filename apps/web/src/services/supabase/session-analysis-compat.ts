import { ANALYSIS_CATEGORY_KEYS } from '@/types/app-settings';
import type { Json, SessionAnalysisRow } from '@/types/database';

const DEFAULT_CONFIDENCE = 0.55;

const CATEGORY_SET = new Set<string>(ANALYSIS_CATEGORY_KEYS);

type PatternImpact = 'low' | 'medium' | 'high';

type CategoryScoreModel = {
  score: number;
  confidence: number;
  justification: string;
  evidence: string[];
};

function isPatternImpact(value: unknown): value is PatternImpact {
  return value === 'low' || value === 'medium' || value === 'high';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function clampScoreFive(value: number): number {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONFIDENCE;
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Deterministische Legacy-Mapping-Regel:
 * legacy 0..100 => round(value / 20) => 0..5 (danach clamp auf 0..5)
 */
export function mapLegacyPercentScoreToFive(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return clampScoreFive(value / 20);
}

function mapLegacyImpactToLevel(value: unknown): PatternImpact {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 67) return 'high';
    if (value >= 34) return 'medium';
    return 'low';
  }

  const text = asString(value)?.toLowerCase() ?? '';
  if (text.includes('high') || text.includes('stark') || text.includes('hoch')) return 'high';
  if (text.includes('low') || text.includes('gering') || text.includes('niedrig')) return 'low';
  return 'medium';
}

function normalizeCategory(value: unknown): string {
  const raw = asString(value);
  if (raw && CATEGORY_SET.has(raw)) return raw;
  return ANALYSIS_CATEGORY_KEYS[0];
}

function normalizeDetectedPatterns(value: Json): Json[] {
  const parsed = Array.isArray(value) ? value : [];

  return parsed.flatMap((entry, index) => {
    const record = asRecord(entry);

    const patternKey = asString(record.pattern_key);
    const label = asString(record.label);
    const description = asString(record.description);
    const frequencyEstimate = record.frequency_estimate;
    const communicativeImpact = record.communicative_impact;

    if (
      patternKey &&
      label &&
      description &&
      isPatternImpact(frequencyEstimate) &&
      isPatternImpact(communicativeImpact)
    ) {
      return [{
        pattern_key: patternKey,
        label,
        description,
        frequency_estimate: frequencyEstimate,
        communicative_impact: communicativeImpact,
        category: normalizeCategory(record.category),
      }];
    }

    const legacyPattern = asString(record.pattern) ?? asString(record.pattern_key) ?? `legacy_pattern_${index + 1}`;
    const legacyEvidence = asString(record.evidence);
    const legacyImpact = mapLegacyImpactToLevel(record.impact);
    const category = normalizeCategory(record.category ?? record.focus_area);

    return [{
      pattern_key: legacyPattern.toLowerCase().replace(/\s+/g, '_'),
      label: legacyPattern,
      description: legacyEvidence ?? 'Legacy-Muster ohne detaillierte Beschreibung.',
      frequency_estimate: 'medium' as const,
      communicative_impact: legacyImpact,
      category,
    }];
  });
}

function normalizePriorityIntervention(value: Json, patterns: Json[]): Json {
  const record = asRecord(value);

  if (asString(record.pattern_key) && asString(record.label) && asString(record.reason)) {
    return {
      pattern_key: asString(record.pattern_key),
      label: asString(record.label),
      reason: asString(record.reason),
    };
  }

  const focusArea = asString(record.focus_area);
  const nextStep = asString(record.next_step);
  const firstPattern = asRecord(patterns[0]);
  const fallbackPatternKey = asString(firstPattern.pattern_key) ?? 'legacy_focus_area';
  const fallbackLabel = asString(firstPattern.label) ?? 'Legacy Fokusbereich';

  return {
    pattern_key: focusArea ?? fallbackPatternKey,
    label: focusArea ?? fallbackLabel,
    reason: nextStep ?? 'Legacy-Empfehlung ohne detaillierte Begründung.',
  };
}

function buildCategoryEvidence(params: {
  category: string;
  patterns: Json[];
  priority: Json;
}): string[] {
  const { category, patterns, priority } = params;

  const patternEvidence = patterns
    .map((item) => asRecord(item))
    .filter((item) => item.category === category)
    .map((item) => asString(item.description))
    .filter((item): item is string => Boolean(item));

  const priorityReason = asString(asRecord(priority).reason);
  const evidence = [...patternEvidence];
  if (priorityReason) {
    evidence.push(priorityReason);
  }

  return evidence.length > 0 ? evidence.slice(0, 3) : ['Legacy-Daten ohne explizite Evidenzliste.'];
}

function normalizeCategoryScores(params: {
  categoryScoresJson: Json;
  patterns: Json[];
  priority: Json;
}): Record<string, CategoryScoreModel> {
  const { categoryScoresJson, patterns, priority } = params;
  const input = asRecord(categoryScoresJson);

  return Object.fromEntries(
    ANALYSIS_CATEGORY_KEYS.map((category) => {
      const value = input[category];
      const valueRecord = asRecord(value);
      const rawScore =
        typeof value === 'number'
          ? value
          : typeof valueRecord.score === 'number'
            ? valueRecord.score
            : 0;

      const score = rawScore > 5 ? mapLegacyPercentScoreToFive(rawScore) : clampScoreFive(rawScore);

      const rawConfidence =
        typeof valueRecord.confidence === 'number'
          ? valueRecord.confidence
          : DEFAULT_CONFIDENCE;

      const confidence = clampUnit(rawConfidence);
      const justification =
        asString(valueRecord.justification) ??
        `Legacy-Normalisierung für Kategorie ${category}.`;

      const evidenceRaw = Array.isArray(valueRecord.evidence) ? valueRecord.evidence : null;
      const evidence = Array.isArray(evidenceRaw)
        ? evidenceRaw.map((item) => asString(item)).filter((item): item is string => Boolean(item))
        : buildCategoryEvidence({ category, patterns, priority });

      return [
        category,
        {
          score,
          confidence,
          justification,
          evidence,
        },
      ];
    }),
  );
}

export function normalizeSessionAnalysisRow(row: SessionAnalysisRow): SessionAnalysisRow {
  const patterns = normalizeDetectedPatterns(row.detected_patterns_json);
  const priority = normalizePriorityIntervention(row.priority_intervention_json, patterns);
  const categoryScores = normalizeCategoryScores({
    categoryScoresJson: row.category_scores_json,
    patterns,
    priority,
  });

  return {
    ...row,
    category_scores_json: categoryScores,
    detected_patterns_json: patterns,
    priority_intervention_json: priority,
  };
}

export function normalizeSessionAnalysisRows(rows: SessionAnalysisRow[]): SessionAnalysisRow[] {
  return rows.map((row) => normalizeSessionAnalysisRow(row));
}
