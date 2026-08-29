import { describe, expect, it } from 'vitest';

import { deriveDashboardInterpretation } from '@/features/dashboard/UserDashboard';
import type { DashboardData } from '@/services/supabase/dashboard-data.service';

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

describe('deriveDashboardInterpretation', () => {
  it('nimmt primaryImprovementArea ausschließlich aus AI', () => {
    const data = createDashboardData();
    data.aiSummary = {
      summary: 's',
      next_action: 'n',
      confidence_note: 'c',
      primaryImprovementArea: { skill: 'grammar', title: 'Grammatik', reason: 'AI reason', confidence: 'high' },
      nextActionDetail: null,
      focusTopic: null,
    };

    const result = deriveDashboardInterpretation(data);
    expect(result.primaryImprovementArea?.title).toBe('Grammatik');
  });

  it('setzt keine lokale Empfehlung wenn AI-Felder fehlen', () => {
    const result = deriveDashboardInterpretation(createDashboardData());
    expect(result.nextRecommendation).toBeNull();
  });
});
