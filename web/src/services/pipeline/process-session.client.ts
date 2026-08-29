import { supabaseClient } from '@/services/supabase/client';

export type ProcessSessionResponse = {
  ok: boolean;
  sessionId?: string;
  status?: string;
  traceId?: string;
  error?: string | { code?: string; message?: string };
  statusCode?: number;
};

async function readFunctionErrorBody(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response | null })?.context;

  if (!context) return null;

  try {
    return await context.text();
  } catch {
    return null;
  }
}

function normalizeFunctionErrorMessage(error: unknown, responseBody: string | null): string {
  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody) as ProcessSessionResponse;
      if (typeof parsed.error === 'string') return parsed.error;
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      return responseBody;
    }
  }

  return error instanceof Error ? error.message : 'process-session failed.';
}

export async function invokeProcessSession(sessionId: string): Promise<ProcessSessionResponse> {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session?.access_token) {
    return {
      ok: false,
      error: 'You must be signed in before processing a session.',
      statusCode: 401,
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };

  const { data, error } = await supabaseClient.functions.invoke<ProcessSessionResponse>('process-session', {
    body: { sessionId },
    headers,
  });

  if (error) {
    const responseBody = await readFunctionErrorBody(error);
    const rawStatus = error.context?.status;
    const statusCode = typeof rawStatus === 'number' ? rawStatus : undefined;

    console.error('[process-session.client] invoke failed', {
      sessionId,
      statusCode,
      error,
      responseBody,
    });

    const isFunctionNotFound =
      statusCode === 404 &&
      /function.*not found|not found.*function/i.test(error.message);

    return {
      ok: false,
      error: isFunctionNotFound
        ? 'process-session function is unavailable (404). Deploy the Supabase Edge Function "process-session" to this project.'
        : normalizeFunctionErrorMessage(error, responseBody),
      statusCode,
    };
  }

  return data ?? { ok: false, error: 'Empty response from process-session function.' };
}
