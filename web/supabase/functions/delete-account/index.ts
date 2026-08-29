import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Launch-Readiness-Audit, Welle 1 Punkt 4 (DSGVO Art. 17, Recht auf Löschung):
// Selbstbedienungs-Löschung des eigenen Kontos. Die Postgres-Tabellen
// (profiles, conversation_sessions, session_transcripts, session_analyses,
// detected_patterns, focus_topics, user_entitlements, billing_customers,
// billing_subscriptions, user_usage_ledger, user_usage_daily_aggregates)
// hängen alle per FK-Kette mit ON DELETE CASCADE an profiles.id -> auth.users.id
// (billing_events/funnel_events nutzen bewusst SET NULL, um anonymisierte
// Aufzeichnungen zu behalten). `auth.admin.deleteUser` löst diese Kette aus --
// diese Function übernimmt nur, was NICHT automatisch kaskadiert: das
// Stripe-Abo kündigen und die Audio-Dateien im Storage-Bucket entfernen.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SESSION_AUDIO_BUCKET = 'session-audio';
// Bewusst kein übersetzbarer Text -- ein fixer, aus dem UI-Bestätigungsdialog
// übernommener Wert schützt vor versehentlichen/fehlerhaften Aufrufen, ist
// aber kein Sicherheitsmechanismus (Selbstlöschung ist für den eingeloggten
// Nutzer ohnehin immer erlaubt).
const REQUIRED_CONFIRMATION = 'DELETE_MY_ACCOUNT';

function jsonResponse(body: unknown, status = 200, traceId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(traceId ? { 'x-trace-id': traceId } : {}),
    },
  });
}

function errorResponse(code: string, message: string, status: number, traceId?: string): Response {
  return jsonResponse({ error: { code, message, ...(traceId ? { traceId } : {}) } }, status, traceId);
}

function getTraceId(req: Request): string {
  return req.headers.get('x-trace-id')?.trim() || crypto.randomUUID();
}

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!stripeSecretKey || !supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error('Missing required environment variables for account deletion.');
}

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

type BillingSubscriptionLookup = {
  stripe_subscription_id: string;
  status: string;
};

async function cancelActiveStripeSubscriptions(serviceClient: ReturnType<typeof createClient>, userId: string, traceId: string): Promise<void> {
  const { data, error } = await serviceClient
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .returns<BillingSubscriptionLookup[]>();

  if (error) {
    console.error(`[delete-account][${traceId}] failed to look up subscriptions`, error);
    return;
  }

  for (const subscription of data ?? []) {
    try {
      // Sofortige Kündigung statt "at period end" -- das Konto wird gelöscht,
      // eine weitere Abrechnung für einen dann nicht mehr existierenden
      // Account wäre falsch.
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    } catch (stripeError) {
      // Das Recht auf Löschung darf nicht an einer Stripe-API-Störung
      // scheitern -- best effort, Löschung läuft trotzdem weiter.
      console.error(`[delete-account][${traceId}] failed to cancel subscription ${subscription.stripe_subscription_id}`, stripeError);
    }
  }
}

async function deleteSessionAudioFiles(serviceClient: ReturnType<typeof createClient>, userId: string, traceId: string): Promise<void> {
  try {
    const { data: sessionFolders, error: listError } = await serviceClient.storage
      .from(SESSION_AUDIO_BUCKET)
      .list(userId);

    if (listError) {
      console.error(`[delete-account][${traceId}] failed to list session-audio folders`, listError);
      return;
    }

    const allObjectPaths: string[] = [];
    for (const folder of sessionFolders ?? []) {
      if (!folder.name) continue;
      const sessionPath = `${userId}/${folder.name}`;
      const { data: files, error: filesError } = await serviceClient.storage
        .from(SESSION_AUDIO_BUCKET)
        .list(sessionPath);

      if (filesError) {
        console.error(`[delete-account][${traceId}] failed to list files under ${sessionPath}`, filesError);
        continue;
      }

      for (const file of files ?? []) {
        if (file.name) allObjectPaths.push(`${sessionPath}/${file.name}`);
      }
    }

    if (allObjectPaths.length > 0) {
      const { error: removeError } = await serviceClient.storage.from(SESSION_AUDIO_BUCKET).remove(allObjectPaths);
      if (removeError) {
        console.error(`[delete-account][${traceId}] failed to remove session-audio files`, removeError);
      }
    }
  } catch (storageError) {
    console.error(`[delete-account][${traceId}] unexpected storage cleanup error`, storageError);
  }
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

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('INVALID_JSON', 'Invalid JSON payload.', 400, traceId);
  }

  const confirm = (payload as Record<string, unknown> | null)?.confirm;
  if (confirm !== REQUIRED_CONFIRMATION) {
    return errorResponse('CONFIRMATION_REQUIRED', `Request body must include { "confirm": "${REQUIRED_CONFIRMATION}" }.`, 400, traceId);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return errorResponse('UNAUTHORIZED', 'Invalid or expired user token.', 401, traceId);
  }

  const userId = authData.user.id;
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  await cancelActiveStripeSubscriptions(serviceClient, userId, traceId);
  await deleteSessionAudioFiles(serviceClient, userId, traceId);

  const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error(`[delete-account][${traceId}] auth.admin.deleteUser failed`, deleteUserError);
    return errorResponse('DELETE_FAILED', 'Account could not be deleted. Please try again or contact support.', 500, traceId);
  }

  return jsonResponse({ ok: true, traceId }, 200, traceId);
});
