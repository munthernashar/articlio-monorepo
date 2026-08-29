import type { JsonSchema, JsonSchemaType, PromptOutputFormat } from '@/services/ai/types';
import type { PromptDefinitionRow } from '@/types/prompt-admin';

const JSON_SCHEMA_TYPES: ReadonlySet<JsonSchemaType> = new Set([
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'null',
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mapPromptResponseFormatToRuntime(value: string): PromptOutputFormat {
  return value === 'text' ? 'text' : 'json_object';
}

export function mapExpectedOutputSchemaJsonToJsonSchema(
  value: PromptDefinitionRow['expected_output_schema_json'],
): JsonSchema | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const schemaType = value.type;
  if (typeof schemaType !== 'string' || !JSON_SCHEMA_TYPES.has(schemaType as JsonSchemaType)) {
    return null;
  }

  return value as JsonSchema;
}
