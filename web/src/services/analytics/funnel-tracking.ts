import { supabaseClient } from '@/services/supabase/client';
import { consentService } from '@/services/consent/consent.service';

export type FunnelEventName =
  | 'landing_viewed'
  | 'pricing_viewed'
  | 'signup_started'
  | 'signup_completed'
  | 'checkout_started'
  | 'checkout_completed'
  | 'payment_succeeded';

type FunnelEventPayloadMap = {
  landing_viewed: {
    surface: 'landing_page';
  };
  pricing_viewed: {
    surface: 'public_pricing' | 'billing_pricing';
    planCount?: number;
  };
  signup_started: {
    source: 'public_pricing' | 'register_page';
    planName?: string;
    destination?: 'register' | 'billing_pricing' | 'session_new';
  };
  signup_completed: {
    verificationRequired: boolean;
  };
  checkout_started: {
    planKey: string;
    currentPlanKey?: string | null;
  };
  checkout_completed: {
    surface: 'billing_pricing';
  };
  payment_succeeded: {
    source: 'stripe_webhook';
  };
};

export type FunnelEventPayload<TEvent extends FunnelEventName> = FunnelEventPayloadMap[TEvent];

type TrackingEnvelope<TEvent extends FunnelEventName> = {
  event: TEvent;
  payload: FunnelEventPayload<TEvent>;
  occurredAt: string;
  traceId: string;
};


declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const TRACE_STORAGE_KEY = 'articlio_funnel_trace_id';

function resolveTraceId(): string {
  const existing = window.localStorage.getItem(TRACE_STORAGE_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(TRACE_STORAGE_KEY, next);
  return next;
}

async function persistFunnelEvent<TEvent extends FunnelEventName>(
  event: TEvent,
  payload: FunnelEventPayload<TEvent>,
  occurredAt: string,
  traceId: string,
): Promise<void> {
  const source = 'source' in payload && typeof payload.source === 'string' ? payload.source : null;
  const planKey = 'planKey' in payload && typeof payload.planKey === 'string' ? payload.planKey : null;

  const { error } = await (supabaseClient as any).rpc('track_funnel_event', {
    p_event_name: event,
    p_occurred_at: occurredAt,
    p_trace_id: traceId,
    p_session_id: null,
    p_source: source,
    p_plan_key: planKey,
    p_payload: payload,
  });

  if (error) {
    throw new Error(error.message);
  }
}

const trackFunnelEvent = <TEvent extends FunnelEventName>(
  event: TEvent,
  payload: FunnelEventPayload<TEvent>,
): void => {
  // §25 Abs. 1 TDDDG: ohne Einwilligung weder Trace-ID im localStorage
  // ablegen noch Ereignisse an dataLayer oder Backend geben.
  if (!consentService.isAnalyticsAllowed()) {
    if (import.meta.env.DEV) {
      console.info('[funnel-event][consent-denied]', event);
    }
    return;
  }

  const traceId = resolveTraceId();
  const occurredAt = new Date().toISOString();
  const envelope: TrackingEnvelope<TEvent> = {
    event,
    payload,
    occurredAt,
    traceId,
  };

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(envelope as Record<string, unknown>);
  }

  void persistFunnelEvent(event, payload, occurredAt, traceId).catch((error) => {
    if (import.meta.env.DEV) {
      console.warn('[funnel-event][persist-failed]', error);
    }
  });

  if (import.meta.env.DEV) {
    console.info('[funnel-event]', envelope);
  }
};

export const funnelTracking = {
  trackFunnelEvent,
};
