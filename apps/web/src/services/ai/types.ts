export type SupportedModel = 'gpt-4.1-mini' | 'gpt-4.1' | 'gpt-5-mini' | 'gpt-5';

export type PromptOutputFormat = 'json_object' | 'text';

export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

export type JsonSchema = {
  type: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: Array<string | number | boolean | null>;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  oneOf?: JsonSchema[];
};

export type PromptKey = string;
export type PromptFallbackMode = 'ok_true' | 'explicit_failure';

export type OvercorrectionFocusMode = 'top_impact_first' | 'first_n_only';

export type OvercorrectionGuardPolicy = {
  maxCorrections?: number;
  maxNextSteps?: number;
  tutorFollowupFields?: string[];
  maxTutorFollowupQuestions?: number;
  maxTutorTopicMarkers?: number;
  maxItemTextLength?: number;
  focusMode?: OvercorrectionFocusMode;
};

export type PromptDefinition<
  TVariables extends Record<string, string> = Record<string, string>,
  TOutput = unknown,
> = {
  /**
   * Fachliche Identität des Prompts (stabil über Revisionen hinweg).
   */
  promptKey: PromptKey;
  /**
   * Numerische Revision des Prompts.
   */
  version: number;
  template: string;
  systemPrompt?: string;
  developerPrompt?: string;
  model: SupportedModel;
  maxTokens: number;
  outputFormat: PromptOutputFormat;
  outputSchema: JsonSchema;
  fallbackOutput?: TOutput;
  fallbackMode?: PromptFallbackMode;
  overcorrectionPolicy?: OvercorrectionGuardPolicy;
  tags?: string[];
};

/**
 * Legacy-Eingabefelder für Übergangskompatibilität.
 *
 * Diese Felder sind ausschließlich für Eingangskompatibilität gedacht
 * und gehören nicht zum Kernmodell.
 */
export type PromptDefinitionLegacyInput = {
  /**
   * @deprecated Nur für Eingangskompatibilität. Verwende `promptKey`.
   */
  id?: PromptKey;
  /**
   * @deprecated Nur für Eingangskompatibilität. Verwende `promptKey`.
   */
  legacyPromptId?: PromptKey;
  /**
   * @deprecated Nur für Eingangskompatibilität. Verwende die numerische `version`.
   */
  legacyVersion?: string;
};

/**
 * Input-Typ mit Legacy-Eingangsfeldern für Übergangskompatibilität.
 */
export type PromptDefinitionInput<
  TVariables extends Record<string, string> = Record<string, string>,
  TOutput = unknown,
> = PromptDefinition<TVariables, TOutput> & PromptDefinitionLegacyInput;

export type PromptExecutionRequest<TVariables extends Record<string, string> = Record<string, string>> = {
  promptKey: PromptKey;
  variables: TVariables;
  promptDefinition?: PromptDefinition<TVariables>;
  maxRetries?: number;
  forceMock?: boolean;
  fallback?: {
    enabled?: boolean;
    output?: unknown;
    mode?: PromptFallbackMode;
    reason?: string;
  };
  logging?: {
    promptDefinitionId?: string;
    userId?: string | null;
    sessionId?: string | null;
    createdBy?: string | null;
  };
  executionContext?: {
    traceId?: string;
    workflowId?: string;
    pipelineStep?: string;
    sessionId?: string;
    featureName?: string;
    attemptNumber?: number;
  };
};

/**
 * Legacy-Eingangsinput ausschließlich für die äußerste Eingangsnormalisierung.
 * Kernpfade sollen `PromptExecutionRequest` mit verpflichtendem `promptKey` verwenden.
 */
export type LegacyPromptExecutionRequestInput<
  TVariables extends Record<string, string> = Record<string, string>,
> = Omit<PromptExecutionRequest<TVariables>, 'promptKey'> & {
  promptKey?: PromptKey;
  /**
   * @deprecated Verwende stattdessen `promptKey`.
   */
  legacyPromptId?: PromptKey;
  /**
   * @deprecated Verwende stattdessen `promptKey`. Nur für Legacy-Eingangsnormalisierung.
   */
  promptId?: PromptKey;
};

export type PromptExecutionResult<TOutput = unknown> = {
  ok: boolean;
  promptKey: PromptKey;
  promptVersion: number | null;
  promptSource?: 'db';
  promptSourceFallbackReason?: null;
  renderedPrompt: string;
  model: SupportedModel;
  attemptCount: number;
  latencyMs: number;
  output: TOutput | null;
  fallbackOutput?: TOutput;
  fallbackUsed?: boolean;
  fallbackReason?:
    | 'db_missing'
    | 'db_inactive'
    | 'db_invalid_schema'
    | 'db_parse_error'
    | 'db_mapping_error'
    | 'db_duplicate_active_version'
    | null;
  validationErrors: string[];
  rawText: string;
  usedMock: false;
  repairApplied: boolean;
  traceId?: string;
  workflowId?: string;
  pipelineStep?: string;
  errorMessage?: string;
  errorCode?: 'token_limit_exceeded';
  softLimitWarning?: boolean;
};

export type PromptRegistryStore = {
  getPromptByKey(promptKey: PromptKey): PromptDefinition | null;
  listPrompts(): PromptDefinition[];
};

export type PromptExecutionLogger = {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};
