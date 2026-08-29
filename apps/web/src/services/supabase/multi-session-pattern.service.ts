import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';
import { applyFocusEvent, withNormalizedStatusHistory } from '@/services/domain/focus-topic-transitions';
import { PRIMARY_FOCUS_STATUSES } from '@/services/domain/focus-topic-state';
import { appSettingsService } from '@/services/supabase/app-settings.service';
import { supabaseClient } from '@/services/supabase/client';
import { extractCategoryScore } from '@/services/supabase/session-analysis.service';
import { normalizeSessionAnalysisRows } from '@/services/supabase/session-analysis-compat';
import { isAiEligibleSession } from '@/services/supabase/session-ai-eligibility';
import type {
  ConversationSessionRow,
  DetectedPatternRow,
  FocusTopicRow,
  Json,
  SessionAnalysisRow,
} from '@/types/database';

const DIAGNOSIS_MIN_SESSIONS = 3;

export type CommunicativeImpact = 'low' | 'medium' | 'high';

// Launch-Readiness-Audit, Befund K (P0 #3, docs/daf-cefr-prompt-audit-2026-05-06.md):
// "Evidenz-Qualität um Performanzbedingungen erweitern" -- Tagging von
// Sprechmodus, Spontaneität, Aufgabenkomplexität, Registerdruck je Muster.
export type PerformanceConditions = {
  speech_mode: 'dialog' | 'monolog' | 'mixed';
  spontaneity: 'spontaneous' | 'prepared' | 'mixed';
  task_complexity: 'low' | 'medium' | 'high';
  register_pressure: 'low' | 'medium' | 'high';
  // Anzahl der 4 Dimensionen oben, in denen die Evidenz über die
  // supporting_sessions hinweg konsistent war (0-4). Fokus-Aktivierung
  // erfordert laut Audit-Empfehlung >= 2 (siehe evaluateFocusEvidence).
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

type MultiSessionPatternDetectionOutput = {
  enough_data: boolean;
  stable_patterns: StablePatternOutput[];
};

type FocusTopicSelectorOutput = {
  selection_status: 'selected' | 'insufficient_evidence';
  focus_topic:
    | {
        topic_key: string;
        label: string;
        short_explanation: string;
        reason: string;
        source_pattern_key: string;
      }
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

export type FocusEvidenceDecision = {
  selectionStatus: 'selected' | 'insufficient_evidence';
  reason: string;
  score: number;
};

export type ActiveFocusTopic = {
  selectionStatus: 'selected';
  id: string;
  topicKey: string;
  title: string;
  description: string | null;
  status: FocusTopicRow['status'];
  priority: number | null;
  confidence: number | null;
  masteryLevel: number;
  improvementLabel: 'verbessert' | 'unverändert' | 'verschlechtert' | 'zu wenig Daten';
  updatedAt: string;
};

export type InsufficientEvidenceFocusState = {
  selectionStatus: 'insufficient_evidence';
  reason: string;
  evidenceSummary: {
    recurrence: number;
    confidence: number;
    communicativeImpact: CommunicativeImpact | null;
    learnerReadiness: number;
  };
};

export type FocusTopicSelectionState = ActiveFocusTopic | InsufficientEvidenceFocusState;

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseJsonObject(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Legacy-Normalisierung:
 * - Primäres internes Format ist 0.0..1.0.
 * - Historische 0..100-Werte werden ausschließlich hier akzeptiert und nach 0.0..1.0 umgerechnet.
 * - Werte außerhalb [0,100] sind ungültig.
 */
export function normalizeLegacyProbabilityScale(value: number): number | null {
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
  if (!Number.isFinite(value)) {
    throw new Error('Score ist nicht numerisch.');
  }
  if (value >= 0 && value <= 1) {
    return value;
  }
  if (opts?.allowLegacy) {
    const normalizedLegacy = normalizeLegacyProbabilityScale(value);
    if (normalizedLegacy !== null) {
      return normalizedLegacy;
    }
  }
  throw new Error(`Score ${value} liegt außerhalb des erlaubten Bereichs 0.0..1.0.`);
}

function parseCommunicativeImpact(value: unknown): CommunicativeImpact {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
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

export function deriveLearnerReadiness(params: {
  sessionsAnalyzed: number;
  stablePatterns: StablePatternOutput[];
  llmSuggestedReadiness: number;
  currentMasteryLevel: number | null;
}): number {
  // mastery_level-Einfluss:
  // - niedriges Mastery (<=2): leichte Erhöhung der Readiness, weil ein klarer Lernhebel erwartbar ist.
  // - hohes Mastery (>=4): leichte Senkung, um vorschnelle Re-Fokussierung auf bereits stabile Themen zu vermeiden.
  // - kein Mastery vorhanden: neutraler Einfluss (0).
  const { sessionsAnalyzed, stablePatterns, llmSuggestedReadiness, currentMasteryLevel } = params;
  const top = [...stablePatterns].sort((a, b) => (b.recurrence + b.confidence) / 2 - (a.recurrence + a.confidence) / 2);
  const topScore = top[0] ? (top[0].recurrence + top[0].confidence) / 2 : 0;
  const secondScore = top[1] ? (top[1].recurrence + top[1].confidence) / 2 : 0;
  const strongPatternCount = stablePatterns.filter((item) => item.recurrence >= 0.6 && item.confidence >= 0.65).length;

  const base = sessionsAnalyzed >= 5 ? 0.72 : sessionsAnalyzed === 4 ? 0.64 : 0.56;
  const dominanceBoost = topScore - secondScore >= 0.15 ? 0.08 : 0;
  const spreadPenalty = Math.max(0, strongPatternCount - 1) * 0.08;
  const masteryAdjustment = typeof currentMasteryLevel === 'number'
    ? currentMasteryLevel >= 4
      ? -0.05
      : currentMasteryLevel <= 2
        ? 0.05
        : 0
    : 0;

  const ruleBased = clampUnitInterval(base + dominanceBoost - spreadPenalty + masteryAdjustment);
  const llmReadiness = clampUnitInterval(llmSuggestedReadiness);
  return clampUnitInterval(ruleBased * 0.7 + llmReadiness * 0.3);
}

/**
 * Pädagogische Evidenzentscheidung (zentral):
 * 1) Harte Mindestregeln verhindern vorschnelle Fokussetzung.
 * 2) Gewichtete Bewertung priorisiert Wiederkehr (0.35), Diagnose-Sicherheit (0.30),
 *    Lernbereitschaft (0.20) und kommunikativen Impact (0.15).
 * 3) Low-Impact darf nie allein Fokus-Thema auslösen.
 */
export function evaluateFocusEvidence(input: {
  sessionsAnalyzed: number;
  recurrence: number;
  confidence: number;
  communicativeImpact: CommunicativeImpact;
  learnerReadiness: number;
  recurrenceThreshold?: number;
  // Launch-Readiness-Audit, Befund K (P0 #3): wie viele der 4
  // Performanzbedingungen (Sprechmodus, Spontaneität, Aufgabenkomplexität,
  // Registerdruck) über die Sessions hinweg konsistent waren. undefined bei
  // Aufrufern, die (noch) keine Muster-Herkunft kennen -- dann greift das Gate
  // nicht, um bestehende Aufrufer nicht zu brechen.
  performanceConditionConsistency?: number;
}): FocusEvidenceDecision {
  const recurrence = clampUnitInterval(input.recurrence);
  const confidence = clampUnitInterval(input.confidence);
  const learnerReadiness = clampUnitInterval(input.learnerReadiness);

  if (input.sessionsAnalyzed < DIAGNOSIS_MIN_SESSIONS) {
    return { selectionStatus: 'insufficient_evidence', reason: 'Mindestens 3 Sessions benötigt.', score: 0 };
  }
  const recurrenceThreshold = clampUnitInterval(input.recurrenceThreshold ?? 0.5);
  if (recurrence < recurrenceThreshold) {
    return { selectionStatus: 'insufficient_evidence', reason: `Wiederkehr unter ${recurrenceThreshold}.`, score: recurrence };
  }
  if (typeof input.performanceConditionConsistency === 'number' && input.performanceConditionConsistency < 2) {
    return {
      selectionStatus: 'insufficient_evidence',
      reason: 'Evidenz ist in weniger als 2 Performanzbedingungen konsistent.',
      score: recurrence,
    };
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

  const score =
    recurrence * 0.35 +
    confidence * 0.3 +
    learnerReadiness * 0.2 +
    impactToScore(input.communicativeImpact) * 0.15;

  return score >= 0.62
    ? { selectionStatus: 'selected', reason: 'Evidenz ausreichend für ein fokussiertes Hauptthema.', score }
    : { selectionStatus: 'insufficient_evidence', reason: 'Gesamtevidenz noch nicht stabil genug.', score };
}

export function shouldActivateNewFocus(decision: FocusEvidenceDecision): boolean {
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
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return false;
      }
      const patternKey = (item as Record<string, unknown>).pattern_key;
      return typeof patternKey === 'string' && patternKey === patternType;
    });

    if (hasCategoryMatch) {
      return count + 1;
    }

    const priorityIntervention = parseJsonObject(analysis.priority_intervention_json);
    return priorityIntervention.pattern_key === patternType ? count + 1 : count;
  }, 0);
}

function getOccurrenceWindow(analyses: SessionAnalysisRow[]): { start: string | null; end: string | null } {
  if (analyses.length === 0) {
    return { start: null, end: null };
  }

  const createdAt = analyses
    .map((analysis) => analysis.created_at)
    .filter((value): value is string => hasText(value))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  if (createdAt.length === 0) {
    return { start: null, end: null };
  }

  return {
    start: createdAt[0] ?? null,
    end: createdAt[createdAt.length - 1] ?? null,
  };
}

export function parseMultiSessionPatternOutput(
  input: unknown,
  options: { allowLegacyScores?: boolean } = {},
): MultiSessionPatternDetectionOutput {
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
    if (
      !hasText(entry.pattern_key) ||
      !hasText(entry.label) ||
      !hasText(entry.description) ||
      !Array.isArray(entry.evidence) ||
      !Array.isArray(entry.supporting_sessions)
    ) {
      throw new Error('stable_pattern ist unvollständig.');
    }

    if (
      typeof entry.recurrence !== 'number' ||
      !Number.isFinite(entry.recurrence) ||
      typeof entry.confidence !== 'number' ||
      !Number.isFinite(entry.confidence)
    ) {
      throw new Error('stable_pattern.recurrence/confidence fehlen oder sind ungültig.');
    }

    const evidence = entry.evidence.filter(hasText);
    const supportingSessions = entry.supporting_sessions.filter(hasText);

    return {
      pattern_key: entry.pattern_key,
      label: entry.label,
      description: entry.description,
      recurrence: normalizeProbabilityValue(entry.recurrence, { allowLegacy: options.allowLegacyScores ?? false }),
      confidence: normalizeProbabilityValue(entry.confidence, { allowLegacy: options.allowLegacyScores ?? false }),
      supporting_sessions: supportingSessions,
      communicative_impact: parseCommunicativeImpact(entry.communicative_impact),
      evidence,
      performance_conditions: parsePerformanceConditions(entry.performance_conditions),
    };
  });

  return {
    enough_data: payload.enough_data,
    stable_patterns: stablePatterns,
  };
}

export function parseFocusTopicSelectorOutput(
  input: unknown,
  options: { allowLegacyScores?: boolean } = {},
): FocusTopicSelectorOutput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('focus_topic_selector muss ein Objekt liefern.');
  }

  const payload = input as Record<string, unknown>;
  if (payload.selection_status !== 'selected' && payload.selection_status !== 'insufficient_evidence') {
    throw new Error('focus_topic_selector.selection_status fehlt oder ist ungültig.');
  }

  if (!hasText(payload.reason)) {
    throw new Error('focus_topic_selector.reason fehlt oder ist ungültig.');
  }

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
    if (focusValue !== null) {
      throw new Error('Bei insufficient_evidence muss focus_topic null sein.');
    }
    return {
      selection_status: 'insufficient_evidence',
      focus_topic: null,
      reason: payload.reason,
      evidence_summary: {
        sessions_analyzed: Math.max(0, Math.round(sessionsAnalyzed)),
        strongest_pattern_key: strongestPatternKey === null ? null : hasText(strongestPatternKey) ? strongestPatternKey : null,
        recurrence: normalizeProbabilityValue(recurrence, { allowLegacy: options.allowLegacyScores ?? false }),
        confidence: normalizeProbabilityValue(confidence, { allowLegacy: options.allowLegacyScores ?? false }),
        communicative_impact: communicativeImpactRaw === null ? null : parseCommunicativeImpact(communicativeImpactRaw),
        learner_readiness: normalizeProbabilityValue(learnerReadiness, { allowLegacy: options.allowLegacyScores ?? false }),
      },
    };
  }

  if (focusValue === null || typeof focusValue !== 'object' || Array.isArray(focusValue)) {
    throw new Error('Bei selected muss focus_topic ein Objekt sein.');
  }

  const focus = focusValue as Record<string, unknown>;
  if (
    !hasText(focus.topic_key) ||
    !hasText(focus.label) ||
    !hasText(focus.short_explanation) ||
    !hasText(focus.reason) ||
    !hasText(focus.source_pattern_key)
  ) {
    throw new Error('focus_topic_selector.focus_topic ist unvollständig.');
  }
  if (focus.topic_key === 'insufficient_evidence') {
    throw new Error('focus_topic_selector.focus_topic.topic_key darf nicht "insufficient_evidence" sein.');
  }
  const readinessRaw = asNumberOrNull(focus.learner_readiness);

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
      recurrence: normalizeProbabilityValue(recurrence, { allowLegacy: options.allowLegacyScores ?? false }),
      confidence: normalizeProbabilityValue(confidence, { allowLegacy: options.allowLegacyScores ?? false }),
      communicative_impact: parseCommunicativeImpact(communicativeImpactRaw),
      learner_readiness: normalizeProbabilityValue(learnerReadiness, { allowLegacy: options.allowLegacyScores ?? false }),
    },
  };
}

async function loadCompletedSessionAnalyses(userId: string, sessionLookbackLimit: number): Promise<SessionAnalysisRow[]> {
  const { data, error } = await supabaseClient
    .from('session_analyses')
    .select('*, conversation_sessions!inner(status, metadata)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(sessionLookbackLimit)
    .returns<Array<SessionAnalysisRow & { conversation_sessions: Pick<ConversationSessionRow, 'status' | 'metadata'> }>>();

  if (error) {
    throw new Error(`Session-Analysen konnten nicht geladen werden: ${error.message}`);
  }

  const aiEligibleAnalyses = (data ?? []).filter((entry) => isAiEligibleSession(entry.conversation_sessions));
  return normalizeSessionAnalysisRows(aiEligibleAnalyses);
}

export const multiSessionPatternService = {
  async detectAndPersist(
    userId: string,
    context?: { traceId?: string; workflowId?: string; pipelineStep?: string; attemptNumber?: number },
  ) {
    const settings = await appSettingsService.getSettings();

    if (!appSettingsService.isFeatureEnabled(settings, 'multi_session_patterns')) {
      return {
        skipped: true as const,
        reason: 'feature_disabled_multi_session_patterns',
      };
    }

    const analyses = (await loadCompletedSessionAnalyses(userId, settings.sessionLookbackLimit)).slice(0, settings.diagnosisMaxSessions);
    const requiredDiagnosisSessions = Math.max(DIAGNOSIS_MIN_SESSIONS, settings.minSessionsForDiagnosis);

    if (analyses.length < requiredDiagnosisSessions) {
      return {
        skipped: true as const,
        reason: 'insufficient_sessions_for_patterns',
      };
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

    const patternPromptResult = await aiOrchestratorService.executePrompt<MultiSessionPatternDetectionOutput>({
      promptKey: 'multi_session_pattern_detection',
      variables: {
        session_analyses_json: JSON.stringify(analysisInput),
        session_count: String(analyses.length),
        min_sessions_for_diagnosis: String(requiredDiagnosisSessions),
      },
      logging: {
        userId,
      },
      executionContext: {
        traceId: context?.traceId,
        workflowId: context?.workflowId,
        pipelineStep: context?.pipelineStep ?? 'multi_session_pattern_detection',
        featureName: 'multi_session_pattern_detection',
        attemptNumber: context?.attemptNumber,
      },
    });

    if (!patternPromptResult.ok || !patternPromptResult.output) {
      throw new Error(patternPromptResult.errorMessage ?? 'Prompt multi_session_pattern_detection fehlgeschlagen.');
    }

    const parsedPatterns = parseMultiSessionPatternOutput(patternPromptResult.output, { allowLegacyScores: true });

    if (!parsedPatterns.enough_data || parsedPatterns.stable_patterns.length === 0) {
      return {
        skipped: true as const,
        reason: 'no_stable_patterns',
      };
    }

    const latestAnalysisId = analyses[0]?.id ?? null;
    const occurrenceWindow = getOccurrenceWindow(analyses);

    const { data: currentPatterns, error: currentPatternsError } = await supabaseClient
      .from('detected_patterns')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .returns<DetectedPatternRow[]>();

    if (currentPatternsError) {
      throw new Error(`Bestehende Muster konnten nicht geladen werden: ${currentPatternsError.message}`);
    }

    const byType = new Map((currentPatterns ?? []).map((pattern) => [pattern.pattern_type, pattern]));
    const nextPatternTypes = new Set(parsedPatterns.stable_patterns.map((pattern) => pattern.pattern_key));

    for (const stablePattern of parsedPatterns.stable_patterns) {
      const existing = byType.get(stablePattern.pattern_key);
      const patternEvidenceStrength =
        stablePattern.recurrence * 0.45 + stablePattern.confidence * 0.4 + impactToScore(stablePattern.communicative_impact) * 0.15;
      const patternSeverity = patternSeverityFromEvidence(stablePattern);
      if (existing) {
        const { error } = await supabaseClient
          .from('detected_patterns')
          .update({
            status: 'active',
            analysis_id: latestAnalysisId,
            severity: patternSeverity,
            occurrence_count: stablePattern.supporting_sessions.length || patternOccurrenceCount(stablePattern.pattern_key, analyses),
            occurrence_window_start: occurrenceWindow.start,
            occurrence_window_end: occurrenceWindow.end,
            evidence: {
              label: stablePattern.label,
              description: stablePattern.description,
              source: 'multi_session_pattern_detection',
              session_count: analyses.length,
              supporting_sessions: stablePattern.supporting_sessions,
              recurrence: stablePattern.recurrence,
              confidence: stablePattern.confidence,
              communicative_impact: stablePattern.communicative_impact,
              evidence_strength: patternEvidenceStrength,
              evidence: stablePattern.evidence,
              performance_conditions: stablePattern.performance_conditions,
            },
            suggested_actions: stablePattern.evidence,
          })
          .eq('id', existing.id)
          .eq('user_id', userId);

        if (error) {
          throw new Error(`Muster ${stablePattern.pattern_key} konnte nicht aktualisiert werden: ${error.message}`);
        }
      } else {
        const { error } = await supabaseClient.from('detected_patterns').insert({
          user_id: userId,
          analysis_id: latestAnalysisId,
          status: 'active',
          pattern_type: stablePattern.pattern_key,
          severity: patternSeverity,
          occurrence_count: stablePattern.supporting_sessions.length || patternOccurrenceCount(stablePattern.pattern_key, analyses),
          occurrence_window_start: occurrenceWindow.start,
          occurrence_window_end: occurrenceWindow.end,
          evidence: {
            label: stablePattern.label,
            description: stablePattern.description,
            source: 'multi_session_pattern_detection',
            session_count: analyses.length,
            supporting_sessions: stablePattern.supporting_sessions,
            recurrence: stablePattern.recurrence,
            confidence: stablePattern.confidence,
            communicative_impact: stablePattern.communicative_impact,
            evidence_strength: patternEvidenceStrength,
            evidence: stablePattern.evidence,
            performance_conditions: stablePattern.performance_conditions,
          },
          suggested_actions: stablePattern.evidence,
        });

        if (error) {
          throw new Error(`Muster ${stablePattern.pattern_key} konnte nicht gespeichert werden: ${error.message}`);
        }
      }
    }

    const stalePatternIds = (currentPatterns ?? [])
      .filter((pattern) => !nextPatternTypes.has(pattern.pattern_type))
      .map((pattern) => pattern.id);

    if (stalePatternIds.length > 0) {
      const { error } = await supabaseClient
        .from('detected_patterns')
        .update({ status: 'resolved' })
        .in('id', stalePatternIds)
        .eq('user_id', userId);

      if (error) {
        throw new Error(`Alte Muster konnten nicht abgeschlossen werden: ${error.message}`);
      }
    }

    if (!appSettingsService.isFeatureEnabled(settings, 'focus_topic_selection')) {
      return {
        skipped: true as const,
        reason: 'feature_disabled_focus_topic_selection',
      };
    }

    if (analyses.length < requiredDiagnosisSessions) {
      return {
        skipped: true as const,
        reason: 'insufficient_sessions_for_focus_topic',
      };
    }

    const focusPromptResult = await aiOrchestratorService.executePrompt<FocusTopicSelectorOutput>({
      promptKey: 'focus_topic_selector',
      variables: {
        session_count: String(analyses.length),
        stable_patterns_json: JSON.stringify(parsedPatterns.stable_patterns),
        min_sessions_for_diagnosis: String(requiredDiagnosisSessions),
      },
      logging: {
        userId,
      },
      executionContext: {
        traceId: context?.traceId,
        workflowId: context?.workflowId,
        pipelineStep: 'focus_topic_selector',
        featureName: 'focus_topic_selector',
        attemptNumber: context?.attemptNumber,
      },
    });

    if (!focusPromptResult.ok || !focusPromptResult.output) {
      throw new Error(focusPromptResult.errorMessage ?? 'Prompt focus_topic_selector fehlgeschlagen.');
    }

    const focusOutput = parseFocusTopicSelectorOutput(focusPromptResult.output, { allowLegacyScores: true });

    if (focusOutput.selection_status === 'insufficient_evidence') {
      return {
        skipped: true as const,
        reason: 'insufficient_evidence',
        detail: focusOutput.reason,
      };
    }
    if (!focusOutput.focus_topic) {
      return {
        skipped: true as const,
        reason: 'insufficient_evidence',
        detail: 'selected_without_focus_topic',
      };
    }
    const selectedFocusTopic = focusOutput.focus_topic;

    const sourcePattern = parsedPatterns.stable_patterns.find(
      (pattern) => pattern.pattern_key === selectedFocusTopic.source_pattern_key,
    );

    const { data: sourcePatternRow, error: sourcePatternError } = await supabaseClient
      .from('detected_patterns')
      .select('id')
      .eq('user_id', userId)
      .eq('pattern_type', selectedFocusTopic.source_pattern_key)
      .eq('status', 'active')
      .maybeSingle<{ id: string }>();

    if (sourcePatternError) {
      throw new Error(`Quellmuster für Fokus-Thema konnte nicht geladen werden: ${sourcePatternError.message}`);
    }

    const { data: focusTopicUpsert, error: focusTopicError } = await supabaseClient
      .from('focus_topics')
      .select('*')
      .eq('user_id', userId)
      .eq('topic_key', selectedFocusTopic.topic_key)
      .maybeSingle<FocusTopicRow>();

    if (focusTopicError) {
      throw new Error(`Bestehendes Fokus-Thema konnte nicht geladen werden: ${focusTopicError.message}`);
    }

    const finalLearnerReadiness = deriveLearnerReadiness({
      sessionsAnalyzed: analyses.length,
      stablePatterns: parsedPatterns.stable_patterns,
      llmSuggestedReadiness: focusOutput.evidence_summary.learner_readiness,
      currentMasteryLevel: focusTopicUpsert?.mastery_level ?? null,
    });
    const evidenceDecision = evaluateFocusEvidence({
      sessionsAnalyzed: focusOutput.evidence_summary.sessions_analyzed,
      recurrence: focusOutput.evidence_summary.recurrence,
      confidence: focusOutput.evidence_summary.confidence,
      communicativeImpact: focusOutput.evidence_summary.communicative_impact ?? 'low',
      learnerReadiness: finalLearnerReadiness,
      recurrenceThreshold: settings.focusRecurrenceThreshold,
      performanceConditionConsistency: sourcePattern?.performance_conditions.consistent_condition_count,
    });
    if (!shouldActivateNewFocus(evidenceDecision)) {
      return {
        skipped: true as const,
        reason: 'insufficient_evidence',
        detail: evidenceDecision.reason,
      };
    }

    const existingMetadata = withNormalizedStatusHistory(focusTopicUpsert?.metadata);
    const baseline =
      existingMetadata.baseline && typeof existingMetadata.baseline === 'object' && !Array.isArray(existingMetadata.baseline)
        ? existingMetadata.baseline
        : {
            analysis_id: analyses[analyses.length - 1]?.id ?? null,
            session_id: analyses[analyses.length - 1]?.session_id ?? null,
            created_at: analyses[analyses.length - 1]?.created_at ?? null,
            category: selectedFocusTopic.source_pattern_key,
            category_score: (() => {
              return extractCategoryScore(
                analyses[analyses.length - 1]?.category_scores_json ?? null,
                selectedFocusTopic.source_pattern_key,
              );
            })(),
          };

    const replacePreviousPrimaryTransition = applyFocusEvent('in_training', 'focus_replaced_by_new_selection', {
      reason: 'single_active_focus_constraint_enforced',
      source: 'multi_session_pattern.service',
    });

    const { error: deactivateError } = await supabaseClient
      .from('focus_topics')
      .update({
        status: replacePreviousPrimaryTransition.nextStatus,
        metadata: toJson({
          ...replacePreviousPrimaryTransition.metadata,
          replaced_by_topic_key: selectedFocusTopic.topic_key,
          previous_primary: true,
          reason: 'single_active_focus_constraint_enforced',
        }),
      })
      .eq('user_id', userId)
      .in('status', PRIMARY_FOCUS_STATUSES)
      .neq('topic_key', selectedFocusTopic.topic_key);

    if (deactivateError) {
      throw new Error(`Bisherige Fokus-Themen konnten nicht deaktiviert werden: ${deactivateError.message}`);
    }

    const selectedTopicTransition = applyFocusEvent(focusTopicUpsert?.status ?? null, 'focus_selected', {
      metadata: existingMetadata,
      reason: 'selected_by_focus_topic_selector',
      source: 'multi_session_pattern.service',
    });

    const { data: upsertedFocusTopic, error: upsertFocusTopicError } = await supabaseClient
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
          mastery_level: focusTopicUpsert?.mastery_level ?? 0,
          source_pattern_id: sourcePatternRow?.id ?? null,
          metadata: toJson({
            ...selectedTopicTransition.metadata,
            source_prompt: 'focus_topic_selector',
            source_pattern_type: selectedFocusTopic.source_pattern_key,
            source_pattern_found: Boolean(sourcePattern),
            scoring_schema: {
              recurrence: '0.0-1.0',
              confidence: '0.0-1.0',
              learner_readiness: '0.0-1.0',
            },
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
          }),
        },
        {
          onConflict: 'user_id,topic_key',
          ignoreDuplicates: false,
        },
      )
      .select('*')
      .single<FocusTopicRow>();

    if (upsertFocusTopicError || !upsertedFocusTopic) {
      throw new Error(
        `Fokus-Thema konnte nicht gespeichert werden: ${upsertFocusTopicError?.message ?? 'Unbekannter Fehler'}`,
      );
    }

    return {
      skipped: false as const,
      focusTopicId: upsertedFocusTopic.id,
      stablePatternCount: parsedPatterns.stable_patterns.length,
    };
  },

  async getActiveFocusTopic(userId: string): Promise<ActiveFocusTopic | null> {
    const { data, error } = await supabaseClient
      .from('focus_topics')
      .select('*')
      .eq('user_id', userId)
      .in('status', PRIMARY_FOCUS_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<FocusTopicRow>();

    if (error) {
      throw new Error(`Aktives Fokus-Thema konnte nicht geladen werden: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const { data: latestCheck } = await supabaseClient
      .from('improvement_checks')
      .select('result_payload')
      .eq('user_id', userId)
      .eq('focus_topic_id', data.id)
      .eq('check_type', 'focus_topic_improvement_v1')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ result_payload: Json }>();

    const resultPayload = latestCheck?.result_payload && typeof latestCheck.result_payload === 'object'
      ? (latestCheck.result_payload as Record<string, unknown>)
      : null;
    const improvementLabelValue = resultPayload?.label;
    const improvementLabel: ActiveFocusTopic['improvementLabel'] =
      improvementLabelValue === 'verbessert' ||
      improvementLabelValue === 'unverändert' ||
      improvementLabelValue === 'verschlechtert' ||
      improvementLabelValue === 'zu wenig Daten'
        ? improvementLabelValue
        : 'zu wenig Daten';

    return {
      selectionStatus: 'selected',
      id: data.id,
      topicKey: data.topic_key,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      confidence: data.confidence,
      masteryLevel: typeof data.mastery_level === 'number' ? data.mastery_level : 0,
      improvementLabel,
      updatedAt: data.updated_at,
    };
  },

  async getFocusTopicSelectionState(userId: string): Promise<FocusTopicSelectionState> {
    const active = await this.getActiveFocusTopic(userId);
    if (active) {
      return active;
    }

    const { data: latestPattern, error } = await supabaseClient
      .from('detected_patterns')
      .select('evidence')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ evidence: Json }>();

    if (error) {
      throw new Error(`Fokus-Evidenz konnte nicht geladen werden: ${error.message}`);
    }

    const evidence = latestPattern?.evidence ? asRecord(latestPattern.evidence) : {};
    return {
      selectionStatus: 'insufficient_evidence',
      reason: 'Noch nicht genug belastbare Hinweise. Sammle weitere 1–2 Sessions.',
      evidenceSummary: {
        recurrence: clampUnitInterval(asNumberOrNull(evidence.recurrence) ?? 0),
        confidence: clampUnitInterval(asNumberOrNull(evidence.confidence) ?? 0),
        communicativeImpact:
          evidence.communicative_impact === 'low' ||
          evidence.communicative_impact === 'medium' ||
          evidence.communicative_impact === 'high'
            ? evidence.communicative_impact
            : null,
        learnerReadiness: clampUnitInterval(asNumberOrNull(evidence.learner_readiness_final) ?? 0),
      },
    };
  },
};
