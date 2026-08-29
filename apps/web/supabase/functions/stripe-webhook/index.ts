import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    // Wirtschaftlichkeitsprüfung 21.08.2026: 1 Session/Tag statt 3 macht das
    // Worst-Case-Kostenrisiko planbar (1×Länge statt Sessions×Länge) und deckt
    // sich mit dem, was Nutzer an fokussierter Sprechzeit pro Tag realistisch
    // durchhalten (Konkurrenzvergleich: 10-30 Min/Tag ist Branchenstandard).
    sessionsPerDayLimit: 1,
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
    // Starter und Pro haben jetzt dieselbe Sprechzeit (1×15 Min) - der
    // Pro-Mehrwert ist der strukturierte Coach (TutorPage.tsx-Gate auf
    // planKey === 'pro'), nicht mehr Audiominuten. Damit ist das
    // Kostenprofil beider Pläne identisch, nur der Preis unterscheidet sich.
    sessionsPerDayLimit: 1,
    maxSessionLengthSeconds: 900,
    dailyConversationSecondsLimit: null,
    monthlyTokenLimit: 1200000,
  },
];

// Pricing-Umstellung Phase 2 (27.08.2026): dieselben Free-Limits wie im
// grant_free_entitlement()-Trigger (Migration 20260827170000, korrigiert auf 3 Minuten in
// 20260827190000 -- 2 Minuten waren zu riskant für insufficient_data -- und auf 200.000
// Tokens/Monat in 20260827200000, da 100.000 bei täglicher Nutzung schon nach ~14-15 Sessions
// gegriffen hätte) -- kein eigener Stripe-Preis, deshalb kein Eintrag in PLAN_CONFIGS (das
// Array ist priceId-indiziert). Wird verwendet, wenn eine Subscription endgültig endet (siehe
// upsertSubscriptionAndEntitlements): der Nutzer fällt auf Free zurück statt komplett gesperrt
// zu werden.
const FREE_PLAN_CONFIG = {
  planKey: 'free' as const,
  sessionsPerDayLimit: 1,
  maxSessionLengthSeconds: 180,
  dailyConversationSecondsLimit: null,
  monthlyTokenLimit: 200000,
};

function getPlanByPriceId(priceId: string): BillingPlanConfig | null {
  return PLAN_CONFIGS.find((plan) => plan.priceId === priceId) ?? null;
}

function normalizePlanKey(value?: string | null): BillingPlanKey | null {
  if (!value) return null;
  if (value === 'starter' || value === 'pro') return value;
  return null;
}

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing required environment variables for Stripe webhook handler.');
}

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

type EntitlementStatus = 'active' | 'grace' | 'suspended' | 'expired';
type BillingEventStatus = 'processing' | 'processed' | 'failed';

type BillingEventBaseUpdate = {
  event_type?: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  user_id: string | null;
};

type BillingEventExtendedUpdate = BillingEventBaseUpdate & {
  processing_status?: BillingEventStatus;
  processing_error: string | null;
};

type BillingEventInsertPayload = {
  stripe_event_id: string;
  event_type: string;
  payload: Stripe.Event;
  processing_status?: BillingEventStatus;
};

type BillingSubscriptionUpsert = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  plan_key: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  metadata: Record<string, string | undefined>;
};

type BillingCustomerUpsert = {
  user_id: string;
  stripe_customer_id: string;
  email: string | null;
};

type BillingCustomerUserLookup = {
  user_id: string;
};

type StripeSubscriptionStatusForEntitlements =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'paused'
  | 'canceled'
  | 'incomplete_expired';

// Konsistentes Mapping Stripe -> user_entitlements.status:
// active|trialing -> active
// past_due -> grace
// unpaid|incomplete|paused -> suspended
// canceled|incomplete_expired -> expired
const SUBSCRIPTION_STATUS_TO_ENTITLEMENT_STATUS: Record<StripeSubscriptionStatusForEntitlements, EntitlementStatus> = {
  trialing: 'active',
  active: 'active',
  past_due: 'grace',
  unpaid: 'suspended',
  canceled: 'expired',
  incomplete: 'suspended',
  incomplete_expired: 'expired',
  paused: 'suspended',
};

function mapSubscriptionStatusToEntitlementStatus(subscriptionStatus: string): EntitlementStatus {
  const entitlementStatus =
    SUBSCRIPTION_STATUS_TO_ENTITLEMENT_STATUS[subscriptionStatus as StripeSubscriptionStatusForEntitlements];

  if (!entitlementStatus) {
    throw new Error(
      `Unsupported Stripe subscription status "${subscriptionStatus}" for entitlement sync. Expected one of: ${Object.keys(
        SUBSCRIPTION_STATUS_TO_ENTITLEMENT_STATUS,
      ).join(', ')}`,
    );
  }

  return entitlementStatus;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toIsoOrNull(unixSeconds?: number | null): string | null {
  return typeof unixSeconds === 'number' ? new Date(unixSeconds * 1000).toISOString() : null;
}

function isMissingColumnError(error: { message?: string } | null): boolean {
  if (!error?.message) return false;
  return error.message.includes('column') && error.message.includes('does not exist');
}

async function updateBillingEvent(params: {
  stripeEventId: string;
  eventType?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  userId?: string | null;
  processingStatus?: 'processing' | 'processed' | 'failed';
  processingError?: string | null;
}) {
  const baseUpdate: BillingEventBaseUpdate = {
    event_type: params.eventType,
    stripe_customer_id: params.stripeCustomerId ?? null,
    stripe_subscription_id: params.stripeSubscriptionId ?? null,
    user_id: params.userId ?? null,
  };

  const extendedUpdate: BillingEventExtendedUpdate = {
    ...baseUpdate,
    processing_status: params.processingStatus,
    processing_error: params.processingError ?? null,
  };

  const { error: updateError } = await supabase
    .from('billing_events')
    .update(extendedUpdate)
    .eq('stripe_event_id', params.stripeEventId);

  if (isMissingColumnError(updateError)) {
    const { error: fallbackUpdateError } = await supabase
      .from('billing_events')
      .update(baseUpdate)
      .eq('stripe_event_id', params.stripeEventId);

    if (fallbackUpdateError) {
      throw new Error(`Failed to update billing event: ${fallbackUpdateError.message}`);
    }
    return;
  }

  if (updateError) {
    throw new Error(`Failed to update billing event: ${updateError.message}`);
  }
}

async function upsertSubscriptionAndEntitlements(params: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  preferredPlanKey?: string | null;
  subscriptionStatus: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  metadata: Record<string, string | undefined>;
}) {
  // Plan-Auflösung:
  // 1) subscription.metadata.plan_key (wenn gültig), 2) Price-ID-Mapping,
  // 3) defensiver Fallback auf "starter" nur als letzter Ausweg.
  const metadataPlanKey = normalizePlanKey(params.preferredPlanKey);
  const mappedPlan = params.stripePriceId ? getPlanByPriceId(params.stripePriceId) : null;
  const planKey = metadataPlanKey ?? mappedPlan?.planKey ?? 'starter';
  const plan = planKey === mappedPlan?.planKey ? mappedPlan : PLAN_CONFIGS.find((cfg) => cfg.planKey === planKey) ?? null;
  const entitlementStatus = mapSubscriptionStatusToEntitlementStatus(params.subscriptionStatus);

  const subscriptionPayload: BillingSubscriptionUpsert = {
    user_id: params.userId,
    stripe_customer_id: params.stripeCustomerId,
    stripe_subscription_id: params.stripeSubscriptionId,
    stripe_price_id: params.stripePriceId,
    plan_key: planKey,
    status: params.subscriptionStatus,
    current_period_start: params.currentPeriodStart,
    current_period_end: params.currentPeriodEnd,
    cancel_at_period_end: params.cancelAtPeriodEnd,
    canceled_at: params.canceledAt,
    metadata: params.metadata,
  };
  const { error: subError } = await supabase
    .from('billing_subscriptions')
    .upsert(subscriptionPayload, { onConflict: 'stripe_subscription_id' });

  if (subError) {
    throw new Error(`Failed to upsert subscription: ${subError.message}`);
  }

  // Pricing-Umstellung Phase 2: 'expired' bedeutet, dass die Subscription endgültig beendet ist
  // (canceled/incomplete_expired, siehe SUBSCRIPTION_STATUS_TO_ENTITLEMENT_STATUS) -- dafür gibt
  // es keine weiteren Stripe-Events mehr, die die Zeile später korrigieren würden. Der Nutzer
  // fällt deshalb auf das Free-Tier zurück (aktiv, nutzbar) statt dauerhaft gesperrt zu bleiben.
  // 'grace'/'suspended' (Zahlungsprobleme, potenziell noch behebbar) bleiben unverändert als
  // echte Blockade -- dort soll der Zahlungsdruck bestehen bleiben.
  const isDefinitivelyEnded = entitlementStatus === 'expired';
  const effectivePlanKey = isDefinitivelyEnded ? 'free' : planKey;
  const effectiveStatus = isDefinitivelyEnded ? 'active' : entitlementStatus;
  const effectiveLimits = isDefinitivelyEnded ? FREE_PLAN_CONFIG : plan;

  const { error: entitlementError } = await supabase.rpc('sync_user_entitlements_from_billing', {
    p_user_id: params.userId,
    p_plan_key: effectivePlanKey,
    p_status: effectiveStatus,
    p_current_period_start: params.currentPeriodStart,
    p_current_period_end: params.currentPeriodEnd,
    p_sessions_per_day_limit: effectiveLimits?.sessionsPerDayLimit ?? 3,
    p_max_session_length_seconds: effectiveLimits?.maxSessionLengthSeconds ?? 900,
    p_daily_conversation_seconds_limit: effectiveLimits?.dailyConversationSecondsLimit ?? null,
    p_monthly_token_limit: effectiveLimits?.monthlyTokenLimit ?? null,
  });

  if (entitlementError) {
    throw new Error(`Failed to sync entitlements: ${entitlementError.message}`);
  }

  // Betreiber-Entscheidung (16.08.2026): 14-Tage-Testphase gilt als "verbraucht",
  // sobald ein echtes trialing-Event eintrifft (nicht schon beim Erstellen der
  // Checkout-Session) -- ein abgebrochener Checkout darf die Berechtigung nicht
  // verbrauchen. Bedingtes Update (nur wenn noch null) macht das idempotent bei
  // wiederholten trialing-Events derselben Subscription.
  if (params.subscriptionStatus === 'trialing') {
    const { error: trialMarkError } = await supabase
      .from('billing_customers')
      .update({ trial_started_at: new Date().toISOString() })
      .eq('user_id', params.userId)
      .is('trial_started_at', null);

    if (trialMarkError) {
      throw new Error(`Failed to mark trial as started: ${trialMarkError.message}`);
    }
  }
}

async function resolveUserId(input: {
  stripeCustomerId?: string;
  fallbackUserId?: string;
}): Promise<string | null> {
  if (input.fallbackUserId) {
    return input.fallbackUserId;
  }

  if (!input.stripeCustomerId) {
    return null;
  }

  const { data } = await supabase
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', input.stripeCustomerId)
    .maybeSingle<BillingCustomerUserLookup>();

  return data?.user_id ?? null;
}

async function resolveUserIdForSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? undefined;

  // User-Auflösung:
  // 1) subscription.metadata.user_id
  // 2) checkout.session.client_reference_id / metadata.user_id
  // 3) billing_customers.stripe_customer_id
  if (subscription.metadata.user_id) {
    return subscription.metadata.user_id;
  }

  const checkoutSessions = await stripe.checkout.sessions.list({
    subscription: subscription.id,
    limit: 1,
  });
  const checkoutSession = checkoutSessions.data[0];
  if (checkoutSession?.client_reference_id || checkoutSession?.metadata?.user_id) {
    return checkoutSession.client_reference_id ?? checkoutSession.metadata?.user_id ?? null;
  }

  return await resolveUserId({ stripeCustomerId });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Use POST.' }, 405);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return jsonResponse({ error: 'Missing stripe-signature header.' }, 400);
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
  } catch {
    return jsonResponse({ error: 'Invalid webhook signature.' }, 400);
  }

  const gatekeeperPayload: BillingEventInsertPayload = {
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event,
    processing_status: 'processing',
  };
  const { data: gatekeeperRows, error: gatekeeperError } = await supabase
    .from('billing_events')
    .insert(gatekeeperPayload, { onConflict: 'stripe_event_id', ignoreDuplicates: true })
    .select('id')
    .limit(1);

  if (isMissingColumnError(gatekeeperError)) {
    const fallbackGatekeeperPayload: BillingEventInsertPayload = {
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event,
    };
    const { data: fallbackGatekeeperRows, error: fallbackGatekeeperError } = await supabase
      .from('billing_events')
      .insert(fallbackGatekeeperPayload, { onConflict: 'stripe_event_id', ignoreDuplicates: true })
      .select('id')
      .limit(1);

    if (fallbackGatekeeperError) {
      return jsonResponse({ error: `Failed to persist billing event: ${fallbackGatekeeperError.message}` }, 500);
    }

    if (!fallbackGatekeeperRows?.[0]?.id) {
      return jsonResponse({ received: true, duplicate: true });
    }
  } else if (gatekeeperError) {
    return jsonResponse({ error: `Failed to persist billing event: ${gatekeeperError.message}` }, 500);
  } else if (!gatekeeperRows?.[0]?.id) {
    return jsonResponse({ received: true, duplicate: true });
  }

  let userId: string | null = null;
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
        stripeSubscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
        userId = await resolveUserId({
          stripeCustomerId: stripeCustomerId ?? undefined,
          fallbackUserId: session.client_reference_id ?? session.metadata?.user_id,
        });

        if (userId && stripeCustomerId) {
          const customerPayload: BillingCustomerUpsert = {
            user_id: userId,
            stripe_customer_id: stripeCustomerId,
            email: session.customer_details?.email ?? null,
          };
          await supabase.from('billing_customers').upsert(customerPayload, { onConflict: 'user_id' });
        }

        if (stripeSubscriptionId && stripeCustomerId) {
          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const firstItem = subscription.items.data[0];
          const resolvedUserId = userId ?? (await resolveUserIdForSubscription(subscription));

          if (resolvedUserId) {
            userId = resolvedUserId;
            await upsertSubscriptionAndEntitlements({
              userId: resolvedUserId,
              stripeCustomerId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: firstItem?.price?.id ?? null,
              preferredPlanKey: subscription.metadata.plan_key,
              subscriptionStatus: subscription.status,
              currentPeriodStart: toIsoOrNull(firstItem?.current_period_start ?? null),
              currentPeriodEnd: toIsoOrNull(firstItem?.current_period_end ?? null),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              canceledAt: toIsoOrNull(subscription.canceled_at),
              metadata: subscription.metadata,
            });
          }
        }

        break;
      }
      // invoice.payment_succeeded ist der primäre Erfolgs-Event;
      // invoice.paid wird aus Kompatibilitätsgründen weiterhin mitbehandelt.
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        stripeCustomerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
        stripeSubscriptionId =
          typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null;
        userId = await resolveUserId({ stripeCustomerId: stripeCustomerId ?? undefined });

        if (stripeSubscriptionId && stripeCustomerId) {
          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const firstItem = subscription.items.data[0];
          const resolvedUserId = userId ?? (await resolveUserIdForSubscription(subscription));

          if (resolvedUserId) {
            userId = resolvedUserId;
            await upsertSubscriptionAndEntitlements({
              userId: resolvedUserId,
              stripeCustomerId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: firstItem?.price?.id ?? null,
              preferredPlanKey: subscription.metadata.plan_key,
              subscriptionStatus: event.type === 'invoice.payment_failed' ? 'past_due' : subscription.status,
              currentPeriodStart: toIsoOrNull(firstItem?.current_period_start ?? null),
              currentPeriodEnd: toIsoOrNull(firstItem?.current_period_end ?? null),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              canceledAt: toIsoOrNull(subscription.canceled_at),
              metadata: subscription.metadata,
            });
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        stripeSubscriptionId = subscription.id;
        userId = await resolveUserIdForSubscription(subscription);

        if (userId && stripeCustomerId) {
          const firstItem = subscription.items.data[0];

          await upsertSubscriptionAndEntitlements({
            userId,
            stripeCustomerId,
            stripeSubscriptionId,
            stripePriceId: firstItem?.price?.id ?? null,
            preferredPlanKey: subscription.metadata.plan_key,
            subscriptionStatus: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
            currentPeriodStart: toIsoOrNull(firstItem?.current_period_start ?? null),
            currentPeriodEnd: toIsoOrNull(firstItem?.current_period_end ?? null),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: toIsoOrNull(subscription.canceled_at),
            metadata: subscription.metadata,
          });
        }

        break;
      }
      default:
        break;
    }

    await updateBillingEvent({
      stripeEventId: event.id,
      eventType: event.type,
      stripeCustomerId,
      stripeSubscriptionId,
      userId,
      processingStatus: 'processed',
      processingError: null,
    });

    return jsonResponse({ received: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Webhook processing failed.';
    try {
      await updateBillingEvent({
        stripeEventId: event.id,
        eventType: event.type,
        stripeCustomerId,
        stripeSubscriptionId,
        userId,
        processingStatus: 'failed',
        processingError: errorMessage,
      });
    } catch {
      // Die ursprüngliche Processing-Exception hat Vorrang.
    }

    return jsonResponse({ error: errorMessage }, 500);
  }
});
