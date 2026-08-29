import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';
import { applyFocusEvent, withNormalizedStatusHistory } from '@/services/domain/focus-topic-transitions';
import { PRIMARY_FOCUS_STATUSES } from '@/services/domain/focus-topic-state';
import { appSettingsService, DEFAULT_APP_SETTINGS } from '@/services/supabase/app-settings.service';
import { supabaseClient } from '@/services/supabase/client';
import { extractCategoryScore } from '@/services/supabase/session-analysis.service';
import { normalizeSessionAnalysisRows } from '@/services/supabase/session-analysis-compat';
import { isAiEligibleSession } from '@/services/supabase/session-ai-eligibility';
import type { ConversationSessionRow, FocusTopicRow, ImprovementCheckRow, Json, SessionAnalysisRow } from '@/types/database';

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
  baseline?: {
    analysis_id?: string;
    session_id?: string;
    created_at?: string;
    category_score?: number | null;
    category?: string;
  };
  improvement_status?: ImprovementDecision;
  last_improvement_check_at?: string;
  status_history?: Array<{
    timestamp: string;
    from: FocusTopicRow['status'] | null;
    to: FocusTopicRow['status'];
    reason: string;
    source: string;
  }>;
};

const MIN_MASTERY_LEVEL = 0;
const MAX_MASTERY_LEVEL = 5;

// Launch-Readiness-Audit / coach-prompt-quality-framework.md Achter Nachtrag: die
// Zustandsmaschine (focus-topic-transitions.ts) definiert einen Übergang
// stabil -> rueckfall_erkannt, und die Tutor-Policy (focus-topic-policy.ts) setzt
// rueckfall_erkannt bereits als tutor.isReleased -- die Reaktivierung ist fertig gebaut.
// Es fehlte nur der Auslöser: runForActiveFocusTopic prüfte ausschließlich
// PRIMARY_FOCUS_STATUSES, nie 'stabil'. Ein bereits gemeistertes Thema wurde dadurch nie
// wieder verifiziert. Re-Check nicht bei jeder Session (unnötige Kosten/Störung), sondern
// erst nach dieser vielen neuen freien Sessions seit der letzten Prüfung.
const STABIL_RECHECK_INTERVAL_SESSIONS = 5;

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function parseJsonObject(value: Json): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function parseJsonArray(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeLegacyConfidence0To100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clampUnitInterval(value / 100);
}

function isLegacyConfidenceScale(payload: Record<string, unknown>): boolean {
  return payload.confidence_scale === 'legacy_0_100' || payload.legacy_confidence_0_to_100 === true;
}

export function parseImprovementCheckPromptOutput(input: unknown): ImprovementCheckOutput {
  const payload = (input ?? {}) as Record<string, unknown>;
  const decisionRaw = safeString(payload.decision, 'insufficient_data');
  const decision: ImprovementDecision =
    decisionRaw === 'improved' || decisionRaw === 'unchanged' || decisionRaw === 'worsened'
      ? decisionRaw
      : 'insufficient_data';

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
      payload.evidence_quality === 'low' || payload.evidence_quality === 'medium' || payload.evidence_quality === 'high'
        ? payload.evidence_quality
        : undefined,
    recommendation: safeString(payload.recommendation),
  };
}

export function mapDecisionToCheckStatus(decision: ImprovementDecision): ImprovementCheckRow['status'] {
  if (decision === 'improved') {
    return 'passed';
  }
  if (decision === 'worsened') {
    return 'failed';
  }
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
  return value === 'improved' || value === 'unchanged' || value === 'worsened' || value === 'insufficient_data'
    ? value
    : 'insufficient_data';
}

export function normalizeImprovementDecision(params: {
  decision: ImprovementDecision;
  confidence: number;
  previousDecisions: ImprovementDecision[];
  minConfidence: number;
  requiredStreak: number | null;
}): ImprovementDecision {
  const { decision, confidence, previousDecisions, minConfidence, requiredStreak } = params;

  if (decision === 'insufficient_data') {
    return decision;
  }

  if (confidence < minConfidence) {
    return 'insufficient_data';
  }

  if (decision === 'improved' && typeof requiredStreak === 'number') {
    const improvedCount = [...previousDecisions, decision].reduce(
      (count, entry) => (entry === 'improved' ? count + 1 : 0),
      0,
    );
    if (improvedCount < requiredStreak) {
      return 'unchanged';
    }
  }

  return decision;
}

export function computeMasteryLevel(params: {
  currentLevel: number;
  currentDecision: ImprovementDecision;
  averageRecentScore: number | null;
  deltaToBaseline: number | null;
  previousDecisions: ImprovementDecision[];
  worsenedDeltaThreshold?: number;
}): number {
  const { currentLevel, currentDecision, averageRecentScore, deltaToBaseline, previousDecisions, worsenedDeltaThreshold } = params;
  const current = clampMasteryLevel(currentLevel);

  if (currentDecision === 'insufficient_data') {
    return current;
  }

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

export const improvementCheckService = {
  async runForActiveFocusTopic(params: {
    userId: string;
    latestSessionId: string;
    traceId?: string;
    workflowId?: string;
    pipelineStep?: string;
    attemptNumber?: number;
  }) {
    const { userId, latestSessionId } = params;
    const appSettings = await appSettingsService.getSettings();
    const minRecentSessions = appSettings.improvementMinRecentSessions ?? DEFAULT_APP_SETTINGS.improvementMinRecentSessions;
    const minConfidenceRaw = appSettings.improvementMinConfidence ?? DEFAULT_APP_SETTINGS.improvementMinConfidence;
    const minConfidence = minConfidenceRaw > 1 ? minConfidenceRaw / 100 : minConfidenceRaw;
    const requiredStreak = appSettings.improvementRequiredStreak;

    const { data: activeFocusTopic, error: focusTopicError } = await supabaseClient
      .from('focus_topics')
      .select('*')
      .eq('user_id', userId)
      .in('status', [...PRIMARY_FOCUS_STATUSES, 'stabil'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<FocusTopicRow>();

    if (focusTopicError) {
      throw new Error(`Aktives Fokus-Thema konnte nicht geladen werden: ${focusTopicError.message}`);
    }

    if (!activeFocusTopic) {
      return { skipped: true as const, reason: 'no_active_focus_topic' };
    }

    const metadata = withNormalizedStatusHistory(activeFocusTopic.metadata) as FocusTopicMetadata;

    if (activeFocusTopic.status === 'stabil') {
      const sinceTimestamp = metadata.last_improvement_check_at ?? activeFocusTopic.updated_at;
      const { count: sessionsSinceLastCheck, error: cooldownError } = await supabaseClient
        .from('session_analyses')
        .select('*, conversation_sessions!inner(source, status)', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .neq('conversation_sessions.source', 'tutor')
        .gt('created_at', sinceTimestamp);

      if (cooldownError) {
        throw new Error(`Rückfall-Check-Intervall konnte nicht geprüft werden: ${cooldownError.message}`);
      }

      if ((sessionsSinceLastCheck ?? 0) < STABIL_RECHECK_INTERVAL_SESSIONS) {
        return { skipped: true as const, reason: 'stabil_recheck_not_due' };
      }
    }
    const currentMasteryLevel =
      typeof activeFocusTopic.mastery_level === 'number' ? clampMasteryLevel(activeFocusTopic.mastery_level) : 0;
    const sourcePatternType = safeString(metadata.source_pattern_type);

    if (!sourcePatternType || !metadata.baseline?.analysis_id || !metadata.baseline?.created_at) {
      const { error: insertError } = await supabaseClient.from('improvement_checks').insert({
        user_id: userId,
        session_id: latestSessionId,
        focus_topic_id: activeFocusTopic.id,
        status: 'skipped',
        check_type: 'focus_topic_improvement_v1',
        score: null,
        result_payload: toJson({
          decision: 'insufficient_data',
          label: decisionLabel('insufficient_data'),
          reason: 'baseline_missing',
        }),
      });
      if (insertError) {
        throw new Error(`Improvement-Check konnte nicht gespeichert werden: ${insertError.message}`);
      }

      const { error: focusUpdateError } = await supabaseClient
        .from('focus_topics')
        .update({
          mastery_level: currentMasteryLevel,
          metadata: toJson({
            ...withNormalizedStatusHistory(metadata),
            improvement_status: 'insufficient_data',
            last_improvement_check_at: new Date().toISOString(),
            global_mastery_level: currentMasteryLevel,
          }),
        })
        .eq('id', activeFocusTopic.id)
        .eq('user_id', userId);

      if (focusUpdateError) {
        throw new Error(`Fokus-Thema-Status konnte nicht aktualisiert werden: ${focusUpdateError.message}`);
      }

      return {
        skipped: true as const,
        reason: 'missing_baseline',
      };
    }

    const baselineCreatedAt = metadata.baseline.created_at;

    const { data: recentAnalyses, error: recentAnalysesError } = await supabaseClient
      .from('session_analyses')
      .select('*, conversation_sessions!inner(source, status, metadata)')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .neq('conversation_sessions.source', 'tutor')
      .gt('created_at', baselineCreatedAt)
      .order('created_at', { ascending: true })
      .returns<Array<SessionAnalysisRow & { conversation_sessions: Pick<ConversationSessionRow, 'source' | 'status' | 'metadata'> }>>();

    if (recentAnalysesError) {
      throw new Error(`Neuere Session-Analysen konnten nicht geladen werden: ${recentAnalysesError.message}`);
    }

    const normalizedRecentAnalyses = normalizeSessionAnalysisRows(
      (recentAnalyses ?? []).filter((analysis) => isAiEligibleSession(analysis.conversation_sessions)),
    );

    if (normalizedRecentAnalyses.length < minRecentSessions) {
      const { error: insertError } = await supabaseClient.from('improvement_checks').insert({
        user_id: userId,
        session_id: latestSessionId,
        focus_topic_id: activeFocusTopic.id,
        status: 'skipped',
        check_type: 'focus_topic_improvement_v1',
        score: null,
        result_payload: toJson({
          decision: 'insufficient_data',
          label: decisionLabel('insufficient_data'),
          reason: 'not_enough_recent_free_sessions',
          recent_session_count: normalizedRecentAnalyses.length,
          applied_thresholds: {
            min_recent_sessions: minRecentSessions,
            min_confidence: minConfidence,
            required_streak: requiredStreak,
          },
        }),
      });

      if (insertError) {
        throw new Error(`Improvement-Check konnte nicht gespeichert werden: ${insertError.message}`);
      }

      const { error: focusUpdateError } = await supabaseClient
        .from('focus_topics')
        .update({
          mastery_level: currentMasteryLevel,
          metadata: toJson({
            ...withNormalizedStatusHistory(metadata),
            improvement_status: 'insufficient_data',
            last_improvement_check_at: new Date().toISOString(),
            global_mastery_level: currentMasteryLevel,
          }),
        })
        .eq('id', activeFocusTopic.id)
        .eq('user_id', userId);

      if (focusUpdateError) {
        throw new Error(`Fokus-Thema-Status konnte nicht aktualisiert werden: ${focusUpdateError.message}`);
      }

      return { skipped: true as const, reason: 'insufficient_recent_sessions' };
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

      // Ein Fortschritt beim Fokus-Thema führt oft dazu, dass es in dieser Session gar
      // nicht mehr die dringendste Priorität ist (priority_intervention zeigt dann
      // bewusst auf ein anderes, jetzt gröberes Problem) -- genau das ist der Erfolg,
      // den dieser Check messen soll, kein Ausschlussgrund. Die Aufnahme in
      // filteredAnalyses hängt deshalb nur noch davon ab, ob die Session überhaupt ein
      // Signal zu diesem Fokus-Thema liefert (erkanntes Muster oder ein Kategorie-Score),
      // nicht davon, ob es zufällig auch die Top-Priorität dieser Session war (vorher
      // löschte ein verbessernder Lernender damit die eigenen Erfolgsbelege).
      if (matchingPatternEntries.length === 0 && filteredCategoryScore === null) {
        return [];
      }

      const priorityLabel = priorityMatchesFocusTopic ? safeString(priority.label) : safeString(matchingPatternEntries[0]?.label);
      const priorityReason = priorityMatchesFocusTopic ? safeString(priority.reason) : safeString(matchingPatternEntries[0]?.description);

      return [{
        ...analysis,
        category_scores_json: toJson({
          [sourcePatternType]: filteredCategoryScore,
        }),
        detected_patterns_json: matchingPatternEntries.map((entry) => toJson({
          pattern_key: currentFocusTopicKey,
          label: safeString(entry.label),
          description: safeString(entry.description),
          frequency_estimate: safeString(entry.frequency_estimate),
          communicative_impact: safeString(entry.communicative_impact),
          category: sourcePatternType,
        })),
        priority_intervention_json: toJson({
          pattern_key: currentFocusTopicKey,
          label: priorityLabel,
          reason: priorityReason,
          category: sourcePatternType,
        }),
      }];
    });

    if (filteredAnalyses.length < minRecentSessions) {
      const { error: insertError } = await supabaseClient.from('improvement_checks').insert({
        user_id: userId,
        session_id: latestSessionId,
        focus_topic_id: activeFocusTopic.id,
        status: 'skipped',
        check_type: 'focus_topic_improvement_v1',
        score: null,
        result_payload: toJson({
          decision: 'insufficient_data',
          label: decisionLabel('insufficient_data'),
          reason: 'not_enough_focus_topic_sessions_after_hard_filter',
          focus_topic_key: currentFocusTopicKey,
          recent_session_count_unfiltered: normalizedRecentAnalyses.length,
          recent_session_count_filtered: filteredAnalyses.length,
          applied_thresholds: {
            min_recent_sessions: minRecentSessions,
            min_confidence: minConfidence,
            required_streak: requiredStreak,
          },
        }),
      });

      if (insertError) {
        throw new Error(`Improvement-Check konnte nicht gespeichert werden: ${insertError.message}`);
      }

      const { error: focusUpdateError } = await supabaseClient
        .from('focus_topics')
        .update({
          mastery_level: currentMasteryLevel,
          metadata: toJson({
            ...withNormalizedStatusHistory(metadata),
            improvement_status: 'insufficient_data',
            last_improvement_check_at: new Date().toISOString(),
            global_mastery_level: currentMasteryLevel,
          }),
        })
        .eq('id', activeFocusTopic.id)
        .eq('user_id', userId);

      if (focusUpdateError) {
        throw new Error(`Fokus-Thema-Status konnte nicht aktualisiert werden: ${focusUpdateError.message}`);
      }

      return { skipped: true as const, reason: 'insufficient_focus_topic_sessions_after_hard_filter' };
    }

    const promptResult = await aiOrchestratorService.executePrompt<ImprovementCheckOutput>({
      promptKey: 'improvement_check',
      variables: {
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
      },
      logging: {
        userId,
        sessionId: latestSessionId,
      },
      executionContext: {
        traceId: params.traceId,
        workflowId: params.workflowId,
        pipelineStep: params.pipelineStep ?? 'improvement_check',
        sessionId: latestSessionId,
        featureName: 'improvement_check',
        attemptNumber: params.attemptNumber,
      },
    });

    if (!promptResult.ok || !promptResult.output) {
      throw new Error(promptResult.errorMessage ?? 'Prompt improvement_check fehlgeschlagen.');
    }

    const parsed = parseImprovementCheckPromptOutput(promptResult.output);

    const recentScores = filteredAnalyses
      .map((entry) => extractCategoryScore(entry.category_scores_json, sourcePatternType))
      .filter((value): value is number => typeof value === 'number');

    const averageRecentScore =
      recentScores.length > 0 ? recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length : null;

    const deltaToBaseline =
      typeof baselineScore === 'number' && typeof averageRecentScore === 'number' ? averageRecentScore - baselineScore : null;

    const { data: previousChecks, error: previousChecksError } = await supabaseClient
      .from('improvement_checks')
      .select('result_payload')
      .eq('user_id', userId)
      .eq('focus_topic_id', activeFocusTopic.id)
      .eq('check_type', 'focus_topic_improvement_v1')
      .order('created_at', { ascending: true })
      .returns<Array<{ result_payload: Json }>>();

    if (previousChecksError) {
      throw new Error(`Historie der Improvement-Checks konnte nicht geladen werden: ${previousChecksError.message}`);
    }

    const previousDecisions = (previousChecks ?? [])
      .map((check) => toImprovementDecision(parseJsonObject(check.result_payload).decision))
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
      worsenedDeltaThreshold: appSettings.worsenedDeltaThreshold,
    });

    const { error: insertError } = await supabaseClient.from('improvement_checks').insert({
      user_id: userId,
      session_id: latestSessionId,
      focus_topic_id: activeFocusTopic.id,
      status: mapDecisionToCheckStatus(normalizedDecision),
      check_type: 'focus_topic_improvement_v1',
      score: averageRecentScore,
      result_payload: toJson({
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
        evidence: {
          before: parsed.baseline_evidence,
          after: parsed.current_evidence,
          summary: parsed.focus_evidence,
        },
        recommendation: parsed.recommendation,
        source_pattern_type: sourcePatternType,
        scoring_schema: {
          baseline_and_recent_scores: '0-5',
          llm_confidence: '0.0-1.0',
        },
        baseline_score: baselineScore,
        average_recent_score: averageRecentScore,
        delta_to_baseline: deltaToBaseline,
        recent_session_count: filteredAnalyses.length,
        recent_session_count_unfiltered: normalizedRecentAnalyses.length,
        applied_thresholds: {
          min_recent_sessions: minRecentSessions,
          min_confidence: minConfidence,
          required_streak: requiredStreak,
        },
      }),
    });

    if (insertError) {
      throw new Error(`Improvement-Check konnte nicht gespeichert werden: ${insertError.message}`);
    }

    const transitionEvent =
      normalizedDecision === 'improved'
        ? 'improvement_improved'
        : normalizedDecision === 'worsened'
          ? 'improvement_worsened'
          : 'improvement_unchanged';
    const transition = applyFocusEvent(activeFocusTopic.status, transitionEvent, {
      metadata,
      reason: `improvement_check:${normalizedDecision}`,
      source: 'improvement_check.service',
    });

    const { error: focusUpdateError } = await supabaseClient
      .from('focus_topics')
      .update({
        status: transition.nextStatus,
        mastery_level: nextMasteryLevel,
        metadata: toJson({
          ...transition.metadata,
          improvement_status: normalizedDecision,
          last_improvement_check_at: new Date().toISOString(),
          global_mastery_level: nextMasteryLevel,
        }),
      })
      .eq('id', activeFocusTopic.id)
      .eq('user_id', userId);

    if (focusUpdateError) {
      throw new Error(`Fokus-Thema-Status konnte nicht aktualisiert werden: ${focusUpdateError.message}`);
    }

    return {
      skipped: false as const,
      focusTopicId: activeFocusTopic.id,
      decision: normalizedDecision,
      label: decisionLabel(normalizedDecision),
    };
  },
};
