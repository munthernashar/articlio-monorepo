import { supabaseClient } from '@/services/supabase/client';

type PromptExecutionCostRow = {
  user_id: string | null;
  created_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | string | null;
};

type EntitlementPlanRow = { user_id: string; plan_key: string };
type BillingPlanPriceRow = { plan_key: string; display_name: string; price_amount_cents: number | null };

/**
 * Grober, fest hinterlegter Näherungskurs für die interne Margenschätzung im
 * Admin-Bereich (Kosten liegen als estimated_cost_usd vor, Plan-Preise in
 * EUR). Kein Live-FX-Feed -- für eine Rentabilitätseinschätzung je Nutzer
 * ausreichend, nicht kundenseitig sichtbar. Bei Bedarf hier anpassen.
 */
const USD_TO_EUR_RATE = 0.92;

export type CostAggregate = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type UserCostAggregate = CostAggregate & {
  userId: string | null;
};

export type CostAnalyticsSummary = {
  today: CostAggregate;
  monthToDate: CostAggregate;
  yearToDate: CostAggregate;
  last30Days: CostAggregate;
  byUserLast30Days: UserCostAggregate[];
  byUserCurrentPeriods: Array<{
    userId: string;
    displayName: string | null;
    day: CostAggregate;
    month: CostAggregate;
    year: CostAggregate;
    planKey: string | null;
    planDisplayName: string | null;
    priceAmountCents: number | null;
    /** Preis minus geschätzte Monatskosten (USD->EUR genähert), null ohne aktiven Plan-Preis. */
    marginEurCents: number | null;
  }>;
};

function emptyAggregate(): CostAggregate {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function addRow(acc: CostAggregate, row: PromptExecutionCostRow): void {
  acc.inputTokens += toNumber(row.input_tokens);
  acc.outputTokens += toNumber(row.output_tokens);
  acc.totalTokens += toNumber(row.total_tokens);
  acc.estimatedCostUsd += toNumber(row.estimated_cost_usd);
}

export const analyticsService = {
  async getCostSummary(params: { userId?: string; now?: Date } = {}): Promise<CostAnalyticsSummary> {
    const now = params.now ?? new Date();
    const todayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrowStartUtc = new Date(todayStartUtc);
    tomorrowStartUtc.setUTCDate(tomorrowStartUtc.getUTCDate() + 1);
    const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yearStartUtc = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const start30DaysUtc = new Date(todayStartUtc);
    start30DaysUtc.setUTCDate(start30DaysUtc.getUTCDate() - 29);

    let query = supabaseClient
      .from('prompt_execution_logs')
      .select('user_id, created_at, input_tokens, output_tokens, total_tokens, estimated_cost_usd')
      .gte('created_at', start30DaysUtc.toISOString())
      .lt('created_at', tomorrowStartUtc.toISOString());

    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }

    const res = await query.returns<PromptExecutionCostRow[]>();
    if (res.error) {
      throw new Error(`Kosten-Analytics konnten nicht geladen werden: ${res.error.message}`);
    }

    const rows = res.data ?? [];
    const today = emptyAggregate();
    const monthToDate = emptyAggregate();
    const yearToDate = emptyAggregate();
    const last30Days = emptyAggregate();
    const byUser = new Map<string, UserCostAggregate>();
    const byUserCurrentPeriods = new Map<
      string,
      {
        userId: string;
        displayName: string | null;
        day: CostAggregate;
        month: CostAggregate;
        year: CostAggregate;
        planKey: string | null;
        planDisplayName: string | null;
        priceAmountCents: number | null;
        marginEurCents: number | null;
      }
    >();

    const profilesRes = await supabaseClient.from('profiles').select('id, display_name').returns<{ id: string; display_name: string | null }[]>();
    if (profilesRes.error) {
      throw new Error(`Kosten-Analytics konnten nicht geladen werden: ${profilesRes.error.message}`);
    }

    for (const profile of profilesRes.data ?? []) {
      byUserCurrentPeriods.set(profile.id, {
        userId: profile.id,
        displayName: profile.display_name,
        day: emptyAggregate(),
        month: emptyAggregate(),
        year: emptyAggregate(),
        planKey: null,
        planDisplayName: null,
        priceAmountCents: null,
        marginEurCents: null,
      });
    }

    for (const row of rows) {
      addRow(last30Days, row);
      const createdAt = Date.parse(row.created_at);
      if (createdAt >= todayStartUtc.getTime() && createdAt < tomorrowStartUtc.getTime()) {
        addRow(today, row);
      }
      if (createdAt >= monthStartUtc.getTime() && createdAt < tomorrowStartUtc.getTime()) {
        addRow(monthToDate, row);
      }
      if (createdAt >= yearStartUtc.getTime() && createdAt < tomorrowStartUtc.getTime()) {
        addRow(yearToDate, row);
      }

      if (row.user_id) {
        const current =
          byUserCurrentPeriods.get(row.user_id) ?? {
            userId: row.user_id,
            displayName: null,
            day: emptyAggregate(),
            month: emptyAggregate(),
            year: emptyAggregate(),
            planKey: null,
            planDisplayName: null,
            priceAmountCents: null,
            marginEurCents: null,
          };
        if (createdAt >= todayStartUtc.getTime() && createdAt < tomorrowStartUtc.getTime()) {
          addRow(current.day, row);
        }
        if (createdAt >= monthStartUtc.getTime() && createdAt < tomorrowStartUtc.getTime()) {
          addRow(current.month, row);
        }
        if (createdAt >= yearStartUtc.getTime() && createdAt < tomorrowStartUtc.getTime()) {
          addRow(current.year, row);
        }
        byUserCurrentPeriods.set(row.user_id, current);
      }

      const userKey = row.user_id ?? 'unknown';
      const aggregate = byUser.get(userKey) ?? {
        userId: row.user_id,
        ...emptyAggregate(),
      };
      addRow(aggregate, row);
      byUser.set(userKey, aggregate);
    }

    // Plan + Preis je Nutzer nachladen, um daraus die Marge (Preis - Kosten)
    // zu berechnen -- separat von der Kosten-Abfrage, da entitlements/Katalog
    // nichts mit prompt_execution_logs zu tun haben.
    // billing_plan_catalog ist nicht Teil des generierten Database-Typs
    // (gleiches Vorgehen wie plan-catalog.service.ts) -- lokal minimal
    // getypter Client statt den vollständigen Supabase-Typ zu erweitern.
    const billingPlanCatalogClient = supabaseClient as unknown as {
      from: (table: 'billing_plan_catalog') => {
        select: (columns: string) => Promise<{ data: BillingPlanPriceRow[] | null; error: { message: string } | null }>;
      };
    };

    const [entitlementsRes, planPricesRes] = await Promise.all([
      supabaseClient.from('user_entitlements').select('user_id, plan_key').returns<EntitlementPlanRow[]>(),
      billingPlanCatalogClient.from('billing_plan_catalog').select('plan_key, display_name, price_amount_cents'),
    ]);

    if (entitlementsRes.error) {
      throw new Error(`Kosten-Analytics konnten nicht geladen werden: ${entitlementsRes.error.message}`);
    }
    if (planPricesRes.error) {
      throw new Error(`Kosten-Analytics konnten nicht geladen werden: ${planPricesRes.error.message}`);
    }

    const planKeyByUserId = new Map((entitlementsRes.data ?? []).map((row) => [row.user_id, row.plan_key]));
    const priceByPlanKey = new Map((planPricesRes.data ?? []).map((row) => [row.plan_key, row]));

    for (const entry of byUserCurrentPeriods.values()) {
      const planKey = planKeyByUserId.get(entry.userId) ?? null;
      const price = planKey ? priceByPlanKey.get(planKey) : undefined;
      entry.planKey = planKey;
      entry.planDisplayName = price?.display_name ?? null;
      entry.priceAmountCents = price?.price_amount_cents ?? null;
      entry.marginEurCents =
        price?.price_amount_cents != null ? Math.round(price.price_amount_cents - entry.month.estimatedCostUsd * USD_TO_EUR_RATE * 100) : null;
    }

    return {
      today,
      monthToDate,
      yearToDate,
      last30Days,
      byUserLast30Days: Array.from(byUser.values()).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
      // Schlechteste Marge zuerst -- macht unprofitable Nutzer ohne
      // zusätzliche Sortier-UI sofort sichtbar. Nutzer ohne Plan-Preis
      // (marginEurCents === null) landen am Ende.
      byUserCurrentPeriods: Array.from(byUserCurrentPeriods.values()).sort((a, b) => {
        if (a.marginEurCents === null && b.marginEurCents === null) return 0;
        if (a.marginEurCents === null) return 1;
        if (b.marginEurCents === null) return -1;
        return a.marginEurCents - b.marginEurCents;
      }),
    };
  },
};
