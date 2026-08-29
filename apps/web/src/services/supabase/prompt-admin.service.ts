import { supabaseClient } from '@/services/supabase/client';
import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';
import type { PromptDefinition } from '@/services/ai/types';
import {
  mapExpectedOutputSchemaJsonToRuntimeJsonSchema,
  mapResponseFormatToPromptOutputFormat,
  PRODUCTIVE_PROMPT_KEYS,
} from '@/services/ai/db-prompt-registry';
import type {
  PromptDefinitionRow,
  PromptDefinitionUpdateInput,
  PromptRuntimeHealthCheck,
  PromptRuntimeHealthStatus,
  PromptExecutionLogRow,
  PromptParseFailureRate,
  PromptExecutionTestResult,
  PromptRuntimeSourceStatus,
} from '@/types/prompt-admin';

type PromptKeyVersionRow = {
  prompt_key: string;
  version: number;
};

type ParseFailureCandidateRow = Pick<
  PromptExecutionLogRow,
  'id' | 'status' | 'validation_repair_status' | 'error_message' | 'validation_errors'
>;

type PromptRuntimeFallbackLogRow = Pick<
  PromptExecutionLogRow,
  'prompt_key' | 'fallback_used' | 'fallback_reason' | 'created_at' | 'prompt_source' | 'status'
>;

function hasParseErrorMarker(message: string | null): boolean {
  if (!message) return false;

  const normalized = message.toLowerCase();
  return (
    normalized.includes('parse_error') ||
    normalized.includes('schema-validierung') ||
    normalized.includes('valide json') ||
    normalized.includes('unexpected token') ||
    normalized.includes('json')
  );
}

function hasValidationErrors(value: PromptExecutionLogRow['validation_errors']): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return false;
}

function isParseFailure(row: ParseFailureCandidateRow): boolean {
  if (row.validation_repair_status === 'failed') {
    return true;
  }

  if (hasParseErrorMarker(row.error_message)) {
    return true;
  }

  return row.status === 'failed' && hasValidationErrors(row.validation_errors);
}

function summarizeExecutionError(errorMessage?: string, validationErrors: string[] = []): string | undefined {
  const details = validationErrors.filter((entry) => entry.trim().length > 0);
  if (!errorMessage && details.length === 0) {
    return undefined;
  }

  if (details.length > 0) {
    const detailList = details.join('; ');
    if (errorMessage) {
      return `Schema-Validierung fehlgeschlagen. ${errorMessage} Details: ${detailList}`;
    }
    return `Schema-Validierung fehlgeschlagen. Details: ${detailList}`;
  }

  if (!errorMessage) {
    return 'Prompt-Ausführung fehlgeschlagen.';
  }

  return `Antwort konnte nicht als valides JSON geparst werden. ${errorMessage}`;
}

export const promptAdminService = {
  async getPromptRuntimeHealthCheck(windowHours = 24): Promise<PromptRuntimeHealthCheck> {
    // Launch-Readiness-Audit, Welle 2 Punkt 11: der statische `promptRegistry`-Fallback
    // ist seit der Prompt-Neutralisierung (Befund E) dauerhaft leer -- Prompt-Text lebt
    // ausschließlich in der DB. `PRODUCTIVE_PROMPT_KEYS` enthält nur Identifier (keine
    // Inhalte) und ist die tatsächliche Quelle der Wahrheit dafür, welche Prompt-Keys die
    // Runtime kennt.
    const knownRuntimePromptKeys = Array.from(PRODUCTIVE_PROMPT_KEYS);
    const fallbackCutoff = new Date(Date.now() - windowHours * 60 * 60 * 1_000).toISOString();

    const [definitionsResult, fallbackLogsResult] = await Promise.all([
      supabaseClient
        .from('prompt_definitions')
        .select('prompt_key, version, is_active, expected_output_schema_json')
        .returns<Array<Pick<PromptDefinitionRow, 'prompt_key' | 'version' | 'is_active' | 'expected_output_schema_json'>>>(),
      supabaseClient
        .from('prompt_execution_logs')
        .select('prompt_key, fallback_used, fallback_reason, created_at, prompt_source, status')
        .gte('created_at', fallbackCutoff)
        .returns<PromptRuntimeFallbackLogRow[]>(),
    ]);

    const { data: definitions, error: definitionsError } = definitionsResult;
    if (definitionsError) {
      throw new Error(`Prompt-Health-Check konnte nicht geladen werden: ${definitionsError.message}`);
    }

    const { data: runtimeRows, error: runtimeRowsError } = fallbackLogsResult;
    if (runtimeRowsError) {
      throw new Error(`Prompt-Fallback-Health-Check konnte nicht geladen werden: ${runtimeRowsError.message}`);
    }

    const activeByPromptKey = (definitions ?? []).reduce<Map<string, boolean>>((accumulator, definition) => {
      const hasActive = accumulator.get(definition.prompt_key) ?? false;
      accumulator.set(definition.prompt_key, hasActive || definition.is_active);
      return accumulator;
    }, new Map<string, boolean>());
    const anyDefinitionByPromptKey = (definitions ?? []).reduce<Map<string, boolean>>((accumulator, definition) => {
      accumulator.set(definition.prompt_key, true);
      return accumulator;
    }, new Map<string, boolean>());

    const activeDefinitions = (definitions ?? []).filter((definition) => definition.is_active);
    const invalidActiveReasonByPromptKey = new Map<string, string>();
    activeDefinitions.forEach((definition) => {
      try {
        mapExpectedOutputSchemaJsonToRuntimeJsonSchema(definition.expected_output_schema_json, {
          promptIdentifier: definition.prompt_key,
          promptVersion: definition.version,
        });
      } catch (error) {
        invalidActiveReasonByPromptKey.set(
          definition.prompt_key,
          error instanceof Error ? error.message : 'Aktiver DB-Prompt ist ungültig.',
        );
      }
    });

    const fallbackCountByPromptKey = new Map<string, number>();
    const latestFallbackReasonByPromptKey = new Map<string, string | null>();
    const latestDbFailureReasonByPromptKey = new Map<string, string | null>();
    (runtimeRows ?? []).forEach((row) => {
      if (row.fallback_used && row.prompt_source === 'seed_fallback') {
        fallbackCountByPromptKey.set(row.prompt_key, (fallbackCountByPromptKey.get(row.prompt_key) ?? 0) + 1);
        if (!latestFallbackReasonByPromptKey.has(row.prompt_key)) {
          latestFallbackReasonByPromptKey.set(row.prompt_key, row.fallback_reason);
        }
      }

      if (row.prompt_source === 'db' && row.status === 'failed' && row.fallback_reason) {
        if (!latestDbFailureReasonByPromptKey.has(row.prompt_key)) {
          latestDbFailureReasonByPromptKey.set(row.prompt_key, row.fallback_reason);
        }
      }
    });

    const promptKeys = Array.from(
      new Set([
        ...knownRuntimePromptKeys,
        ...activeByPromptKey.keys(),
        ...fallbackCountByPromptKey.keys(),
        ...invalidActiveReasonByPromptKey.keys(),
        ...latestDbFailureReasonByPromptKey.keys(),
      ]),
    ).sort();

    const statuses: PromptRuntimeHealthStatus[] = promptKeys.map((promptKey) => {
      const hasActiveDbVersion = activeByPromptKey.get(promptKey) ?? false;
      const fallbackExecutions24h = fallbackCountByPromptKey.get(promptKey) ?? 0;
      const invalidReason = invalidActiveReasonByPromptKey.get(promptKey) ?? null;
      const dbFailureReason = latestDbFailureReasonByPromptKey.get(promptKey) ?? null;
      const hasInvalidActiveDbPrompt = Boolean(invalidReason) || dbFailureReason === 'db_invalid_schema';
      const fallbackReason =
        latestFallbackReasonByPromptKey.get(promptKey) ??
        (!hasActiveDbVersion ? (anyDefinitionByPromptKey.has(promptKey) ? 'db_inactive' : 'db_missing') : null);

      let status: PromptRuntimeHealthStatus['status'] = 'healthy';
      let adminHint = 'Runtime nutzt autoritative DB-Prompt-Version.';
      if (hasInvalidActiveDbPrompt) {
        status = 'error';
        adminHint =
          'Aktiver DB-Prompt ist ungültig. Runtime-Ausführung schlägt fehl, bis der DB-Prompt korrigiert oder deaktiviert wird.';
      } else if (!hasActiveDbVersion || fallbackExecutions24h > 0) {
        status = 'fallback';
        adminHint = 'Fallback aktiv – DB-Prompt fehlt oder ist deaktiviert.';
      }

      return {
        promptKey,
        hasActiveDbVersion,
        fallbackExecutions24h,
        hasInvalidActiveDbPrompt,
        invalidReason: invalidReason ?? dbFailureReason,
        fallbackReason,
        status,
        adminHint,
      };
    });

    const dbActivePromptKeys = statuses.filter((status) => status.hasActiveDbVersion).length;
    const fallbackExecutions24h = statuses.reduce((sum, status) => sum + status.fallbackExecutions24h, 0);
    const warningPromptKeys = statuses.filter((status) => status.status !== 'healthy').map((status) => status.promptKey);

    return {
      windowHours,
      checkedAt: new Date().toISOString(),
      totalPromptKeys: statuses.length,
      dbActivePromptKeys,
      fallbackExecutions24h,
      warningPromptKeys,
      statuses,
    };
  },

  async listPromptDefinitions(): Promise<PromptDefinitionRow[]> {
    const { data, error } = await supabaseClient
      .from('prompt_definitions')
      .select('*')
      .order('prompt_key', { ascending: true })
      .order('version', { ascending: false })
      .returns<PromptDefinitionRow[]>();

    if (error) {
      throw new Error(`Prompts konnten nicht geladen werden: ${error.message}`);
    }

    return data ?? [];
  },

  async getPromptDefinitionByRowId(promptDefinitionId: string): Promise<PromptDefinitionRow | null> {
    const { data, error } = await supabaseClient
      .from('prompt_definitions')
      .select('*')
      .eq('id', promptDefinitionId)
      .maybeSingle<PromptDefinitionRow>();

    if (error) {
      throw new Error(`Prompt-Detail konnte nicht geladen werden: ${error.message}`);
    }

    return data;
  },

  async listExecutionLogs(promptDefinitionId: string): Promise<PromptExecutionLogRow[]> {
    const { data, error } = await supabaseClient
      .from('prompt_execution_logs')
      .select('*')
      .eq('prompt_definition_id', promptDefinitionId)
      .order('created_at', { ascending: false })
      .limit(20)
      .returns<PromptExecutionLogRow[]>();

    if (error) {
      throw new Error(`Ausführungslogs konnten nicht geladen werden: ${error.message}`);
    }

    return data ?? [];
  },

  async getParseFailureRate(params: {
    promptKey: string;
    userId?: string | null;
    from?: string | null;
    to?: string | null;
  }): Promise<PromptParseFailureRate> {
    const { promptKey, userId, from, to } = params;
    let query = supabaseClient
      .from('prompt_execution_logs')
      .select('id, status, validation_repair_status, error_message, validation_errors')
      .eq('prompt_key', promptKey);

    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    const { data, error } = await query.returns<ParseFailureCandidateRow[]>();
    if (error) {
      throw new Error(`Parsing-Fehlerrate konnte nicht geladen werden: ${error.message}`);
    }

    const executions = data ?? [];
    const parseFailures = executions.filter(isParseFailure).length;
    const totalExecutions = executions.length;
    const rate = totalExecutions > 0 ? parseFailures / totalExecutions : 0;

    return {
      promptKey,
      userId: userId ?? null,
      from: from ?? null,
      to: to ?? null,
      totalExecutions,
      parseFailures,
      rate,
    };
  },

  async listPromptRuntimeSourceStatuses(): Promise<PromptRuntimeSourceStatus[]> {
    const [definitionsResult, fallbackLogsResult] = await Promise.all([
      supabaseClient
        .from('prompt_definitions')
        .select('prompt_key, is_active')
        .returns<Array<Pick<PromptDefinitionRow, 'prompt_key' | 'is_active'>>>(),
      supabaseClient
        .from('prompt_execution_logs')
        .select('prompt_key, fallback_used, fallback_reason, created_at, prompt_source, status')
        .eq('fallback_used', true)
        .order('created_at', { ascending: false })
        .returns<PromptRuntimeFallbackLogRow[]>(),
    ]);

    const { data: definitions, error: definitionsError } = definitionsResult;
    if (definitionsError) {
      throw new Error(`Runtime-Status konnte nicht geladen werden: ${definitionsError.message}`);
    }

    const { data: fallbackLogs, error: fallbackLogsError } = fallbackLogsResult;
    if (fallbackLogsError) {
      throw new Error(`Runtime-Fallback-Status konnte nicht geladen werden: ${fallbackLogsError.message}`);
    }

    const activeByPromptKey = (definitions ?? []).reduce<Map<string, boolean>>((accumulator, definition) => {
      const hasActive = accumulator.get(definition.prompt_key) ?? false;
      accumulator.set(definition.prompt_key, hasActive || definition.is_active);
      return accumulator;
    }, new Map<string, boolean>());
    const anyDefinitionByPromptKey = (definitions ?? []).reduce<Map<string, boolean>>((accumulator, definition) => {
      accumulator.set(definition.prompt_key, true);
      return accumulator;
    }, new Map<string, boolean>());

    const latestFallbackByPromptKey = new Map<string, PromptRuntimeFallbackLogRow>();
    (fallbackLogs ?? []).forEach((row) => {
      if (!latestFallbackByPromptKey.has(row.prompt_key)) {
        latestFallbackByPromptKey.set(row.prompt_key, row);
      }
    });

    const promptKeys = Array.from(new Set([...activeByPromptKey.keys(), ...latestFallbackByPromptKey.keys()])).sort();

    return promptKeys.map((promptKey) => {
      const latestFallback = latestFallbackByPromptKey.get(promptKey) ?? null;
      const hasActiveDbVersion = activeByPromptKey.get(promptKey) ?? false;
      const runtimeUsesFallback = !hasActiveDbVersion || Boolean(latestFallback);

      return {
        promptKey,
        hasActiveDbVersion,
        runtimeUsesFallback,
        fallbackReason:
          latestFallback?.fallback_reason ??
          (hasActiveDbVersion ? null : anyDefinitionByPromptKey.has(promptKey) ? 'db_inactive' : 'db_missing'),
        fallbackObservedAt: latestFallback?.created_at ?? null,
      };
    });
  },

  async getPromptRuntimeSourceStatus(promptKey: string): Promise<PromptRuntimeSourceStatus | null> {
    const statuses = await this.listPromptRuntimeSourceStatuses();
    return statuses.find((entry) => entry.promptKey === promptKey) ?? null;
  },

  async createNewPromptVersion(prompt: PromptDefinitionRow, input: PromptDefinitionUpdateInput, userId: string) {
    const { data: latestVersionRow, error: versionError } = await supabaseClient
      .from('prompt_definitions')
      .select('prompt_key, version')
      .eq('prompt_key', prompt.prompt_key)
      .order('version', { ascending: false })
      .limit(1)
      .single<PromptKeyVersionRow>();

    if (versionError) {
      throw new Error(`Neue Prompt-Version konnte nicht vorbereitet werden: ${versionError.message}`);
    }

    const nextVersion = (latestVersionRow?.version ?? prompt.version) + 1;

    if (input.isActive) {
      const { error: deactivateError } = await supabaseClient
        .from('prompt_definitions')
        .update({ is_active: false, updated_by: userId })
        .eq('prompt_key', prompt.prompt_key)
        .eq('is_active', true);

      if (deactivateError) {
        throw new Error(`Aktive Version konnte nicht deaktiviert werden: ${deactivateError.message}`);
      }
    }

    const { data, error } = await supabaseClient
      .from('prompt_definitions')
      .insert({
        prompt_key: prompt.prompt_key,
        name: input.name,
        description: input.description,
        category: input.category,
        version: nextVersion,
        system_prompt: input.systemPrompt,
        developer_prompt: input.developerPrompt,
        user_prompt_template: input.userPromptTemplate,
        expected_output_schema_json: input.expectedOutputSchemaJson,
        prompt_variables_definition_json: input.promptVariablesDefinition,
        model: input.model,
        max_output_tokens: input.maxOutputTokens,
        response_format: input.responseFormat,
        is_active: input.isActive,
        created_by: userId,
        updated_by: userId,
      })
      .select('*')
      .single<PromptDefinitionRow>();

    if (error || !data) {
      throw new Error(`Prompt-Version konnte nicht gespeichert werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return data;
  },

  async runPromptTest(params: {
    prompt: PromptDefinitionRow;
    userId: string;
    variables: Record<string, unknown>;
  }): Promise<PromptExecutionTestResult> {
    const { prompt, userId, variables } = params;
    const { data: activePrompt, error: activePromptError } = await supabaseClient
      .from('prompt_definitions')
      .select('*')
      .eq('prompt_key', prompt.prompt_key)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle<PromptDefinitionRow>();

    if (activePromptError) {
      throw new Error(`Aktiver Prompt konnte für den Testlauf nicht geladen werden: ${activePromptError.message}`);
    }

    if (!activePrompt) {
      throw new Error(`Kein aktiver Prompt in public.prompt_definitions für prompt_key "${prompt.prompt_key}" gefunden.`);
    }

    const traceId = `admin-test-prompt_key-${prompt.prompt_key}-${Date.now()}`;
    // Admin-Testaufbau nutzt bewusst dasselbe Identitätsmodell wie Runtime und DB:
    // promptKey + numerische version (kein promptId/semver-Mix), damit Logging und Auflösung konsistent bleiben.
    const outputSchema = mapExpectedOutputSchemaJsonToRuntimeJsonSchema(activePrompt.expected_output_schema_json, {
      promptIdentifier: activePrompt.prompt_key,
      promptVersion: activePrompt.version,
    });

    const promptDefinition: PromptDefinition = {
      promptKey: activePrompt.prompt_key,
      version: activePrompt.version,
      template: activePrompt.user_prompt_template,
      systemPrompt: activePrompt.system_prompt,
      developerPrompt: activePrompt.developer_prompt,
      model: activePrompt.model as PromptDefinition['model'],
      maxTokens: activePrompt.max_output_tokens,
      outputFormat: mapResponseFormatToPromptOutputFormat(activePrompt.response_format),
      outputSchema,
      tags: ['admin-test'],
    };

    const stringVariables = Object.entries(variables).reduce<Record<string, string>>((accumulator, [key, value]) => {
      accumulator[key] = typeof value === 'string' ? value : JSON.stringify(value);
      return accumulator;
    }, {});

    const result = await aiOrchestratorService.executePrompt({
      promptKey: prompt.prompt_key,
      promptDefinition,
      variables: stringVariables,
      logging: {
        promptDefinitionId: activePrompt.id,
        userId,
        createdBy: userId,
      },
      executionContext: {
        traceId,
        workflowId: `admin-prompt_key-${prompt.prompt_key}`,
        pipelineStep: 'admin_prompt_test',
        featureName: 'admin_prompt_key_test',
      },
    });

    return {
      ok: result.ok,
      rawResponse: result.rawText,
      parsedOutput: result.output,
      latencyMs: result.latencyMs,
      validationErrors: result.validationErrors,
      errorMessage: result.ok ? undefined : summarizeExecutionError(result.errorMessage, result.validationErrors),
    };
  },
};
