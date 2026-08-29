import { supabaseClient } from '@/services/supabase/client';

type BillingEventProcessingStatus = 'processing' | 'processed' | 'failed' | 'pending';

export type AdminBillingEventItem = {
  id: string;
  eventType: string;
  stripeEventId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  userId: string | null;
  processingStatus: BillingEventProcessingStatus;
  processingError: string | null;
  traceId: string | null;
  processedAt: string;
  createdAt: string;
  updatedAt: string;
};

const adminSelect =
  'id, event_type, stripe_event_id, stripe_customer_id, stripe_subscription_id, user_id, processing_status, processing_error, processed_at, created_at, updated_at, payload';

function safeTraceId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const traceId = (payload as Record<string, unknown>).trace_id;
  return typeof traceId === 'string' && traceId.length > 0 ? traceId : null;
}

function toAdminItem(row: Record<string, unknown>): AdminBillingEventItem {
  return {
    id: String(row.id),
    eventType: String(row.event_type),
    stripeEventId: String(row.stripe_event_id),
    stripeCustomerId: typeof row.stripe_customer_id === 'string' ? row.stripe_customer_id : null,
    stripeSubscriptionId: typeof row.stripe_subscription_id === 'string' ? row.stripe_subscription_id : null,
    userId: typeof row.user_id === 'string' ? row.user_id : null,
    processingStatus: (row.processing_status as BillingEventProcessingStatus) ?? 'failed',
    processingError: typeof row.processing_error === 'string' ? row.processing_error : null,
    traceId: safeTraceId(row.payload),
    processedAt: String(row.processed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const adminBillingEventsService = {
  async listRecent(limit = 200): Promise<AdminBillingEventItem[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.round(limit)));
    const { data, error } = await supabaseClient
      .from('billing_events')
      .select(adminSelect)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      throw new Error(`Billing-Events konnten nicht geladen werden: ${error.message}`);
    }

    return (data ?? []).map((row) => toAdminItem(row as Record<string, unknown>));
  },

  async retryEvent(eventId: string): Promise<void> {
    const { error } = await supabaseClient
      .from('billing_events')
      .update({ processing_status: 'pending', processing_error: null, updated_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) {
      throw new Error(`Retry für Billing-Event fehlgeschlagen: ${error.message}`);
    }
  },
};
