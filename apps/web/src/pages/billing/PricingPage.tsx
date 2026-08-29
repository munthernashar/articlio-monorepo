import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { LegalFooter } from '@/components/ui/LegalFooter';
import { PlanFeatureList } from '@/components/ui/PlanFeatureList';
import { paths } from '@/app/routes/paths';
import { checkoutService, type BillingPlanKey } from '@/services/billing/checkout.service';
import { billingPlanCatalogService } from '@/services/billing/plan-catalog.service';
import { billingPortalService } from '@/services/billing/billing-portal.service';
import { useAuth } from '@/features/auth/useAuth';
import { userEntitlementsService } from '@/services/supabase/user-entitlements.service';
import { getBillingRecoveryContent, mapEntitlementStatusToLabel } from '@/services/billing/billing-recovery';
import { funnelTracking } from '@/services/analytics/funnel-tracking';
import { mapPlanContractToUiModel, type BillingPlanUiModel } from '@/services/billing/plan-ui-mapping';
import { dashboardSubscriptionService, type DashboardSubscriptionUsage } from '@/services/supabase/dashboard-subscription.service';

function mapBillingError(error: unknown): string {
  const fallback = 'Das Kundenportal konnte nicht geöffnet werden. Bitte versuche es erneut.';
  const message = error instanceof Error ? error.message : fallback;

  if (message.includes('BILLING_CUSTOMER_NOT_FOUND')) {
    return 'Für dieses Konto wurde noch kein Stripe-Kundenprofil gefunden. Starte zuerst einen Checkout für einen Plan.';
  }

  return message;
}

export function BillingPricingPage() {
  const { user } = useAuth();
  const [activePlanKey, setActivePlanKey] = useState<BillingPlanKey | null>(null);
  const [currentPlanKey, setCurrentPlanKey] = useState<string | null>(null);
  const [entitlementStatus, setEntitlementStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [portalFlowLoading, setPortalFlowLoading] = useState<'billing_history' | 'payment_method_update' | 'subscription_update' | null>(null);
  const [plans, setPlans] = useState<BillingPlanUiModel[]>([]);
  const [isPlansLoading, setIsPlansLoading] = useState(true);
  const [subscriptionUsage, setSubscriptionUsage] = useState<DashboardSubscriptionUsage | null>(null);
  // §356 Abs. 5 BGB: das Widerrufsrecht erlischt bei sofortigem Leistungsbeginn nur,
  // wenn diese Zustimmung ausdrücklich eingeholt wurde. Ohne sie darf kein Checkout starten.
  // Betreiber-Entscheidung (16.08.2026): bei verfügbarer 14-Tage-Testphase beginnt die
  // Leistung nicht sofort kostenpflichtig, daher gilt statt dieser Einwilligung eine
  // Auto-Konversions-Kenntnisnahme (siehe isTrialEligible unten).
  const [hasAcceptedCheckoutConsent, setHasAcceptedCheckoutConsent] = useState(false);
  const [isTrialEligible, setIsTrialEligible] = useState<boolean | null>(null);

  const checkoutStatus = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('checkout');
  }, []);

  useEffect(() => {
    funnelTracking.trackFunnelEvent('pricing_viewed', {
      surface: 'billing_pricing',
    });
  }, []);

  useEffect(() => {
    if (checkoutStatus === 'success') {
      funnelTracking.trackFunnelEvent('checkout_completed', {
        surface: 'billing_pricing',
      });
    }
  }, [checkoutStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadCurrentPlan = async () => {
      if (!user?.id) {
        setCurrentPlanKey(null);
        setIsTrialEligible(null);
        return;
      }

      try {
        const entitlement = await userEntitlementsService.getEffectiveForUser(user.id);
        if (isMounted) {
          setCurrentPlanKey(entitlement.planKey);
          setEntitlementStatus(entitlement.status);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Der aktive Plan konnte nicht geladen werden.',
          );
        }
      }

      try {
        const trialEligible = await checkoutService.checkTrialEligibility(user.id);
        if (isMounted) {
          setIsTrialEligible(trialEligible);
        }
      } catch (error) {
        if (isMounted) {
          // Konservativer Fallback: ohne verlässliche Auskunft keine Testphase anzeigen,
          // damit nicht versehentlich die schwächere Einwilligung eingeholt wird.
          setIsTrialEligible(false);
          setErrorMessage(
            error instanceof Error ? error.message : 'Der Testphasen-Status konnte nicht geladen werden.',
          );
        }
      }
    };

    void loadCurrentPlan();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;
    const loadSubscriptionUsage = async () => {
      if (!user?.id) {
        setSubscriptionUsage(null);
        return;
      }
      try {
        const usage = await dashboardSubscriptionService.loadSubscriptionUsage();
        if (isMounted) setSubscriptionUsage(usage);
      } catch {
        if (isMounted) setSubscriptionUsage(null);
      }
    };

    void loadSubscriptionUsage();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadPlans = async () => {
      setIsPlansLoading(true);

      try {
        const planContracts = await billingPlanCatalogService.listPublicPlans();
        const nextPlans = planContracts.map(mapPlanContractToUiModel);

        if (isMounted) {
          setPlans(nextPlans);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Die Planliste konnte nicht geladen werden.');
        }
      } finally {
        if (isMounted) {
          setIsPlansLoading(false);
        }
      }
    };

    void loadPlans();

    return () => {
      isMounted = false;
    };
  }, []);

  const openBillingPortal = async () => {
    const recovery = getBillingRecoveryContent(entitlementStatus);
    setErrorMessage(null);
    setIsPortalLoading(true);

    try {
      const returnUrl = `${window.location.origin}${paths.billing.pricing}`;
      const { url } = await billingPortalService.createSession({ returnUrl, flowType: recovery?.flowType });
      window.location.assign(url);
    } catch (error) {
      setErrorMessage(mapBillingError(error));
      setIsPortalLoading(false);
    }
  };

  const startCheckout = async (planKey: BillingPlanKey) => {
    if (!hasAcceptedCheckoutConsent) {
      setErrorMessage('Bitte bestätige zuerst den Hinweis unten auf dieser Seite.');
      return;
    }

    setErrorMessage(null);
    setActivePlanKey(planKey);
    funnelTracking.trackFunnelEvent('checkout_started', {
      planKey,
      currentPlanKey,
    });

    try {
      const baseUrl = window.location.origin;
      const successUrl = `${baseUrl}${paths.billing.pricing}?checkout=success`;
      const cancelUrl = `${baseUrl}${paths.billing.pricing}?checkout=cancel`;
      const consentTimestamp = new Date().toISOString();

      const data = await checkoutService.createCheckoutSession({
        planKey,
        successUrl,
        cancelUrl,
        ...(isTrialEligible
          ? { trialDisclosureAcceptedAt: consentTimestamp }
          : { withdrawalConsentAcceptedAt: consentTimestamp }),
      });

      window.location.assign(data.url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Der Checkout konnte nicht gestartet werden. Bitte versuche es gleich erneut.',
      );
      setActivePlanKey(null);
    }
  };

  const openPortalFlow = async (flowType: 'billing_history' | 'payment_method_update' | 'subscription_update') => {
    if (portalFlowLoading) return;
    setErrorMessage(null);
    setPortalFlowLoading(flowType);
    try {
      const returnUrl = `${window.location.origin}${paths.billing.pricing}`;
      const { url } = await dashboardSubscriptionService.createCustomerPortalUrl(flowType, returnUrl);
      window.location.assign(url);
    } catch (error) {
      setErrorMessage(mapBillingError(error));
      setPortalFlowLoading(null);
    }
  };

  return (
    <section className="page">
      <PageHeader
        title="Preise & Abo"
        subtitle="Wähle den Plan, der zu deinem Lernrhythmus passt. Dein Kauf wird sicher über Stripe abgewickelt."
      />

      {checkoutStatus === 'success' ? (
        <article className="card" role="status" aria-live="polite">
          <p>Danke! Dein Checkout wurde abgeschlossen. Dein Zugriff wird in Kürze aktualisiert.</p>
        </article>
      ) : null}

      {checkoutStatus === 'cancel' ? (
        <article className="card" role="status" aria-live="polite">
          <p>Checkout abgebrochen. Du kannst jederzeit erneut einen Plan auswählen.</p>
        </article>
      ) : null}

      <article className="card">
        <h2>Abo verwalten</h2>
        {getBillingRecoveryContent(entitlementStatus) ? (
          <div role="status" aria-live="polite" style={{ marginBottom: '0.75rem' }}>
            <p><strong>{getBillingRecoveryContent(entitlementStatus)?.title}</strong></p>
            <p>{getBillingRecoveryContent(entitlementStatus)?.message}</p>
          </div>
        ) : null}
        <p>
          {subscriptionUsage?.hasBillingSubscription
            ? 'Wenn du bereits ein aktives Stripe-Abo hast, kannst du hier Zahlungsmethode und Rechnungen verwalten.'
            : 'Aktuell ist kein Stripe-Abo aktiv. Rechnungen und Abo-Änderungen sind nach dem ersten Checkout verfügbar.'}
        </p>
        <div className="button-row">
          <button
            type="button"
            className="button button-secondary"
            disabled={portalFlowLoading !== null || !subscriptionUsage?.hasBillingSubscription}
            onClick={() => void openPortalFlow('billing_history')}
          >
            {portalFlowLoading === 'billing_history' ? 'Öffne Rechnungen ...' : 'Rechnungen ansehen'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={portalFlowLoading !== null || !subscriptionUsage?.hasBillingSubscription}
            onClick={() => void openPortalFlow('payment_method_update')}
          >
            {portalFlowLoading === 'payment_method_update' ? 'Öffne Zahlungsmethoden ...' : 'Zahlungsmethode verwalten'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={portalFlowLoading !== null || !subscriptionUsage?.hasBillingSubscription}
            onClick={() => void openPortalFlow('subscription_update')}
          >
            {portalFlowLoading === 'subscription_update' ? 'Öffne Abo-Details ...' : 'Abo bearbeiten'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={isPortalLoading || activePlanKey !== null}
            onClick={() => {
              void openBillingPortal();
            }}
          >
            {isPortalLoading ? 'Portal wird geöffnet ...' : getBillingRecoveryContent(entitlementStatus)?.cta ?? 'Abo verwalten'}
          </button>
        </div>
        {subscriptionUsage?.hasBillingSubscription ? (
          <ul style={{ marginTop: '0.75rem' }}>
            <li>Aktiver Plan: {subscriptionUsage.planName}</li>
            <li>Status: {mapEntitlementStatusToLabel(subscriptionUsage.entitlementStatus)}</li>
            <li>Nächste Abrechnung: {subscriptionUsage.nextBillingDate ? new Date(subscriptionUsage.nextBillingDate).toLocaleDateString('de-DE') : '—'}</li>
            <li>Abo gültig bis: {subscriptionUsage.billingPeriodEnd ? new Date(subscriptionUsage.billingPeriodEnd).toLocaleDateString('de-DE') : '—'}</li>
          </ul>
        ) : null}
      </article>

      <article className="card legal-consent-card">
        {isTrialEligible === null ? (
          <p>Hinweis wird geladen ...</p>
        ) : isTrialEligible ? (
          <label className="auth-checkbox" htmlFor="trial-disclosure-consent">
            <input
              id="trial-disclosure-consent"
              type="checkbox"
              checked={hasAcceptedCheckoutConsent}
              onChange={(event) => setHasAcceptedCheckoutConsent(event.target.checked)}
            />
            <span>
              Ich weiß, dass meine 14-tägige kostenfreie Testphase automatisch in ein
              kostenpflichtiges Abo zum jeweiligen Plan-Preis übergeht, sofern ich nicht vorher in
              den Kontoeinstellungen kündige. Ich kann während der Testphase jederzeit kostenlos
              kündigen.
            </span>
          </label>
        ) : (
          <label className="auth-checkbox" htmlFor="withdrawal-consent">
            <input
              id="withdrawal-consent"
              type="checkbox"
              checked={hasAcceptedCheckoutConsent}
              onChange={(event) => setHasAcceptedCheckoutConsent(event.target.checked)}
            />
            <span>
              Ich möchte, dass die gebuchte Leistung sofort mit Vertragsschluss beginnt, und weiß,
              dass mein Widerrufsrecht dadurch erlischt, sobald die Leistung vollständig erbracht
              ist. Details in der <Link to={paths.legal.withdrawal}>Widerrufsbelehrung</Link>.
            </span>
          </label>
        )}
      </article>

      {isPlansLoading ? (
        <article className="card" role="status" aria-live="polite">
          <p>Pläne werden geladen ...</p>
        </article>
      ) : plans.length === 0 ? (
        <article className="card" role="status" aria-live="polite">
          <p>Die Preise konnten gerade nicht geladen werden. Versuch's gleich noch mal.</p>
        </article>
      ) : (
        <section className="public-pricing-grid">
          {plans.map((plan) => {
            const planKey = plan.key;
            const isLoading = activePlanKey === planKey;
            const isCurrentPlan = currentPlanKey === planKey;
            const isDisabled =
              activePlanKey !== null || isCurrentPlan || isTrialEligible === null || !hasAcceptedCheckoutConsent;
            const buyLabel = isTrialEligible ? `${plan.name}: 14 Tage kostenlos testen` : `${plan.name} kaufen`;

            return (
              <article key={planKey} className="card public-card public-pricing-card">
                {isCurrentPlan ? <p className="chip">Aktiver Plan</p> : null}
                <h2>{plan.name}</h2>
                <p className="public-price">{plan.price}</p>
                <p>{plan.note}</p>
                <PlanFeatureList features={plan.features} />

                {planKey === 'free' ? (
                  <button type="button" className="button" disabled>
                    {isCurrentPlan ? 'Aktueller Plan' : 'Kostenlos inklusive'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button"
                    disabled={isDisabled}
                    onClick={() => {
                      void startCheckout(planKey);
                    }}
                  >
                    {isCurrentPlan ? 'Bereits aktiv' : isLoading ? 'Weiterleitung ...' : buyLabel}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

      <LegalFooter />
    </section>
  );
}
