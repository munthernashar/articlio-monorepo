import { supabaseClient } from '@/services/supabase/client';

export type FunnelDailySummaryRow = {
  eventDate: string;
  landingViewed: number;
  pricingViewed: number;
  signupStarted: number;
  signupCompleted: number;
  checkoutStarted: number;
  checkoutCompleted: number;
  paymentSucceeded: number;
};

export const funnelAnalyticsService = {
  async getDailySummary(days = 30): Promise<FunnelDailySummaryRow[]> {
    const { data, error } = await (supabaseClient as any).rpc('get_funnel_daily_summary', { p_days: days });
    if (error) {
      throw new Error(`Funnel-Analytics konnten nicht geladen werden: ${error.message}`);
    }

    const rows = Array.isArray(data) ? data : [];
    return rows.map((row: any) => ({
      eventDate: row.event_date,
      landingViewed: Number(row.landing_viewed ?? 0),
      pricingViewed: Number(row.pricing_viewed ?? 0),
      signupStarted: Number(row.signup_started ?? 0),
      signupCompleted: Number(row.signup_completed ?? 0),
      checkoutStarted: Number(row.checkout_started ?? 0),
      checkoutCompleted: Number(row.checkout_completed ?? 0),
      paymentSucceeded: Number(row.payment_succeeded ?? 0),
    }));
  },
};
