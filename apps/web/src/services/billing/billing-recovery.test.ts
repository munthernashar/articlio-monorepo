import { describe, expect, it } from 'vitest';

import { getBillingRecoveryContent, normalizeEntitlementStatus } from '@/services/billing/billing-recovery';

describe('billing recovery matrix', () => {
  it('maps past_due to grace', () => {
    expect(normalizeEntitlementStatus('past_due')).toBe('grace');
  });

  it('returns payment method update flow for grace', () => {
    expect(getBillingRecoveryContent('grace')).toMatchObject({
      cta: 'Zahlungsmethode aktualisieren',
      flowType: 'payment_method_update',
    });
  });

  it('returns subscription update flow for suspended and expired', () => {
    expect(getBillingRecoveryContent('suspended')?.flowType).toBe('subscription_update');
    expect(getBillingRecoveryContent('expired')?.flowType).toBe('subscription_update');
  });

  it('returns null for active or unknown statuses', () => {
    expect(getBillingRecoveryContent('active')).toBeNull();
    expect(getBillingRecoveryContent('foo')).toBeNull();
    expect(getBillingRecoveryContent(null)).toBeNull();
  });
});
