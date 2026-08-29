import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { JsonSchema } from './prompt-types.ts';
import { validateWithSchema } from './json-schema-validator.ts';
import { detectOffensiveLanguage, SAFE_RESPONSE_MESSAGE, type SafetyFlag } from './safety-filter.ts';
import { applyOvercorrectionGuard } from './overcorrection-guard.ts';
import { calculateEstimatedCostUsd } from './model-pricing.ts';
import { hasStructuredOutputProperties, makeStrictJsonSchema } from './strict-json-schema.ts';

// Extrahiert aus process-session/index.ts (28.08.2026): dieselbe Reserve->Call->
// Parse->Validate->Repair->Guard->Log-Pipeline wurde für die serverseitigen
// Post-Processing-Schritte (Mustererkennung, Fokus-Themen-Auswahl,
// Improvement-Check -- siehe focus-topic-followups.ts) erneut benötigt. Statt
// ein zweites Mal zu duplizieren, jetzt ein gemeinsames Modul, das sowohl
// index.ts als auch focus-topic-followups.ts importieren.

const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1';

export type ActivePromptDefinition = {
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

export function renderPromptTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, token: string) => values[token] ?? '');
}

export async function fetchActivePromptDefinition(serviceClient: SupabaseClient, promptKey: string): Promise<ActivePromptDefinition> {
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

export type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number };

function extractTokenUsage(payload: Record<string, unknown>): TokenUsage {
  const usage = payload.usage as Record<string, unknown> | undefined;
  const inputTokens = typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0;
  const outputTokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0;
  const total = usage?.total_tokens;
  const totalTokens = typeof total === 'number' && Number.isFinite(total) ? total : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

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
  const rawText = extractOutputText(payload);
  return { rawText, tokenUsage: extractTokenUsage(payload) };
}

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

type PromptExecutionLogStatus = 'success' | 'failed';
type ValidationRepairStatus = 'not_needed' | 'repaired' | 'failed';

async function persistPromptExecutionLog(params: {
  serviceClient: SupabaseClient;
  promptDefinition: ActivePromptDefinition;
  renderedUserPrompt: string;
  status: PromptExecutionLogStatus;
  userId: string;
  sessionId: string | null;
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

export async function runGuardedJsonPrompt(params: {
  serviceClient: SupabaseClient;
  userId: string;
  sessionId: string | null;
  traceId: string;
  promptDefinition: ActivePromptDefinition;
  renderedUserPrompt: string;
  pipelineStep?: string;
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
      pipelineStep: params.pipelineStep ?? promptDefinition.prompt_key,
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
      pipelineStep: params.pipelineStep ?? promptDefinition.prompt_key,
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
