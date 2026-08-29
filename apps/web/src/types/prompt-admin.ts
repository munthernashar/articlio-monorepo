import type { Json, PromptResponseFormat } from '@/types/database';

export type PromptVariableType = 'string' | 'number' | 'boolean' | 'json';

export type PromptVariableDefinition = {
  name: string;
  type: PromptVariableType;
  required: boolean;
  description: string;
  defaultValue: string;
};

export type PromptDefinitionRow = {
  id: string;
  prompt_key: string;
  name: string;
  description: string;
  category: string;
  version: number;
  system_prompt: string;
  developer_prompt: string;
  user_prompt_template: string;
  expected_output_schema_json: Json;
  prompt_variables_definition_json: Json;
  model: string;
  max_output_tokens: number;
  response_format: PromptResponseFormat;
  is_active: boolean;
  metadata: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PromptExecutionLogRow = {
  id: string;
  prompt_definition_id: string;
  prompt_key: string;
  prompt_version: number;
  model: string;
  max_output_tokens: number;
  user_id: string | null;
  session_id: string | null;
  feature_name: string;
  input_payload_json: Json;
  rendered_prompt_json: Json;
  raw_model_output: string | null;
  success: boolean;
  status: 'success' | 'failed';
  parsed_output: Json;
  validation_errors: Json;
  latency_ms: number | null;
  error_message: string | null;
  trace_id: string | null;
  workflow_id: string | null;
  pipeline_step: string | null;
  attempt_number: number;
  validation_repair_status: 'not_needed' | 'repaired' | 'failed' | null;
  error_class: string | null;
  fallback_used: boolean;
  fallback_reason: string | null;
  prompt_source: 'db' | 'seed_fallback';
  created_by: string | null;
  created_at: string;
};

export type PromptRuntimeSourceStatus = {
  promptKey: string;
  hasActiveDbVersion: boolean;
  runtimeUsesFallback: boolean;
  fallbackReason: string | null;
  fallbackObservedAt: string | null;
};

export type PromptHealthState = 'healthy' | 'fallback' | 'error';

export type PromptRuntimeHealthStatus = {
  promptKey: string;
  hasActiveDbVersion: boolean;
  fallbackExecutions24h: number;
  hasInvalidActiveDbPrompt: boolean;
  invalidReason: string | null;
  fallbackReason: string | null;
  status: PromptHealthState;
  adminHint: string;
};

export type PromptRuntimeHealthCheck = {
  windowHours: number;
  checkedAt: string;
  totalPromptKeys: number;
  dbActivePromptKeys: number;
  fallbackExecutions24h: number;
  warningPromptKeys: string[];
  statuses: PromptRuntimeHealthStatus[];
};

export type PromptParseFailureRate = {
  promptKey: string;
  userId: string | null;
  from: string | null;
  to: string | null;
  totalExecutions: number;
  parseFailures: number;
  rate: number;
};

export type PromptDefinitionUpdateInput = {
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  developerPrompt: string;
  userPromptTemplate: string;
  expectedOutputSchemaJson: Json;
  promptVariablesDefinition: PromptVariableDefinition[];
  model: string;
  maxOutputTokens: number;
  responseFormat: PromptResponseFormat;
  isActive: boolean;
};

export type PromptExecutionTestResult = {
  ok: boolean;
  rawResponse: string;
  parsedOutput: unknown;
  latencyMs: number;
  validationErrors: string[];
  errorMessage?: string;
};
