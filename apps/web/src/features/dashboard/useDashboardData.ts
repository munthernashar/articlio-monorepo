import { useQuery } from '@tanstack/react-query';
import { dashboardDataService, type DashboardAiSummaryInput, type DashboardData } from '@/services/supabase/dashboard-data.service';

export function useDashboardData(userId: string | undefined) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', userId],
    queryFn: () => dashboardDataService.loadDashboardData(userId!),
    enabled: Boolean(userId),
  });
}

// Bug-Fix (27.08.2026): dashboard_summary (KI-Zusammenfassung samt Trainingsempfehlung) dauert
// real 4-10s -- lief bislang synchron innerhalb von loadDashboardData() mit einem viel zu
// knappen 1200ms-Timeout, der praktisch jede erfolgreiche Antwort verwarf. Läuft jetzt als
// eigene, spätere Query: Dashboard/Coach rendern sofort mit dashboardData (schnell), diese Query
// löst dann im Hintergrund nach, sobald aiSummaryInput aus dashboardData vorliegt. Aufrufer
// zeigen währenddessen ein Skeleton statt des vorher fälschlich sofort "fertigen" Leerzustands.
export function useDashboardAiSummary(aiSummaryInput: DashboardAiSummaryInput | undefined) {
  return useQuery({
    queryKey: ['dashboard-ai-summary', aiSummaryInput],
    queryFn: () => dashboardDataService.loadAiSummary(aiSummaryInput!),
    enabled: Boolean(aiSummaryInput),
  });
}
