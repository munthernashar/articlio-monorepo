import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchActivePromptDefinition,
  renderPromptTemplate,
  runGuardedJsonPrompt,
} from './_shared/prompt-runtime.ts';
import { runPostSessionFollowUps } from './_shared/focus-topic-followups.ts';

export type SessionLifecycleStatus =
  | 'draft'
  | 'recording'
  | 'uploaded'
  | 'processing'
  | 'transcribed'
  | 'analyzed'
  | 'feedback_ready'
  | 'training_in_progress'
  | 'completed'
  | 'insufficient_data'
  | 'completed_capped'
  | 'rejected_too_long'
  | 'failed'
  | 'archived';

export type SessionRow = {
  id: string;
  user_id: string;
  status: SessionLifecycleStatus;
  audio_file_path: string | null;
  metadata: Record<string, unknown> | null;
};

export type ProcessingStage = 'transcript' | 'analysis' | 'session';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REPROCESSABLE_STATUSES: ReadonlySet<SessionLifecycleStatus> = new Set(['uploaded', 'failed']);
const REPROCESSABLE_STATUS_LIST: SessionLifecycleStatus[] = ['uploaded', 'failed'];


function resolveSessionAudioPath(session: SessionRow): string | null {
  if (typeof session.audio_file_path === 'string' && session.audio_file_path.trim().length > 0) {
    return session.audio_file_path;
  }

  const metadata = session.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const audioFilePath = (metadata as Record<string, unknown>).audioFilePath;
  return typeof audioFilePath === 'string' && audioFilePath.trim().length > 0 ? audioFilePath : null;
}

type ActivePromptDefinition = {
  id: string;
  prompt_key: string;
  version: number;
  model: string;
  max_output_tokens: number | null;
  response_format: string | null;
  expected_output_schema_json: Record<string, unknown> | null;
  system_prompt: string | null;
  developer_prompt: string | null;
  user_prompt_template: string;
};

function renderPromptTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, token: string) => values[token] ?? '');
}

async function fetchActivePromptDefinition(serviceClient: SupabaseClient, promptKey: string): Promise<ActivePromptDefinition> {
  const { data, error } = await serviceClient
    .from('prompt_definitions')
    .select('id,prompt_key,version,model,max_output_tokens,response_format,expected_output_schema_json,system_prompt,developer_prompt,user_prompt_template')
    .eq('prompt_key', promptKey)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`prompt_definition_query_failed_${promptKey}`);
  if (!data) throw new Error(`prompt_definition_missing_or_inactive_${promptKey}`);
  if (typeof data.user_prompt_template !== 'string' || !data.user_prompt_template.trim()) {
    throw new Error(`prompt_definition_invalid_user_prompt_template_${promptKey}`);
  }

  return data as ActivePromptDefinition;
}

// Deno-Port von mapExpectedOutputSchemaJsonToJsonSchema
// (src/services/ai/prompt-definition-mappers.ts): dieselbe leichte
// Formprüfung, bevor ein DB-JSON-Wert als JsonSchema behandelt wird.
const JSON_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

function parseJsonSchema(value: Record<string, unknown> | null): JsonSchema | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const schemaType = (value as Record<string, unknown>).type;
  if (typeof schemaType !== 'string' || !JSON_SCHEMA_TYPES.has(schemaType)) return null;
  return value as unknown as JsonSchema;
}

function requireExpectedOutputSchema(promptDefinition: ActivePromptDefinition): JsonSchema {
  const schema = parseJsonSchema(promptDefinition.expected_output_schema_json);
  if (!schema) {
    throw new Error(`prompt_definition_invalid_schema_${promptDefinition.prompt_key}`);
  }
  return schema;
}

function extractOutputText(payload: Record<string, unknown>): string {
  const direct = payload.output_text;
  if (typeof direct === 'string' && direct.trim()) return direct;

  const output = payload.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;

      for (const part of content) {
        if (!part || typeof part !== 'object' || Array.isArray(part)) continue;
        const partRecord = part as Record<string, unknown>;
        const textValue = partRecord.text;
        if (typeof textValue === 'string' && textValue.trim()) return textValue;
        const nestedText = partRecord.value;
        if (typeof nestedText === 'string' && nestedText.trim()) return nestedText;
      }
    }
  }

  throw new Error('OpenAI response did not include output_text');
}

type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number };

function extractTokenUsage(payload: Record<string, unknown>): TokenUsage {
  const usage = payload.usage as Record<string, unknown> | undefined;
  const inputTokens = typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0;
  const outputTokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0;
  const total = usage?.total_tokens;
  const totalTokens = typeof total === 'number' && Number.isFinite(total) ? total : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

// Deno-Port des Structured-Output-Gatings aus
// src/services/api/openai-api.service.ts (siehe _shared/strict-json-schema.ts):
// entscheidend ist ein gültiges Objekt-Schema mit mindestens einer Property,
// nicht ein bestimmter `response_format`-Stringwert (Befund D).
//
// Bugfix 24.08.2026 ("Unterminated string in JSON at position 3518"):
// gpt-5-mini ist ein Reasoning-Modell -- verdeckte Reasoning-Tokens werden
// aus demselben max_output_tokens-Budget bezahlt wie der sichtbare
// JSON-Text. Bei session_analysis (8 Bewertungskategorien +
// detected_patterns) reichte das Budget nicht: das Modell verbrauchte es
// komplett und brach mitten in einem String-Wert ab, bevor JSON.parse
// überhaupt zum Zug kam. Zwei Änderungen dagegen:
// 1) reasoning.effort:'low' für gpt-5*-Modelle reduziert den unsichtbaren
//    Reasoning-Anteil, damit mehr vom Budget für den tatsächlichen
//    Output bleibt (nicht gesetzt für gpt-4.1-mini, das den Parameter
//    nicht kennt und die Anfrage sonst mit invalid_request ablehnen würde).
// 2) status:'incomplete' + incomplete_details.reason:'max_output_tokens'
//    (Responses-API-Äquivalent zu finish_reason:'length') wird jetzt
//    explizit erkannt und bricht mit einer klaren, eigenen Fehlermeldung
//    ab, statt den unvollständigen Text erst an JSON.parse bzw. die
//    JSON-Repair-Pipeline zu geben -- ein abgeschnittener String lässt
//    sich nicht sinnvoll "reparieren", das hätte nur einen weiteren,
//    ebenso abgeschnittenen Repair-Versuch erzeugt.
async function invokeModelForRawText(
  traceId: string,
  promptDefinition: Pick<ActivePromptDefinition, 'prompt_key' | 'model' | 'max_output_tokens' | 'response_format' | 'system_prompt' | 'developer_prompt'>,
  schema: JsonSchema,
  renderedUserPrompt: string,
): Promise<{ rawText: string; tokenUsage: TokenUsage }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const normalizedResponseFormat = promptDefinition.response_format?.trim() ?? null;
  const usesStructuredOutput = normalizedResponseFormat === 'json_object' && hasStructuredOutputProperties(schema);
  const isReasoningModel = promptDefinition.model.startsWith('gpt-5');

  const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Trace-Id': traceId,
    },
    body: JSON.stringify({
      model: promptDefinition.model,
      input: [
        ...(promptDefinition.system_prompt ? [{ role: 'system', content: promptDefinition.system_prompt }] : []),
        ...(promptDefinition.developer_prompt ? [{ role: 'developer', content: promptDefinition.developer_prompt }] : []),
        { role: 'user', content: renderedUserPrompt },
      ],
      ...(promptDefinition.max_output_tokens ? { max_output_tokens: promptDefinition.max_output_tokens } : {}),
      ...(isReasoningModel ? { reasoning: { effort: 'low' } } : {}),
      ...(normalizedResponseFormat
        ? {
          text: {
            format: usesStructuredOutput
              ? {
                type: 'json_schema',
                name: `${promptDefinition.prompt_key}_output`,
                schema: makeStrictJsonSchema(schema),
              }
              : { type: normalizedResponseFormat },
          },
        }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`openai_request_failed_${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;

  const incompleteDetails = payload.incomplete_details as Record<string, unknown> | null | undefined;
  if (payload.status === 'incomplete' && incompleteDetails?.reason === 'max_output_tokens') {
    throw new Error(
      `model_output_truncated_max_tokens_${promptDefinition.prompt_key} (max_output_tokens=${promptDefinition.max_output_tokens ?? 'unset'})`,
    );
  }

  const rawText = extractOutputText(payload);
  return { rawText, tokenUsage: extractTokenUsage(payload) };
}

// Deno-Port von tryRepairJson (prompt-execution.service.ts): bei ungültigem
// JSON oder fehlgeschlagener Schema-Validierung wird -- wie im Client-Pfad --
// einmalig der `json_repair`-Prompt aufgerufen, statt die Session sofort als
// fehlgeschlagen zu markieren.
async function attemptJsonRepair(
  serviceClient: SupabaseClient,
  traceId: string,
  rawText: string,
  errorHint: string,
  targetSchema: JsonSchema,
): Promise<unknown | null> {
  const repairPromptDefinition = await fetchActivePromptDefinition(serviceClient, 'json_repair');
  const repairSchema = requireExpectedOutputSchema(repairPromptDefinition);
  const renderedRepairPrompt = renderPromptTemplate(repairPromptDefinition.user_prompt_template, {
    repair_error_hint: errorHint,
    invalid_json_text: rawText,
    target_schema_json: JSON.stringify(targetSchema),
  });

  const repairResult = await invokeModelForRawText(traceId, repairPromptDefinition, repairSchema, renderedRepairPrompt);
  const repairEnvelope = JSON.parse(repairResult.rawText) as { repaired_json?: unknown };
  if (typeof repairEnvelope.repaired_json !== 'string') {
    return null;
  }

  return JSON.parse(repairEnvelope.repaired_json);
}

// --- Token-Guardrail --------------------------------------------------
//
// Spiegelt den Reserve->Call->Finalize/Release-Zyklus aus
// `src/services/ai/prompt-execution.service.ts` (Client-Pfad), der bislang
// die einzige Stelle war, die die RPCs aus `20260426160000_create_user_usage_ledger.sql`
// aufgerufen hat. Diese Function verarbeitet aber tatsächlich die Sessions
// (siehe Launch-Readiness-Audit, Befund A) und rief bislang gar keine
// Kontingentprüfung auf. `reserve_user_tokens` ist selbst dann sicher
// aufzurufen, wenn der Nutzer kein `monthly_token_limit` gesetzt hat: die
// RPC gibt dann `allowed:true` zurück, ohne etwas zu reservieren.

type TokenReservation = {
  allowed: boolean;
  hard_limit_reached: boolean;
  soft_limit_reached: boolean;
  error_code: string | null;
  limit_value: number | null;
  tokens_used: number;
  tokens_reserved: number;
  period_start: string;
  period_end: string;
};

async function reserveTokens(serviceClient: SupabaseClient, userId: string, tokens: number): Promise<TokenReservation | null> {
  const { data, error } = await serviceClient.rpc('reserve_user_tokens', {
    p_user_id: userId,
    p_tokens: Math.max(0, Math.round(tokens)),
    p_soft_limit_ratio: 0.8,
  });

  if (error) {
    console.error('[process-session] token reservation failed', error);
    return null;
  }

  return Array.isArray(data) ? ((data[0] ?? null) as TokenReservation | null) : null;
}

async function finalizeTokens(
  serviceClient: SupabaseClient,
  userId: string,
  periodStart: string,
  reservedTokens: number,
  actualTokens: number,
): Promise<void> {
  const { error } = await serviceClient.rpc('finalize_user_token_usage', {
    p_user_id: userId,
    p_period_start: periodStart,
    p_reserved_tokens: Math.max(0, Math.round(reservedTokens)),
    p_actual_used: Math.max(0, Math.round(actualTokens)),
  });

  if (error) console.error('[process-session] token finalize failed', error);
}

async function releaseTokens(
  serviceClient: SupabaseClient,
  userId: string,
  periodStart: string,
  reservedTokens: number,
): Promise<void> {
  const { error } = await serviceClient.rpc('release_reserved_user_tokens', {
    p_user_id: userId,
    p_period_start: periodStart,
    p_reserved_tokens: Math.max(0, Math.round(reservedTokens)),
  });

  if (error) console.error('[process-session] token release failed', error);
}

// --- prompt_execution_logs -----------------------------------------------
//
// Spiegelt persistExecutionLog() aus prompt-execution.service.ts: process-
// session lief bislang komplett ohne Ausführungs-/Kostenprotokoll (Befund D).
// Nur die produktiv relevanten Felder werden gesetzt; Felder mit
// DB-seitigem Default (test_input, request_payload, input_payload_json,
// rendered_prompt_json) werden bewusst nicht mitgeschickt, da process-session
// keine Test-/Client-Aufrufkontexte hat, die sie sinnvoll füllen würden.
type PromptExecutionLogStatus = 'success' | 'failed';
type ValidationRepairStatus = 'not_needed' | 'repaired' | 'failed';

async function persistPromptExecutionLog(params: {
  serviceClient: SupabaseClient;
  promptDefinition: ActivePromptDefinition;
  renderedUserPrompt: string;
  status: PromptExecutionLogStatus;
  userId: string;
  sessionId: string;
  traceId: string;
  pipelineStep: string;
  attempt: number;
  latencyMs: number;
  rawText: string | null;
  parsedOutput: unknown | null;
  safetyFlags: SafetyFlag[];
  validationErrors: string[];
  validationRepairStatus: ValidationRepairStatus;
  errorMessage?: string | null;
  tokenUsage: TokenUsage | null;
}): Promise<void> {
  const cost = params.tokenUsage
    ? calculateEstimatedCostUsd({
      model: params.promptDefinition.model,
      inputTokens: params.tokenUsage.inputTokens,
      outputTokens: params.tokenUsage.outputTokens,
    })
    : null;

  const { error } = await params.serviceClient.from('prompt_execution_logs').insert({
    prompt_definition_id: params.promptDefinition.id,
    prompt_key: params.promptDefinition.prompt_key,
    prompt_version: params.promptDefinition.version,
    model: params.promptDefinition.model,
    max_output_tokens: params.promptDefinition.max_output_tokens ?? 0,
    user_id: params.userId,
    session_id: params.sessionId,
    feature_name: 'process-session',
    rendered_user_prompt: params.renderedUserPrompt,
    raw_response: params.rawText,
    raw_model_output: params.rawText,
    parsed_output: params.parsedOutput,
    safety_flags: params.safetyFlags,
    validation_errors: params.validationErrors,
    status: params.status,
    success: params.status === 'success',
    latency_ms: params.latencyMs,
    error_message: params.errorMessage ?? null,
    trace_id: params.traceId,
    pipeline_step: params.pipelineStep,
    attempt_number: params.attempt,
    validation_repair_status: params.validationRepairStatus,
    error_class: params.errorMessage ? 'prompt_execution_error' : null,
    fallback_used: false,
    fallback_reason: null,
    prompt_source: 'db',
    input_tokens: params.tokenUsage?.inputTokens ?? null,
    output_tokens: params.tokenUsage?.outputTokens ?? null,
    total_tokens: params.tokenUsage?.totalTokens ?? null,
    estimated_cost_usd: cost?.estimatedCostUsd ?? null,
    pricing_version: cost?.pricingVersion ?? null,
  });

  if (error) {
    console.error('[process-session] prompt execution log write failed', error);
  }
}

// Spiegelt execute() aus prompt-execution.service.ts (ohne den dortigen
// Retry-Loop -- process-session ruft jede Stufe genau einmal auf, ein
// erneuter Versuch bei OpenAI-Fehlern ist nicht Teil dieser Angleichung):
// Parse -> Schema-Validierung -> bei Bedarf Repair -> Overcorrection-Guard ->
// Safety-Filter -> Logging. Jede dieser Stufen fehlte in process-session
// bislang komplett (Befund D).
async function runGuardedJsonPrompt(params: {
  serviceClient: SupabaseClient;
  userId: string;
  sessionId: string;
  traceId: string;
  promptDefinition: ActivePromptDefinition;
  renderedUserPrompt: string;
}): Promise<Record<string, unknown>> {
  const { serviceClient, userId, sessionId, traceId, promptDefinition, renderedUserPrompt } = params;
  const schema = requireExpectedOutputSchema(promptDefinition);
  const reservedTokens = Math.max(promptDefinition.max_output_tokens ?? 0, 1);
  const reservation = await reserveTokens(serviceClient, userId, reservedTokens);

  if (reservation && !reservation.allowed && reservation.hard_limit_reached) {
    throw new Error(`token_limit_exceeded_${promptDefinition.prompt_key}_${reservation.limit_value ?? 'unbekannt'}`);
  }

  const startedAt = Date.now();
  const attempt = 1;
  let reservationFinalized = false;
  let rawText = '';
  let tokenUsage: TokenUsage | null = null;
  let validationRepairStatus: ValidationRepairStatus = 'not_needed';

  try {
    const invocation = await invokeModelForRawText(traceId, promptDefinition, schema, renderedUserPrompt);
    rawText = invocation.rawText;
    tokenUsage = invocation.tokenUsage;
    if (reservation?.period_start) {
      await finalizeTokens(serviceClient, userId, reservation.period_start, reservedTokens, tokenUsage.totalTokens);
      reservationFinalized = true;
    }

    let parsed: unknown = null;
    let needsRepair = false;
    let repairErrorHint = '';

    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      needsRepair = true;
      repairErrorHint = error instanceof Error ? error.message : 'Modellantwort enthält kein valides JSON.';
    }

    let validationErrors: string[] = [];
    if (!needsRepair) {
      validationErrors = validateWithSchema(schema, parsed);
      if (validationErrors.length > 0) {
        needsRepair = true;
        repairErrorHint = `Schema-Validierung fehlgeschlagen: ${validationErrors.join('; ')}`;
      }
    }

    if (needsRepair) {
      const repaired = await attemptJsonRepair(serviceClient, traceId, rawText, repairErrorHint, schema);
      if (!repaired) {
        validationRepairStatus = 'failed';
        throw new Error(repairErrorHint);
      }

      parsed = repaired;
      validationErrors = validateWithSchema(schema, parsed);
      if (validationErrors.length > 0) {
        validationRepairStatus = 'failed';
        throw new Error(`Schema-Validierung nach Repair fehlgeschlagen: ${validationErrors.join('; ')}`);
      }
      validationRepairStatus = 'repaired';
    }

    // Overcorrection-Guard: siehe Kommentar in _shared/overcorrection-guard.ts
    // -- aktuell systemweit ein No-op ohne Policy-Quelle, hier trotzdem 1:1
    // mitgeführt für exakte Client-Parität.
    const guardResult = applyOvercorrectionGuard(parsed, undefined);
    if (guardResult.normalized) {
      parsed = guardResult.output;
      validationErrors = validateWithSchema(schema, parsed);
      if (validationErrors.length > 0) {
        throw new Error(`Schema-Validierung nach Overcorrection-Guard fehlgeschlagen: ${validationErrors.join('; ')}`);
      }
    }

    const safetyFlags = detectOffensiveLanguage(parsed);
    if (safetyFlags.length > 0) {
      throw new Error(SAFE_RESPONSE_MESSAGE);
    }

    await persistPromptExecutionLog({
      serviceClient,
      promptDefinition,
      renderedUserPrompt,
      status: 'success',
      userId,
      sessionId,
      traceId,
      pipelineStep: promptDefinition.prompt_key,
      attempt,
      latencyMs: Date.now() - startedAt,
      rawText,
      parsedOutput: parsed,
      safetyFlags,
      validationErrors: [],
      validationRepairStatus,
      tokenUsage,
    });

    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    await persistPromptExecutionLog({
      serviceClient,
      promptDefinition,
      renderedUserPrompt,
      status: 'failed',
      userId,
      sessionId,
      traceId,
      pipelineStep: promptDefinition.prompt_key,
      attempt,
      latencyMs: Date.now() - startedAt,
      rawText: rawText || null,
      parsedOutput: null,
      safetyFlags: [],
      validationErrors: [],
      validationRepairStatus,
      errorMessage: message,
      tokenUsage,
    });
    throw error;
  } finally {
    if (reservation?.period_start && !reservationFinalized) {
      await releaseTokens(serviceClient, userId, reservation.period_start, reservedTokens);
    }
  }
}

// --- Aktives Entitlement erforderlich -----------------------------------
//
// Launch-Readiness-Audit, Befund A / Welle-2-Entscheidung (Munther): keine
// aktive `user_entitlements`-Zeile => keine Verarbeitung, kein Fallback auf
// hartkodierte Default-Limits (das wäre ein verstecktes, unbegrenztes
// Dauer-Free-Tier gewesen).
//
// Pricing-Umstellung (27.08.2026): die frühere Annahme "es gibt kein
// dauerhaftes Free-Tier" wurde bewusst aufgehoben -- jedes neue Profil
// bekommt per Trigger (`grant_free_entitlement()`, Migration
// 20260827170000) automatisch eine aktive Free-Zeile, ganz ohne Stripe.
// `user_entitlements`-Zeilen entstehen also entweder über diesen Trigger
// (Free) oder über `sync_user_entitlements_from_billing`, aufgerufen vom
// Stripe-Webhook bei jedem Subscription-Event (Starter/Pro, inkl. Downgrade
// auf Free bei endgültig beendeter Subscription). Eine fehlende aktive Zeile
// ist damit keine normale Situation für unbezahlte Nutzer mehr, sondern eine
// echte Datenanomalie -- die Guard-Logik unten bleibt deshalb unverändert
// scharf.
type ActiveEntitlement = {
  sessions_per_day_limit: number;
  max_session_length_seconds: number;
};

async function fetchActiveEntitlement(serviceClient: SupabaseClient, userId: string): Promise<ActiveEntitlement> {
  const { data, error } = await serviceClient
    .from('user_entitlements')
    .select('sessions_per_day_limit, max_session_length_seconds')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<ActiveEntitlement>();

  if (error) throw new Error(`entitlement_lookup_failed_${error.message}`);
  if (!data) throw new Error('no_active_entitlement');

  return data;
}

// --- Sessions/Tag-Guardrail --------------------------------------------
//
// `src/services/supabase/session.service.ts` prüft dieses Limit bereits beim
// Erstellen einer Session, aber ausschließlich im Browser mit dem User-JWT.
// Diese Function ist der einzige Ort, an dem tatsächlich OpenAI-Kosten
// entstehen; ein serverseitiger Re-Check hier verhindert, dass ein
// umgangener Client-Check zu unbegrenzten Verarbeitungskosten führt. Nutzt
// bewusst UTC-Tagesgrenzen statt der zeitzonenbewussten Client-Logik
// (`getCurrentDayBoundsUtcForTimezone`) — für einen Hard-Stop ausreichend,
// kann um bis zu einem halben Tag von der Nutzer-lokalen Tagesgrenze
// abweichen.

async function enforceSessionsPerDayGuard(serviceClient: SupabaseClient, userId: string, limit: number): Promise<void> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { count, error } = await serviceClient
    .from('conversation_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayStart.toISOString())
    .lt('created_at', dayEnd.toISOString());

  if (error) throw new Error(`sessions_per_day_check_failed_${error.message}`);
  if ((count ?? 0) > limit) {
    throw new Error(`daily_session_limit_exceeded_${limit}`);
  }
}

// Launch-Readiness-Audit, Befund C: der Client meldet `durationSeconds` schon
// heute in `conversation_sessions.metadata` (siehe
// `session.service.ts:updateConversationSessionAfterUpload`) -- kein neues
// Feld nötig. Dieser Re-Check schließt die Lücke, dass `AudioRecorder.tsx`
// und der Post-Upload-Check in `NewSessionPage.tsx` beide nur im Browser
// laufen und umgangen werden können, bevor hier tatsächlich
// Transkriptionskosten anfallen.
function getSessionDurationSeconds(session: SessionRow): number | null {
  const metadata = session.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).durationSeconds;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function enforceSessionLengthGuard(session: SessionRow, limit: number): void {
  const durationSeconds = getSessionDurationSeconds(session);
  // Fehlt die Dauer (sollte durch den Upload-Flow nicht vorkommen), lässt der
  // Guard die Verarbeitung durch, statt eine an sich gültige Session ohne
  // belastbaren Grund zu blockieren.
  if (durationSeconds === null) return;

  if (durationSeconds > limit) {
    throw new Error(`session_length_limit_exceeded_${limit}`);
  }
}

async function runCleanupPrompt(params: {
  serviceClient: SupabaseClient;
  userId: string;
  sessionId: string;
  traceId: string;
  rawTranscript: string;
}): Promise<{ cleaned_transcript: string; utterances: unknown[]; notes: Record<string, unknown> }> {
  const promptDefinition = await fetchActivePromptDefinition(params.serviceClient, 'session_transcript_cleanup');
  const renderedPrompt = renderPromptTemplate(promptDefinition.user_prompt_template, {
    raw_transcript: params.rawTranscript,
  });
  const output = await runGuardedJsonPrompt({
    serviceClient: params.serviceClient,
    userId: params.userId,
    sessionId: params.sessionId,
    traceId: params.traceId,
    promptDefinition,
    renderedUserPrompt: renderedPrompt,
  });

  if (typeof output.cleaned_transcript !== 'string') throw new Error('cleanup_invalid_cleaned_transcript');
  if (!Array.isArray(output.utterances)) throw new Error('cleanup_invalid_utterances');

  const notesCandidate = output.notes;
  let normalizedNotes: Record<string, unknown> | null = null;
  if (notesCandidate && typeof notesCandidate === 'object' && !Array.isArray(notesCandidate)) {
    normalizedNotes = notesCandidate as Record<string, unknown>;
  } else {
    normalizedNotes = {};
    if (typeof output.language_code === 'string' && output.language_code.trim()) {
      normalizedNotes.language_code = output.language_code;
    }
    if (typeof output.summary === 'string' && output.summary.trim()) {
      normalizedNotes.summary = output.summary;
    }
    if (typeof output.quality === 'string' && output.quality.trim()) {
      normalizedNotes.quality = output.quality;
    }
  }

  if (!normalizedNotes) throw new Error('cleanup_invalid_notes');

  return {
    cleaned_transcript: output.cleaned_transcript,
    utterances: output.utterances,
    notes: normalizedNotes,
  };
}

// Lernpfade Phase C (26.08.2026): bei gesetztem Sprachniveau-Lernziel bekommt
// session_analysis einen kurzen Kontext-Satz (Zielprüfung, Ziel-CEFR-Band,
// Fach-Fokus), damit priority_intervention konkret auf die Distanz zum Ziel
// eingehen kann. "Leben in Deutschland" (goal_type 'knowledge') hat kein
// CEFR-Ziel und bekommt bewusst noch keinen Kontext -- der eigene
// Wissens-Coaching-Mechanismus dafür ist eine spätere, separate Phase.
async function buildLearningGoalContext(serviceClient: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('learning_goal_key, german_level')
    .eq('id', userId)
    .maybeSingle();

  const goalKey = (profile as { learning_goal_key: string | null } | null)?.learning_goal_key;
  if (!goalKey) return '';

  const { data: goal } = await serviceClient
    .from('learning_goal_catalog')
    .select('display_name, goal_type, target_cefr_band, focus_areas')
    .eq('goal_key', goalKey)
    .eq('is_active', true)
    .maybeSingle();

  if (!goal) return '';
  const goalRow = goal as {
    display_name: string;
    goal_type: string;
    target_cefr_band: string | null;
    focus_areas: unknown;
  };
  if (goalRow.goal_type !== 'language_level') return '';

  const targetBand = goalRow.target_cefr_band ?? (profile as { german_level: string | null } | null)?.german_level ?? null;
  const focusAreas = Array.isArray(goalRow.focus_areas)
    ? goalRow.focus_areas.filter((entry): entry is string => typeof entry === 'string')
    : [];

  const parts = [`Ziel: ${goalRow.display_name}`];
  if (targetBand) parts.push(`Ziel-Niveau: ${targetBand}`);
  if (focusAreas.length > 0) parts.push(`Fokus: ${focusAreas.join(', ')}`);

  return `${parts.join('. ')}.`;
}

async function runSessionAnalysisPrompt(params: {
  serviceClient: SupabaseClient;
  userId: string;
  sessionId: string;
  traceId: string;
  cleanedTranscript: string;
  languageCode: string;
  learningGoalContext: string;
}): Promise<Record<string, unknown>> {
  const promptDefinition = await fetchActivePromptDefinition(params.serviceClient, 'session_analysis');

  const renderedPrompt = renderPromptTemplate(promptDefinition.user_prompt_template, {
    cleaned_transcript: params.cleanedTranscript,
    language_code: params.languageCode,
    learning_goal_context: params.learningGoalContext,
  });
  return runGuardedJsonPrompt({
    serviceClient: params.serviceClient,
    userId: params.userId,
    sessionId: params.sessionId,
    traceId: params.traceId,
    promptDefinition,
    renderedUserPrompt: renderedPrompt,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function getTraceId(req: Request): string {
  return req.headers.get('x-trace-id') ?? crypto.randomUUID();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function requireAnalysisShape(input: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['category_scores', 'detected_patterns', 'priority_intervention', 'session_summary']) {
    if (!(key in input)) throw new Error(`analysis_missing_${key}`);
  }
  return input;
}

// Pricing-Umstellung Nachbesserung (27.08.2026): session_analysis (aktive Version v7) liefert
// pro Kategorie bereits ein confidence-Feld (0-1, laut Prompt "niedriger bei wenig Daten") --
// bislang wurde dieses Signal nirgends ausgewertet. Durchschnitt über die 7 Kategorien statt
// Minimum: eine einzelne niedrig bewertete Kategorie kann auch bedeuten, dass dieses Thema in
// der Session schlicht nicht vorkam, nicht dass das gesamte Transkript datenarm ist.
const CATEGORY_SCORE_KEYS = [
  'grammatical_accuracy',
  'lexical_appropriateness',
  'fluency',
  'intelligibility',
  'coherence_and_sentence_structure',
  'register_and_naturalness',
  'interactional_competence',
];

function extractAverageConfidence(analysis: Record<string, unknown>): number | null {
  const categoryScores = analysis.category_scores;
  if (!categoryScores || typeof categoryScores !== 'object' || Array.isArray(categoryScores)) return null;

  const confidenceValues: number[] = [];
  for (const key of CATEGORY_SCORE_KEYS) {
    const category = (categoryScores as Record<string, unknown>)[key];
    if (!category || typeof category !== 'object' || Array.isArray(category)) continue;
    const confidence = (category as Record<string, unknown>).confidence;
    if (typeof confidence === 'number' && Number.isFinite(confidence)) {
      confidenceValues.push(confidence);
    }
  }

  if (confidenceValues.length === 0) return null;
  return confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length;
}

// Erste, vorsichtige Schwellen ohne echte Free-Tier-Nutzungsdaten (bislang nur 4 reale
// session_analysis-Läufe, alle aus 15-Minuten-Sessions mit vollem Transkript) -- bei Bedarf
// nachjustieren, sobald reale kurze Sessions vorliegen.
const INSUFFICIENT_DATA_MIN_WORD_COUNT = 40;
const INSUFFICIENT_DATA_MIN_AVG_CONFIDENCE = 0.4;

function isInsufficientDataAnalysis(wordCount: number, analysis: Record<string, unknown>): boolean {
  if (wordCount < INSUFFICIENT_DATA_MIN_WORD_COUNT) return true;
  const avgConfidence = extractAverageConfidence(analysis);
  return avgConfidence !== null && avgConfidence < INSUFFICIENT_DATA_MIN_AVG_CONFIDENCE;
}

async function callTranscribeFunction(params: {
  traceId: string;
  authHeader: string;
  sessionId: string;
  userId: string;
  audioFilePath: string;
}) {
  const base = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');

  if (!base || !anon) throw new Error('missing_supabase_env');

  const functionsBaseUrl =
    Deno.env.get('SUPABASE_FUNCTIONS_URL')
    ?? `${base.replace(/\/$/, '')}/functions/v1`;

  const url = `${functionsBaseUrl.replace(/\/$/, '')}/transcribe-session-audio`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: params.authHeader,
      apikey: anon,
      'X-Trace-Id': params.traceId,
    },
    body: JSON.stringify({
      sessionId: params.sessionId,
      userId: params.userId,
      audioBucket: 'session-audio',
      audioFilePath: params.audioFilePath,
      expectedLanguage: 'de',
    }),
  });

  const text = await resp.text();

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`transcription_invalid_json_${resp.status}_${text.slice(0, 200)}`);
  }

  if (!resp.ok || !data?.success) {
    throw new Error(`transcription_failed_${resp.status}_${JSON.stringify(data).slice(0, 300)}`);
  }

  return data.data as {
    rawTranscript: string;
    languageCode: string | null;
    segments: unknown[];
  };
}

// Verfolgt, welche Stufe der Pipeline gerade läuft. Der aufrufende Handler
// liest das nach einem Fehlschlag aus, um im catch-Block ausschließlich die
// Tabelle(n) der tatsächlich fehlgeschlagenen Stufe auf "failed" zu setzen --
// vorher wurde `session_transcripts` bei jedem Fehler unbedingt auf "failed"
// überschrieben, auch wenn die Transkription längst erfolgreich
// abgeschlossen war und erst die nachgelagerte Analyse fehlschlug.
type StageTracker = { current: ProcessingStage | null };

async function runServerPipeline(params: {
  serviceClient: SupabaseClient;
  session: SessionRow;
  userId: string;
  traceId: string;
  authHeader: string;
  stageTracker: StageTracker;
}) {
  const { serviceClient, session, userId, traceId, stageTracker } = params;
  if (!REPROCESSABLE_STATUSES.has(session.status)) throw new Error(`unprocessable_status_${session.status}`);
  const sessionAudioPath = resolveSessionAudioPath(session);
  if (!sessionAudioPath) throw new Error('missing_audio_file_path');

  // Vor jeder Statusänderung und vor jedem kostenpflichtigen Aufruf prüfen –
  // damit eine abgelehnte Verarbeitung die Session nicht erst auf
  // "processing" setzt, nur um sie danach wieder auf "failed" zu drehen.
  const entitlement = await fetchActiveEntitlement(serviceClient, userId);
  await enforceSessionsPerDayGuard(serviceClient, userId, entitlement.sessions_per_day_limit);
  enforceSessionLengthGuard(session, entitlement.max_session_length_seconds);

  const processingClaim = await serviceClient
    .from('conversation_sessions')
    .update({
      status: 'processing',
      metadata: {
        ...((session.metadata && typeof session.metadata === 'object') ? session.metadata : {}),
        processing: {
          traceId,
          startedAt: new Date().toISOString(),
        },
      },
    })
    .eq('id', session.id)
    .eq('user_id', userId)
    .in('status', REPROCESSABLE_STATUS_LIST)
    .select('id');

  if (!processingClaim.data || processingClaim.data.length === 0) {
    throw new Error('unprocessable_status_or_already_processing');
  }
  stageTracker.current = 'transcript';
  await serviceClient.from('session_transcripts').upsert({ session_id: session.id, user_id: userId, status: 'pending' }, { onConflict: 'session_id' });
  await serviceClient.from('session_transcripts').update({ status: 'processing', last_error: null }).eq('session_id', session.id).eq('user_id', userId);

  const transcription = await callTranscribeFunction({
    traceId,
    authHeader: params.authHeader,
    sessionId: session.id,
    userId,
    audioFilePath: sessionAudioPath,
  });

  const cleanup = await runCleanupPrompt({ serviceClient, userId, sessionId: session.id, traceId, rawTranscript: transcription.rawTranscript });

  const transcriptRecord = await serviceClient
    .from('session_transcripts')
    .update({
      status: 'completed',
      raw_transcript: transcription.rawTranscript,
      cleaned_transcript: cleanup.cleaned_transcript,
      transcript_text: cleanup.cleaned_transcript,
      utterances_json: cleanup.utterances,
      notes_json: cleanup.notes,
      language_code: transcription.languageCode ?? 'de',
      word_count: countWords(cleanup.cleaned_transcript),
      last_error: null,
      last_processed_at: new Date().toISOString(),
    })
    .eq('session_id', session.id)
    .eq('user_id', userId)
    .select('id')
    .single();

  if (transcriptRecord.error) {
    throw new Error(`transcript_update_failed_${transcriptRecord.error.message}`);
  }

  await serviceClient.from('conversation_sessions').update({ status: 'transcribed' }).eq('id', session.id).eq('user_id', userId);
  stageTracker.current = 'analysis';
  await serviceClient.from('session_analyses').upsert({ session_id: session.id, user_id: userId, status: 'pending' }, { onConflict: 'session_id' });
  await serviceClient.from('session_analyses').update({ status: 'processing', last_error: null }).eq('session_id', session.id).eq('user_id', userId);

  const learningGoalContext = await buildLearningGoalContext(serviceClient, userId);

  const rawAnalysis = await runSessionAnalysisPrompt({
    serviceClient,
    userId,
    sessionId: session.id,
    traceId,
    cleanedTranscript: cleanup.cleaned_transcript,
    languageCode: transcription.languageCode ?? 'de',
    learningGoalContext,
  });
  const analysis = requireAnalysisShape(rawAnalysis);
  const isInsufficientData = isInsufficientDataAnalysis(countWords(cleanup.cleaned_transcript), analysis);

  await serviceClient.from('session_analyses').update({
    status: 'completed',
    transcript_id: transcriptRecord.data?.id ?? null,
    category_scores_json: analysis.category_scores,
    detected_patterns_json: analysis.detected_patterns,
    priority_intervention_json: analysis.priority_intervention,
    session_summary: typeof analysis.session_summary === 'string' ? analysis.session_summary : null,
    summary: analysis,
    last_error: null,
  }).eq('session_id', session.id).eq('user_id', userId);

  stageTracker.current = 'session';
  // War zuvor eine Kaskade aus vier sequenziellen Updates ('analyzed' ->
  // 'feedback_ready' -> 'training_in_progress' -> 'completed'), obwohl kein
  // anderer Teil der App diese Zwischenstati für diese Session-Zeile liest
  // (die UI rankt Post-Upload-Status monoton, siehe NewSessionPage.tsx, und
  // 'training_in_progress' bezeichnet dort eine separat angelegte
  // Tutor-Session, nicht dieselbe Zeile). Ein einzelnes Update genügt.
  const finalUpdate = await serviceClient
    .from('conversation_sessions')
    .update({ status: isInsufficientData ? 'insufficient_data' : 'completed' })
    .eq('id', session.id)
    .eq('user_id', userId);

  if (finalUpdate.error) {
    throw new Error(`session_completion_update_failed_${finalUpdate.error.message}`);
  }
}

Deno.serve(async (req: Request) => {
  const traceId = getTraceId(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed', traceId }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'Unauthorized', traceId }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ ok: false, error: 'Server misconfigured', traceId }, 500);
  }

  const payload = await req.json().catch(() => null) as { sessionId?: string } | null;
  if (!payload?.sessionId) return jsonResponse({ ok: false, error: 'Missing required field: sessionId', traceId }, 400);

  const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data: authData } = await userClient.auth.getUser();
  if (!authData.user) return jsonResponse({ ok: false, error: 'Unauthorized', traceId }, 401);

  const userId = authData.user.id;
  const { data: session } = await serviceClient
    .from('conversation_sessions')
    .select('id, user_id, status, audio_file_path, metadata')
    .eq('id', payload.sessionId)
    .maybeSingle<SessionRow>();

  console.log(
    '[process-session] loaded session',
    JSON.stringify(session, null, 2),
  );

  if (!session || session.user_id !== userId) return jsonResponse({ ok: false, error: 'Session not found', traceId }, 404);

  const stageTracker: StageTracker = { current: null };

  try {
    await runServerPipeline({ serviceClient, session, userId, traceId, authHeader, stageTracker });

    // Bug-Fix (28.08.2026): lief zuvor ausschließlich clientseitig als Fire-and-Forget NACH
    // dem Warten auf genau diesen Request (siehe runPostProcessingFollowUps in
    // NewSessionPage.tsx) -- verpuffte dadurch lautlos, sobald der Tab wegnavigierte oder in
    // den Hintergrund geriet (verifiziert: 0 Zeilen in focus_topics/detected_patterns über die
    // gesamte Produktions-DB). Läuft jetzt hier, serverseitig, unabhängig vom Client-Tab.
    // runPostSessionFollowUps ist selbst best-effort (fängt seine Fehler intern ab); dieser
    // Try/catch ist nur ein zusätzliches Sicherheitsnetz, damit ein unerwarteter Fehler hier
    // nie die bereits erfolgreich verarbeitete Session als fehlgeschlagen erscheinen lässt.
    try {
      await runPostSessionFollowUps({ serviceClient, userId, sessionId: session.id, traceId });
    } catch (error) {
      console.error('[process-session] runPostSessionFollowUps failed', error);
    }

    return jsonResponse({ ok: true, sessionId: session.id, status: 'completed', traceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    const isGuardRejection =
      message.startsWith('token_limit_exceeded_')
      || message.startsWith('daily_session_limit_exceeded_')
      || message.startsWith('session_length_limit_exceeded_');
    // Kein Guard-Limit, sondern das Fehlen jeder aktiven Entitlement-Zeile
    // (kein Abo, auch nicht im Trial) -- eigener Statuscode statt 429, damit
    // der Client "kein Plan aktiv" von "Limit erreicht" unterscheiden kann.
    const isMissingEntitlement = message === 'no_active_entitlement';

    // Nur die Tabelle(n) der Stufe auf "failed" setzen, die dieser Lauf
    // tatsächlich erreicht hat -- sonst überschreibt z. B. ein Fehlschlag in
    // der Analyse-Stufe den `session_transcripts`-Datensatz einer bereits
    // erfolgreich abgeschlossenen Transkription mit einem irreführenden
    // "failed"-Status samt fremdem `last_error`. Bei `stageTracker.current
    // === null` (Guard-Ablehnung vor jeder Zeilen-Beanspruchung) wird keine
    // der beiden Tabellen angefasst, da für diesen Lauf noch gar nichts
    // beansprucht wurde.
    if (stageTracker.current === 'transcript') {
      await serviceClient.from('session_transcripts').update({ status: 'failed', last_error: message }).eq('session_id', session.id).eq('user_id', userId);
    } else if (stageTracker.current === 'analysis') {
      await serviceClient.from('session_analyses').update({ status: 'failed', last_error: message }).eq('session_id', session.id).eq('user_id', userId);
    }
    // stageTracker.current === 'session': Transkription und Analyse sind bereits
    // erfolgreich abgeschlossen und bleiben unangetastet; nur der finale
    // Statuswechsel der Session selbst ist fehlgeschlagen (siehe unten).

    const currentMetadata = (session.metadata && typeof session.metadata === 'object') ? session.metadata : {};
    await serviceClient.from('conversation_sessions').update({
      status: 'failed',
      metadata: {
        ...currentMetadata,
        processing: {
          lastError: message,
          traceId,
          failedAt: new Date().toISOString(),
        },
      },
    }).eq('id', session.id).eq('user_id', userId);

    const statusCode = isMissingEntitlement ? 402 : isGuardRejection ? 429 : 500;
    const errorCode = isMissingEntitlement ? 'no_active_entitlement' : isGuardRejection ? 'usage_guard_rejected' : 'pipeline_failed';
    return jsonResponse({ ok: false, error: { code: errorCode, message }, traceId }, statusCode);
  }
});
