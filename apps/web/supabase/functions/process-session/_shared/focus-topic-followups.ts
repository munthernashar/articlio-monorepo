import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchActivePromptDefinition, renderPromptTemplate, runGuardedJsonPrompt } from './prompt-runtime.ts';
import { runCivicsExplanationCheckIfApplicable } from './civics-followup.ts';

// Bug-Fix (28.08.2026): multi_session_pattern_detection/focus_topic_selector/improvement_check
// liefen bislang ausschließlich clientseitig, als Fire-and-Forget-Aufruf NACH dem vollständigen
// Warten auf diese Edge Function (siehe runPostProcessingFollowUps in NewSessionPage.tsx). Da
// process-session real 10-60+ Sekunden dauert, verpuffte diese Kette lautlos, sobald der Tab
// wegnavigierte oder in den Hintergrund geriet -- verifiziert per SQL: 0 Zeilen in focus_topics
// und detected_patterns über die gesamte Produktions-DB, trotz Nutzern mit ausreichend
// qualifizierten Analysen. Diese Datei ist der Deno-Port der browserseitigen Fachlogik aus
// src/services/supabase/multi-session-pattern.service.ts und improvement-check.service.ts
// (inkl. ihrer reinen Abhängigkeiten aus focus-topic-transitions.ts/-state.ts und
// session-analysis-compat.ts), damit sie hier serverseitig läuft -- unabhängig vom Client-Tab.
// civics_explanation_check (siehe civics-followup.ts) ist seit demselben Datum ebenfalls
// server-seitig verdrahtet, war aber vorher blockiert: die zu einer Session gehörende
// civics_exam_questions-Zeile lebte nur im React-State von NewSessionPage.tsx. Erst seit
// NewSessionPage.tsx sie in conversation_sessions.metadata.civicsQuestionId persistiert
// (session.service.ts), kann diese Function sie serverseitig nachschlagen.

// --- focus-topic-state.ts (Deno-Port) -----------------------------------

export type FocusTopicStatus =
  | 'unentdeckt'
  | 'beobachtet'
  | 'wiederkehrend'
  | 'in_training'
  | 'teilweise_stabilisiert'
  | 'stabil'
  | 'rueckfall_erkannt';

export const PRIMARY_FOCUS_STATUSES: FocusTopicStatus[] = ['in_training', 'teilweise_stabilisiert'];

// --- focus-topic-transitions.ts (Deno-Port) -----------------------------

const ALLOWED_FOCUS_STATES: FocusTopicStatus[] = [
  'unentdeckt',
  'beobachtet',
  'wiederkehrend',
  'in_training',
  'teilweise_stabilisiert',
  'stabil',
  'rueckfall_erkannt',
];

type FocusEvent =
  | 'focus_selected'
  | 'focus_replaced_by_new_selection'
  | 'improvement_improved'
  | 'improvement_worsened'
  | 'improvement_unchanged'
  | 'tutor_mark_sufficient'
  | 'tutor_mark_partial'
  | 'tutor_mark_not_yet';

type FocusStatusHistorySource = 'multi_session_pattern.service' | 'improvement_check.service' | 'tutor.service' | 'system';

type FocusStatusHistoryEntry = {
  timestamp: string;
  from: FocusTopicStatus | null;
  to: FocusTopicStatus;
  reason: string;
  source: FocusStatusHistorySource;
};

type FocusMetadataWithHistory = Record<string, unknown> & {
  status_history: FocusStatusHistoryEntry[];
};

type ApplyFocusEventContext = {
  metadata?: Record<string, unknown>;
  reason: string;
  source: FocusStatusHistorySource;
  timestamp?: string;
};

type FocusTransitionResult = {
  nextStatus: FocusTopicStatus;
  metadata: FocusMetadataWithHistory;
  historyEntry: FocusStatusHistoryEntry;
};

const TRANSITIONS: Record<
  FocusEvent,
  {
    any?: FocusTopicStatus;
    from?: Partial<Record<FocusTopicStatus, FocusTopicStatus>>;
    fromNull?: FocusTopicStatus;
  }
> = {
  focus_selected: { any: 'in_training', fromNull: 'in_training' },
  focus_replaced_by_new_selection: {
    from: { in_training: 'beobachtet', teilweise_stabilisiert: 'beobachtet', rueckfall_erkannt: 'beobachtet' },
  },
  improvement_improved: {
    from: {
      wiederkehrend: 'in_training',
      in_training: 'teilweise_stabilisiert',
      teilweise_stabilisiert: 'stabil',
      stabil: 'stabil',
      rueckfall_erkannt: 'in_training',
    },
  },
  improvement_worsened: {
    from: {
      in_training: 'wiederkehrend',
      teilweise_stabilisiert: 'wiederkehrend',
      stabil: 'rueckfall_erkannt',
      rueckfall_erkannt: 'rueckfall_erkannt',
      wiederkehrend: 'wiederkehrend',
    },
  },
  improvement_unchanged: {
    from: {
      in_training: 'in_training',
      teilweise_stabilisiert: 'teilweise_stabilisiert',
      stabil: 'stabil',
      rueckfall_erkannt: 'rueckfall_erkannt',
      wiederkehrend: 'wiederkehrend',
    },
  },
  tutor_mark_sufficient: {
    from: { in_training: 'teilweise_stabilisiert', teilweise_stabilisiert: 'stabil', rueckfall_erkannt: 'stabil', stabil: 'stabil' },
  },
  tutor_mark_partial: {
    from: {
      in_training: 'in_training',
      teilweise_stabilisiert: 'teilweise_stabilisiert',
      rueckfall_erkannt: 'in_training',
      stabil: 'teilweise_stabilisiert',
      wiederkehrend: 'in_training',
    },
  },
  tutor_mark_not_yet: {
    from: {
      in_training: 'in_training',
      teilweise_stabilisiert: 'in_training',
      rueckfall_erkannt: 'in_training',
      stabil: 'in_training',
      wiederkehrend: 'in_training',
    },
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseHistoryEntry(value: unknown): FocusStatusHistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : null;
  const from = row.from;
  const to = row.to;
  const reason = typeof row.reason === 'string' ? row.reason : null;
  const source = row.source;

  const legacyStatus = typeof row.status === 'string' ? row.status : null;
  const normalizedTo = (typeof to === 'string' ? to : legacyStatus) as FocusTopicStatus | null;
  if (!timestamp || !normalizedTo || !reason) return null;
  if (!ALLOWED_FOCUS_STATES.includes(normalizedTo)) return null;

  const normalizedFrom =
    from === null ? null : typeof from === 'string' && ALLOWED_FOCUS_STATES.includes(from as FocusTopicStatus) ? (from as FocusTopicStatus) : null;

  const normalizedSource: FocusStatusHistorySource =
    source === 'multi_session_pattern.service' || source === 'improvement_check.service' || source === 'tutor.service' || source === 'system'
      ? source
      : 'system';

  return { timestamp, from: normalizedFrom, to: normalizedTo, reason, source: normalizedSource };
}

export function withNormalizedStatusHistory(metadata: Record<string, unknown> | undefined): FocusMetadataWithHistory {
  const base = asRecord(metadata);
  const statusHistoryRaw = Array.isArray(base.status_history) ? base.status_history : [];
  const statusHistory = statusHistoryRaw.map(parseHistoryEntry).filter((entry): entry is FocusStatusHistoryEntry => Boolean(entry));
  return { ...base, status_history: statusHistory };
}

function resolveNextStatus(current: FocusTopicStatus | null, event: FocusEvent): FocusTopicStatus | null {
  const transition = TRANSITIONS[event];
  if (!transition) return null;
  if (current === null) return transition.fromNull ?? null;
  if (transition.any) return transition.any;
  return transition.from?.[current] ?? null;
}

export function applyFocusEvent(current: FocusTopicStatus | null, event: FocusEvent, context: ApplyFocusEventContext): FocusTransitionResult {
  const nextStatus = resolveNextStatus(current, event);
  if (!nextStatus) {
    throw new Error(`Ungültige Fokus-Transition: ${current ?? 'null'} --(${event})-> ?`);
  }

  const historyEntry: FocusStatusHistoryEntry = {
    timestamp: context.timestamp ?? new Date().toISOString(),
    from: current,
    to: nextStatus,
    reason: context.reason,
    source: context.source,
  };

  const normalizedMetadata = withNormalizedStatusHistory(context.metadata);

  return {
    nextStatus,
    historyEntry,
    metadata: { ...normalizedMetadata, status_history: [...normalizedMetadata.status_history, historyEntry] },
  };
}

// --- session-analysis-compat.ts (Deno-Port) -----------------------------

const ANALYSIS_CATEGORY_KEYS = [
  'grammatical_accuracy',
  'lexical_appropriateness',
  'fluency',
  'intelligibility',
  'coherence_and_sentence_structure',
  'register_and_naturalness',
  'interactional_competence',
] as const;
const CATEGORY_SET = new Set<string>(ANALYSIS_CATEGORY_KEYS);
const DEFAULT_CONFIDENCE = 0.55;

type PatternImpact = 'low' | 'medium' | 'high';

function isPatternImpact(value: unknown): value is PatternImpact {
  return value === 'low' || value === 'medium' || value === 'high';
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

function mapLegacyPercentScoreToFive(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clampScoreFive(value / 20);
}

function mapLegacyImpactToLevel(value: unknown): PatternImpact {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
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

function normalizeDetectedPatterns(value: unknown): Record<string, unknown>[] {
  const parsed = Array.isArray(value) ? value : [];
  return parsed.flatMap((entry, index) => {
    const record = asRecord(entry);
    const patternKey = asString(record.pattern_key);
    const label = asString(record.label);
    const description = asString(record.description);
    const frequencyEstimate = record.frequency_estimate;
    const communicativeImpact = record.communicative_impact;

    if (patternKey && label && description && isPatternImpact(frequencyEstimate) && isPatternImpact(communicativeImpact)) {
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

function normalizePriorityIntervention(value: unknown, patterns: Record<string, unknown>[]): Record<string, unknown> {
  const record = asRecord(value);
  if (asString(record.pattern_key) && asString(record.label) && asString(record.reason)) {
    return { pattern_key: asString(record.pattern_key), label: asString(record.label), reason: asString(record.reason) };
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

function buildCategoryEvidence(params: { category: string; patterns: Record<string, unknown>[]; priority: Record<string, unknown> }): string[] {
  const { category, patterns, priority } = params;
  const patternEvidence = patterns
    .filter((item) => item.category === category)
    .map((item) => asString(item.description))
    .filter((item): item is string => Boolean(item));

  const priorityReason = asString(priority.reason);
  const evidence = [...patternEvidence];
  if (priorityReason) evidence.push(priorityReason);
  return evidence.length > 0 ? evidence.slice(0, 3) : ['Legacy-Daten ohne explizite Evidenzliste.'];
}

function normalizeCategoryScores(params: {
  categoryScoresJson: unknown;
  patterns: Record<string, unknown>[];
  priority: Record<string, unknown>;
}): Record<string, { score: number; confidence: number; justification: string; evidence: string[] }> {
  const { categoryScoresJson, patterns, priority } = params;
  const input = asRecord(categoryScoresJson);

  return Object.fromEntries(
    ANALYSIS_CATEGORY_KEYS.map((category) => {
      const value = input[category];
      const valueRecord = asRecord(value);
      const rawScore = typeof value === 'number' ? value : typeof valueRecord.score === 'number' ? valueRecord.score : 0;
      const score = rawScore > 5 ? mapLegacyPercentScoreToFive(rawScore) : clampScoreFive(rawScore);
      const rawConfidence = typeof valueRecord.confidence === 'number' ? valueRecord.confidence : DEFAULT_CONFIDENCE;
      const confidence = clampUnit(rawConfidence);
      const justification = asString(valueRecord.justification) ?? `Legacy-Normalisierung für Kategorie ${category}.`;
      const evidenceRaw = Array.isArray(valueRecord.evidence) ? valueRecord.evidence : null;
      const evidence = Array.isArray(evidenceRaw)
        ? evidenceRaw.map((item) => asString(item)).filter((item): item is string => Boolean(item))
        : buildCategoryEvidence({ category, patterns, priority });

      return [category, { score, confidence, justification, evidence }];
    }),
  );
}

/** Deno-Port von normalizeSessionAnalysisRow(s) (session-analysis-compat.ts). */
function normalizeSessionAnalysisRow(row: SessionAnalysisRow): SessionAnalysisRow {
  const patterns = normalizeDetectedPatterns(row.detected_patterns_json);
  const priority = normalizePriorityIntervention(row.priority_intervention_json, patterns);
  const categoryScores = normalizeCategoryScores({ categoryScoresJson: row.category_scores_json, patterns, priority });
  return { ...row, category_scores_json: categoryScores, detected_patterns_json: patterns, priority_intervention_json: priority };
}

function normalizeSessionAnalysisRows(rows: SessionAnalysisRow[]): SessionAnalysisRow[] {
  return rows.map(normalizeSessionAnalysisRow);
}

// --- session-analysis.service.ts::extractCategoryScore (Deno-Port) ------

function clampFivePointScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function extractCategoryScore(categoryScores: unknown, category: string): number | null {
  if (!categoryScores || typeof categoryScores !== 'object' || Array.isArray(categoryScores)) return null;
  const value = (categoryScores as Record<string, unknown>)[category];
  if (typeof value === 'number') return clampFivePointScore(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const score = (value as Record<string, unknown>).score;
    return typeof score === 'number' ? clampFivePointScore(score) : null;
  }
  return null;
}

// --- session-ai-eligibility.ts (Deno-Port) -------------------------------

const AI_ELIGIBLE_QUALITY_GATE_STATUSES = new Set(['valid', 'capped', 'approved', 'completed_capped']);

function isAiEligibleSession(session: { status?: string | null; metadata?: unknown } | null | undefined): boolean {
  if (!session) return false;
  const metadata = asRecord(session.metadata);
  const qualityGate = asRecord(metadata.qualityGate);
  const status = qualityGate.status;
  if (typeof status === 'string' && AI_ELIGIBLE_QUALITY_GATE_STATUSES.has(status)) return true;
  if (typeof session.status !== 'string') return true;
  return session.status === 'completed' || session.status === 'completed_capped';
}

// --- app_settings (Deno-Port, nur die für diese Datei relevanten Felder) --

type RelevantAppSettings = {
  minSessionsForDiagnosis: number;
  diagnosisMaxSessions: number;
  sessionLookbackLimit: number;
  focusRecurrenceThreshold: number;
  improvementMinRecentSessions: number;
  improvementMinConfidence: number;
  improvementRequiredStreak: number | null;
  worsenedDeltaThreshold: number;
  featureFlags: {
    multi_session_patterns: boolean;
    focus_topic_selection: boolean;
    improvement_checks: boolean;
  };
};

const DEFAULT_RELEVANT_APP_SETTINGS: RelevantAppSettings = {
  minSessionsForDiagnosis: 3,
  diagnosisMaxSessions: 5,
  sessionLookbackLimit: 8,
  focusRecurrenceThreshold: 0.5,
  improvementMinRecentSessions: 2,
  improvementMinConfidence: 60,
  improvementRequiredStreak: null,
  worsenedDeltaThreshold: -0.5,
  featureFlags: { multi_session_patterns: true, focus_topic_selection: true, improvement_checks: true },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

async function loadRelevantAppSettings(serviceClient: SupabaseClient): Promise<RelevantAppSettings> {
  const { data, error } = await serviceClient.from('app_settings').select('*').eq('id', 'global').maybeSingle();
  if (error || !data) return DEFAULT_RELEVANT_APP_SETTINGS;

  const row = data as Record<string, unknown>;
  const featureFlagsRaw = asRecord(row.feature_flags);

  return {
    minSessionsForDiagnosis: clamp(Number(row.min_sessions_for_diagnosis ?? 3), 3, 5),
    diagnosisMaxSessions: clamp(Number(row.diagnosis_max_sessions ?? 5), 3, 12),
    sessionLookbackLimit: clamp(Number(row.session_lookback_limit ?? 8), 3, 20),
    focusRecurrenceThreshold: Math.max(0.1, Math.min(1, Number(row.focus_recurrence_threshold ?? 0.5))),
    improvementMinRecentSessions: clamp(Number(row.improvement_min_recent_sessions ?? 2), 1, 20),
    improvementMinConfidence: Math.max(0, Math.min(100, Math.round(Number(row.improvement_min_confidence ?? 60)))),
    improvementRequiredStreak:
      row.improvement_required_streak === null || row.improvement_required_streak === undefined
        ? null
        : clamp(Number(row.improvement_required_streak), 1, 10),
    worsenedDeltaThreshold: Math.max(-3, Math.min(0, Number(row.worsened_delta_threshold ?? -0.5))),
    featureFlags: {
      multi_session_patterns: featureFlagsRaw.multi_session_patterns !== false,
      focus_topic_selection: featureFlagsRaw.focus_topic_selection !== false,
      improvement_checks: featureFlagsRaw.improvement_checks !== false,
    },
  };
}

// --- multi-session-pattern.service.ts::detectAndPersist (Deno-Port) -----

type CommunicativeImpact = 'low' | 'medium' | 'high';

type PerformanceConditions = {
  speech_mode: 'dialog' | 'monolog' | 'mixed';
  spontaneity: 'spontaneous' | 'prepared' | 'mixed';
  task_complexity: 'low' | 'medium' | 'high';
  register_pressure: 'low' | 'medium' | 'high';
  consistent_condition_count: number;
};

type StablePatternOutput = {
  pattern_key: string;
  label: string;
  description: string;
  recurrence: number;
  confidence: number;
  supporting_sessions: string[];
  communicative_impact: CommunicativeImpact;
  evidence: string[];
  performance_conditions: PerformanceConditions;
};

type MultiSessionPatternDetectionOutput = { enough_data: boolean; stable_patterns: StablePatternOutput[] };

type FocusTopicSelectorOutput = {
  selection_status: 'selected' | 'insufficient_evidence';
  focus_topic:
    | { topic_key: string; label: string; short_explanation: string; reason: string; source_pattern_key: string }
    | null;
  reason: string;
  evidence_summary: {
    sessions_analyzed: number;
    strongest_pattern_key: string | null;
    recurrence: number;
    confidence: number;
    communicative_impact: CommunicativeImpact | null;
    learner_readiness: number;
  };
};

type SessionAnalysisRow = {
  id: string;
  session_id: string;
  created_at: string;
  category_scores_json: unknown;
  detected_patterns_json: unknown;
  priority_intervention_json: unknown;
  session_summary: unknown;
};

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeLegacyProbabilityScale(value: number): number | null {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return null;
  if (value <= 1) return value;
  if (value <= 100) return value / 100;
  return null;
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeProbabilityValue(value: number, opts?: { allowLegacy: boolean }): number {
  if (!Number.isFinite(value)) throw new Error('Score ist nicht numerisch.');
  if (value >= 0 && value <= 1) return value;
  if (opts?.allowLegacy) {
    const normalizedLegacy = normalizeLegacyProbabilityScale(value);
    if (normalizedLegacy !== null) return normalizedLegacy;
  }
  throw new Error(`Score ${value} liegt außerhalb des erlaubten Bereichs 0.0..1.0.`);
}

function parseCommunicativeImpact(value: unknown): CommunicativeImpact {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'medium';
}

function parsePerformanceConditions(value: unknown): PerformanceConditions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('stable_pattern.performance_conditions fehlt oder ist ungültig.');
  }
  const raw = value as Record<string, unknown>;
  if (raw.speech_mode !== 'dialog' && raw.speech_mode !== 'monolog' && raw.speech_mode !== 'mixed') {
    throw new Error('stable_pattern.performance_conditions.speech_mode muss dialog|monolog|mixed sein.');
  }
  if (raw.spontaneity !== 'spontaneous' && raw.spontaneity !== 'prepared' && raw.spontaneity !== 'mixed') {
    throw new Error('stable_pattern.performance_conditions.spontaneity muss spontaneous|prepared|mixed sein.');
  }
  if (raw.task_complexity !== 'low' && raw.task_complexity !== 'medium' && raw.task_complexity !== 'high') {
    throw new Error('stable_pattern.performance_conditions.task_complexity muss low|medium|high sein.');
  }
  if (raw.register_pressure !== 'low' && raw.register_pressure !== 'medium' && raw.register_pressure !== 'high') {
    throw new Error('stable_pattern.performance_conditions.register_pressure muss low|medium|high sein.');
  }
  if (
    typeof raw.consistent_condition_count !== 'number' ||
    !Number.isInteger(raw.consistent_condition_count) ||
    raw.consistent_condition_count < 0 ||
    raw.consistent_condition_count > 4
  ) {
    throw new Error('stable_pattern.performance_conditions.consistent_condition_count muss ein Integer zwischen 0 und 4 sein.');
  }

  return {
    speech_mode: raw.speech_mode,
    spontaneity: raw.spontaneity,
    task_complexity: raw.task_complexity,
    register_pressure: raw.register_pressure,
    consistent_condition_count: raw.consistent_condition_count,
  };
}

function impactToScore(impact: CommunicativeImpact): number {
  return impact === 'high' ? 1 : impact === 'medium' ? 0.65 : 0.35;
}

function deriveLearnerReadiness(params: {
  sessionsAnalyzed: number;
  stablePatterns: StablePatternOutput[];
  llmSuggestedReadiness: number;
  currentMasteryLevel: number | null;
}): number {
  const { sessionsAnalyzed, stablePatterns, llmSuggestedReadiness, currentMasteryLevel } = params;
  const top = [...stablePatterns].sort((a, b) => (b.recurrence + b.confidence) / 2 - (a.recurrence + a.confidence) / 2);
  const topScore = top[0] ? (top[0].recurrence + top[0].confidence) / 2 : 0;
  const secondScore = top[1] ? (top[1].recurrence + top[1].confidence) / 2 : 0;
  const strongPatternCount = stablePatterns.filter((item) => item.recurrence >= 0.6 && item.confidence >= 0.65).length;

  const base = sessionsAnalyzed >= 5 ? 0.72 : sessionsAnalyzed === 4 ? 0.64 : 0.56;
  const dominanceBoost = topScore - secondScore >= 0.15 ? 0.08 : 0;
  const spreadPenalty = Math.max(0, strongPatternCount - 1) * 0.08;
  const masteryAdjustment =
    typeof currentMasteryLevel === 'number' ? (currentMasteryLevel >= 4 ? -0.05 : currentMasteryLevel <= 2 ? 0.05 : 0) : 0;

  const ruleBased = clampUnitInterval(base + dominanceBoost - spreadPenalty + masteryAdjustment);
  const llmReadiness = clampUnitInterval(llmSuggestedReadiness);
  return clampUnitInterval(ruleBased * 0.7 + llmReadiness * 0.3);
}

type FocusEvidenceDecision = { selectionStatus: 'selected' | 'insufficient_evidence'; reason: string; score: number };

function evaluateFocusEvidence(input: {
  sessionsAnalyzed: number;
  recurrence: number;
  confidence: number;
  communicativeImpact: CommunicativeImpact;
  learnerReadiness: number;
  recurrenceThreshold?: number;
  performanceConditionConsistency?: number;
  diagnosisMinSessions: number;
}): FocusEvidenceDecision {
  const recurrence = clampUnitInterval(input.recurrence);
  const confidence = clampUnitInterval(input.confidence);
  const learnerReadiness = clampUnitInterval(input.learnerReadiness);

  if (input.sessionsAnalyzed < input.diagnosisMinSessions) {
    return { selectionStatus: 'insufficient_evidence', reason: `Mindestens ${input.diagnosisMinSessions} Sessions benötigt.`, score: 0 };
  }
  const recurrenceThreshold = clampUnitInterval(input.recurrenceThreshold ?? 0.5);
  if (recurrence < recurrenceThreshold) {
    return { selectionStatus: 'insufficient_evidence', reason: `Wiederkehr unter ${recurrenceThreshold}.`, score: recurrence };
  }
  if (typeof input.performanceConditionConsistency === 'number' && input.performanceConditionConsistency < 2) {
    return { selectionStatus: 'insufficient_evidence', reason: 'Evidenz ist in weniger als 2 Performanzbedingungen konsistent.', score: recurrence };
  }
  if (confidence < 0.65) {
    return { selectionStatus: 'insufficient_evidence', reason: 'Diagnose-Confidence unter 0.65.', score: confidence };
  }
  if (learnerReadiness < 0.4) {
    return { selectionStatus: 'insufficient_evidence', reason: 'Learner readiness unter 0.4.', score: learnerReadiness };
  }
  if (input.communicativeImpact === 'low' && recurrence < 0.65) {
    return { selectionStatus: 'insufficient_evidence', reason: 'Low-impact Muster ohne klare Dominanz.', score: recurrence };
  }

  const score = recurrence * 0.35 + confidence * 0.3 + learnerReadiness * 0.2 + impactToScore(input.communicativeImpact) * 0.15;

  return score >= 0.62
    ? { selectionStatus: 'selected', reason: 'Evidenz ausreichend für ein fokussiertes Hauptthema.', score }
    : { selectionStatus: 'insufficient_evidence', reason: 'Gesamtevidenz noch nicht stabil genug.', score };
}

function shouldActivateNewFocus(decision: FocusEvidenceDecision): boolean {
  return decision.selectionStatus === 'selected';
}

function patternSeverityFromEvidence(pattern: StablePatternOutput): number {
  const weighted = (pattern.recurrence + pattern.confidence + impactToScore(pattern.communicative_impact)) / 3;
  return Math.max(1, Math.min(5, Math.round(weighted * 5)));
}

function patternOccurrenceCount(patternType: string, analyses: SessionAnalysisRow[]): number {
  return analyses.reduce((count, analysis) => {
    const detectedPatterns = Array.isArray(analysis.detected_patterns_json) ? analysis.detected_patterns_json : [];
    const hasCategoryMatch = detectedPatterns.some((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const patternKey = (item as Record<string, unknown>).pattern_key;
      return typeof patternKey === 'string' && patternKey === patternType;
    });
    if (hasCategoryMatch) return count + 1;
    const priorityIntervention = asRecord(analysis.priority_intervention_json);
    return priorityIntervention.pattern_key === patternType ? count + 1 : count;
  }, 0);
}

function getOccurrenceWindow(analyses: SessionAnalysisRow[]): { start: string | null; end: string | null } {
  if (analyses.length === 0) return { start: null, end: null };
  const createdAt = analyses
    .map((analysis) => analysis.created_at)
    .filter((value): value is string => hasText(value))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  if (createdAt.length === 0) return { start: null, end: null };
  return { start: createdAt[0] ?? null, end: createdAt[createdAt.length - 1] ?? null };
}

function parseMultiSessionPatternOutput(input: unknown): MultiSessionPatternDetectionOutput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('multi_session_pattern_detection muss ein Objekt liefern.');
  }
  const payload = input as Record<string, unknown>;
  if (typeof payload.enough_data !== 'boolean') {
    throw new Error('multi_session_pattern_detection.enough_data fehlt oder ist ungültig.');
  }
  if (!Array.isArray(payload.stable_patterns)) {
    throw new Error('multi_session_pattern_detection.stable_patterns fehlt oder ist ungültig.');
  }

  const stablePatterns = payload.stable_patterns.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('stable_patterns enthält ein ungültiges Element.');
    }
    const entry = item as Record<string, unknown>;
    if (!hasText(entry.pattern_key) || !hasText(entry.label) || !hasText(entry.description) || !Array.isArray(entry.evidence) || !Array.isArray(entry.supporting_sessions)) {
      throw new Error('stable_pattern ist unvollständig.');
    }
    if (typeof entry.recurrence !== 'number' || !Number.isFinite(entry.recurrence) || typeof entry.confidence !== 'number' || !Number.isFinite(entry.confidence)) {
      throw new Error('stable_pattern.recurrence/confidence fehlen oder sind ungültig.');
    }

    return {
      pattern_key: entry.pattern_key,
      label: entry.label,
      description: entry.description,
      recurrence: normalizeProbabilityValue(entry.recurrence, { allowLegacy: true }),
      confidence: normalizeProbabilityValue(entry.confidence, { allowLegacy: true }),
      supporting_sessions: entry.supporting_sessions.filter(hasText),
      communicative_impact: parseCommunicativeImpact(entry.communicative_impact),
      evidence: entry.evidence.filter(hasText),
      performance_conditions: parsePerformanceConditions(entry.performance_conditions),
    };
  });

  return { enough_data: payload.enough_data, stable_patterns: stablePatterns };
}

function parseFocusTopicSelectorOutput(input: unknown): FocusTopicSelectorOutput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('focus_topic_selector muss ein Objekt liefern.');
  }
  const payload = input as Record<string, unknown>;
  if (payload.selection_status !== 'selected' && payload.selection_status !== 'insufficient_evidence') {
    throw new Error('focus_topic_selector.selection_status fehlt oder ist ungültig.');
  }
  if (!hasText(payload.reason)) throw new Error('focus_topic_selector.reason fehlt oder ist ungültig.');

  const evidenceSummaryRaw = payload.evidence_summary;
  if (!evidenceSummaryRaw || typeof evidenceSummaryRaw !== 'object' || Array.isArray(evidenceSummaryRaw)) {
    throw new Error('focus_topic_selector.evidence_summary fehlt oder ist ungültig.');
  }
  const evidenceSummary = evidenceSummaryRaw as Record<string, unknown>;
  const sessionsAnalyzed = asNumberOrNull(evidenceSummary.sessions_analyzed);
  const strongestPatternKey = evidenceSummary.strongest_pattern_key;
  const recurrence = asNumberOrNull(evidenceSummary.recurrence);
  const confidence = asNumberOrNull(evidenceSummary.confidence);
  const communicativeImpactRaw = evidenceSummary.communicative_impact;
  const learnerReadiness = asNumberOrNull(evidenceSummary.learner_readiness);
  if (sessionsAnalyzed === null || recurrence === null || confidence === null || learnerReadiness === null) {
    throw new Error('focus_topic_selector.evidence_summary ist unvollständig.');
  }

  const focusValue = payload.focus_topic;
  if (payload.selection_status === 'insufficient_evidence') {
    if (focusValue !== null) throw new Error('Bei insufficient_evidence muss focus_topic null sein.');
    return {
      selection_status: 'insufficient_evidence',
      focus_topic: null,
      reason: payload.reason,
      evidence_summary: {
        sessions_analyzed: Math.max(0, Math.round(sessionsAnalyzed)),
        strongest_pattern_key: strongestPatternKey === null ? null : hasText(strongestPatternKey) ? strongestPatternKey : null,
        recurrence: normalizeProbabilityValue(recurrence, { allowLegacy: true }),
        confidence: normalizeProbabilityValue(confidence, { allowLegacy: true }),
        communicative_impact: communicativeImpactRaw === null ? null : parseCommunicativeImpact(communicativeImpactRaw),
        learner_readiness: normalizeProbabilityValue(learnerReadiness, { allowLegacy: true }),
      },
    };
  }

  if (focusValue === null || typeof focusValue !== 'object' || Array.isArray(focusValue)) {
    throw new Error('Bei selected muss focus_topic ein Objekt sein.');
  }
  const focus = focusValue as Record<string, unknown>;
  if (!hasText(focus.topic_key) || !hasText(focus.label) || !hasText(focus.short_explanation) || !hasText(focus.reason) || !hasText(focus.source_pattern_key)) {
    throw new Error('focus_topic_selector.focus_topic ist unvollständig.');
  }
  if (focus.topic_key === 'insufficient_evidence') {
    throw new Error('focus_topic_selector.focus_topic.topic_key darf nicht "insufficient_evidence" sein.');
  }

  return {
    selection_status: 'selected',
    focus_topic: {
      topic_key: focus.topic_key,
      label: focus.label,
      short_explanation: focus.short_explanation,
      reason: focus.reason,
      source_pattern_key: focus.source_pattern_key,
    },
    reason: payload.reason,
    evidence_summary: {
      sessions_analyzed: Math.max(0, Math.round(sessionsAnalyzed)),
      strongest_pattern_key: hasText(strongestPatternKey) ? strongestPatternKey : null,
      recurrence: normalizeProbabilityValue(recurrence, { allowLegacy: true }),
      confidence: normalizeProbabilityValue(confidence, { allowLegacy: true }),
      communicative_impact: parseCommunicativeImpact(communicativeImpactRaw),
      learner_readiness: normalizeProbabilityValue(learnerReadiness, { allowLegacy: true }),
    },
  };
}

async function loadCompletedSessionAnalyses(
  serviceClient: SupabaseClient,
  userId: string,
  sessionLookbackLimit: number,
): Promise<SessionAnalysisRow[]> {
  const { data, error } = await serviceClient
    .from('session_analyses')
    .select('*, conversation_sessions!inner(status, metadata)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(sessionLookbackLimit);

  if (error) throw new Error(`Session-Analysen konnten nicht geladen werden: ${error.message}`);

  const rows = (data ?? []) as Array<SessionAnalysisRow & { conversation_sessions: { status: string; metadata: unknown } }>;
  const aiEligibleAnalyses = rows.filter((entry) => isAiEligibleSession(entry.conversation_sessions));
  return normalizeSessionAnalysisRows(aiEligibleAnalyses);
}

type DetectAndPersistResult =
  | { skipped: true; reason: string; detail?: string }
  | { skipped: false; focusTopicId: string; stablePatternCount: number };

async function detectAndPersist(params: {
  serviceClient: SupabaseClient;
  userId: string;
  traceId: string;
  settings: RelevantAppSettings;
}): Promise<DetectAndPersistResult> {
  const { serviceClient, userId, traceId, settings } = params;

  if (!settings.featureFlags.multi_session_patterns) {
    return { skipped: true, reason: 'feature_disabled_multi_session_patterns' };
  }

  const analyses = (await loadCompletedSessionAnalyses(serviceClient, userId, settings.sessionLookbackLimit)).slice(0, settings.diagnosisMaxSessions);
  const requiredDiagnosisSessions = Math.max(3, settings.minSessionsForDiagnosis);

  if (analyses.length < requiredDiagnosisSessions) {
    return { skipped: true, reason: 'insufficient_sessions_for_patterns' };
  }

  const analysisInput = analyses.map((analysis) => ({
    analysis_id: analysis.id,
    session_id: analysis.session_id,
    created_at: analysis.created_at,
    category_scores: analysis.category_scores_json,
    detected_patterns: analysis.detected_patterns_json,
    priority_intervention: analysis.priority_intervention_json,
    session_summary: analysis.session_summary,
  }));

  const patternPromptDefinition = await fetchActivePromptDefinition(serviceClient, 'multi_session_pattern_detection');
  const patternRenderedPrompt = renderPromptTemplate(patternPromptDefinition.user_prompt_template, {
    session_analyses_json: JSON.stringify(analysisInput),
    session_count: String(analyses.length),
    min_sessions_for_diagnosis: String(requiredDiagnosisSessions),
  });
  const patternOutputRaw = await runGuardedJsonPrompt({
    serviceClient,
    userId,
    sessionId: null,
    traceId,
    promptDefinition: patternPromptDefinition,
    renderedUserPrompt: patternRenderedPrompt,
    pipelineStep: 'post_session_focus_detection',
  });

  const parsedPatterns = parseMultiSessionPatternOutput(patternOutputRaw);

  if (!parsedPatterns.enough_data || parsedPatterns.stable_patterns.length === 0) {
    return { skipped: true, reason: 'no_stable_patterns' };
  }

  const latestAnalysisId = analyses[0]?.id ?? null;
  const occurrenceWindow = getOccurrenceWindow(analyses);

  const { data: currentPatterns, error: currentPatternsError } = await serviceClient
    .from('detected_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (currentPatternsError) throw new Error(`Bestehende Muster konnten nicht geladen werden: ${currentPatternsError.message}`);

  const byType = new Map(((currentPatterns ?? []) as Array<{ id: string; pattern_type: string }>).map((pattern) => [pattern.pattern_type, pattern]));
  const nextPatternTypes = new Set(parsedPatterns.stable_patterns.map((pattern) => pattern.pattern_key));

  for (const stablePattern of parsedPatterns.stable_patterns) {
    const existing = byType.get(stablePattern.pattern_key);
    const patternSeverity = patternSeverityFromEvidence(stablePattern);
    const evidencePayload = {
      label: stablePattern.label,
      description: stablePattern.description,
      source: 'multi_session_pattern_detection',
      session_count: analyses.length,
      supporting_sessions: stablePattern.supporting_sessions,
      recurrence: stablePattern.recurrence,
      confidence: stablePattern.confidence,
      communicative_impact: stablePattern.communicative_impact,
      evidence_strength: stablePattern.recurrence * 0.45 + stablePattern.confidence * 0.4 + impactToScore(stablePattern.communicative_impact) * 0.15,
      evidence: stablePattern.evidence,
      performance_conditions: stablePattern.performance_conditions,
    };

    if (existing) {
      const { error } = await serviceClient
        .from('detected_patterns')
        .update({
          status: 'active',
          analysis_id: latestAnalysisId,
          severity: patternSeverity,
          occurrence_count: stablePattern.supporting_sessions.length || patternOccurrenceCount(stablePattern.pattern_key, analyses),
          occurrence_window_start: occurrenceWindow.start,
          occurrence_window_end: occurrenceWindow.end,
          evidence: evidencePayload,
          suggested_actions: stablePattern.evidence,
        })
        .eq('id', existing.id)
        .eq('user_id', userId);
      if (error) throw new Error(`Muster ${stablePattern.pattern_key} konnte nicht aktualisiert werden: ${error.message}`);
    } else {
      const { error } = await serviceClient.from('detected_patterns').insert({
        user_id: userId,
        analysis_id: latestAnalysisId,
        status: 'active',
        pattern_type: stablePattern.pattern_key,
        severity: patternSeverity,
        occurrence_count: stablePattern.supporting_sessions.length || patternOccurrenceCount(stablePattern.pattern_key, analyses),
        occurrence_window_start: occurrenceWindow.start,
        occurrence_window_end: occurrenceWindow.end,
        evidence: evidencePayload,
        suggested_actions: stablePattern.evidence,
      });
      if (error) throw new Error(`Muster ${stablePattern.pattern_key} konnte nicht gespeichert werden: ${error.message}`);
    }
  }

  const stalePatternIds = ((currentPatterns ?? []) as Array<{ id: string; pattern_type: string }>)
    .filter((pattern) => !nextPatternTypes.has(pattern.pattern_type))
    .map((pattern) => pattern.id);

  if (stalePatternIds.length > 0) {
    const { error } = await serviceClient.from('detected_patterns').update({ status: 'resolved' }).in('id', stalePatternIds).eq('user_id', userId);
    if (error) throw new Error(`Alte Muster konnten nicht abgeschlossen werden: ${error.message}`);
  }

  if (!settings.featureFlags.focus_topic_selection) {
    return { skipped: true, reason: 'feature_disabled_focus_topic_selection' };
  }
  if (analyses.length < requiredDiagnosisSessions) {
    return { skipped: true, reason: 'insufficient_sessions_for_focus_topic' };
  }

  const focusPromptDefinition = await fetchActivePromptDefinition(serviceClient, 'focus_topic_selector');
  const focusRenderedPrompt = renderPromptTemplate(focusPromptDefinition.user_prompt_template, {
    session_count: String(analyses.length),
    stable_patterns_json: JSON.stringify(parsedPatterns.stable_patterns),
    min_sessions_for_diagnosis: String(requiredDiagnosisSessions),
  });
  const focusOutputRaw = await runGuardedJsonPrompt({
    serviceClient,
    userId,
    sessionId: null,
    traceId,
    promptDefinition: focusPromptDefinition,
    renderedUserPrompt: focusRenderedPrompt,
    pipelineStep: 'focus_topic_selector',
  });

  const focusOutput = parseFocusTopicSelectorOutput(focusOutputRaw);

  if (focusOutput.selection_status === 'insufficient_evidence' || !focusOutput.focus_topic) {
    return { skipped: true, reason: 'insufficient_evidence', detail: focusOutput.reason };
  }
  const selectedFocusTopic = focusOutput.focus_topic;

  const sourcePattern = parsedPatterns.stable_patterns.find((pattern) => pattern.pattern_key === selectedFocusTopic.source_pattern_key);

  const { data: sourcePatternRow, error: sourcePatternError } = await serviceClient
    .from('detected_patterns')
    .select('id')
    .eq('user_id', userId)
    .eq('pattern_type', selectedFocusTopic.source_pattern_key)
    .eq('status', 'active')
    .maybeSingle();

  if (sourcePatternError) throw new Error(`Quellmuster für Fokus-Thema konnte nicht geladen werden: ${sourcePatternError.message}`);

  const { data: focusTopicUpsert, error: focusTopicError } = await serviceClient
    .from('focus_topics')
    .select('*')
    .eq('user_id', userId)
    .eq('topic_key', selectedFocusTopic.topic_key)
    .maybeSingle();

  if (focusTopicError) throw new Error(`Bestehendes Fokus-Thema konnte nicht geladen werden: ${focusTopicError.message}`);
  const existingFocusTopic = focusTopicUpsert as { status: FocusTopicStatus; metadata: Record<string, unknown>; mastery_level: number | null } | null;

  const finalLearnerReadiness = deriveLearnerReadiness({
    sessionsAnalyzed: analyses.length,
    stablePatterns: parsedPatterns.stable_patterns,
    llmSuggestedReadiness: focusOutput.evidence_summary.learner_readiness,
    currentMasteryLevel: existingFocusTopic?.mastery_level ?? null,
  });
  const evidenceDecision = evaluateFocusEvidence({
    sessionsAnalyzed: focusOutput.evidence_summary.sessions_analyzed,
    recurrence: focusOutput.evidence_summary.recurrence,
    confidence: focusOutput.evidence_summary.confidence,
    communicativeImpact: focusOutput.evidence_summary.communicative_impact ?? 'low',
    learnerReadiness: finalLearnerReadiness,
    recurrenceThreshold: settings.focusRecurrenceThreshold,
    performanceConditionConsistency: sourcePattern?.performance_conditions.consistent_condition_count,
    diagnosisMinSessions: requiredDiagnosisSessions,
  });
  if (!shouldActivateNewFocus(evidenceDecision)) {
    return { skipped: true, reason: 'insufficient_evidence', detail: evidenceDecision.reason };
  }

  const existingMetadata = withNormalizedStatusHistory(existingFocusTopic?.metadata);
  const baseline =
    existingMetadata.baseline && typeof existingMetadata.baseline === 'object' && !Array.isArray(existingMetadata.baseline)
      ? existingMetadata.baseline
      : {
          analysis_id: analyses[analyses.length - 1]?.id ?? null,
          session_id: analyses[analyses.length - 1]?.session_id ?? null,
          created_at: analyses[analyses.length - 1]?.created_at ?? null,
          category: selectedFocusTopic.source_pattern_key,
          category_score: extractCategoryScore(analyses[analyses.length - 1]?.category_scores_json ?? null, selectedFocusTopic.source_pattern_key),
        };

  const replacePreviousPrimaryTransition = applyFocusEvent('in_training', 'focus_replaced_by_new_selection', {
    reason: 'single_active_focus_constraint_enforced',
    source: 'multi_session_pattern.service',
  });

  const { error: deactivateError } = await serviceClient
    .from('focus_topics')
    .update({
      status: replacePreviousPrimaryTransition.nextStatus,
      metadata: {
        ...replacePreviousPrimaryTransition.metadata,
        replaced_by_topic_key: selectedFocusTopic.topic_key,
        previous_primary: true,
        reason: 'single_active_focus_constraint_enforced',
      },
    })
    .eq('user_id', userId)
    .in('status', PRIMARY_FOCUS_STATUSES)
    .neq('topic_key', selectedFocusTopic.topic_key);

  if (deactivateError) throw new Error(`Bisherige Fokus-Themen konnten nicht deaktiviert werden: ${deactivateError.message}`);

  const selectedTopicTransition = applyFocusEvent(existingFocusTopic?.status ?? null, 'focus_selected', {
    metadata: existingMetadata,
    reason: 'selected_by_focus_topic_selector',
    source: 'multi_session_pattern.service',
  });

  const { data: upsertedFocusTopic, error: upsertFocusTopicError } = await serviceClient
    .from('focus_topics')
    .upsert(
      {
        user_id: userId,
        topic_key: selectedFocusTopic.topic_key,
        title: selectedFocusTopic.label,
        description: selectedFocusTopic.short_explanation,
        status: selectedTopicTransition.nextStatus,
        priority: sourcePattern ? patternSeverityFromEvidence(sourcePattern) : 3,
        confidence: focusOutput.evidence_summary.confidence,
        mastery_level: existingFocusTopic?.mastery_level ?? 0,
        source_pattern_id: sourcePatternRow?.id ?? null,
        metadata: {
          ...selectedTopicTransition.metadata,
          source_prompt: 'focus_topic_selector',
          source_pattern_type: selectedFocusTopic.source_pattern_key,
          source_pattern_found: Boolean(sourcePattern),
          scoring_schema: { recurrence: '0.0-1.0', confidence: '0.0-1.0', learner_readiness: '0.0-1.0' },
          reason: selectedFocusTopic.reason,
          selection_reason: focusOutput.reason,
          learner_readiness_llm: focusOutput.evidence_summary.learner_readiness,
          learner_readiness_final: finalLearnerReadiness,
          recurrence: focusOutput.evidence_summary.recurrence,
          confidence: focusOutput.evidence_summary.confidence,
          communicative_impact: focusOutput.evidence_summary.communicative_impact,
          evidence_strength: evidenceDecision.score,
          is_primary: true,
          baseline,
          improvement_status: existingMetadata.improvement_status ?? 'insufficient_data',
          last_improvement_check_at: existingMetadata.last_improvement_check_at ?? null,
        },
      },
      { onConflict: 'user_id,topic_key', ignoreDuplicates: false },
    )
    .select('*')
    .single();

  if (upsertFocusTopicError || !upsertedFocusTopic) {
    throw new Error(`Fokus-Thema konnte nicht gespeichert werden: ${upsertFocusTopicError?.message ?? 'Unbekannter Fehler'}`);
  }

  return { skipped: false, focusTopicId: (upsertedFocusTopic as { id: string }).id, stablePatternCount: parsedPatterns.stable_patterns.length };
}

// --- improvement-check.service.ts::runForActiveFocusTopic (Deno-Port) ---

type ImprovementDecision = 'improved' | 'unchanged' | 'worsened' | 'insufficient_data';
type EvidenceQuality = 'low' | 'medium' | 'high';

type ImprovementCheckOutput = {
  decision: ImprovementDecision;
  confidence: number;
  rationale: string;
  focus_evidence: string;
  baseline_evidence: string[];
  current_evidence: string[];
  focus_topic_key: string;
  focus_topic_key_match: boolean;
  focus_topic_match: boolean;
  evidence_quality?: EvidenceQuality;
  recommendation: string;
};

type FocusTopicMetadata = {
  source_pattern_type?: string;
  baseline?: { analysis_id?: string; session_id?: string; created_at?: string; category_score?: number | null; category?: string };
  improvement_status?: ImprovementDecision;
  last_improvement_check_at?: string;
};

const STABIL_RECHECK_INTERVAL_SESSIONS = 5;
const MIN_MASTERY_LEVEL = 0;
const MAX_MASTERY_LEVEL = 5;

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function parseJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeLegacyConfidence0To100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clampUnitInterval(value / 100);
}

function isLegacyConfidenceScale(payload: Record<string, unknown>): boolean {
  return payload.confidence_scale === 'legacy_0_100' || payload.legacy_confidence_0_to_100 === true;
}

function parseImprovementCheckPromptOutput(input: unknown): ImprovementCheckOutput {
  const payload = (input ?? {}) as Record<string, unknown>;
  const decisionRaw = safeString(payload.decision, 'insufficient_data');
  const decision: ImprovementDecision = decisionRaw === 'improved' || decisionRaw === 'unchanged' || decisionRaw === 'worsened' ? decisionRaw : 'insufficient_data';

  let confidence = 0;
  if (typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)) {
    if (payload.confidence >= 0 && payload.confidence <= 1) {
      confidence = clampUnitInterval(payload.confidence);
    } else if (isLegacyConfidenceScale(payload) && payload.confidence >= 0 && payload.confidence <= 100) {
      confidence = normalizeLegacyConfidence0To100(payload.confidence);
    }
  }

  return {
    decision,
    confidence,
    rationale: safeString(payload.rationale),
    focus_evidence: safeString(payload.focus_evidence),
    baseline_evidence: parseStringArray(payload.baseline_evidence),
    current_evidence: parseStringArray(payload.current_evidence),
    focus_topic_key: safeString(payload.focus_topic_key),
    focus_topic_key_match: payload.focus_topic_key_match === true,
    focus_topic_match: payload.focus_topic_match === true,
    evidence_quality:
      payload.evidence_quality === 'low' || payload.evidence_quality === 'medium' || payload.evidence_quality === 'high' ? payload.evidence_quality : undefined,
    recommendation: safeString(payload.recommendation),
  };
}

function mapDecisionToCheckStatus(decision: ImprovementDecision): 'passed' | 'failed' | 'skipped' {
  if (decision === 'improved') return 'passed';
  if (decision === 'worsened') return 'failed';
  return 'skipped';
}

function decisionLabel(decision: ImprovementDecision): string {
  if (decision === 'improved') return 'verbessert';
  if (decision === 'unchanged') return 'unverändert';
  if (decision === 'worsened') return 'verschlechtert';
  return 'zu wenig Daten';
}

function clampMasteryLevel(value: number): number {
  return Math.max(MIN_MASTERY_LEVEL, Math.min(MAX_MASTERY_LEVEL, Math.round(value)));
}

function toImprovementDecision(value: unknown): ImprovementDecision {
  return value === 'improved' || value === 'unchanged' || value === 'worsened' || value === 'insufficient_data' ? value : 'insufficient_data';
}

function normalizeImprovementDecision(params: {
  decision: ImprovementDecision;
  confidence: number;
  previousDecisions: ImprovementDecision[];
  minConfidence: number;
  requiredStreak: number | null;
}): ImprovementDecision {
  const { decision, confidence, previousDecisions, minConfidence, requiredStreak } = params;
  if (decision === 'insufficient_data') return decision;
  if (confidence < minConfidence) return 'insufficient_data';

  if (decision === 'improved' && typeof requiredStreak === 'number') {
    const improvedCount = [...previousDecisions, decision].reduce((count, entry) => (entry === 'improved' ? count + 1 : 0), 0);
    if (improvedCount < requiredStreak) return 'unchanged';
  }

  return decision;
}

function computeMasteryLevel(params: {
  currentLevel: number;
  currentDecision: ImprovementDecision;
  averageRecentScore: number | null;
  deltaToBaseline: number | null;
  previousDecisions: ImprovementDecision[];
  worsenedDeltaThreshold?: number;
}): number {
  const { currentLevel, currentDecision, averageRecentScore, deltaToBaseline, previousDecisions, worsenedDeltaThreshold } = params;
  const current = clampMasteryLevel(currentLevel);
  if (currentDecision === 'insufficient_data') return current;

  const baseDelta = currentDecision === 'improved' ? 1 : currentDecision === 'worsened' ? -1 : 0;
  const improvedStreak = previousDecisions.slice(-2).every((decision) => decision === 'improved');
  const worsenedStreak = previousDecisions.slice(-2).every((decision) => decision === 'worsened');
  const scoreBonus = currentDecision === 'improved' && typeof averageRecentScore === 'number' && averageRecentScore >= 4 ? 1 : 0;
  const threshold = typeof worsenedDeltaThreshold === 'number' ? worsenedDeltaThreshold : -0.5;
  const scorePenalty = currentDecision === 'worsened' && typeof deltaToBaseline === 'number' && deltaToBaseline <= threshold ? -1 : 0;
  const streakBonus = currentDecision === 'improved' && previousDecisions.length >= 2 && improvedStreak ? 1 : 0;
  const streakPenalty = currentDecision === 'worsened' && previousDecisions.length >= 2 && worsenedStreak ? -1 : 0;

  return clampMasteryLevel(current + baseDelta + scoreBonus + scorePenalty + streakBonus + streakPenalty);
}

type RunImprovementCheckResult =
  | { skipped: true; reason: string }
  | { skipped: false; focusTopicId: string; decision: ImprovementDecision; label: string };

async function runImprovementCheck(params: {
  serviceClient: SupabaseClient;
  userId: string;
  latestSessionId: string;
  traceId: string;
  settings: RelevantAppSettings;
}): Promise<RunImprovementCheckResult> {
  const { serviceClient, userId, latestSessionId, traceId, settings } = params;

  if (!settings.featureFlags.improvement_checks) {
    return { skipped: true, reason: 'feature_disabled_improvement_checks' };
  }

  const minRecentSessions = settings.improvementMinRecentSessions;
  const minConfidenceRaw = settings.improvementMinConfidence;
  const minConfidence = minConfidenceRaw > 1 ? minConfidenceRaw / 100 : minConfidenceRaw;
  const requiredStreak = settings.improvementRequiredStreak;

  const { data: activeFocusTopicRaw, error: focusTopicError } = await serviceClient
    .from('focus_topics')
    .select('*')
    .eq('user_id', userId)
    .in('status', [...PRIMARY_FOCUS_STATUSES, 'stabil'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (focusTopicError) throw new Error(`Aktives Fokus-Thema konnte nicht geladen werden: ${focusTopicError.message}`);
  if (!activeFocusTopicRaw) return { skipped: true, reason: 'no_active_focus_topic' };

  const activeFocusTopic = activeFocusTopicRaw as {
    id: string;
    topic_key: string;
    title: string;
    status: FocusTopicStatus;
    mastery_level: number | null;
    metadata: Record<string, unknown>;
    updated_at: string;
  };

  const metadata = withNormalizedStatusHistory(activeFocusTopic.metadata) as FocusMetadataWithHistory & FocusTopicMetadata;

  if (activeFocusTopic.status === 'stabil') {
    const sinceTimestamp = metadata.last_improvement_check_at ?? activeFocusTopic.updated_at;
    const { count: sessionsSinceLastCheck, error: cooldownError } = await serviceClient
      .from('session_analyses')
      .select('*, conversation_sessions!inner(source, status)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .neq('conversation_sessions.source', 'tutor')
      .gt('created_at', sinceTimestamp);

    if (cooldownError) throw new Error(`Rückfall-Check-Intervall konnte nicht geprüft werden: ${cooldownError.message}`);
    if ((sessionsSinceLastCheck ?? 0) < STABIL_RECHECK_INTERVAL_SESSIONS) {
      return { skipped: true, reason: 'stabil_recheck_not_due' };
    }
  }

  const currentMasteryLevel = typeof activeFocusTopic.mastery_level === 'number' ? clampMasteryLevel(activeFocusTopic.mastery_level) : 0;
  const sourcePatternType = safeString(metadata.source_pattern_type);

  const skipWithInsufficientData = async (reason: string, extra?: Record<string, unknown>) => {
    const { error: insertError } = await serviceClient.from('improvement_checks').insert({
      user_id: userId,
      session_id: latestSessionId,
      focus_topic_id: activeFocusTopic.id,
      status: 'skipped',
      check_type: 'focus_topic_improvement_v1',
      score: null,
      result_payload: { decision: 'insufficient_data', label: decisionLabel('insufficient_data'), reason, ...extra },
    });
    if (insertError) throw new Error(`Improvement-Check konnte nicht gespeichert werden: ${insertError.message}`);

    const { error: focusUpdateError } = await serviceClient
      .from('focus_topics')
      .update({
        mastery_level: currentMasteryLevel,
        metadata: {
          ...withNormalizedStatusHistory(metadata),
          improvement_status: 'insufficient_data',
          last_improvement_check_at: new Date().toISOString(),
          global_mastery_level: currentMasteryLevel,
        },
      })
      .eq('id', activeFocusTopic.id)
      .eq('user_id', userId);
    if (focusUpdateError) throw new Error(`Fokus-Thema-Status konnte nicht aktualisiert werden: ${focusUpdateError.message}`);
  };

  if (!sourcePatternType || !metadata.baseline?.analysis_id || !metadata.baseline?.created_at) {
    await skipWithInsufficientData('baseline_missing');
    return { skipped: true, reason: 'missing_baseline' };
  }

  const baselineCreatedAt = metadata.baseline.created_at;

  const { data: recentAnalysesRaw, error: recentAnalysesError } = await serviceClient
    .from('session_analyses')
    .select('*, conversation_sessions!inner(source, status, metadata)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .neq('conversation_sessions.source', 'tutor')
    .gt('created_at', baselineCreatedAt)
    .order('created_at', { ascending: true });

  if (recentAnalysesError) throw new Error(`Neuere Session-Analysen konnten nicht geladen werden: ${recentAnalysesError.message}`);

  const recentAnalyses = (recentAnalysesRaw ?? []) as Array<SessionAnalysisRow & { conversation_sessions: { source: string; status: string; metadata: unknown } }>;
  const normalizedRecentAnalyses = normalizeSessionAnalysisRows(recentAnalyses.filter((analysis) => isAiEligibleSession(analysis.conversation_sessions)));

  if (normalizedRecentAnalyses.length < minRecentSessions) {
    await skipWithInsufficientData('not_enough_recent_free_sessions', {
      recent_session_count: normalizedRecentAnalyses.length,
      applied_thresholds: { min_recent_sessions: minRecentSessions, min_confidence: minConfidence, required_streak: requiredStreak },
    });
    return { skipped: true, reason: 'insufficient_recent_sessions' };
  }

  const baselineScore = metadata.baseline.category_score ?? null;
  const currentFocusTopicKey = activeFocusTopic.topic_key;

  const filteredAnalyses = normalizedRecentAnalyses.flatMap((analysis) => {
    const priority = asRecord(analysis.priority_intervention_json);
    const priorityMatchesFocusTopic = safeString(priority.pattern_key) === currentFocusTopicKey;

    const matchingPatternEntries = parseJsonArray(analysis.detected_patterns_json)
      .map((entry) => asRecord(entry))
      .filter((entry) => safeString(entry.pattern_key) === currentFocusTopicKey)
      .filter((entry) => safeString(entry.category) === sourcePatternType);

    const filteredCategoryScore = extractCategoryScore(analysis.category_scores_json, sourcePatternType);

    if (matchingPatternEntries.length === 0 && filteredCategoryScore === null) return [];

    const priorityLabel = priorityMatchesFocusTopic ? safeString(priority.label) : safeString(matchingPatternEntries[0]?.label);
    const priorityReason = priorityMatchesFocusTopic ? safeString(priority.reason) : safeString(matchingPatternEntries[0]?.description);

    return [{
      ...analysis,
      category_scores_json: { [sourcePatternType]: filteredCategoryScore },
      detected_patterns_json: matchingPatternEntries.map((entry) => ({
        pattern_key: currentFocusTopicKey,
        label: safeString(entry.label),
        description: safeString(entry.description),
        frequency_estimate: safeString(entry.frequency_estimate),
        communicative_impact: safeString(entry.communicative_impact),
        category: sourcePatternType,
      })),
      priority_intervention_json: { pattern_key: currentFocusTopicKey, label: priorityLabel, reason: priorityReason, category: sourcePatternType },
    }];
  });

  if (filteredAnalyses.length < minRecentSessions) {
    await skipWithInsufficientData('not_enough_focus_topic_sessions_after_hard_filter', {
      focus_topic_key: currentFocusTopicKey,
      recent_session_count_unfiltered: normalizedRecentAnalyses.length,
      recent_session_count_filtered: filteredAnalyses.length,
      applied_thresholds: { min_recent_sessions: minRecentSessions, min_confidence: minConfidence, required_streak: requiredStreak },
    });
    return { skipped: true, reason: 'insufficient_focus_topic_sessions_after_hard_filter' };
  }

  const promptDefinition = await fetchActivePromptDefinition(serviceClient, 'improvement_check');
  const renderedPrompt = renderPromptTemplate(promptDefinition.user_prompt_template, {
    current_focus_topic_key: currentFocusTopicKey,
    focus_topic_title: activeFocusTopic.title,
    focus_pattern_type: sourcePatternType,
    baseline_json: JSON.stringify({
      analysis_id: metadata.baseline.analysis_id,
      session_id: metadata.baseline.session_id,
      created_at: metadata.baseline.created_at,
      focus_topic_key: currentFocusTopicKey,
      category: sourcePatternType,
      category_score: baselineScore,
    }),
    recent_sessions_json: JSON.stringify(filteredAnalyses.map((analysis) => ({
      analysis_id: analysis.id,
      session_id: analysis.session_id,
      created_at: analysis.created_at,
      focus_topic_key: currentFocusTopicKey,
      category_score: extractCategoryScore(analysis.category_scores_json, sourcePatternType),
      category_scores: analysis.category_scores_json,
      detected_patterns: analysis.detected_patterns_json,
      session_summary: analysis.session_summary,
      priority_intervention: analysis.priority_intervention_json,
    }))),
    recent_session_count: String(filteredAnalyses.length),
  });

  const promptOutputRaw = await runGuardedJsonPrompt({
    serviceClient,
    userId,
    sessionId: latestSessionId,
    traceId,
    promptDefinition,
    renderedUserPrompt: renderedPrompt,
    pipelineStep: 'post_session_improvement_check',
  });

  const parsed = parseImprovementCheckPromptOutput(promptOutputRaw);

  const recentScores = filteredAnalyses
    .map((entry) => extractCategoryScore(entry.category_scores_json, sourcePatternType))
    .filter((value): value is number => typeof value === 'number');
  const averageRecentScore = recentScores.length > 0 ? recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length : null;
  const deltaToBaseline = typeof baselineScore === 'number' && typeof averageRecentScore === 'number' ? averageRecentScore - baselineScore : null;

  const { data: previousChecks, error: previousChecksError } = await serviceClient
    .from('improvement_checks')
    .select('result_payload')
    .eq('user_id', userId)
    .eq('focus_topic_id', activeFocusTopic.id)
    .eq('check_type', 'focus_topic_improvement_v1')
    .order('created_at', { ascending: true });

  if (previousChecksError) throw new Error(`Historie der Improvement-Checks konnte nicht geladen werden: ${previousChecksError.message}`);

  const previousDecisions = ((previousChecks ?? []) as Array<{ result_payload: unknown }>)
    .map((check) => toImprovementDecision(asRecord(check.result_payload).decision))
    .filter((decision) => decision !== 'insufficient_data');

  const explicitTopicKeyMatch = parsed.focus_topic_key === currentFocusTopicKey && parsed.focus_topic_key_match;
  const explicitFocusMatch = parsed.focus_topic_match && explicitTopicKeyMatch;
  const focusBoundDecision = explicitFocusMatch ? parsed.decision : 'insufficient_data';
  const normalizedDecision = normalizeImprovementDecision({
    decision: focusBoundDecision,
    confidence: parsed.confidence,
    previousDecisions,
    minConfidence,
    requiredStreak,
  });

  const nextMasteryLevel = computeMasteryLevel({
    currentLevel: currentMasteryLevel,
    currentDecision: normalizedDecision,
    averageRecentScore,
    deltaToBaseline,
    previousDecisions,
    worsenedDeltaThreshold: settings.worsenedDeltaThreshold,
  });

  const { error: insertError } = await serviceClient.from('improvement_checks').insert({
    user_id: userId,
    session_id: latestSessionId,
    focus_topic_id: activeFocusTopic.id,
    status: mapDecisionToCheckStatus(normalizedDecision),
    check_type: 'focus_topic_improvement_v1',
    score: averageRecentScore,
    result_payload: {
      decision: normalizedDecision,
      label: decisionLabel(normalizedDecision),
      raw_decision: parsed.decision,
      focus_bound_decision: focusBoundDecision,
      current_focus_topic_key: currentFocusTopicKey,
      llm_focus_topic_key: parsed.focus_topic_key,
      focus_topic_key_match: explicitTopicKeyMatch,
      confidence: parsed.confidence,
      rationale: parsed.rationale,
      focus_evidence: parsed.focus_evidence,
      baseline_evidence: parsed.baseline_evidence,
      current_evidence: parsed.current_evidence,
      focus_topic_match: explicitFocusMatch,
      evidence_quality: parsed.evidence_quality ?? null,
      evidence: { before: parsed.baseline_evidence, after: parsed.current_evidence, summary: parsed.focus_evidence },
      recommendation: parsed.recommendation,
      source_pattern_type: sourcePatternType,
      scoring_schema: { baseline_and_recent_scores: '0-5', llm_confidence: '0.0-1.0' },
      baseline_score: baselineScore,
      average_recent_score: averageRecentScore,
      delta_to_baseline: deltaToBaseline,
      recent_session_count: filteredAnalyses.length,
      recent_session_count_unfiltered: normalizedRecentAnalyses.length,
      applied_thresholds: { min_recent_sessions: minRecentSessions, min_confidence: minConfidence, required_streak: requiredStreak },
    },
  });

  if (insertError) throw new Error(`Improvement-Check konnte nicht gespeichert werden: ${insertError.message}`);

  const transitionEvent =
    normalizedDecision === 'improved' ? 'improvement_improved' : normalizedDecision === 'worsened' ? 'improvement_worsened' : 'improvement_unchanged';
  const transition = applyFocusEvent(activeFocusTopic.status, transitionEvent, {
    metadata,
    reason: `improvement_check:${normalizedDecision}`,
    source: 'improvement_check.service',
  });

  const { error: focusUpdateError } = await serviceClient
    .from('focus_topics')
    .update({
      status: transition.nextStatus,
      mastery_level: nextMasteryLevel,
      metadata: {
        ...transition.metadata,
        improvement_status: normalizedDecision,
        last_improvement_check_at: new Date().toISOString(),
        global_mastery_level: nextMasteryLevel,
      },
    })
    .eq('id', activeFocusTopic.id)
    .eq('user_id', userId);

  if (focusUpdateError) throw new Error(`Fokus-Thema-Status konnte nicht aktualisiert werden: ${focusUpdateError.message}`);

  return { skipped: false, focusTopicId: activeFocusTopic.id, decision: normalizedDecision, label: decisionLabel(normalizedDecision) };
}

// --- Orchestrierung -------------------------------------------------------

/**
 * Läuft serverseitig direkt nach erfolgreichem Abschluss der Session-Pipeline
 * (siehe index.ts, Aufruf nach dem finalen conversation_sessions-Status-Update).
 * Alle drei Schritte sind bewusst best-effort: ein Fehler hier darf die bereits
 * erfolgreich verarbeitete Session nicht nachträglich als fehlgeschlagen
 * erscheinen lassen -- Fehler werden geloggt, aber nicht weitergeworfen.
 */
export async function runPostSessionFollowUps(params: {
  serviceClient: SupabaseClient;
  userId: string;
  sessionId: string;
  traceId: string;
}): Promise<void> {
  const { serviceClient, userId, sessionId, traceId } = params;
  const settings = await loadRelevantAppSettings(serviceClient);

  try {
    const result = await detectAndPersist({ serviceClient, userId, traceId, settings });
    console.log('[process-session] multi_session_pattern_detection', JSON.stringify(result));
  } catch (error) {
    console.error('[process-session] multi_session_pattern_detection failed', error);
  }

  try {
    const result = await runImprovementCheck({ serviceClient, userId, latestSessionId: sessionId, traceId, settings });
    console.log('[process-session] improvement_check', JSON.stringify(result));
  } catch (error) {
    console.error('[process-session] improvement_check failed', error);
  }

  try {
    const result = await runCivicsExplanationCheckIfApplicable({ serviceClient, userId, sessionId, traceId });
    console.log('[process-session] civics_explanation_check', JSON.stringify(result));
  } catch (error) {
    console.error('[process-session] civics_explanation_check failed', error);
  }
}
