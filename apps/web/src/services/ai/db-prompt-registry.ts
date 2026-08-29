import { supabaseClient } from '@/services/supabase/client';
import type { PromptDefinition, JsonSchema, PromptOutputFormat } from '@/services/ai/types';
import { resolveLegacyPromptKey } from '@/services/ai/prompt-registry';
import type { PromptDefinitionRow } from '@/types/prompt-admin';
import { mapExpectedOutputSchemaJsonToJsonSchema, mapPromptResponseFormatToRuntime } from '@/services/ai/prompt-definition-mappers';

type MapSchemaOptions = {
  promptIdentifier: string;
  promptVersion?: number;
};

const FORBIDDEN_LEGACY_OUTPUT_FIELDS_BY_PROMPT: Record<string, readonly string[]> = {
  tutor_explanation: ['title', 'intro_text', 'explanation_text', 'followup_prompts'],
  tutor_followup_answer: ['answer_text', 'did_expand_scope', 'suggested_next_step'],
  understanding_check: ['understanding_status', 'recommended_next_step'],
  improvement_check: [
    'focus_topic_label',
    'improvement_status',
    'evidence_before',
    'evidence_after',
    'summary',
    'should_continue_training',
  ],
};

const STRICT_NON_GENERIC_SCHEMA_PROMPT_KEYS = new Set([
  'tutor_explanation',
  'tutor_followup_answer',
  'understanding_check',
  'improvement_check',
]);

export type DbPromptRegistryErrorCode =
  | 'db_missing'
  | 'db_inactive'
  | 'db_invalid_schema'
  | 'db_parse_error'
  | 'db_mapping_error'
  | 'db_duplicate_active_version';
export type DbPromptFallbackReason =
  | 'db_missing'
  | 'db_inactive';
export type DbPromptLookupResult =
  | { prompt: PromptDefinition; source: 'db' };



export class DbPromptRegistryError extends Error {
  constructor(
    readonly code: DbPromptRegistryErrorCode,
    readonly promptKey: string,
    readonly promptVersion: number | null,
    message: string,
    readonly causeError?: unknown,
  ) {
    super(message);
    this.name = 'DbPromptRegistryError';
  }
}


export const PRODUCTIVE_PROMPT_KEYS = new Set([
  'session_analysis',
  'multi_session_pattern_detection',
  'focus_topic_selector',
  'improvement_check',
  'tutor_explanation',
  'tutor_followup_answer',
  'understanding_check',
  'coach_feedback',
  'coach_session_plan',
  'coach_next_step',
  'coach_session_completion',
  'coach_training_recommendation',
  'coach_reflection_interpreter',
  'session_transcript_cleanup',
  'daily_prompt_generator',
  'dashboard_summary',
  'json_repair',
]);

function isProductivePromptKey(promptKey: string): boolean {
  return PRODUCTIVE_PROMPT_KEYS.has(promptKey);
}

const LEGACY_PROMPT_IDENTIFIER_ALIASES_TO_PROMPT_KEY: Record<string, string> = {
  session_analysis_v1: 'session_analysis',
  multi_session_pattern_detection_v1: 'multi_session_pattern_detection',
  focus_topic_selector_v1: 'focus_topic_selector',
  improvement_check_v1: 'improvement_check',
  tutor_explanation_v1: 'tutor_explanation',
  tutor_followup_answer_v1: 'tutor_followup_answer',
  understanding_check_v1: 'understanding_check',
  coach_feedback_v1: 'coach_feedback',
  coach_session_plan_v1: 'coach_session_plan',
  coach_next_step_v1: 'coach_next_step',
  coach_session_completion_v1: 'coach_session_completion',
  coach_training_recommendation_v1: 'coach_training_recommendation',
  coach_reflection_interpreter_v1: 'coach_reflection_interpreter',
  session_transcript_cleanup_v1: 'session_transcript_cleanup',
  daily_prompt_generator_v1: 'daily_prompt_generator',
  dashboard_summary_v1: 'dashboard_summary',
  admin_prompt_test_runner_v1: 'admin_prompt_test_runner',
  json_repair_v1: 'json_repair',
};

function formatPromptLabel(options: MapSchemaOptions): string {
  return options.promptVersion === undefined
    ? options.promptIdentifier
    : `${options.promptIdentifier} v${options.promptVersion}`;
}

function ensureNoForbiddenLegacyOutputFields(
  schema: JsonSchema,
  options: MapSchemaOptions,
): void {
  const forbiddenFields = FORBIDDEN_LEGACY_OUTPUT_FIELDS_BY_PROMPT[options.promptIdentifier];
  if (!forbiddenFields || forbiddenFields.length === 0) {
    return;
  }

  const propertyKeys = Object.keys((schema.properties ?? {}) as Record<string, unknown>);
  const requiredKeys = Array.isArray(schema.required) ? schema.required : [];
  const combinedKeys = new Set([...propertyKeys, ...requiredKeys]);
  const matched = forbiddenFields.filter((field) => combinedKeys.has(field));

  if (matched.length > 0) {
    throw new Error(
      `expected_output_schema_json enthält Legacy-Felder (${matched.join(', ')}) für Prompt ${formatPromptLabel(options)}.`,
    );
  }
}

function ensurePromptSpecificSchemaGuards(schema: JsonSchema, options: MapSchemaOptions): void {
  if (
    STRICT_NON_GENERIC_SCHEMA_PROMPT_KEYS.has(options.promptIdentifier) &&
    schema.type === 'object' &&
    schema.additionalProperties !== false
  ) {
    throw new Error(
      `expected_output_schema_json für Prompt ${formatPromptLabel(options)} muss additionalProperties=false setzen.`,
    );
  }

  if (options.promptIdentifier === 'improvement_check') {
    const confidenceProperty = (schema.properties as Record<string, JsonSchema> | undefined)?.confidence;
    if (
      confidenceProperty?.type === 'number' &&
      typeof confidenceProperty.maximum === 'number' &&
      confidenceProperty.maximum > 1
    ) {
      throw new Error(
        `expected_output_schema_json für Prompt ${formatPromptLabel(options)} setzt confidence.maximum=${confidenceProperty.maximum}; erlaubt ist maximal 1.`,
      );
    }
  }
}

export function mapExpectedOutputSchemaJsonToRuntimeJsonSchema(
  expectedOutputSchemaJson: PromptDefinitionRow['expected_output_schema_json'],
  options: MapSchemaOptions,
): JsonSchema {
  const dbSchema = mapExpectedOutputSchemaJsonToJsonSchema(expectedOutputSchemaJson);
  if (dbSchema) {
    ensureNoForbiddenLegacyOutputFields(dbSchema, options);
    ensurePromptSpecificSchemaGuards(dbSchema, options);
    return dbSchema;
  }

  throw new Error(
    `expected_output_schema_json ist für Prompt ${formatPromptLabel(options)} ungültig.`,
  );
}

export function mapResponseFormatToPromptOutputFormat(value: string): PromptOutputFormat {
  return mapPromptResponseFormatToRuntime(value);
}

/**
 * Legacy-Eingangsnormalisierung: alte Prompt-Identifier werden auf kanonische promptKeys abgebildet.
 * Neue Aufrufer sollen direkt promptKey übergeben.
 */
export function normalizeLegacyPromptIdentifierToPromptKey(promptIdentifier: string): string {
  if (LEGACY_PROMPT_IDENTIFIER_ALIASES_TO_PROMPT_KEY[promptIdentifier]) {
    return LEGACY_PROMPT_IDENTIFIER_ALIASES_TO_PROMPT_KEY[promptIdentifier];
  }

  return resolveLegacyPromptKey(promptIdentifier);
}


export function verifyDbPromptSchemaMappingCheckpoint(): boolean {
  const schemaX: JsonSchema = {
    type: 'object',
    properties: {
      checkpoint: { type: 'string' },
    },
    required: ['checkpoint'],
  };

  const resolved = mapExpectedOutputSchemaJsonToRuntimeJsonSchema(schemaX, { promptIdentifier: 'checkpoint_prompt' });

  return resolved === schemaX;
}

export class DbPromptRegistryAdapter {
  constructor() {}

  async getPromptByPromptKey(promptKeyInput: string): Promise<DbPromptLookupResult> {
    const promptKey = normalizeLegacyPromptIdentifierToPromptKey(promptKeyInput);
    const { data: activeRows, error: activeRowsError } = await supabaseClient
      .from('prompt_definitions')
      .select('*')
      .eq('prompt_key', promptKey)
      .eq('is_active', true)
      .limit(2)
      .returns<PromptDefinitionRow[]>();

    if (activeRowsError) {
      throw new DbPromptRegistryError(
        'db_parse_error',
        promptKey,
        null,
        `Aktive DB-Prompt-Abfrage fehlgeschlagen: ${activeRowsError.message}`,
        activeRowsError,
      );
    }

    if ((activeRows ?? []).length > 1) {
      throw new DbPromptRegistryError(
        'db_duplicate_active_version',
        promptKey,
        null,
        `Mehr als eine aktive DB-Prompt-Version für ${promptKey}.`,
      );
    }

    const activePrompt = activeRows?.[0] ?? null;
    if (!activePrompt) {
      const { data: latestAny, error: latestAnyError } = await supabaseClient
        .from('prompt_definitions')
        .select('id,is_active')
        .eq('prompt_key', promptKey)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; is_active: boolean }>();

      if (latestAnyError) {
        throw new DbPromptRegistryError(
          'db_parse_error',
          promptKey,
          null,
          `DB-Prompt-Statusabfrage fehlgeschlagen: ${latestAnyError.message}`,
          latestAnyError,
        );
      }

      if (!latestAny) {
        throw new DbPromptRegistryError(
          'db_missing',
          promptKey,
          null,
          isProductivePromptKey(promptKey)
            ? `Technischer Fehler: Produktiver Prompt ${promptKey} nicht verfügbar (reason=db_missing).`
            : `Technischer Fehler: Prompt ${promptKey} nicht verfügbar (reason=db_missing).`,
        );
      }

      throw new DbPromptRegistryError(
        'db_inactive',
        promptKey,
        null,
        isProductivePromptKey(promptKey)
          ? `Technischer Fehler: Produktiver Prompt ${promptKey} ist inaktiv (reason=db_inactive).`
          : `Technischer Fehler: Prompt ${promptKey} ist inaktiv (reason=db_inactive).`,
      );
    }

    let outputSchema: JsonSchema;
    try {
      outputSchema = mapExpectedOutputSchemaJsonToRuntimeJsonSchema(activePrompt.expected_output_schema_json, {
        promptIdentifier: activePrompt.prompt_key,
        promptVersion: activePrompt.version,
      });
    } catch (error) {
      throw new DbPromptRegistryError(
        'db_invalid_schema',
        promptKey,
        activePrompt.version,
        `Invalid active DB prompt for ${promptKey}@${activePrompt.version}: ${error instanceof Error ? error.message : 'unknown error'}`,
        error,
      );
    }

    let outputFormat: PromptOutputFormat;
    try {
      outputFormat = mapResponseFormatToPromptOutputFormat(activePrompt.response_format);
    } catch (error) {
      throw new DbPromptRegistryError(
        'db_mapping_error',
        promptKey,
        activePrompt.version,
        `Response-Format-Mapping fehlgeschlagen für ${promptKey}@${activePrompt.version}.`,
        error,
      );
    }

    return {
      prompt: {
        promptKey: activePrompt.prompt_key,
        version: activePrompt.version,
        template: activePrompt.user_prompt_template,
        model: activePrompt.model as PromptDefinition['model'],
        maxTokens: activePrompt.max_output_tokens,
        outputFormat,
        outputSchema,
        tags: ['db-active'],
        systemPrompt: activePrompt.system_prompt,
        developerPrompt: activePrompt.developer_prompt,
      },
      source: 'db',
    };
  }
}
