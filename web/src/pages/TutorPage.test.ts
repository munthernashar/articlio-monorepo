import { describe, expect, it } from 'vitest';

import { deriveTutorPageViewModel } from '@/pages/TutorPage';
import type { DashboardData } from '@/services/supabase/dashboard-data.service';
import type { SessionAnalysisRow } from '@/types/database';

function createDashboardData(): DashboardData {
  return {
    sessions: [],
    userTimezone: 'UTC',
    dailyUsage: {
      definition: 'd',
      sessionsToday: 0,
      activeDaysLast7: 0,
      sessionsLast7: 0,
      averageSessionsPerDayLast7: 0,
      averageSessionsPerActiveDayLast7: 0,
      timezone: 'UTC',
      usedSnapshotMaterialization: false,
    },
    analyses: [],
    latestImprovement: null,
    latestImprovementMetrics: null,
    relapseRate: { relapseEvents: 0, observedCycles: 0, relapseRate: 0, definition: 'd', sources: [] },
    sessionCompletionRate: {
      last7Days: { startedSessions: 0, completedSessions: 0, completionRate: 0 },
      last30Days: { startedSessions: 0, completedSessions: 0, completionRate: 0 },
    },
    latestTutorInteraction: null,
    tutorDialogueCompletionRate: {
      last7Days: { startedDialogues: 0, completedDialogues: 0, completionRate: 0 },
      last30Days: { startedDialogues: 0, completedDialogues: 0, completionRate: 0 },
    },
    focusTitle: null,
    focusMasteryLevel: null,
    focusStatus: null,
    aiSummary: null,
    aiTrainingRecommendations: {
      primaryTrainingId: null,
      additionalTrainingIds: [],
    },
    aiSummaryInput: {
      userId: 'user-1',
      sessionCount: 0,
      analysisCount: 0,
      focusTopicTitle: null,
      focusTopicMasteryLevel: null,
      latestImprovementResultPayload: null,
      latestAnalysisSummary: null,
      latestPriorityIntervention: null,
      learningGoalContext: '',
    },
    costKpis: {
      today: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      last30Days: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    },
    subscriptionUsage: null,
  };
}

function createAnalysisRow(id: string): SessionAnalysisRow {
  return {
    id,
    user_id: 'user-1',
    session_id: 'session-1',
    transcript_id: null,
    status: 'completed',
    analysis_version: null,
    score_overall: null,
    summary: {},
    metrics: {},
    recommendations: {},
    category_scores_json: {},
    detected_patterns_json: {},
    priority_intervention_json: {},
    session_summary: null,
    last_error: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('TutorPage view model', () => {
  it('Empty-State: keine Empfehlung und CTA möglich', () => {
    const result = deriveTutorPageViewModel(createDashboardData());

    expect(result.tutorDataState).toBe('empty');
    expect(result.shouldRenderRecommendedCard).toBe(false);
    expect(result.hasAiSummaryPayload).toBe(false);
    expect(result.isAiTechnicalUnavailable).toBe(false);
  });

  it('Nach erster Analyse ohne nextActionDetail bleibt der State konsistent auf ready', () => {
    const data = createDashboardData();
    data.analyses = [createAnalysisRow('a1')];
    data.aiSummary = {
      summary: 's',
      next_action: 'n',
      confidence_note: 'c',
      primaryImprovementArea: { skill: 'grammar', title: 'Artikel', reason: 'AI', confidence: 'high' },
      nextActionDetail: null,
      focusTopic: null,
    };

    const result = deriveTutorPageViewModel(data);

    expect(result.tutorDataState).toBe('ready');
    expect(result.shouldRenderRecommendedCard).toBe(false);
    expect(result.hasAiSummaryPayload).toBe(true);
  });

  it('Ready-State: Empfehlung kommt direkt aus nextActionDetail, ohne lokalen Katalog-Match', () => {
    const data = createDashboardData();
    data.analyses = [createAnalysisRow('a1')];
    data.aiSummary = {
      summary: 's',
      next_action: 'n',
      confidence_note: 'c',
      primaryImprovementArea: { skill: 'grammar', title: 'Artikel', reason: 'AI', confidence: 'high' },
      nextActionDetail: {
        title: 'Trainiere Fokus',
        reason: 'AI empfiehlt das',
        description: 'Nächster Schritt',
        recommendedTrainingId: 'grammar-repair',
        targetSkill: 'Grammatik',
      },
      focusTopic: null,
    };

    const result = deriveTutorPageViewModel(data);

    expect(result.tutorDataState).toBe('ready');
    expect(result.shouldRenderRecommendedCard).toBe(true);
    expect(result.recommendedTraining?.title).toBe('Trainiere Fokus');
    expect(result.recommendedTraining?.reason).toBe('AI empfiehlt das');
  });

  it('Fehler-State: technischer AI-Hinweis, wenn nur eine Verbesserungsfläche ohne konkrete Empfehlung vorliegt', () => {
    const data = createDashboardData();
    data.analyses = [createAnalysisRow('a1')];
    data.aiSummary = {
      summary: 's',
      next_action: 'n',
      confidence_note: 'c',
      primaryImprovementArea: { skill: 'grammar', title: 'Artikel', reason: 'AI', confidence: 'high' },
      nextActionDetail: null,
      focusTopic: null,
    };

    const result = deriveTutorPageViewModel(data);

    expect(result.tutorDataState).toBe('ready');
    expect(result.hasAiSummaryPayload).toBe(true);
    expect(result.isAiTechnicalUnavailable).toBe(true);
    expect(result.shouldRenderRecommendedCard).toBe(false);
  });

  it('Regression: keine lokalen Coach-/AI-Ersatztexte als Fallback', () => {
    const data = createDashboardData();
    data.analyses = [createAnalysisRow('a1')];

    const result = deriveTutorPageViewModel(data);

    expect(result.recommendedTraining).toBeNull();
    expect(result.hasAiSummaryPayload).toBe(false);
    expect(result.isAiTechnicalUnavailable).toBe(false);
  });
});
