import { supabaseClient } from '@/services/supabase/client';

export type BillingPlanKey = 'starter' | 'pro';

type CheckoutSessionRequest = {
  planKey: BillingPlanKey;
  successUrl: string;
  cancelUrl: string;
  /**
   * ISO-Zeitstempel der Zustimmung zu sofortigem Leistungsbeginn / Verlust
   * des Widerrufsrechts. Nur nötig, wenn keine Testphase mehr verfügbar ist
   * (server-seitig autoritativ geprüft, siehe trialDisclosureAcceptedAt).
   */
  withdrawalConsentAcceptedAt?: string;
  /**
   * ISO-Zeitstempel der Kenntnisnahme, dass die 14-tägige kostenfreie
   * Testphase automatisch in ein kostenpflichtiges Abo übergeht. Nur nötig,
   * wenn eine Testphase gewährt wird.
   */
  trialDisclosureAcceptedAt?: string;
};

type CheckoutSessionResponse = {
  url: string;
  sessionId: string;
  trialGranted: boolean;
};

type BillingCustomerTrialLookup = {
  trial_started_at: string | null;
};

class CheckoutService {
  async createCheckoutSession(payload: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
    const { data, error } = await supabaseClient.functions.invoke<CheckoutSessionResponse>('create-checkout-session', {
      body: payload,
    });

    if (error) {
      throw new Error(error.message || 'Checkout konnte nicht gestartet werden.');
    }

    if (!data?.url) {
      throw new Error('Checkout-URL fehlt. Bitte versuche es erneut.');
    }

    return data;
  }

  /**
   * UI-Vorabschätzung, ob dieser Nutzer noch die 14-Tage-Testphase bekäme.
   * Nicht autoritativ – create-checkout-session prüft und entscheidet das
   * serverseitig unabhängig davon noch einmal.
   */
  async checkTrialEligibility(userId: string): Promise<boolean> {
    const { data, error } = await supabaseClient
      .from('billing_customers')
      .select('trial_started_at')
      .eq('user_id', userId)
      .maybeSingle<BillingCustomerTrialLookup>();

    if (error) {
      throw new Error(`Testphasen-Status konnte nicht geladen werden: ${error.message}`);
    }

    return !data?.trial_started_at;
  }
}

export const checkoutService = new CheckoutService();
