import { supabaseClient } from '@/services/supabase/client';
import type { BillingPlanContract, BillingPlanFeatureFlags, BillingPlanLimits } from '@/services/api/contracts';

type BillingPlanCatalogRow = {
  plan_key: string;
  display_name: string;
  price_label: string;
  note: string;
  feature_flags: unknown;
  limits: unknown;
  sort_order: number;
  updated_at: string;
};


import { FALLBACK_PLAN_CONTRACTS } from '@/services/billing/plan-fallback-catalog';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFeatureFlags(value: unknown): BillingPlanFeatureFlags {
  if (!isObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
  );
}

function normalizeLimits(value: unknown): BillingPlanLimits {
  if (!isObject(value)) {
    return {};
  }

  const normalized: BillingPlanLimits = {};

  for (const [key, limitValue] of Object.entries(value)) {
    if (typeof limitValue === 'number' && Number.isFinite(limitValue) && limitValue >= 0) {
      normalized[key] = Math.round(limitValue);
    }
  }

  return normalized;
}

function asCatalogPlanKey(value: string): BillingPlanContract['planKey'] | null {
  if (value === 'free' || value === 'starter' || value === 'pro') {
    return value;
  }

  return null;
}

function mapRow(row: BillingPlanCatalogRow): BillingPlanContract | null {
  const planKey = asCatalogPlanKey(row.plan_key);
  if (!planKey) {
    return null;
  }

  return {
    planKey,
    displayName: row.display_name,
    priceLabel: row.price_label,
    note: row.note,
    featureFlags: normalizeFeatureFlags(row.feature_flags),
    limits: normalizeLimits(row.limits),
    sortOrder: row.sort_order,
  };
}

export const billingPlanCatalogService = {
  async listPublicPlans(): Promise<BillingPlanContract[]> {
    const billingPlanClient = supabaseClient as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: boolean) => {
            order: (column: string, options: { ascending: boolean }) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{
                data: BillingPlanCatalogRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };

    const { data, error } = await billingPlanClient
      .from('billing_plan_catalog')
      .select('plan_key, display_name, price_label, note, feature_flags, limits, sort_order, updated_at')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('display_name', { ascending: true });

    if (error) {
      return FALLBACK_PLAN_CONTRACTS;
    }

    const mappedPlans = ((data ?? []) as BillingPlanCatalogRow[])
      .map(mapRow)
      .filter((plan): plan is BillingPlanContract => plan !== null);

    return mappedPlans.length > 0 ? mappedPlans : FALLBACK_PLAN_CONTRACTS;
  },
};
