import type { UserEntitlementStatus } from '@/types/user-entitlements';

export type BillingRecoveryPortalFlow = 'billing_history' | 'payment_method_update' | 'subscription_update';

export type BillingRecoveryContent = {
  title: string;
  message: string;
  cta: string;
  flowType: BillingRecoveryPortalFlow;
};

const RECOVERY_MATRIX: Record<UserEntitlementStatus, BillingRecoveryContent | null> = {
  active: null,
  grace: {
    title: 'Zahlung ausstehend',
    message: 'Dein Zugriff ist noch aktiv. Aktualisiere jetzt die Zahlungsmethode, um Unterbrechungen zu vermeiden.',
    cta: 'Zahlungsmethode aktualisieren',
    flowType: 'payment_method_update',
  },
  suspended: {
    title: 'Abo pausiert wegen fehlgeschlagener Zahlung',
    message: 'Reaktiviere dein Konto im Billing-Portal. Nach erfolgreicher Zahlung ist dein Zugriff wieder aktiv.',
    cta: 'Konto reaktivieren',
    flowType: 'subscription_update',
  },
  expired: {
    title: 'Abo nicht mehr aktiv',
    message: 'Aktiviere im Billing-Portal ein neues Abo, um wieder vollen Zugriff zu erhalten.',
    cta: 'Abo erneuern',
    flowType: 'subscription_update',
  },
};

export function normalizeEntitlementStatus(status: string | null | undefined): UserEntitlementStatus | null {
  if (!status) return null;
  if (status === 'past_due') return 'grace';

  return status === 'active' || status === 'grace' || status === 'suspended' || status === 'expired' ? status : null;
}

export function getBillingRecoveryContent(status: string | null | undefined): BillingRecoveryContent | null {
  const normalized = normalizeEntitlementStatus(status);
  return normalized ? RECOVERY_MATRIX[normalized] : null;
}

const ENTITLEMENT_STATUS_LABELS: Record<UserEntitlementStatus, string> = {
  active: 'Aktiv',
  grace: 'Zahlung ausstehend',
  suspended: 'Pausiert',
  expired: 'Abgelaufen',
};

export function mapEntitlementStatusToLabel(status: string | null | undefined): string {
  const normalized = normalizeEntitlementStatus(status);
  return normalized ? ENTITLEMENT_STATUS_LABELS[normalized] : 'Unbekannt';
}
