import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type BillingPortalFlowType = 'billing_history' | 'payment_method_update' | 'subscription_update';

type BillingPortalRequest = {
  returnUrl: string;
  flowType?: BillingPortalFlowType;
};


type StripeFlowData =
  | {
      type: 'payment_method_update';
    }
  | {
      type: 'subscription_update';
      subscription_update: {
        subscription: string;
      };
    }
  | undefined;

type ErrorBody = {
  error: {
    code: string;
    message: string;
    traceId?: string;
  };
};

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!stripeSecretKey || !supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Missing required environment variables for billing portal session creation.');
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

  return new Response(JSON.stringify(body), { status, headers });
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

function getTraceId(req: Request): string {
  return req.headers.get('x-trace-id')?.trim() || crypto.randomUUID();
}

function logError(traceId: string, message: string, details?: unknown): void {
  console.error(`[create-billing-portal-session][${traceId}] ${message}`, details ?? '');
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


function getAllowedAppOrigin(traceId: string): string | null {
  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim() ?? '';
  if (!appBaseUrl) {
    logError(traceId, 'APP_BASE_URL is missing');
    return null;
  }

  try {
    return new URL(appBaseUrl).origin;
  } catch {
    logError(traceId, 'APP_BASE_URL is not a valid URL', appBaseUrl);
    return null;
  }
}


function buildStripeFlowData(flowType: BillingPortalFlowType | undefined, subscriptionId: string | null): StripeFlowData {
  if (!flowType || flowType === 'billing_history') {
    return undefined;
  }

  if (flowType === 'payment_method_update') {
    return { type: 'payment_method_update' };
  }

  if (!subscriptionId) {
    return undefined;
  }

  return {
    type: 'subscription_update',
    subscription_update: {
      subscription: subscriptionId,
    },
  };
}

function validateRequest(payload: unknown, allowedAppOrigin: string): BillingPortalRequest | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const { returnUrl, flowType } = payload as Record<string, unknown>;
  if (typeof returnUrl !== 'string' || returnUrl.trim().length === 0) {
    return null;
  }
  if (
    flowType !== undefined &&
    flowType !== 'billing_history' &&
    flowType !== 'payment_method_update' &&
    flowType !== 'subscription_update'
  ) {
    return null;
  }

  const parsedReturnUrl = parseAndValidateUrl(returnUrl.trim(), allowedAppOrigin);
  if (!parsedReturnUrl) {
    return null;
  }

  return {
    returnUrl: parsedReturnUrl.toString(),
    flowType,
  };
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

  const allowedAppOrigin = getAllowedAppOrigin(traceId);
  if (!allowedAppOrigin) {
    return errorResponse(
      'SERVER_MISCONFIGURED',
      'Server configuration error: APP_BASE_URL is missing or invalid.',
      500,
      traceId,
    );
  }

  const parsed = validateRequest(payload, allowedAppOrigin);
  if (!parsed) {
    return errorResponse(
      'INVALID_RETURN_URL_ORIGIN',
      'Invalid input. returnUrl must use an allowed origin.',
      400,
      traceId,
    );
  }

  const userId = authData.user.id;

  const { data: billingCustomer, error: billingCustomerError } = await serviceClient
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle<{ stripe_customer_id: string }>();

  if (billingCustomerError) {
    logError(traceId, 'Failed to load billing customer.', billingCustomerError);
    return errorResponse('CUSTOMER_LOOKUP_FAILED', 'Billing-Kundendaten konnten nicht geladen werden.', 422, traceId);
  }

  const stripeCustomerId = billingCustomer?.stripe_customer_id?.trim() ?? '';
  if (!stripeCustomerId) {
    return errorResponse(
      'BILLING_CUSTOMER_NOT_FOUND',
      'Für dein Konto wurde noch kein Stripe-Kunde gefunden. Bitte schließe zuerst ein Abo ab.',
      404,
      traceId,
    );
  }

  const { data: billingSubscription, error: billingSubscriptionError } = await serviceClient
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status, current_period_end')
    .eq('user_id', userId)
    .not('stripe_subscription_id', 'is', null)
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle<{ stripe_subscription_id: string; status: string | null; current_period_end: string | null }>();

  if (billingSubscriptionError) {
    logError(traceId, 'Failed to load billing subscription.', billingSubscriptionError);
    return errorResponse('SUBSCRIPTION_LOOKUP_FAILED', 'Abo-Daten konnten nicht geladen werden.', 422, traceId);
  }

  const stripeFlowData = buildStripeFlowData(parsed.flowType, billingSubscription?.stripe_subscription_id ?? null);

  if (parsed.flowType === 'subscription_update' && !stripeFlowData) {
    return errorResponse(
      'BILLING_SUBSCRIPTION_NOT_FOUND',
      'Für dein Konto wurde kein Stripe-Abo gefunden, das aktualisiert werden kann.',
      404,
      traceId,
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: parsed.returnUrl,
      flow_data: stripeFlowData,
    });

    return jsonResponse({ url: session.url }, 200, traceId);
  } catch (error) {
    logError(traceId, 'Stripe billing portal session creation failed.', error);
    return errorResponse(
      'BILLING_PORTAL_CREATION_FAILED',
      'Billing-Portal konnte nicht geöffnet werden. Bitte versuche es erneut.',
      502,
      traceId,
    );
  }
});
