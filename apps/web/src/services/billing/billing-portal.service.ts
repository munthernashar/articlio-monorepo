import { supabaseClient } from '@/services/supabase/client';

type BillingPortalRequest = {
  returnUrl: string;
  flowType?: 'billing_history' | 'payment_method_update' | 'subscription_update';
};

type BillingPortalResponse = {
  url: string;
};

class BillingPortalService {
  async createSession(payload: BillingPortalRequest): Promise<BillingPortalResponse> {
    const { data, error } = await supabaseClient.functions.invoke<BillingPortalResponse>('create-billing-portal-session', {
      body: payload,
    });

    if (error) {
      const message = error.message || 'Billing-Portal konnte nicht geöffnet werden.';
      const isMissingFunction = message.includes('404');

      if (isMissingFunction) {
        throw new Error('Die Supabase Edge Function `create-billing-portal-session` wurde nicht gefunden (404). Bitte Function deployen und den Endpoint in diesem Projekt prüfen.');
      }

      throw new Error(message);
    }

    if (!data?.url) {
      throw new Error('Billing-Portal-URL fehlt. Bitte versuche es erneut.');
    }

    return data;
  }
}

export const billingPortalService = new BillingPortalService();
