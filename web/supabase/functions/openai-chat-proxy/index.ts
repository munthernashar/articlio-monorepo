import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_BASE_URL = Deno.env.get('APP_BASE_URL')?.trim() ?? '';

function resolveCorsOrigin(): string {
  if (!APP_BASE_URL) return '*';
  try {
    return new URL(APP_BASE_URL).origin;
  } catch {
    return '*';
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': resolveCorsOrigin(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

// Launch-Readiness-Audit, Befund A: dieser Proxy prüfte bislang nur, dass ein
// gültiger User-Token vorliegt, und leitete den kompletten Request-Body
// ungeprüft an OpenAI weiter – beliebiges Modell, beliebige
// max_output_tokens, auf den Server-API-Key. Diese Allowlist/Deckel
// verhindert das, ohne den Aufrufer (`openai-api.service.ts`) zu ändern.
//
// Bewusste Grenze: der Proxy bekommt seit 21.08.2026 zwar `prompt_key` mit
// (siehe COACH_EXCLUSIVE_PROMPT_PREFIX-Prüfung unten), nutzt das aber nur für
// die Plan-Gate-Prüfung von coach_*-Prompts – keine echte Token-Reservierung
// (`reserve_user_tokens`) wie bei `process-session`, ohne den
// Reservierungszyklus des Aufrufers (`prompt-execution.service.ts`) zu
// duplizieren. Allowlist + Kappung reduzieren den Schaden bei einer direkten,
// den Client umgehenden Anfrage auf bekannte, günstige Modelle mit
// begrenzter Ausgabelänge – kein vollständiger Ersatz für serverseitige
// Kontingentprüfung pro Nutzer.
const ALLOWED_MODELS = new Set(['gpt-4.1-mini', 'gpt-5-mini']);
const MAX_OUTPUT_TOKENS_CAP = 4000;

type ProxyError = {
  code: 'unauthorized' | 'rate_limited' | 'upstream_error' | 'invalid_request';
  message: string;
};

function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

function mapUpstreamError(status: number): ProxyError {
  if (status === 401) {
    return {
      code: 'unauthorized',
      message: 'OpenAI authentication failed. Check OPENAI_API_KEY on the server.',
    };
  }

  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'OpenAI rate limit reached. Please retry shortly.',
    };
  }

  if (status >= 500) {
    return {
      code: 'upstream_error',
      message: 'OpenAI is currently unavailable. Please retry later.',
    };
  }

  return {
    code: 'invalid_request',
    message: 'OpenAI request was rejected. Please verify request payload.',
  };
}

function validateAndCapPayload(
  payload: unknown,
): { ok: true; body: Record<string, unknown>; promptKey: string | null } | { ok: false; message: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }

  const body = payload as Record<string, unknown>;
  const model = body.model;
  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    return { ok: false, message: `Model must be one of: ${Array.from(ALLOWED_MODELS).join(', ')}.` };
  }

  const requestedMaxTokens = body.max_output_tokens;
  const cappedMaxTokens =
    typeof requestedMaxTokens === 'number' && Number.isFinite(requestedMaxTokens)
      ? Math.max(1, Math.min(requestedMaxTokens, MAX_OUTPUT_TOKENS_CAP))
      : MAX_OUTPUT_TOKENS_CAP;

  const promptKey = typeof body.prompt_key === 'string' && body.prompt_key.trim().length > 0 ? body.prompt_key.trim() : null;
  // prompt_key ist nur eine Anweisung an diesen Proxy (siehe COACH_EXCLUSIVE_PROMPT_PREFIX
  // unten) und kein OpenAI-Request-Feld - nicht an die Responses API weiterleiten.
  const { prompt_key: _promptKey, ...forwardBody } = body;

  return {
    ok: true,
    promptKey,
    body: {
      ...forwardBody,
      max_output_tokens: cappedMaxTokens,
    },
  };
}

// Der strukturierte Coach (die 5 coach_*-Trainingspfade) ist seit der
// Preisumstellung 21.08.2026 Pro-exklusiv. TutorPage.tsx mountet die
// Coach-Workspace für Nicht-Pro-Nutzer erst gar nicht, aber dieser Proxy ist
// der einzige echte serverseitige Durchsetzungspunkt für alle nicht-process-
// session-Prompts (siehe Kommentar zu ALLOWED_MODELS oben) - ohne diese
// Prüfung könnte ein direkter Aufruf gegen diese Function die UI-Sperre
// umgehen.
const COACH_EXCLUSIVE_PROMPT_PREFIX = 'coach_';

async function isUserOnProPlan(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_entitlements')
    .select('plan_key')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.plan_key === 'pro';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: { code: 'invalid_request', message: 'Method not allowed. Use POST.' } },
      405,
    );
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse(
      {
        error: {
          code: 'unauthorized',
          message: 'Server secret OPENAI_API_KEY is not configured.',
        },
      },
      500,
    );
  }

  const traceId = req.headers.get('X-Trace-Id') ?? crypto.randomUUID();

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: { code: 'unauthorized', message: 'Missing Authorization header.' }, traceId }, 401);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse({ error: { code: 'unauthorized', message: 'Supabase auth configuration missing on server.' }, traceId }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: { code: 'unauthorized', message: 'Invalid or expired user token.' }, traceId }, 401);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(
      { error: { code: 'invalid_request', message: 'Invalid JSON payload.' }, traceId },
      400,
    );
  }

  const validated = validateAndCapPayload(payload);
  if (!validated.ok) {
    return jsonResponse(
      { error: { code: 'invalid_request', message: validated.message }, traceId },
      400,
    );
  }

  if (validated.promptKey?.startsWith(COACH_EXCLUSIVE_PROMPT_PREFIX)) {
    const isPro = await isUserOnProPlan(supabase, authData.user.id);
    if (!isPro) {
      return jsonResponse(
        {
          error: {
            code: 'invalid_request',
            message: 'Der strukturierte Coach ist ein Pro-Feature. Bitte upgraden, um fortzufahren.',
          },
          traceId,
        },
        403,
      );
    }
  }

  const upstreamResponse = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'X-Trace-Id': traceId,
    },
    body: JSON.stringify(validated.body),
  });

  if (!upstreamResponse.ok) {
    const mappedError = mapUpstreamError(upstreamResponse.status);
    const retryAfter = upstreamResponse.headers.get('retry-after');

    return jsonResponse(
      {
        error: mappedError,
        traceId,
      },
      upstreamResponse.status,
      retryAfter ? { 'retry-after': retryAfter } : {},
    );
  }

  const rawResponse = await upstreamResponse.text();

  return new Response(rawResponse, {
    status: upstreamResponse.status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Trace-Id': traceId,
    },
  });
});
