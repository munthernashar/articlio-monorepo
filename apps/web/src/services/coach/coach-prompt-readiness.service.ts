import { supabaseClient } from '@/services/supabase/client';
import type { Json, PromptDefinitionDbRow } from '@/types/database';

export const REQUIRED_COACH_PROMPT_KEYS = [
  'coach_training_recommendation',
  'coach_session_plan',
  'coach_next_step',
  'coach_session_completion',
  'coach_reflection_interpreter',
] as const;

export type RequiredCoachPromptKey = (typeof REQUIRED_COACH_PROMPT_KEYS)[number];

export type CoachPromptAvailabilityValidationResult = {
  ok: boolean;
  missingKeys: RequiredCoachPromptKey[];
  invalidKeys: Array<{ promptKey: RequiredCoachPromptKey; reason: string }>;
};

function isJsonObject(value: Json): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonArray(value: Json): boolean {
  return Array.isArray(value);
}

export async function validateCoachPromptAvailability(): Promise<CoachPromptAvailabilityValidationResult> {
  const { data, error } = await supabaseClient
    .from('prompt_definitions')
    .select('prompt_key, is_active, response_format, expected_output_schema_json, prompt_variables_definition_json, category')
    .in('prompt_key', [...REQUIRED_COACH_PROMPT_KEYS])
    .eq('is_active', true)
    .returns<
      Array<
        Pick<
          PromptDefinitionDbRow,
          | 'prompt_key'
          | 'is_active'
          | 'response_format'
          | 'expected_output_schema_json'
          | 'prompt_variables_definition_json'
          | 'category'
        >
      >
    >();

  if (error) {
    throw new Error(`Coach-Prompt-Availability-Check fehlgeschlagen: ${error.message}`);
  }

  const activeRows = data ?? [];
  const missingKeys: RequiredCoachPromptKey[] = [];
  const invalidKeys: Array<{ promptKey: RequiredCoachPromptKey; reason: string }> = [];

  for (const promptKey of REQUIRED_COACH_PROMPT_KEYS) {
    const rowsForKey = activeRows.filter((row) => row.prompt_key === promptKey);

    if (rowsForKey.length === 0) {
      missingKeys.push(promptKey);
      continue;
    }

    if (rowsForKey.length !== 1) {
      invalidKeys.push({ promptKey, reason: `expected exactly 1 active definition, found ${rowsForKey.length}` });
      continue;
    }

    const row = rowsForKey.at(0);
    if (!row) {
      invalidKeys.push({ promptKey, reason: 'active prompt row missing unexpectedly' });
      continue;
    }

    if (row.response_format !== 'json_object') {
      invalidKeys.push({ promptKey, reason: `response_format must be json_object, got ${String(row.response_format)}` });
    }

    if (!isJsonObject(row.expected_output_schema_json)) {
      invalidKeys.push({ promptKey, reason: 'expected_output_schema_json must be an object' });
    }

    if (!isJsonArray(row.prompt_variables_definition_json)) {
      invalidKeys.push({ promptKey, reason: 'prompt_variables_definition_json must be an array' });
    }

    if (row.category !== 'coach') {
      invalidKeys.push({ promptKey, reason: `category must be coach, got ${String(row.category)}` });
    }
  }

  return {
    ok: missingKeys.length === 0 && invalidKeys.length === 0,
    missingKeys,
    invalidKeys,
  };
}
