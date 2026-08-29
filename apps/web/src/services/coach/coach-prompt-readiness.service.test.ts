import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryChain, fromMock } = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    returns: vi.fn(),
  };

  return {
    queryChain: chain,
    fromMock: vi.fn(() => chain),
  };
});

vi.mock('@/services/supabase/client', () => ({
  supabaseClient: {
    from: fromMock,
  },
}));

import {
  REQUIRED_COACH_PROMPT_KEYS,
  validateCoachPromptAvailability,
} from '@/services/coach/coach-prompt-readiness.service';

describe('validateCoachPromptAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryChain.select.mockReturnValue(queryChain);
    queryChain.in.mockReturnValue(queryChain);
    queryChain.eq.mockReturnValue(queryChain);
  });

  it('meldet ok=true bei vollständig gültigen Prompt-Definitionen', async () => {
    queryChain.returns.mockResolvedValue({
      data: REQUIRED_COACH_PROMPT_KEYS.map((promptKey) => ({
        prompt_key: promptKey,
        is_active: true,
        response_format: 'json_object',
        expected_output_schema_json: { type: 'object' },
        prompt_variables_definition_json: [],
        category: 'coach',
      })),
      error: null,
    });

    const result = await validateCoachPromptAvailability();

    expect(result).toEqual({ ok: true, missingKeys: [], invalidKeys: [] });
  });

  it('meldet fehlende Keys und invalide Konfigurationen pro Prompt-Key', async () => {
    queryChain.returns.mockResolvedValue({
      data: [
        {
          prompt_key: 'coach_training_recommendation',
          is_active: true,
          response_format: 'json_object',
          expected_output_schema_json: { type: 'object' },
          prompt_variables_definition_json: [],
          category: 'coach',
        },
        {
          prompt_key: 'coach_session_plan',
          is_active: true,
          response_format: 'text',
          expected_output_schema_json: [],
          prompt_variables_definition_json: {},
          category: 'general',
        },
        {
          prompt_key: 'coach_next_step',
          is_active: true,
          response_format: 'json_object',
          expected_output_schema_json: { type: 'object' },
          prompt_variables_definition_json: [],
          category: 'coach',
        },
        {
          prompt_key: 'coach_next_step',
          is_active: true,
          response_format: 'json_object',
          expected_output_schema_json: { type: 'object' },
          prompt_variables_definition_json: [],
          category: 'coach',
        },
      ],
      error: null,
    });

    const result = await validateCoachPromptAvailability();

    expect(result.ok).toBe(false);
    expect(result.missingKeys).toEqual(['coach_session_completion', 'coach_reflection_interpreter']);
    expect(result.invalidKeys).toEqual(
      expect.arrayContaining([
        {
          promptKey: 'coach_session_plan',
          reason: 'response_format must be json_object, got text',
        },
        {
          promptKey: 'coach_session_plan',
          reason: 'expected_output_schema_json must be an object',
        },
        {
          promptKey: 'coach_session_plan',
          reason: 'prompt_variables_definition_json must be an array',
        },
        {
          promptKey: 'coach_session_plan',
          reason: 'category must be coach, got general',
        },
        {
          promptKey: 'coach_next_step',
          reason: 'expected exactly 1 active definition, found 2',
        },
      ]),
    );
  });

  it('schlägt kontrolliert fehl, wenn keine DB-Abfrage möglich ist', async () => {
    queryChain.returns.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });

    await expect(validateCoachPromptAvailability()).rejects.toThrow(
      'Coach-Prompt-Availability-Check fehlgeschlagen: connection refused',
    );
  });
});
