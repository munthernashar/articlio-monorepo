import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { paths } from '@/app/routes/paths';
import { AdminToolsPanel } from '@/features/admin/AdminToolsPanel';
import { Badge } from '@/components/ui/Badge';
import { funnelAnalyticsService, type FunnelDailySummaryRow } from '@/services/supabase/funnel-analytics.service';
import { analyticsService, type CostAnalyticsSummary } from '@/services/supabase/analytics.service';

function formatEurFromCents(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function AdminDashboardPage() {
  const [funnelRows, setFunnelRows] = useState<FunnelDailySummaryRow[]>([]);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const [costSummary, setCostSummary] = useState<CostAnalyticsSummary | null>(null);
  const [costError, setCostError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [rows, costs] = await Promise.all([
          funnelAnalyticsService.getDailySummary(14),
          analyticsService.getCostSummary(),
        ]);
        setFunnelRows(rows);
        setCostSummary(costs);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Admin-Dashboard konnte nicht geladen werden.';
        setFunnelError(errorMessage);
        setCostError(errorMessage);
      }
    };

    void load();
  }, []);

  const latest = useMemo(() => funnelRows[0] ?? null, [funnelRows]);

  return (
    <section className="page">
      <article className="card" style={{ marginBottom: '1rem' }}>
        <h3>KI-Kosten (konsolidiert)</h3>
        {costError ? <p className="auth-error">{costError}</p> : null}
        {!costSummary && !costError ? <p>Daten werden geladen …</p> : null}
        {costSummary ? (
          <>
            <p>
              Heute: ${costSummary.today.estimatedCostUsd.toFixed(4)} · Monat: ${costSummary.monthToDate.estimatedCostUsd.toFixed(4)} · Jahr: ${costSummary.yearToDate.estimatedCostUsd.toFixed(4)}
            </p>
            <p>30 Tage: ${costSummary.last30Days.estimatedCostUsd.toFixed(4)}</p>
            <p>
              Tokens (30 Tage): {costSummary.last30Days.totalTokens} · In: {costSummary.last30Days.inputTokens} · Out:{' '}
              {costSummary.last30Days.outputTokens}
            </p>
            <details>
              <summary>Top User nach Kosten (30 Tage)</summary>
              <ul>
                {costSummary.byUserLast30Days.slice(0, 10).map((entry) => (
                  <li key={entry.userId ?? 'unknown'}>
                    {entry.userId ?? 'unknown'} · ${entry.estimatedCostUsd.toFixed(4)} · {entry.totalTokens} Tokens
                  </li>
                ))}
              </ul>
            </details>
            <details open>
              <summary>Kosten, Plan &amp; Marge je registriertem Benutzer (schlechteste Marge zuerst)</summary>
              <ul>
                {costSummary.byUserCurrentPeriods.map((entry) => (
                  <li key={entry.userId}>
                    {(entry.displayName ?? entry.userId).trim()} · Tag ${entry.day.estimatedCostUsd.toFixed(4)} · Monat $
                    {entry.month.estimatedCostUsd.toFixed(4)} · Jahr ${entry.year.estimatedCostUsd.toFixed(4)} · Plan:{' '}
                    {entry.planDisplayName ?? 'kein Abo'}
                    {entry.priceAmountCents != null ? ` (${formatEurFromCents(entry.priceAmountCents)}/Monat)` : ''} · Marge:{' '}
                    {entry.marginEurCents != null ? (
                      <Badge tone={entry.marginEurCents >= 0 ? 'success' : 'danger'}>{formatEurFromCents(entry.marginEurCents)}</Badge>
                    ) : (
                      <Badge tone="neutral">n/a</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
      </article>
      <article className="card" style={{ marginBottom: '1rem' }}>
        <h3>Funnel Conversion (täglich)</h3>
        {funnelError ? <p className="auth-error">{funnelError}</p> : null}
        {!latest && !funnelError ? <p>Daten werden geladen …</p> : null}
        {latest ? (
          <>
            <p>Tag: {new Date(latest.eventDate).toLocaleDateString('de-DE')}</p>
            <p>Landing: {latest.landingViewed} → Pricing: {latest.pricingViewed}</p>
            <p>Signup: {latest.signupStarted} / {latest.signupCompleted}</p>
            <p>Checkout: {latest.checkoutStarted} / {latest.checkoutCompleted}</p>
            <p>Payment succeeded: {latest.paymentSucceeded}</p>
          </>
        ) : null}
      </article>
      <article className="card" style={{ marginBottom: '1rem' }}>
        <h3>Billing Webhooks</h3>
        <p>Schnellansicht für fehlgeschlagene Stripe-Events inklusive Fehlertexten für den Support.</p>
        <Link className="button button-secondary" to={paths.admin.billingEvents}>
          Fehlgeschlagene Billing-Events öffnen
        </Link>
      </article>
      <AdminToolsPanel />
    </section>
  );
}
