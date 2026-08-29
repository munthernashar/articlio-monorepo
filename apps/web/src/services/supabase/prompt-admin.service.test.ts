import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptExecutionLogRow, PromptDefinitionRow } from '@/types/prompt-admin';

const { executePromptMock, fromMock } = vi.hoisted(() => ({
  executePromptMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/services/ai/ai-orchestrator.service', () => ({
  aiOrchestratorService: {
    executePrompt: executePromptMock,
  },
}));

vi.mock('@/services/supabase/client', () => ({
  supabaseClient: {
    from: fromMock,
  },
}));

import { promptAdminService } from '@/services/supabase/prompt-admin.service';

type ParseRow = Pick<
  PromptExecutionLogRow,
  'id' | 'status' | 'validation_repair_status' | 'error_message' | 'validation_errors'
>;

function createPrompt(overrides: Partial<PromptDefinitionRow> = {}): PromptDefinitionRow {
  return {
    id: 'prompt-row-id',
    prompt_key: 'test_prompt',
    name: 'Test Prompt',
    description: 'Beschreibung',
    category: 'tests',
    version: 3,
    system_prompt: 'system',
    developer_prompt: 'developer',
    user_prompt_template: 'Hello {{name}}',
    expected_output_schema_json: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
      required: ['answer'],
    },
    prompt_variables_definition_json: [],
    model: 'gpt-5-mini',
    max_output_tokens: 200,
    response_format: 'json_object',
    is_active: true,
    metadata: {},
    created_by: 'admin',
    updated_by: 'admin',
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
    ...overrides,
  };
}

function mockParseFailureQuery(rows: ParseRow[]) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };

  fromMock.mockReturnValue({
    select: vi.fn().mockReturnValue(query),
  });

  return query;
}

function mockHealthCheckQueries(params: {
  definitions: Array<Pick<PromptDefinitionRow, 'prompt_key' | 'is_active' | 'version' | 'expected_output_schema_json'>>;
  runtimeRows: Array<
    Pick<
      PromptExecutionLogRow,
      'prompt_key' | 'fallback_used' | 'fallback_reason' | 'created_at' | 'prompt_source' | 'status'
    >
  >;
}) {
  const definitionsQuery = {
    returns: vi.fn().mockResolvedValue({ data: params.definitions, error: null }),
  };

  const runtimeQuery = {
    gte: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data: params.runtimeRows, error: null }),
  };

  fromMock.mockImplementation((table: string) => {
    if (table === 'prompt_definitions') {
      return {
        select: vi.fn().mockReturnValue(definitionsQuery),
      };
    }

    if (table === 'prompt_execution_logs') {
      return {
        select: vi.fn().mockReturnValue(runtimeQuery),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { runtimeQuery };
}

describe('promptAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockActivePromptLookup(activePrompt: PromptDefinitionRow | null) {
    const promptDefinitionsQuery = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: activePrompt, error: null }),
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'prompt_definitions') {
        return {
          select: vi.fn().mockReturnValue(promptDefinitionsQuery),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    return promptDefinitionsQuery;
  }

  it('runPromptTest nutzt exakt expected_output_schema_json des gewählten Prompts', async () => {
    executePromptMock.mockResolvedValue({
      ok: true,
      rawText: '{"answer":"ok"}',
      output: { answer: 'ok' },
      latencyMs: 42,
      validationErrors: [],
    });

    const prompt = createPrompt();
    mockActivePromptLookup(prompt);
    const result = await promptAdminService.runPromptTest({
      prompt,
      userId: 'user-1',
      variables: { name: 'Ada' },
    });

    expect(result.ok).toBe(true);
    expect(executePromptMock).toHaveBeenCalledTimes(1);

    const [request] = executePromptMock.mock.calls[0] ?? [];
    if (!request) {
      throw new Error('executePrompt wurde ohne Request aufgerufen');
    }
    expect(request.promptDefinition.outputSchema).toBe(prompt.expected_output_schema_json);
  });

  it('ungültiges DB-Schema erzeugt expliziten Fehler ohne additionalProperties-Fallback', async () => {
    const prompt = createPrompt({
      expected_output_schema_json: {
        properties: {
          answer: { type: 'string' },
        },
      },
    });
    mockActivePromptLookup(prompt);

    await expect(
      promptAdminService.runPromptTest({
        prompt,
        userId: 'user-1',
        variables: {},
      }),
    ).rejects.toThrow(/expected_output_schema_json ist für Prompt test_prompt v3 ungültig\./);

    expect(executePromptMock).not.toHaveBeenCalled();
  });

  it('bei Schema-Verstoß enthält das Testresultat nachvollziehbare validationErrors', async () => {
    executePromptMock.mockResolvedValue({
      ok: false,
      rawText: '{"foo":1}',
      output: null,
      latencyMs: 18,
      errorMessage: 'Output entspricht nicht dem Schema',
      validationErrors: ['$.answer ist erforderlich', '$.foo ist nicht erlaubt'],
    });

    mockActivePromptLookup(createPrompt());

    const result = await promptAdminService.runPromptTest({
      prompt: createPrompt(),
      userId: 'user-1',
      variables: {},
    });

    expect(result.ok).toBe(false);
    expect(result.validationErrors).toEqual(['$.answer ist erforderlich', '$.foo ist nicht erlaubt']);
    expect(result.errorMessage).toContain('Schema-Validierung fehlgeschlagen');
    expect(result.errorMessage).toContain('$.answer ist erforderlich');
  });

  it('getParseFailureRate nutzt konsistente Parse-Failure-Kriterien', async () => {
    const rows: ParseRow[] = [
      {
        id: '1',
        status: 'success',
        validation_repair_status: 'failed',
        error_message: null,
        validation_errors: null,
      },
      {
        id: '2',
        status: 'failed',
        validation_repair_status: null,
        error_message: 'Runtime error',
        validation_errors: ['$.x fehlt'],
      },
      {
        id: '3',
        status: 'failed',
        validation_repair_status: null,
        error_message: 'Unexpected token at position 4',
        validation_errors: null,
      },
      {
        id: '4',
        status: 'failed',
        validation_repair_status: null,
        error_message: 'schema-validierung: antwort ungültig',
        validation_errors: null,
      },
      {
        id: '5',
        status: 'failed',
        validation_repair_status: null,
        error_message: 'Timeout',
        validation_errors: null,
      },
      {
        id: '6',
        status: 'success',
        validation_repair_status: 'repaired',
        error_message: null,
        validation_errors: null,
      },
    ];

    const query = mockParseFailureQuery(rows);

    const rate = await promptAdminService.getParseFailureRate({
      promptKey: 'test_prompt',
      userId: 'user-1',
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.999Z',
    });

    expect(rate.totalExecutions).toBe(6);
    expect(rate.parseFailures).toBe(4);
    expect(rate.rate).toBeCloseTo(4 / 6, 10);

    expect(query.eq).toHaveBeenNthCalledWith(1, 'prompt_key', 'test_prompt');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'user_id', 'user-1');
    expect(query.gte).toHaveBeenCalledWith('created_at', '2026-04-01T00:00:00.000Z');
    expect(query.lte).toHaveBeenCalledWith('created_at', '2026-04-30T23:59:59.999Z');
  });

  it('getPromptRuntimeHealthCheck aggregiert DB-Aktivstatus und Fallbacks in 24h', async () => {
    const { runtimeQuery } = mockHealthCheckQueries({
      definitions: [
        {
          prompt_key: 'session_analysis',
          is_active: true,
          version: 1,
          expected_output_schema_json: { type: 'object', properties: {}, additionalProperties: false },
        },
        {
          prompt_key: 'daily_prompt_generator',
          is_active: false,
          version: 1,
          expected_output_schema_json: { type: 'object', properties: {}, additionalProperties: false },
        },
        {
          prompt_key: 'broken_prompt',
          is_active: true,
          version: 2,
          expected_output_schema_json: { properties: { bad: { type: 'string' } } },
        },
      ],
      runtimeRows: [
        {
          prompt_key: 'session_analysis',
          fallback_used: true,
          fallback_reason: 'db_missing',
          created_at: '2026-04-24T10:00:00.000Z',
          prompt_source: 'seed_fallback',
          status: 'success',
        },
        {
          prompt_key: 'session_analysis',
          fallback_used: true,
          fallback_reason: 'db_missing',
          created_at: '2026-04-24T09:00:00.000Z',
          prompt_source: 'seed_fallback',
          status: 'success',
        },
        {
          prompt_key: 'broken_prompt',
          fallback_used: false,
          fallback_reason: 'db_invalid_schema',
          created_at: '2026-04-24T08:00:00.000Z',
          prompt_source: 'db',
          status: 'failed',
        },
      ],
    });

    const health = await promptAdminService.getPromptRuntimeHealthCheck(24);

    expect(health.windowHours).toBe(24);
    expect(health.totalPromptKeys).toBeGreaterThanOrEqual(10);
    expect(health.dbActivePromptKeys).toBe(2);
    expect(health.fallbackExecutions24h).toBe(2);
    expect(health.warningPromptKeys).toContain('session_analysis');
    expect(health.warningPromptKeys).toContain('daily_prompt_generator');
    expect(health.warningPromptKeys).toContain('broken_prompt');

    const sessionAnalysisStatus = health.statuses.find((entry) => entry.promptKey === 'session_analysis');
    expect(sessionAnalysisStatus).toMatchObject({
      hasActiveDbVersion: true,
      fallbackExecutions24h: 2,
      status: 'fallback',
    });

    const dailyPromptStatus = health.statuses.find((entry) => entry.promptKey === 'daily_prompt_generator');
    expect(dailyPromptStatus).toMatchObject({
      hasActiveDbVersion: false,
      fallbackExecutions24h: 0,
      status: 'fallback',
    });

    const brokenPromptStatus = health.statuses.find((entry) => entry.promptKey === 'broken_prompt');
    expect(brokenPromptStatus).toMatchObject({
      hasActiveDbVersion: true,
      hasInvalidActiveDbPrompt: true,
      status: 'error',
    });

    expect(runtimeQuery.gte).toHaveBeenCalledWith('created_at', expect.any(String));
  });
});
