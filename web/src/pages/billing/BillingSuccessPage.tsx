import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { ICON_SIZE_LG } from '@/lib/icon-sizes';
import { paths } from '@/app/routes/paths';
import { useAuth } from '@/features/auth/useAuth';
import { userEntitlementsService } from '@/services/supabase/user-entitlements.service';
import { mapEntitlementStatusToLabel } from '@/services/billing/billing-recovery';
import type { EffectiveUserEntitlement } from '@/types/user-entitlements';

export function BillingSuccessPage() {
  const { user } = useAuth();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<EffectiveUserEntitlement | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshEntitlements = async () => {
    if (!user?.id || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setStatusMessage(null);

    try {
      const nextEntitlement = await userEntitlementsService.getEffectiveForUser(user.id);
      setEntitlement(nextEntitlement);
      setStatusMessage('Deine Zugriffsrechte wurden neu geladen.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Deine Zugriffsrechte konnten nicht aktualisiert werden.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1 className="card-heading-with-icon">
            <CheckCircle aria-hidden="true" size={ICON_SIZE_LG} className="icon--success" />
            Zahlung erfolgreich
          </h1>
          <p>
            Danke für dein Upgrade! Es kann ein paar Minuten dauern, bis dein neuer Plan aktiv ist.
          </p>
        </div>
      </header>

      <article className="card flow-card">
        <p>
          Falls dein neuer Plan noch nicht angezeigt wird, kannst du deinen Zugang hier aktualisieren.
        </p>
        <div className="button-row">
          <button type="button" className="button" onClick={refreshEntitlements} disabled={!user?.id || isRefreshing}>
            {isRefreshing ? 'Aktualisiere …' : 'Zugang aktualisieren'}
          </button>
          <Link className="button button-secondary" to={paths.dashboard}>
            Zum Dashboard
          </Link>
        </div>

        {statusMessage ? <p>{statusMessage}</p> : null}

        {entitlement ? (
          <div>
            <h2>Dein Zugang</h2>
            <ul>
              <li>Plan: {entitlement.planKey}</li>
              <li>Status: {mapEntitlementStatusToLabel(entitlement.status)}</li>
              <li>Sessions/Tag: {entitlement.sessionsPerDayLimit}</li>
              <li>Max. Session-Länge: {Math.round(entitlement.maxSessionLengthSeconds / 60)} Minuten</li>
            </ul>
          </div>
        ) : null}
      </article>
    </section>
  );
}
