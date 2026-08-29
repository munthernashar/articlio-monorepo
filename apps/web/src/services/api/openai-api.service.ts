import { appConfig } from '@/lib/config';
import { supabaseClient } from '@/services/supabase/client';
import {
  ApiErrorCode,
  ApiResult,
  ApiRetryHint,
  createApiError,
  createApiSuccess,
  createTraceId,
  parseRetryAfterToMs,
} from '@/services/api/contracts';

export type OpenAIResponseRequest = {
  model: string;
  maxOutputTokens: number;
  outputFormat: 'json_object' | 'text';
  input: Array<{
    role: 'system' | 'developer' | 'user';
    content: string;
  }>;
  structuredOutput?: {
    name: string;
    schema: unknown;
  };
  traceId?: string;
  // Erlaubt dem Proxy, plan-exklusive Prompts (aktuell: coach_*) serverseitig
  // gegen das Entitlement des Aufrufers zu prüfen, statt sich auf die
  // UI-Sperre (TutorPage.tsx) als einzige Kontrolle zu verlassen.
  promptKey?: string;
};

type OpenAIResponseOutputItem = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export type OpenAIResponseApiResponse = {
  id?: string;
  output_text?: string;
  output?: OpenAIResponseOutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

export type OpenAIResponse = OpenAIResponseApiResponse & {
  text: string;
};

function mapError(status: number): { code: ApiErrorCode; retry: ApiRetryHint } {
  if (status === 400 || status === 422) {
    return {
      code: 'invalid_request',
      retry: { recommended: false },
    };
  }

  if (status === 401) {
    return {
      code: 'unauthorized',
      retry: { recommended: false },
    };
  }

  if (status === 403) {
    return {
      code: 'forbidden',
      retry: { recommended: false },
    };
  }

  if (status === 404) {
    return {
      code: 'not_found',
      retry: { recommended: false },
    };
  }

  if (status === 408) {
    return {
      code: 'upstream_timeout',
      retry: { recommended: true, maxAttempts: 3, baseDelayMs: 300 },
    };
  }

  if (status === 429) {
    return {
      code: 'rate_limited',
      retry: { recommended: true, maxAttempts: 5, baseDelayMs: 1000 },
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      code: 'upstream_unavailable',
      retry: { recommended: true, maxAttempts: 4, baseDelayMs: 600 },
    };
  }

  if (status >= 500) {
    return {
      code: 'upstream_error',
      retry: { recommended: true, maxAttempts: 3, baseDelayMs: 500 },
    };
  }

  return {
    code: 'unknown_error',
    retry: { recommended: false },
  };
}

function getOpenAiProxyUrl(): string {
  const supabaseUrl = appConfig.supabase.url.replace(/\/$/, '');
  const proxyPath = appConfig.openai.proxyPath.startsWith('/')
    ? appConfig.openai.proxyPath
    : `/${appConfig.openai.proxyPath}`;
  return `${supabaseUrl}${proxyPath}`;
}

function hasStructuredOutputProperties(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return false;
  }

  const candidate = schema as Record<string, unknown>;

  return (
    candidate.type === 'object' &&
    !!candidate.properties &&
    typeof candidate.properties === 'object' &&
    !Array.isArray(candidate.properties) &&
    Object.keys(candidate.properties).length > 0
  );
}

function makeStrictJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }

  const source = schema as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([propertyName, propertySchema]) => [
          propertyName,
          makeStrictJsonSchema(propertySchema),
        ]),
      );
      continue;
    }

    if (key === 'items') {
      next[key] = makeStrictJsonSchema(value);
      continue;
    }

    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      next[key] = Array.isArray(value) ? value.map(makeStrictJsonSchema) : value;
      continue;
    }

    next[key] = makeStrictJsonSchema(value);
  }

  if (source.type === 'object') {
    const properties =
      next.properties && typeof next.properties === 'object' && !Array.isArray(next.properties)
        ? (next.properties as Record<string, unknown>)
        : {};

    next.properties = properties;
    next.required = Object.keys(properties);
    next.additionalProperties = false;
  }

  return next;
}

export const openAiApiService = {
  async createResponse(request: OpenAIResponseRequest): Promise<ApiResult<OpenAIResponse>> {
    const traceId = request.traceId ?? createTraceId('openai');
const canUseStructuredOutput =
  request.outputFormat === 'json_object' &&
  request.structuredOutput &&
  request.structuredOutput.schema &&
  typeof request.structuredOutput.schema === 'object' &&
  (request.structuredOutput.schema as any).type === 'object' &&
  (request.structuredOutput.schema as any).properties &&
  Object.keys((request.structuredOutput.schema as any).properties).length > 0;

const responseFormat =
  request.outputFormat === 'json_object'
    ? canUseStructuredOutput
      ? {
          type: 'json_schema' as const,
          name: request.structuredOutput!.name,
          schema: makeStrictJsonSchema(request.structuredOutput!.schema),
        }
      : {
          type: 'json_object' as const,
        }
    : {
        type: 'text' as const,
      };

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      if (!session?.access_token) {
        return createApiError({
          code: 'unauthorized',
          message: 'OpenAI proxy request requires an authenticated user session.',
          traceId,
          status: 401,
          retry: { recommended: false },
        });
      }

      const response = await fetch(getOpenAiProxyUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: appConfig.supabase.anonKey,
          Authorization: `Bearer ${session.access_token}`,
          'X-Trace-Id': traceId,
        },
        body: JSON.stringify({
          model: request.model,
          max_output_tokens: request.maxOutputTokens,
          prompt_key: request.promptKey,
          input: request.input.map((message) => ({
            role: message.role,
            content: [
              {
                type: 'input_text',
                text: message.content,
              },
            ],
          })),
          text: {
            format: responseFormat,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const mapped = mapError(response.status);
        return createApiError({
          code: mapped.code,
          message: `OpenAI proxy request failed with status ${response.status}: ${errorText}`,
          traceId,
          status: response.status,
          retry: {
            ...mapped.retry,
            retryAfterMs: parseRetryAfterToMs(response.headers.get('retry-after')),
          },
        });
      }

      let payload: OpenAIResponseApiResponse;
      try {
        payload = (await response.json()) as OpenAIResponseApiResponse;
      } catch {
        return createApiError({
          code: 'parse_error',
          message: 'OpenAI proxy response could not be parsed as JSON.',
          traceId,
          status: response.status,
          retry: { recommended: false },
        });
      }

      const outputText =
        payload.output_text ??
        payload.output
          ?.flatMap((item) => item.content ?? [])
          .map((contentItem) => (contentItem.type === 'output_text' ? contentItem.text ?? '' : ''))
          .join('')
          .trim() ??
        '';

      return createApiSuccess({
        data: {
          ...payload,
          text: outputText,
        },
        traceId,
        status: response.status,
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      return createApiError({
        code: isTimeout ? 'upstream_timeout' : 'network_error',
        message: isTimeout
          ? 'OpenAI proxy request timed out after 30s.'
          : error instanceof Error
            ? error.message
            : 'Network error while contacting OpenAI proxy.',
        traceId,
        status: 0,
        retry: {
          recommended: true,
          maxAttempts: 3,
          baseDelayMs: isTimeout ? 300 : 500,
        },
      });
    }
  },
};
