import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PromptDefinitionRow } from '@/types/prompt-admin';
import { PromptRegistry } from '@/services/ai/prompt-registry';
import {
  DbPromptRegistryAdapter,
  DbPromptRegistryError,
  mapExpectedOutputSchemaJsonToRuntimeJsonSchema,
} from '@/services/ai/db-prompt-registry';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('@/services/supabase/client', () => ({
  supabaseClient: {
    from: fromMock,
  },
}));

function createSeedRegistry() {
  return new PromptRegistry([
    {
      promptKey: 'session_analysis',
      version: 1,
      template: 'seed {{input}}',
      model: 'gpt-4.1-mini',
      maxTokens: 200,
      outputFormat: 'json_object',
      outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          answer: { type: 'string' },
        },
        required: ['answer'],
      },
      tags: ['seed'],
    },
  ]);
}

function createDbPrompt(overrides: Partial<PromptDefinitionRow> = {}): PromptDefinitionRow {
  return {
    id: 'db-row-1',
    prompt_key: 'session_analysis',
    name: 'Session Analysis',
    description: 'desc',
    category: 'analysis',
    version: 2,
    system_prompt: 'sys',
    developer_prompt: 'dev',
    user_prompt_template: 'db {{input}}',
    expected_output_schema_json: {
      type: 'object',
      additionalProperties: false,
      properties: {
        answer: { type: 'string' },
      },
      required: ['answer'],
    },
    prompt_variables_definition_json: [],
    model: 'gpt-4.1-mini',
    max_output_tokens: 200,
    response_format: 'json_object',
    is_active: true,
    metadata: {},
    created_by: null,
    updated_by: null,
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
    ...overrides,
  };
}

function setupPromptDefinitionTableMock(params: {
  activeRows: PromptDefinitionRow[];
  latestAny?: { id: string; is_active: boolean } | null;
}) {
  const activeQuery = {
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data: params.activeRows, error: null }),
  };

  const latestAnyQuery = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: params.latestAny ?? null, error: null }),
  };

  const selectMock = vi
    .fn()
    .mockReturnValueOnce(activeQuery)
    .mockReturnValueOnce(latestAnyQuery);

  fromMock.mockReturnValue({
    select: selectMock,
  });
}

describe('mapExpectedOutputSchemaJsonToRuntimeJsonSchema', () => {
  it('liefert das DB-Schema unverändert zurück, wenn es gültig ist', () => {
    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
      required: ['answer'],
    };

    const mapped = mapExpectedOutputSchemaJsonToRuntimeJsonSchema(schema, {
      promptIdentifier: 'prompt_a',
      promptVersion: 2,
    });

    expect(mapped).toBe(schema);
  });

  it('wirft bei ungültigem DB-Schema einen expliziten Fehler (kein Fallback)', () => {
    expect(() =>
      mapExpectedOutputSchemaJsonToRuntimeJsonSchema(
        {
          properties: {
            answer: { type: 'string' },
          },
          additionalProperties: true,
        },
        {
          promptIdentifier: 'prompt_b',
          promptVersion: 5,
        },
      ),
    ).toThrow('expected_output_schema_json ist für Prompt prompt_b v5 ungültig.');
  });

  it('akzeptiert runtime-konforme Schemas für tutor-/improvement-Prompts', () => {
    const validSchemas = [
      {
        key: 'tutor_explanation',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { explanation: { type: 'string' } },
          required: ['explanation'],
        },
      },
      {
        key: 'tutor_followup_answer',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        },
      },
      {
        key: 'understanding_check',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { status: { type: 'string' } },
          required: ['status'],
        },
      },
      {
        key: 'improvement_check',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            decision: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['decision', 'confidence'],
        },
      },
    ];

    for (const entry of validSchemas) {
      const mapped = mapExpectedOutputSchemaJsonToRuntimeJsonSchema(entry.schema, {
        promptIdentifier: entry.key,
        promptVersion: 1,
      });

      expect(mapped).toBe(entry.schema);
    }
  });

  it('lehnt generische Top-Level-Schemas (additionalProperties=true) für die 4 PromptKeys ab', () => {
    const keys = ['tutor_explanation', 'tutor_followup_answer', 'understanding_check', 'improvement_check'] as const;

    for (const key of keys) {
      expect(() =>
        mapExpectedOutputSchemaJsonToRuntimeJsonSchema(
          {
            type: 'object',
            additionalProperties: true,
            properties: {
              decision: { type: 'string' },
            },
            required: ['decision'],
          },
          {
            promptIdentifier: key,
            promptVersion: 1,
          },
        ),
      ).toThrow(/ungültig|Legacy-Felder|additionalProperties=false/);
    }
  });

  it('lehnt driftendes improvement_check-Schema mit confidence.maximum > 1 ab', () => {
    expect(() =>
      mapExpectedOutputSchemaJsonToRuntimeJsonSchema(
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            decision: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1.2 },
            rationale: { type: 'string' },
            focus_evidence: { type: 'string' },
            baseline_evidence: { type: 'array', items: { type: 'string' } },
            current_evidence: { type: 'array', items: { type: 'string' } },
            focus_topic_key: { type: 'string' },
            focus_topic_key_match: { type: 'boolean' },
            focus_topic_match: { type: 'boolean' },
            recommendation: { type: 'string' },
          },
          required: [
            'decision',
            'confidence',
            'rationale',
            'focus_evidence',
            'baseline_evidence',
            'current_evidence',
            'focus_topic_key',
            'focus_topic_key_match',
            'focus_topic_match',
            'recommendation',
          ],
        },
        {
          promptIdentifier: 'improvement_check',
          promptVersion: 9,
        },
      ),
    ).toThrow(/ungültig|confidence|Legacy-Felder/);
  });
});

describe('DbPromptRegistryAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('liefert aktiven DB-Prompt als autoritative Quelle', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [createDbPrompt()],
      latestAny: null,
    });

    const adapter = new DbPromptRegistryAdapter();
    const result = await adapter.getPromptByPromptKey('session_analysis');

    expect(result.source).toBe('db');
    expect(result.prompt?.template).toBe('db {{input}}');
    expect(result.prompt?.tags).toEqual(['db-active']);
  });

  it('wirft technischen Fehler bei fehlendem DB-Prompt für DB-required Key', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [],
      latestAny: null,
    });

    const adapter = new DbPromptRegistryAdapter();
    await expect(adapter.getPromptByPromptKey('session_analysis')).rejects.toMatchObject({
      name: 'DbPromptRegistryError',
      code: 'db_missing',
    } satisfies Partial<DbPromptRegistryError>);
  });

  it('wirft technischen Fehler bei inaktivem DB-Prompt für DB-required Key', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [],
      latestAny: { id: 'latest', is_active: false },
    });

    const adapter = new DbPromptRegistryAdapter();
    await expect(adapter.getPromptByPromptKey('session_analysis')).rejects.toMatchObject({
      name: 'DbPromptRegistryError',
      code: 'db_inactive',
    } satisfies Partial<DbPromptRegistryError>);
  });

  it('wirft technischen Fehler bei fehlendem DB-Prompt für strikt DB-required tutor_explanation', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [],
      latestAny: null,
    });

    const adapter = new DbPromptRegistryAdapter();
    await expect(adapter.getPromptByPromptKey('tutor_explanation')).rejects.toMatchObject({
      name: 'DbPromptRegistryError',
      code: 'db_missing',
    } satisfies Partial<DbPromptRegistryError>);
  });

  it('wirft Fehler bei aktivem DB-Prompt mit invalidem Schema (kein seed fallback)', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [
        createDbPrompt({
          expected_output_schema_json: {
            properties: { answer: { type: 'string' } },
          },
        }),
      ],
      latestAny: null,
    });

    const adapter = new DbPromptRegistryAdapter();

    await expect(adapter.getPromptByPromptKey('session_analysis')).rejects.toMatchObject({
      name: 'DbPromptRegistryError',
      code: 'db_invalid_schema',
    } satisfies Partial<DbPromptRegistryError>);

    await expect(adapter.getPromptByPromptKey('session_analysis')).rejects.not.toMatchObject({
      source: 'db',
    });
  });

  it('wirft Validierungsfehler bei aktivem improvement_check mit Legacy-Feldern im Schema', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [
        createDbPrompt({
          prompt_key: 'improvement_check',
          expected_output_schema_json: {
            type: 'object',
            properties: {
              decision: { type: 'string' },
              improvement_status: { type: 'string' },
            },
            required: ['decision', 'improvement_status'],
          },
        }),
      ],
      latestAny: null,
    });

    const adapter = new DbPromptRegistryAdapter();

    await expect(adapter.getPromptByPromptKey('improvement_check')).rejects.toMatchObject({
      name: 'DbPromptRegistryError',
      code: 'db_invalid_schema',
    } satisfies Partial<DbPromptRegistryError>);
  });

  it('wirft Validierungsfehler bei aktivem tutor_explanation mit Legacy-Mini-Map-Feldern', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [
        createDbPrompt({
          prompt_key: 'tutor_explanation',
          expected_output_schema_json: {
            type: 'object',
            additionalProperties: false,
            properties: {
              explanation: { type: 'string' },
              title: { type: 'string' },
            },
            required: ['explanation', 'title'],
          },
        }),
      ],
      latestAny: null,
    });

    const adapter = new DbPromptRegistryAdapter();

    await expect(adapter.getPromptByPromptKey('tutor_explanation')).rejects.toMatchObject({
      name: 'DbPromptRegistryError',
      code: 'db_invalid_schema',
    } satisfies Partial<DbPromptRegistryError>);
  });

  it('wirft Validierungsfehler bei aktivem tutor_followup_answer mit Legacy-Feldern', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [
        createDbPrompt({
          prompt_key: 'tutor_followup_answer',
          expected_output_schema_json: {
            type: 'object',
            additionalProperties: false,
            properties: {
              answer_text: { type: 'string' },
              did_expand_scope: { type: 'boolean' },
              suggested_next_step: { type: 'string' },
            },
            required: ['answer_text', 'did_expand_scope', 'suggested_next_step'],
          },
        }),
      ],
      latestAny: null,
    });

    const adapter = new DbPromptRegistryAdapter();

    await expect(adapter.getPromptByPromptKey('tutor_followup_answer')).rejects.toMatchObject({
      name: 'DbPromptRegistryError',
      code: 'db_invalid_schema',
    } satisfies Partial<DbPromptRegistryError>);
  });

  it('prüft Legacy-Felder sowohl gegen schema.properties als auch schema.required', () => {
    expect(() =>
      mapExpectedOutputSchemaJsonToRuntimeJsonSchema(
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string' },
            understanding_status: { type: 'string' },
          },
          required: ['status', 'understanding_status'],
        },
        {
          promptIdentifier: 'understanding_check',
          promptVersion: 3,
        },
      ),
    ).toThrow(/Legacy-Felder \(understanding_status\)/);
  });

  it('akzeptiert aktives improvement_check-Schema mit neuen Fokusfeldern', async () => {
    setupPromptDefinitionTableMock({
      activeRows: [
        createDbPrompt({
          prompt_key: 'improvement_check',
          expected_output_schema_json: {
            type: 'object',
            additionalProperties: false,
            properties: {
              decision: { type: 'string' },
              confidence: { type: 'number' },
              rationale: { type: 'string' },
              focus_evidence: { type: 'string' },
              baseline_evidence: { type: 'array', items: { type: 'string' } },
              current_evidence: { type: 'array', items: { type: 'string' } },
              focus_topic_key: { type: 'string' },
              focus_topic_key_match: { type: 'boolean' },
              focus_topic_match: { type: 'boolean' },
              recommendation: { type: 'string' },
            },
            required: [
              'decision',
              'confidence',
              'rationale',
              'focus_evidence',
              'baseline_evidence',
              'current_evidence',
              'focus_topic_key',
              'focus_topic_key_match',
              'focus_topic_match',
              'recommendation',
            ],
          },
        }),
      ],
      latestAny: null,
    });

    const adapter = new DbPromptRegistryAdapter();
    const result = await adapter.getPromptByPromptKey('improvement_check');

    expect(result.source).toBe('db');
    expect(result.prompt?.outputSchema.required).toContain('focus_topic_key');
    expect(result.prompt?.outputSchema.required).toContain('focus_topic_key_match');
  });
});
