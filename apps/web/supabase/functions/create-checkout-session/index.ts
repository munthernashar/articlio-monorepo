import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type BillingPlanKey = 'starter' | 'pro';

type BillingPlanConfig = {
  planKey: BillingPlanKey;
  priceId: string;
  sessionsPerDayLimit: number;
  maxSessionLengthSeconds: number;
  dailyConversationSecondsLimit: number | null;
  monthlyTokenLimit: number | null;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const PLAN_CONFIGS: BillingPlanConfig[] = [
  {
    planKey: 'starter',
    priceId: requireEnv('STRIPE_PRICE_STARTER'),
    sessionsPerDayLimit: 3,
    maxSessionLengthSeconds: 900,
    dailyConversationSecondsLimit: null,
    // Launch-Readiness-Audit, Befund A Punkt 8: konservativer Deckel, vom Betreiber
    // bestätigt (~20-30 vollständig verarbeitete Sessions/Monat bei 8.000-15.000
    // Gesamt-Tokens je Session-Pipeline-Durchlauf).
    monthlyTokenLimit: 300000,
  },
  {
    planKey: 'pro',
    priceId: requireEnv('STRIPE_PRICE_PRO'),
    sessionsPerDayLimit: 12,
    maxSessionLengthSeconds: 3600,
    dailyConversationSecondsLimit: null,
    monthlyTokenLimit: 1200000,
  },
];

function getPlanByKey(planKey: string): BillingPlanConfig | null {
  return PLAN_CONFIGS.find((plan) => plan.planKey === planKey) ?? null;
}

// Betreiber-Entscheidung (16.08.2026): 14 Tage kostenfreie Testphase auf den
// gewählten Plan, danach automatische Abbuchung. Ein Nutzer bekommt sie genau
// einmal (siehe trial_started_at auf billing_customers). Welche der beiden
// folgenden Einwilligungen verlangt wird, entscheidet der Server anhand der
// tatsächlichen Testphasen-Berechtigung – der Client kennt sie nur als
// UI-Vorabschätzung, nicht als Wahrheit.
type CheckoutRequest = {
  planKey: BillingPlanKey;
  successUrl: string;
  cancelUrl: string;
  /**
   * ISO-Zeitstempel der ausdrücklichen Zustimmung zum sofortigen
   * Leistungsbeginn und zur damit einhergehenden vorzeitigen Beendigung des
   * Widerrufsrechts (§356 Abs. 5 BGB). Nur relevant/verpflichtend, wenn keine
   * Testphase mehr zur Verfügung steht (Leistung beginnt dann sofort
   * kostenpflichtig).
   */
  withdrawalConsentAcceptedAt: string | null;
  /**
   * ISO-Zeitstempel der Kenntnisnahme, dass die kostenfreie 14-Tage-Testphase
   * automatisch in ein kostenpflichtiges Abo übergeht, sofern nicht vorher
   * gekündigt wird. Nur relevant/verpflichtend, wenn eine Testphase gewährt
   * wird.
   */
  trialDisclosureAcceptedAt: string | null;
};

type ErrorBody = {
  error: {
    code: string;
    message: string;
    traceId?: string;
  };
};

type BillingSubscriptionStatus = 'trialing' | 'active';

type BillingSubscriptionLookup = {
  status: BillingSubscriptionStatus;
};

type BillingCustomerLookup = {
  stripe_customer_id: string;
  trial_started_at: string | null;
};

type BillingCustomerUpsert = {
  user_id: string;
  stripe_customer_id: string;
  email: string | null;
};

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim() ?? '';

if (!stripeSecretKey || !supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !appBaseUrl) {
  throw new Error('Missing required environment variables for checkout session creation.');
}

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

function jsonResponse(body: unknown, status = 200, traceId?: string): Response {
  const headers: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': 'application/json',
  };

  if (traceId) {
    headers['x-trace-id'] = traceId;
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function errorResponse(code: string, message: string, status: number, traceId?: string): Response {
  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(traceId ? { traceId } : {}),
    },
  };

  return jsonResponse(body, status, traceId);
}

function isStrictPlanKey(planKey: string): planKey is BillingPlanKey {
  return planKey === 'starter' || planKey === 'pro';
}

function isAllowedOrigin(url: URL, allowedAppOrigin: string): boolean {
  if (url.origin === allowedAppOrigin) {
    return true;
  }

  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

function parseAndValidateUrl(input: string, allowedAppOrigin: string): URL | null {
  try {
    const parsed = new URL(input);
    if (!isAllowedOrigin(parsed, allowedAppOrigin)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function normalizeOptionalTimestamp(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (Number.isNaN(Date.parse(trimmed))) {
    return { ok: false };
  }
  return { ok: true, value: trimmed };
}

function validateRequest(payload: unknown, allowedAppOrigin: string): CheckoutRequest | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const { planKey, successUrl, cancelUrl, withdrawalConsentAcceptedAt, trialDisclosureAcceptedAt } = payload as Record<string, unknown>;

  if (typeof planKey !== 'string' || typeof successUrl !== 'string' || typeof cancelUrl !== 'string') {
    return null;
  }

  const normalizedPlanKey = planKey.trim();
  const normalizedSuccessUrl = successUrl.trim();
  const normalizedCancelUrl = cancelUrl.trim();

  if (!isStrictPlanKey(normalizedPlanKey) || normalizedSuccessUrl.length === 0 || normalizedCancelUrl.length === 0) {
    return null;
  }

  const withdrawalConsent = normalizeOptionalTimestamp(withdrawalConsentAcceptedAt);
  const trialDisclosure = normalizeOptionalTimestamp(trialDisclosureAcceptedAt);
  if (!withdrawalConsent.ok || !trialDisclosure.ok) {
    return null;
  }

  const parsedSuccessUrl = parseAndValidateUrl(normalizedSuccessUrl, allowedAppOrigin);
  const parsedCancelUrl = parseAndValidateUrl(normalizedCancelUrl, allowedAppOrigin);

  if (!parsedSuccessUrl || !parsedCancelUrl) {
    return null;
  }

  return {
    planKey: normalizedPlanKey,
    successUrl: parsedSuccessUrl.toString(),
    cancelUrl: parsedCancelUrl.toString(),
    withdrawalConsentAcceptedAt: withdrawalConsent.value,
    trialDisclosureAcceptedAt: trialDisclosure.value,
  };
}

function getTraceId(req: Request): string {
  return req.headers.get('x-trace-id')?.trim() || crypto.randomUUID();
}

function logError(traceId: string, message: string, details?: unknown): void {
  console.error(`[create-checkout-session][${traceId}] ${message}`, details ?? '');
}

Deno.serve(async (req: Request) => {
  const traceId = getTraceId(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'x-trace-id': traceId } });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed. Use POST.', 405, traceId);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse('UNAUTHORIZED', 'Missing authorization header.', 401, traceId);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized.', 401, traceId);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('INVALID_JSON', 'Invalid JSON payload.', 400, traceId);
  }

  let allowedAppOrigin: string;
  try {
    allowedAppOrigin = new URL(appBaseUrl).origin;
  } catch {
    logError(traceId, 'APP_BASE_URL is not a valid URL', appBaseUrl);
    return errorResponse('SERVER_MISCONFIGURED', 'Server configuration error.', 500, traceId);
  }

  const parsed = validateRequest(payload, allowedAppOrigin);
  if (!parsed) {
    return errorResponse(
      'VALIDATION_ERROR',
      'Invalid input. planKey must be starter|pro, success/cancel URLs must use allowed origins, '
        + 'and withdrawalConsentAcceptedAt/trialDisclosureAcceptedAt must be valid ISO timestamps if present.',
      400,
      traceId,
    );
  }

  const plan = getPlanByKey(parsed.planKey);
  if (!plan) {
    return errorResponse('INVALID_PLAN', 'Invalid billing plan.', 422, traceId);
  }

  const userId = authData.user.id;
  const userEmail = authData.user.email ?? undefined;

  const { data: existingSubscription, error: subscriptionCheckError } = await serviceClient
    .from('billing_subscriptions')
    .select('status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .limit(1)
    .maybeSingle<BillingSubscriptionLookup>();

  if (subscriptionCheckError) {
    logError(traceId, 'Failed to check existing subscriptions', subscriptionCheckError);
    return errorResponse('SUBSCRIPTION_CHECK_FAILED', 'Could not validate subscription status.', 422, traceId);
  }

  if (existingSubscription) {
    const statusCode = existingSubscription.status === 'active' ? 409 : 422;
    return errorResponse(
      'SUBSCRIPTION_EXISTS',
      'An active or trialing subscription already exists for this user.',
      statusCode,
      traceId,
    );
  }

  const { data: existingCustomer, error: existingCustomerError } = await serviceClient
    .from('billing_customers')
    .select('stripe_customer_id, trial_started_at')
    .eq('user_id', userId)
    .maybeSingle<BillingCustomerLookup>();

  if (existingCustomerError) {
    logError(traceId, 'Failed to fetch billing customer', existingCustomerError);
    return errorResponse('CUSTOMER_FETCH_FAILED', 'Unable to prepare checkout.', 500, traceId);
  }

  // Betreiber-Entscheidung (16.08.2026): 14 Tage kostenfrei auf den gewählten
  // Plan, genau einmal pro Nutzer. trial_started_at wird erst vom Webhook bei
  // status=trialing gesetzt (nicht hier), damit ein abgebrochener Checkout
  // die Berechtigung nicht verbraucht.
  const isTrialEligible = !existingCustomer?.trial_started_at;

  if (isTrialEligible && !parsed.trialDisclosureAcceptedAt) {
    return errorResponse(
      'TRIAL_DISCLOSURE_REQUIRED',
      'A 14-day trial applies to this checkout. trialDisclosureAcceptedAt is required.',
      400,
      traceId,
    );
  }
  if (!isTrialEligible && !parsed.withdrawalConsentAcceptedAt) {
    return errorResponse(
      'WITHDRAWAL_CONSENT_REQUIRED',
      'No trial is available for this account; the plan starts immediately as a paid service. '
        + 'withdrawalConsentAcceptedAt is required.',
      400,
      traceId,
    );
  }

  let stripeCustomerId = existingCustomer?.stripe_customer_id;

  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { user_id: userId },
      });
      stripeCustomerId = customer.id;
    } catch (error) {
      logError(traceId, 'Stripe customer creation failed', error);
      return errorResponse('CHECKOUT_CREATION_FAILED', 'Unable to create checkout session.', 502, traceId);
    }

    const customerPayload: BillingCustomerUpsert = {
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      email: userEmail ?? null,
    };
    const { error: customerError } = await serviceClient
      .from('billing_customers')
      .upsert(customerPayload, { onConflict: 'user_id' });

    if (customerError) {
      logError(traceId, 'Failed to store billing customer', customerError);
      return errorResponse('CUSTOMER_UPSERT_FAILED', 'Unable to prepare checkout.', 500, traceId);
    }
  }

  const sharedMetadata: Record<string, string> = {
    user_id: userId,
    plan_key: plan.planKey,
    price_id: plan.priceId,
    ...(parsed.withdrawalConsentAcceptedAt ? { withdrawal_consent_accepted_at: parsed.withdrawalConsentAcceptedAt } : {}),
    ...(parsed.trialDisclosureAcceptedAt ? { trial_disclosure_accepted_at: parsed.trialDisclosureAcceptedAt } : {}),
    trial_granted: String(isTrialEligible),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      success_url: parsed.successUrl,
      cancel_url: parsed.cancelUrl,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      client_reference_id: userId,
      // Betreiber-Entscheidung (16.08.2026): eine Zahlungsmethode wird auch
      // während der Testphase erfasst, damit die Abbuchung nach 14 Tagen
      // tatsächlich automatisch erfolgt (nicht nur eine Aufforderung ist).
      payment_method_collection: 'always',
      metadata: sharedMetadata,
      subscription_data: {
        ...(isTrialEligible ? { trial_period_days: 14 } : {}),
        metadata: sharedMetadata,
      },
    });

    return jsonResponse({ sessionId: session.id, url: session.url, trialGranted: isTrialEligible }, 200, traceId);
  } catch (error) {
    logError(traceId, 'Stripe checkout session creation failed', error);
    return errorResponse('CHECKOUT_CREATION_FAILED', 'Unable to create checkout session.', 502, traceId);
  }
});
