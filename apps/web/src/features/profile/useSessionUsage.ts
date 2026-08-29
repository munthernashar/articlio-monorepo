import { useQuery } from '@tanstack/react-query';
import { getBillingPeriodUsageSummary, getTodaysUsageSummary } from '@/services/supabase/session.service';

/** Nutzungsdaten für die Profil-Anzeige: heutige Sekunden (echtes Tageslimit)
 *  plus Sekunden im aktuellen Abrechnungszeitraum (rein informativ). */
export function useSessionUsage(userId: string | undefined) {
  return useQuery({
    queryKey: ['session-usage', userId],
    queryFn: async () => {
      const [today, period] = await Promise.all([
        getTodaysUsageSummary(userId!),
        getBillingPeriodUsageSummary(userId!),
      ]);

      return {
        secondsToday: today.secondsToday,
        sessionsToday: today.sessionsToday,
        secondsThisPeriod: period.secondsUsed,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      };
    },
    enabled: Boolean(userId),
  });
}
