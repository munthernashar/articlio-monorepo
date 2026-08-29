import * as Sentry from '@sentry/react';
import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';
import { analyticsService, type CostAggregate } from '@/services/supabase/analytics.service';
import { sessionService } from '@/services/supabase/session.service';
import { supabaseClient } from '@/services/supabase/client';
import { multiSessionPatternService } from '@/services/supabase/multi-session-pattern.service';
import { profileService } from '@/services/supabase/profile.service';
import { buildLearningGoalContextText, learningGoalCatalogService } from '@/services/supabase/learning-goal-catalog.service';
import { dashboardSubscriptionService, type DashboardSubscriptionUsage } from '@/services/supabase/dashboard-subscription.service';
import { normalizeSessionAnalysisRows } from '@/services/supabase/session-analysis-compat';
import { isAiEligibleSession } from '@/services/supabase/session-ai-eligibility';
import { getCurrentDayBoundsUtcForTimezone, getDayKeyInTimezone } from '@/lib/timezone';
import { TimeoutError, withTimeout } from '@/lib/with-timeout';
import type { ConversationSessionRow, FocusTopicRow, ImprovementCheckRow, Json, SessionAnalysisRow, TutorInteractionRow } from '@/types/database';
import type { ConversationSession } from '@/types/domain';

type DashboardSummaryOutput = {
  recommendedTrainingId?: string | null;
  recommendedTrainingIds?: string[] | null;
  summary: string;
  next_action: string;
  confidence_note: string;
  primaryImprovementArea?: {
    skill: string;
    title: string;
    reason: string;
    confidence: 'low' | 'medium' | 'high';
  } | null;
  nextActionDetail?: {
    title: string;
    description: string;
    targetSkill: string;
    recommendedTrainingId: string | null;
    reason: string;
  } | null;
  focusTopic?: {
    title: string;
    reason: string;
  } | null;
};

export type FocusTopicImprovementMetrics = {
  baseline: number | null;
  average: number | null;
  delta: number | null;
  hasInsufficientData: boolean;
  evidenceQuality?: 'low' | 'medium' | 'high' | null;
  focusTopicMatch?: boolean | null;
};

export type TutorDialogueCompletionRateWindow = {
  startedDialogues: number;
  completedDialogues: number;
  completionRate: number;
};

// Alles, was loadAiSummary() braucht, um die dashboard_summary-Anfrage zusammenzustellen --
// aus loadDashboardData() herausgelöst, damit der langsame KI-Aufruf (real 4-10s, siehe
// loadAiSummary()) als eigene, spätere Abfrage laufen kann, statt das schnelle Laden von
// Dashboard/Coach zu blockieren (Munther-Feedback 27.08.2026).
export type DashboardAiSummaryInput = {
  userId: string;
  sessionCount: number;
  analysisCount: number;
  focusTopicTitle: string | null;
  focusTopicMasteryLevel: number | null;
  latestImprovementResultPayload: Json | null;
  latestAnalysisSummary: string | null;
  latestPriorityIntervention: Json | null;
  learningGoalContext: string;
};

export type DashboardData = {
  sessions: ConversationSession[];
  userTimezone: string;
  dailyUsage: DailyUsageKpi;
  analyses: SessionAnalysisRow[];
  latestImprovement: ImprovementCheckRow | null;
  latestImprovementMetrics: FocusTopicImprovementMetrics | null;
  relapseRate: RelapseRateMetrics;
  sessionCompletionRate: {
    last7Days: SessionCompletionRateWindow;
    last30Days: SessionCompletionRateWindow;
  };
  latestTutorInteraction: TutorInteractionRow | null;
  tutorDialogueCompletionRate: {
    last7Days: TutorDialogueCompletionRateWindow;
    last30Days: TutorDialogueCompletionRateWindow;
  };
  focusTitle: string | null;
  focusMasteryLevel: number | null;
  focusStatus: FocusTopicRow['status'] | null;
  // Bleiben null/leer, bis useDashboardAiSummary() (eigene, spätere Query) das Ergebnis von
  // loadAiSummary() liefert -- siehe DashboardAiSummaryInput oben.
  aiSummary: DashboardSummaryOutput | null;
  aiTrainingRecommendations: AiTrainingRecommendations;
  aiSummaryInput: DashboardAiSummaryInput;
  costKpis: {
    today: CostAggregate;
    last30Days: CostAggregate;
  };
  subscriptionUsage: DashboardSubscriptionUsage | null;
};


export type AiTrainingRecommendations = {
  primaryTrainingId: string | null;
  additionalTrainingIds: string[];
};

function normalizeTrainingId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractAiTrainingRecommendations(summary: DashboardSummaryOutput | null): AiTrainingRecommendations {
  if (!summary) {
    return { primaryTrainingId: null, additionalTrainingIds: [] };
  }

  const primaryTrainingId =
    normalizeTrainingId(summary.nextActionDetail?.recommendedTrainingId) ??
    normalizeTrainingId(summary.recommendedTrainingId);

  const candidateIds = [
    ...(Array.isArray(summary.recommendedTrainingIds) ? summary.recommendedTrainingIds : []),
  ]
    .map((value) => normalizeTrainingId(value))
    .filter((value): value is string => Boolean(value));

  const uniqueAdditionalTrainingIds = Array.from(new Set(candidateIds.filter((id) => id !== primaryTrainingId)));

  return {
    primaryTrainingId,
    additionalTrainingIds: uniqueAdditionalTrainingIds,
  };
}

export type DailyUsageKpi = {
  definition: string;
  sessionsToday: number;
  activeDaysLast7: number;
  sessionsLast7: number;
  averageSessionsPerDayLast7: number;
  averageSessionsPerActiveDayLast7: number;
  timezone: string;
  usedSnapshotMaterialization: boolean;
};

type DailySessionCreatedAtRow = {
  created_at: string;
};

type SessionCompletionRateWindow = {
  startedSessions: number;
  completedSessions: number;
  completionRate: number;
};

type RelapseSource = 'focus_topic_status_transition' | 'improvement_check_worsened_after_success';

export type RelapseRateMetrics = {
  relapseEvents: number;
  observedCycles: number;
  relapseRate: number;
  definition: string;
  sources: RelapseSource[];
};

type FocusTopicRelapseHistoryRow = Pick<FocusTopicRow, 'id' | 'status' | 'metadata' | 'created_at' | 'updated_at'>;
type ImprovementCheckRelapseHistoryRow = Pick<ImprovementCheckRow, 'created_at' | 'status' | 'result_payload'>;

const DAILY_USAGE_DEFINITION =
  'Zeitzonenbasiert: Sessions heute (00:00–23:59 in deiner Zeitzone), aktive Tage in den letzten 7 Tagen und Sessions/Tag als 7-Tage-Mittel.';
const RELAPSE_RATE_DEFINITION =
  'Rückfallquote = Rückfallereignisse / beobachtete Zyklen. Ereignis: (a) Fokus-Thema wechselt von stabil zu rueckfall_erkannt oder (b) Improvement-Check "worsened" nach mindestens einem vorherigen "improved".';

function buildDailyUsageKpiFromMap(
  countsByDay: Map<string, number>,
  todayKey: string,
  timezone: string,
  usedSnapshotMaterialization: boolean,
): DailyUsageKpi {
  const sessionsLast7 = Array.from(countsByDay.values()).reduce((sum, value) => sum + value, 0);
  const activeDaysLast7 = Array.from(countsByDay.values()).filter((value) => value > 0).length;
  const sessionsToday = countsByDay.get(todayKey) ?? 0;

  return {
    definition: DAILY_USAGE_DEFINITION,
    sessionsToday,
    activeDaysLast7,
    sessionsLast7,
    averageSessionsPerDayLast7: Number((sessionsLast7 / 7).toFixed(2)),
    averageSessionsPerActiveDayLast7: activeDaysLast7 > 0 ? Number((sessionsLast7 / activeDaysLast7).toFixed(2)) : 0,
    timezone,
    usedSnapshotMaterialization,
  };
}

function validateTimezoneDayBoundaryMapping(timezone: string) {
  const { dayStartUtc } = getCurrentDayBoundsUtcForTimezone(timezone, new Date('2026-04-23T12:00:00.000Z'));
  const beforeBoundary = new Date(dayStartUtc.getTime() - 1);
  const atBoundary = new Date(dayStartUtc.getTime());

  if (getDayKeyInTimezone(beforeBoundary, timezone) === getDayKeyInTimezone(atBoundary, timezone)) {
    throw new Error('Zeitzonen-Validierung fehlgeschlagen: Tagesgrenze wurde nicht korrekt aufgelöst.');
  }
}

async function loadDailyUsageKpi(userId: string, timezone: string): Promise<DailyUsageKpi> {
  validateTimezoneDayBoundaryMapping(timezone);
  const { dayStartUtc, nextDayStartUtc } = getCurrentDayBoundsUtcForTimezone(timezone);
  const last7Start = new Date(dayStartUtc);
  last7Start.setUTCDate(last7Start.getUTCDate() - 6);
  const todayKey = getDayKeyInTimezone(dayStartUtc, timezone);
  const countsByDay = new Map<string, number>();

  const sessionsRes = await supabaseClient
    .from('conversation_sessions')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', last7Start.toISOString())
    .lt('created_at', nextDayStartUtc.toISOString())
    .returns<DailySessionCreatedAtRow[]>();

  if (sessionsRes.error) {
    throw new Error(`Daily-Usage-KPI konnte nicht geladen werden: ${sessionsRes.error.message}`);
  }

  for (const row of sessionsRes.data ?? []) {
    const dayKey = getDayKeyInTimezone(row.created_at, timezone);
    countsByDay.set(dayKey, (countsByDay.get(dayKey) ?? 0) + 1);
  }

  // Snapshot-Materialisierung wäre möglich, sobald die Tabelle im generierten DB-Typ enthalten ist.
  return buildDailyUsageKpiFromMap(countsByDay, todayKey, timezone, false);
}

function asRecord(value: ImprovementCheckRow['result_payload']): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asJsonRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractImprovementMetrics(row: ImprovementCheckRow | null): FocusTopicImprovementMetrics | null {
  if (!row) return null;
  const payload = asRecord(row.result_payload);
  const status = payload.status;
  const label = payload.label;

  return {
    baseline: asNullableNumber(payload.baseline),
    average: asNullableNumber(payload.average),
    delta: asNullableNumber(payload.delta),
    hasInsufficientData:
      status === 'insufficient_data' || label === 'insufficient_data' || row.status === 'skipped',
    evidenceQuality:
      payload.evidence_quality === 'low' || payload.evidence_quality === 'medium' || payload.evidence_quality === 'high'
        ? payload.evidence_quality
        : null,
    focusTopicMatch: typeof payload.focus_topic_match === 'boolean' ? payload.focus_topic_match : null,
  };
}

function createCompletionWindow(params: { startedSessions: number; completedSessions: number }): SessionCompletionRateWindow {
  const { startedSessions, completedSessions } = params;

  return {
    startedSessions,
    completedSessions,
    completionRate: startedSessions > 0 ? completedSessions / startedSessions : 0,
  };
}

function parseImprovementDecision(row: Pick<ImprovementCheckRow, 'result_payload' | 'status'>): string | null {
  const payload = asRecord(row.result_payload);
  const decision = payload.decision;
  if (typeof decision === 'string') return decision;
  return row.status === 'failed' ? 'worsened' : null;
}

function calculateRelapseRate(params: {
  focusTopicRows: FocusTopicRelapseHistoryRow[];
  improvementRows: ImprovementCheckRelapseHistoryRow[];
}): RelapseRateMetrics {
  const { focusTopicRows, improvementRows } = params;
  let relapseEvents = 0;
  let observedCycles = 0;
  const sources = new Set<RelapseSource>();

  for (const topic of focusTopicRows) {
    observedCycles += 1;
    const history = asJsonRecord(topic.metadata).status_history;
    const statusHistory = Array.isArray(history) ? history : [];
    const sawStable = statusHistory.some((entry) => {
      const item = asJsonRecord(entry as Json);
      const toStatus = item.to ?? item.status;
      return toStatus === 'stabil';
    });
    const isRelapseNow = topic.status === 'rueckfall_erkannt';
    if (sawStable && isRelapseNow) {
      relapseEvents += 1;
      sources.add('focus_topic_status_transition');
    }
  }

  let hasPriorSuccess = false;
  for (const check of improvementRows) {
    const decision = parseImprovementDecision(check);
    if (!decision || decision === 'insufficient_data') continue;

    observedCycles += 1;
    if (decision === 'worsened' && hasPriorSuccess) {
      relapseEvents += 1;
      sources.add('improvement_check_worsened_after_success');
    }
    if (decision === 'improved') hasPriorSuccess = true;
  }

  return {
    relapseEvents,
    observedCycles,
    relapseRate: observedCycles > 0 ? relapseEvents / observedCycles : 0,
    definition: RELAPSE_RATE_DEFINITION,
    sources: Array.from(sources.values()),
  };
}


function createTutorDialogueCompletionWindow(params: {
  startedDialogues: number;
  completedDialogues: number;
}): TutorDialogueCompletionRateWindow {
  const { startedDialogues, completedDialogues } = params;

  return {
    startedDialogues,
    completedDialogues,
    completionRate: startedDialogues > 0 ? completedDialogues / startedDialogues : 0,
  };
}

export const dashboardDataService = {
  async loadDashboardData(userId: string): Promise<DashboardData> {
    const start30Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userTimezonePromise = profileService.getUserTimezone(userId);

    const [
      userTimezone,
      sessions,
      analysesRes,
      improvementRes,
      tutorRes,
      focusTopic,
      recentSessionsRes,
      focusTopicsRelapseRes,
      improvementChecksRelapseRes,
      tutorSessionsRes,
      tutorCompletionEventsRes,
      costSummary,
      subscriptionUsage,
      onboardingProfile,
      learningGoals,
    ] = await Promise.all([
      userTimezonePromise,
      sessionService.listConversationSessions(userId, { limit: 14 }),
      supabaseClient
        .from('session_analyses')
        .select('*, conversation_sessions!inner(status, metadata)')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(20)
        .returns<Array<SessionAnalysisRow & { conversation_sessions: Pick<ConversationSessionRow, 'status' | 'metadata'> }>>(),
      supabaseClient
        .from('improvement_checks')
        .select('*')
        .eq('user_id', userId)
        .eq('check_type', 'focus_topic_improvement_v1')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<ImprovementCheckRow>(),
      supabaseClient
        .from('tutor_interactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<TutorInteractionRow>(),
      multiSessionPatternService.getActiveFocusTopic(userId),
      supabaseClient
        .from('conversation_sessions')
        .select('started_at, ended_at, created_at, status')
        .eq('user_id', userId)
        .gte('created_at', start30Date.toISOString())
        .returns<Pick<ConversationSessionRow, 'started_at' | 'ended_at' | 'created_at' | 'status'>[]>(),
      supabaseClient
        .from('focus_topics')
        .select('id, status, metadata, created_at, updated_at')
        .eq('user_id', userId)
        .returns<FocusTopicRelapseHistoryRow[]>(),
      supabaseClient
        .from('improvement_checks')
        .select('created_at, status, result_payload')
        .eq('user_id', userId)
        .eq('check_type', 'focus_topic_improvement_v1')
        .order('created_at', { ascending: true })
        .returns<ImprovementCheckRelapseHistoryRow[]>(),
      supabaseClient
        .from('conversation_sessions')
        .select('id, started_at, created_at')
        .eq('user_id', userId)
        .eq('source', 'tutor')
        .gte('created_at', start30Date.toISOString())
        .returns<Pick<ConversationSessionRow, 'id' | 'started_at' | 'created_at'>[]>(),
      supabaseClient
        .from('tutor_interactions')
        .select('session_id, created_at, interaction_payload')
        .eq('user_id', userId)
        .gte('created_at', start30Date.toISOString())
        .contains('interaction_payload', { event: 'dialogue_completed' })
        .returns<Pick<TutorInteractionRow, 'session_id' | 'created_at' | 'interaction_payload'>[]>(),
      analyticsService.getCostSummary({ userId }),
      dashboardSubscriptionService.loadSubscriptionUsage().catch((error: unknown) => {
        Sentry.captureException(error);
        return null;
      }),
      // Lernpfade Phase G: dashboard_summary bekommt denselben additiven learning_goal_context
      // wie daily_prompt_generator/session_analysis (Phase C) -- "kein Insellösung" (Munther).
      profileService.getOnboardingProfile(userId).catch(() => null),
      learningGoalCatalogService.listActiveGoals().catch(() => []),
    ]);

    const learningGoalContext = buildLearningGoalContextText(
      learningGoals.find((goal) => goal.goalKey === onboardingProfile?.learning_goal_key) ?? null,
      onboardingProfile?.german_level ?? null,
    );

    const dailyUsage = await loadDailyUsageKpi(userId, userTimezone);

    if (analysesRes.error) throw new Error(analysesRes.error.message);
    if (improvementRes.error) throw new Error(improvementRes.error.message);
    if (tutorRes.error) throw new Error(tutorRes.error.message);
    if (recentSessionsRes.error) throw new Error(recentSessionsRes.error.message);
    if (focusTopicsRelapseRes.error) throw new Error(focusTopicsRelapseRes.error.message);
    if (improvementChecksRelapseRes.error) throw new Error(improvementChecksRelapseRes.error.message);
    if (tutorSessionsRes.error) throw new Error(tutorSessionsRes.error.message);
    if (tutorCompletionEventsRes.error) throw new Error(tutorCompletionEventsRes.error.message);

    const analyses = normalizeSessionAnalysisRows((analysesRes.data ?? []).filter((entry) => isAiEligibleSession(entry.conversation_sessions)));
    const recentSessions = recentSessionsRes.data ?? [];
    const tutorSessions = tutorSessionsRes.data ?? [];
    const tutorCompletionEvents = tutorCompletionEventsRes.data ?? [];
    const focusTitle = focusTopic?.title ?? null;
    const focusMasteryLevel = typeof focusTopic?.masteryLevel === 'number' ? focusTopic.masteryLevel : null;
    const focusStatus = focusTopic?.status ?? null;
    const relapseRate = calculateRelapseRate({
      focusTopicRows: focusTopicsRelapseRes.data ?? [],
      improvementRows: improvementChecksRelapseRes.data ?? [],
    });

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const sessionCompletionRate = recentSessions.reduce<{
      last7Days: { startedSessions: number; completedSessions: number };
      last30Days: { startedSessions: number; completedSessions: number };
    }>(
      (acc, session) => {
        const startedTimestamp = Date.parse(session.started_at ?? session.created_at);
        const completedTimestamp =
          session.status === 'completed' || session.status === 'completed_capped'
            ? Date.parse(session.ended_at ?? session.created_at)
            : NaN;

        if (!Number.isNaN(startedTimestamp)) {
          if (now - startedTimestamp <= sevenDaysMs) acc.last7Days.startedSessions += 1;
          if (now - startedTimestamp <= thirtyDaysMs) acc.last30Days.startedSessions += 1;
        }

        if (!Number.isNaN(completedTimestamp)) {
          if (now - completedTimestamp <= sevenDaysMs) acc.last7Days.completedSessions += 1;
          if (now - completedTimestamp <= thirtyDaysMs) acc.last30Days.completedSessions += 1;
        }

        return acc;
      },
      {
        last7Days: { startedSessions: 0, completedSessions: 0 },
        last30Days: { startedSessions: 0, completedSessions: 0 },
      },
    );


    const tutorSessionIds = new Set(tutorSessions.map((session) => session.id));
    const completedTutorSessionByWindow = {
      last7Days: new Set<string>(),
      last30Days: new Set<string>(),
    };

    for (const completionEvent of tutorCompletionEvents) {
      if (!tutorSessionIds.has(completionEvent.session_id)) {
        continue;
      }
      const completedTimestamp = Date.parse(completionEvent.created_at);
      if (Number.isNaN(completedTimestamp)) {
        continue;
      }

      if (now - completedTimestamp <= sevenDaysMs) completedTutorSessionByWindow.last7Days.add(completionEvent.session_id);
      if (now - completedTimestamp <= thirtyDaysMs) completedTutorSessionByWindow.last30Days.add(completionEvent.session_id);
    }

    const tutorDialogueCompletionRate = tutorSessions.reduce<{
      last7Days: { startedDialogues: number; completedDialogues: number };
      last30Days: { startedDialogues: number; completedDialogues: number };
    }>(
      (acc, session) => {
        const startedTimestamp = Date.parse(session.started_at ?? session.created_at);
        if (Number.isNaN(startedTimestamp)) {
          return acc;
        }

        if (now - startedTimestamp <= sevenDaysMs) acc.last7Days.startedDialogues += 1;
        if (now - startedTimestamp <= thirtyDaysMs) acc.last30Days.startedDialogues += 1;

        return acc;
      },
      {
        last7Days: { startedDialogues: 0, completedDialogues: completedTutorSessionByWindow.last7Days.size },
        last30Days: { startedDialogues: 0, completedDialogues: completedTutorSessionByWindow.last30Days.size },
      },
    );

    // Bug-Fix (27.08.2026, Munther-Feedback): dashboard_summary dauert real 4-10s (KI-Aufruf),
    // wurde hier aber bislang mit 1200ms-Timeout synchron abgewartet -- griff dadurch praktisch
    // immer (siehe prompt_execution_logs: alle 10 letzten Läufe 3,7-9,8s, alle "success", aber
    // zu spät für den 1200ms-Timeout), die Coach-/Dashboard-Seite zeigte fast immer den leeren
    // "wird vorbereitet"-Zustand. Der Aufruf läuft jetzt nicht mehr hier, sondern separat über
    // loadAiSummary()/useDashboardAiSummary() -- dieser Rückgabewert (aiSummaryInput) liefert nur
    // die dafür nötigen Zutaten, ohne auf die KI-Antwort zu warten.
    const aiSummaryInput: DashboardAiSummaryInput = {
      userId,
      sessionCount: sessions.length,
      analysisCount: analyses.length,
      focusTopicTitle: focusTitle,
      focusTopicMasteryLevel: focusMasteryLevel,
      latestImprovementResultPayload: improvementRes.data?.result_payload ?? null,
      latestAnalysisSummary: analyses[0]?.session_summary ?? null,
      latestPriorityIntervention: analyses[0]?.priority_intervention_json ?? null,
      learningGoalContext,
    };

    return {
      sessions,
      userTimezone,
      dailyUsage,
      analyses,
      latestImprovement: improvementRes.data,
      latestImprovementMetrics: extractImprovementMetrics(improvementRes.data),
      relapseRate,
      sessionCompletionRate: {
        last7Days: createCompletionWindow(sessionCompletionRate.last7Days),
        last30Days: createCompletionWindow(sessionCompletionRate.last30Days),
      },
      latestTutorInteraction: tutorRes.data,
      tutorDialogueCompletionRate: {
        last7Days: createTutorDialogueCompletionWindow(tutorDialogueCompletionRate.last7Days),
        last30Days: createTutorDialogueCompletionWindow(tutorDialogueCompletionRate.last30Days),
      },
      focusTitle,
      focusMasteryLevel,
      focusStatus,
      aiSummary: null,
      aiTrainingRecommendations: { primaryTrainingId: null, additionalTrainingIds: [] },
      aiSummaryInput,
      costKpis: {
        today: costSummary.today,
        last30Days: costSummary.last30Days,
      },
      subscriptionUsage,
    };
  },

  // Eigene, langsamere Abfrage (siehe DashboardAiSummaryInput/Kommentar oben in
  // loadDashboardData): läuft NACH dem schnellen Kern-Laden, blockiert es nicht mehr. Realer
  // Timeout großzügig über der beobachteten Latenz (3,7-9,8s in den letzten 10 Läufen) statt der
  // vorherigen 1200ms, die praktisch jede erfolgreiche Antwort verworfen haben.
  async loadAiSummary(input: DashboardAiSummaryInput): Promise<{
    aiSummary: DashboardSummaryOutput | null;
    aiTrainingRecommendations: AiTrainingRecommendations;
  }> {
    const summaryResult = await withTimeout(
      aiOrchestratorService.executePrompt<DashboardSummaryOutput>({
        promptKey: 'dashboard_summary',
        variables: {
          dashboard_payload_json: JSON.stringify({
            session_count: input.sessionCount,
            analysis_count: input.analysisCount,
            focus_topic_title: input.focusTopicTitle,
            focus_topic_mastery_level: input.focusTopicMasteryLevel,
            latest_improvement: input.latestImprovementResultPayload,
            latest_analysis_summary: input.latestAnalysisSummary,
            // Munthers Feedback 21.08.2026: session_analysis entscheidet pro Session
            // bereits, was die wichtigste nächste Handlung ist (priority_intervention).
            // dashboard_summary bekam davon bislang nur den Fließtext-Zusammenfassung,
            // nicht diese strukturierte Entscheidung selbst -- und hat unabhängig eine
            // eigene primaryImprovementArea/nextActionDetail geraten, die auf der
            // Session-Detailseite dadurch etwas anderes zeigte als auf dem Dashboard.
            // Jetzt bekommt sie die tatsächliche Entscheidung, um sie zu übernehmen
            // statt neu zu raten (siehe developer_prompt der aktiven Prompt-Version).
            latest_priority_intervention: input.latestPriorityIntervention,
          }),
          learning_goal_context: input.learningGoalContext,
        },
        logging: {
          userId: input.userId,
        },
        executionContext: {
          featureName: 'dashboard_summary',
          pipelineStep: 'dashboard_summary',
        },
      }),
      15000,
      'Dashboard-Zusammenfassung hat das Zeitlimit überschritten.',
    ).catch((error: unknown) => {
      if (!(error instanceof TimeoutError)) {
        Sentry.captureException(error);
      }
      return null;
    });

    const aiSummary = summaryResult?.ok ? summaryResult.output : null;
    return { aiSummary, aiTrainingRecommendations: extractAiTrainingRecommendations(aiSummary) };
  },
};
