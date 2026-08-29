import { supabaseClient } from '@/services/supabase/client';

export type DashboardSubscriptionUsage = {
  hasBillingSubscription: boolean;
  planKey: string | null;
  planName: string | null;
  entitlementStatus: string | null;
  nextBillingDate: string | null;
  sessionsPerDayLimit: number | null;
  sessionsToday: number;
  remainingSessionsToday: number | null;
  tokenLimitInPeriod: number | null;
  tokensUsedInPeriod: number;
  remainingTokensInPeriod: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
};

type CustomerPortalFlowType = 'billing_history' | 'payment_method_update' | 'subscription_update';
type BillingPortalResponse = {
  url: string;
};

export const dashboardSubscriptionService = {
  async loadSubscriptionUsage(): Promise<DashboardSubscriptionUsage> {
    const { data, error } = await supabaseClient.functions.invoke<DashboardSubscriptionUsage>('dashboard-subscription-usage', {
      method: 'GET',
    });

    if (error || !data) {
      throw new Error(`Abo-Verbrauch konnte nicht geladen werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return data;
  },

  async createCustomerPortalUrl(flowType: CustomerPortalFlowType, returnUrl: string): Promise<BillingPortalResponse> {
    const { data, error } = await supabaseClient.functions.invoke<BillingPortalResponse>('create-billing-portal-session', {
      body: {
        flowType,
        returnUrl,
      },
    });

    if (error || !data?.url) {
      const baseMessage = error?.message ?? 'Unbekannter Fehler';
      if (baseMessage.includes('404')) {
        throw new Error('Die Supabase Edge Function `create-billing-portal-session` wurde nicht gefunden (404). Bitte Function deployen und den Endpoint in diesem Projekt prüfen.');
      }

      throw new Error(`Stripe Customer Portal konnte nicht geöffnet werden: ${baseMessage}`);
    }

    return data;
  },
};
