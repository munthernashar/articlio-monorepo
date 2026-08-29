import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { paths } from '@/app/routes/paths';
import { PublicNav } from '@/components/ui/PublicNav';
import { LegalFooter } from '@/components/ui/LegalFooter';
import { PlanFeatureList } from '@/components/ui/PlanFeatureList';
import { funnelTracking } from '@/services/analytics/funnel-tracking';
import { billingPlanCatalogService } from '@/services/billing/plan-catalog.service';
import { mapPlanContractToUiModel, type BillingPlanUiModel } from '@/services/billing/plan-ui-mapping';
import { useAuth } from '@/features/auth/useAuth';

const fallbackPlans: BillingPlanUiModel[] = [
  {
    key: 'free',
    name: 'Free',
    price: 'Kostenlos',
    note: 'Kostenlos ausprobieren, ohne Kreditkarte.',
    features: ['1 Session pro Tag', 'Session-Länge bis 3 Minuten', 'Fortschrittsübersicht & Lernhistorie'],
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '5 € / Monat · inkl. MwSt.',
    note: 'Ideal für konstantes Lernen im Alltag.',
    features: ['1 Session pro Tag', 'Session-Länge bis 15 Minuten', 'Fortschrittsübersicht & Lernhistorie'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '9 € / Monat · inkl. MwSt.',
    note: 'Für strukturiertes Coaching mit persönlichen Trainingspfaden.',
    features: [
      '1 Session pro Tag',
      'Session-Länge bis 15 Minuten',
      'Strukturierter KI-Coach mit persönlichen Trainingspfaden',
      'Priorisierte Analyse & tiefere Verlaufsdaten',
    ],
  },
];

export function PricingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [plans, setPlans] = useState<BillingPlanUiModel[]>(fallbackPlans);

  useEffect(() => {
    let isMounted = true;
    const loadPlans = async () => {
      const contracts = await billingPlanCatalogService.listPublicPlans();
      if (isMounted && contracts.length > 0) {
        setPlans(contracts.map(mapPlanContractToUiModel));
      }
    };

    void loadPlans();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    funnelTracking.trackFunnelEvent('pricing_viewed', {
      surface: 'public_pricing',
      planCount: plans.length,
    });
  }, [plans.length]);

  const handlePlanSelection = (plan: BillingPlanUiModel) => {
    // Free läuft nie durch Stripe-Checkout (kein 0€-Zahlungsversuch möglich) -- eingeloggte
    // Nutzer haben Free ohnehin automatisch aktiv, sie starten deshalb direkt eine Session
    // statt über billing/PricingPage.tsx umzuleiten.
    if (plan.key === 'free') {
      funnelTracking.trackFunnelEvent('signup_started', {
        source: 'public_pricing',
        planName: plan.name,
        destination: isAuthenticated ? 'session_new' : 'register',
      });

      navigate(isAuthenticated ? paths.sessions.new : paths.auth.register);
      return;
    }

    funnelTracking.trackFunnelEvent('signup_started', {
      source: 'public_pricing',
      planName: plan.name,
      destination: isAuthenticated ? 'billing_pricing' : 'register',
    });

    if (isAuthenticated) {
      navigate(paths.billing.pricing);
      return;
    }

    navigate(paths.auth.register);
  };

  return (
    <>
      <PublicNav />
      <main className="app-main page public-page">
        <header className="public-page-hero">
          <p className="public-kicker">Preise</p>
          <h1>Transparente Pakete für jedes Lernziel</h1>
          <p>
            Wähle den Plan, der zu deinem Alltag passt. Du kannst jederzeit wechseln, wenn sich dein Lernumfang ändert.
          </p>
        </header>

        <section className="public-pricing-grid">
          {plans.map((plan) => (
            <article key={plan.key} className="card public-card public-pricing-card">
              <h2>{plan.name}</h2>
              <p className="public-price">{plan.price}</p>
              <p>{plan.note}</p>
              <PlanFeatureList features={plan.features} />
              <button className="button" type="button" onClick={() => handlePlanSelection(plan)}>
                {plan.name} wählen
              </button>
            </article>
          ))}
        </section>

        <section className="card public-cta">
          <h2>Noch unsicher?</h2>
          <p>Sieh dir zuerst die Produkt-Features an oder starte direkt mit der Registrierung.</p>
          <div className="button-row">
            <Link className="button button-secondary" to={paths.public.features}>
              Features ansehen
            </Link>
          </div>
        </section>

        <LegalFooter />
      </main>
    </>
  );
}
