const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const TRANSCRIPTION_ERROR_CODES = {
  MISSING_AUDIO_PATH: 'missing_audio_path',
  MISSING_SESSION_ID: 'missing_session_id',
  MISSING_USER_ID: 'missing_user_id',
  STORAGE_FILE_NOT_FOUND: 'storage_file_not_found',
  STORAGE_DOWNLOAD_FAILED: 'storage_download_failed',
  INVALID_AUDIO_FORMAT: 'invalid_audio_format',
  STT_PROVIDER_ERROR: 'stt_provider_error',
  MISSING_STT_API_KEY: 'missing_stt_api_key',
  UNAUTHORIZED: 'unauthorized',
  UNKNOWN_ERROR: 'unknown_error',
} as const;

type TranscriptionErrorCode = (typeof TRANSCRIPTION_ERROR_CODES)[keyof typeof TRANSCRIPTION_ERROR_CODES];

type HandlerConfig = {
  openAiApiKey?: string;
  openAiBaseUrl: string;
  sttProvider: string;
  sttModel: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

type CreateClientFn = (
  supabaseUrl: string,
  supabaseAnonKey: string,
  options: { global: { headers: { Authorization: string } } },
) => {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }> } };
};

type CreateHandlerDeps = {
  fetchFn?: typeof fetch;
  createClientFn: CreateClientFn;
};

type TranscribeRequest = {
  userId: string;
  sessionId: string;
  audioBucket: string;
  audioFilePath: string;
  expectedLanguage?: string;
};

type ErrorEnvelope = {
  success: false;
  error: {
    code: TranscriptionErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
  traceId: string;
};

type SuccessEnvelope = {
  success: true;
  data: {
    rawTranscript: string;
    languageCode: string | null;
    segments: unknown[];
  };
  traceId: string;
};

const ALLOWED_AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'webm', 'ogg', 'oga', 'mp4', 'mpeg', 'mpga']);

function jsonResponse(body: ErrorEnvelope | SuccessEnvelope, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function successResponse(traceId: string, data: SuccessEnvelope['data']): Response {
  return jsonResponse({ success: true, data, traceId }, 200);
}

function errorResponse(
  traceId: string,
  status: number,
  code: TranscriptionErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse({ success: false, error: { code, message, details: details ?? {} }, traceId }, status);
}

function getExtension(path: string): string | null {
  const lastPart = path.split('/').pop();
  if (!lastPart || !lastPart.includes('.')) {
    return null;
  }

  return lastPart.split('.').pop()?.toLowerCase() ?? null;
}

export function parseRequest(
  payload: unknown,
  traceId: string,
): { ok: true; value: TranscribeRequest } | { ok: false; response: Response } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, response: errorResponse(traceId, 400, TRANSCRIPTION_ERROR_CODES.UNKNOWN_ERROR, 'Invalid JSON payload.') };
  }

  const { userId, sessionId, audioBucket, audioFilePath, expectedLanguage } = payload as Record<string, unknown>;

  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return { ok: false, response: errorResponse(traceId, 400, TRANSCRIPTION_ERROR_CODES.MISSING_USER_ID, 'Missing required field: userId.') };
  }

  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return { ok: false, response: errorResponse(traceId, 400, TRANSCRIPTION_ERROR_CODES.MISSING_SESSION_ID, 'Missing required field: sessionId.') };
  }

  if (typeof audioFilePath !== 'string' || audioFilePath.trim().length === 0) {
    return { ok: false, response: errorResponse(traceId, 400, TRANSCRIPTION_ERROR_CODES.MISSING_AUDIO_PATH, 'Missing required field: audioFilePath.') };
  }

  if (typeof audioBucket !== 'string' || audioBucket.trim().length === 0) {
    return {
      ok: false,
      response: errorResponse(traceId, 400, TRANSCRIPTION_ERROR_CODES.INVALID_AUDIO_FORMAT, 'Missing required field: audioBucket.'),
    };
  }

  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(audioBucket.trim())) {
    return {
      ok: false,
      response: errorResponse(traceId, 400, TRANSCRIPTION_ERROR_CODES.INVALID_AUDIO_FORMAT, 'Invalid audioBucket format.'),
    };
  }

  if (
    audioFilePath.startsWith('/')
    || audioFilePath.endsWith('/')
    || audioFilePath.includes('..')
    || audioFilePath.split('/').some((segment) => segment.length === 0)
    || audioFilePath.startsWith(`${audioBucket.trim()}/`)
  ) {
    return {
      ok: false,
      response: errorResponse(
        traceId,
        400,
        TRANSCRIPTION_ERROR_CODES.INVALID_AUDIO_FORMAT,
        'Invalid audioFilePath format. Expected object path without bucket.',
      ),
    };
  }

  const extension = getExtension(audioFilePath);
  if (!extension || !ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      response: errorResponse(
        traceId,
        400,
        TRANSCRIPTION_ERROR_CODES.INVALID_AUDIO_FORMAT,
        `Unsupported audio format. Allowed: ${Array.from(ALLOWED_AUDIO_EXTENSIONS).join(', ')}.`,
      ),
    };
  }

  if (
    expectedLanguage !== undefined
    && (typeof expectedLanguage !== 'string' || !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(expectedLanguage))
  ) {
    return {
      ok: false,
      response: errorResponse(traceId, 400, TRANSCRIPTION_ERROR_CODES.UNKNOWN_ERROR, 'expectedLanguage is invalid (e.g. de, en, en-US).'),
    };
  }

  return {
    ok: true,
    value: {
      userId: userId.trim(),
      sessionId: sessionId.trim(),
      audioBucket: audioBucket.trim(),
      audioFilePath: audioFilePath.trim(),
      expectedLanguage: expectedLanguage?.trim(),
    },
  };
}

export function splitStoragePath(audioBucket: string, audioFilePath: string): { bucket: string; objectPath: string } {
  return { bucket: audioBucket, objectPath: audioFilePath };
}

function mapStorageErrorToResponse(traceId: string, message: string): Response {
  const lowered = message.toLowerCase();

  if (lowered.includes('not found') || lowered.includes('does not exist')) {
    return errorResponse(traceId, 404, TRANSCRIPTION_ERROR_CODES.STORAGE_FILE_NOT_FOUND, 'Audio file not found in storage');
  }

  if (lowered.includes('permission') || lowered.includes('unauthorized')) {
    return errorResponse(traceId, 403, TRANSCRIPTION_ERROR_CODES.UNAUTHORIZED, 'Not allowed to access the provided audio file.');
  }

  return errorResponse(traceId, 502, TRANSCRIPTION_ERROR_CODES.STORAGE_DOWNLOAD_FAILED, 'Failed to load audio file from storage.');
}

function mapSttErrorToResponse(traceId: string, err: unknown): Response {
  const code = err instanceof Error ? err.message : 'unknown';

  if (code === 'missing_openai_key') {
    return errorResponse(traceId, 500, TRANSCRIPTION_ERROR_CODES.MISSING_STT_API_KEY, 'Missing STT provider API key.');
  }

  if (code === 'provider_unauthorized' || code === 'provider_unavailable' || code === 'provider_bad_request') {
    return errorResponse(traceId, 502, TRANSCRIPTION_ERROR_CODES.STT_PROVIDER_ERROR, 'STT provider returned an error response.');
  }

  return errorResponse(traceId, 500, TRANSCRIPTION_ERROR_CODES.UNKNOWN_ERROR, 'Unexpected STT provider error.');
}

async function transcribeWithOpenAI(
  fileBytes: Uint8Array,
  filename: string,
  expectedLanguage: string | undefined,
  traceId: string,
  config: HandlerConfig,
  fetchFn: typeof fetch,
): Promise<{ text: string; language: string | null; segments?: unknown[] }> {
  if (!config.openAiApiKey) {
    throw new Error('missing_openai_key');
  }

  const formData = new FormData();
  const fileBlob = new Blob([fileBytes]);
  formData.set('file', fileBlob, filename);
  formData.set('model', config.sttModel);
  formData.set('response_format', 'verbose_json');

  if (expectedLanguage) {
    formData.set('language', expectedLanguage);
  }

  const response = await fetchFn(`${config.openAiBaseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      'X-Trace-Id': traceId,
    },
    body: formData,
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) {
      throw new Error('provider_unauthorized');
    }

    if (status === 429 || status >= 500) {
      throw new Error('provider_unavailable');
    }

    throw new Error('provider_bad_request');
  }

  const data = (await response.json()) as { text?: string; language?: string; segments?: unknown[] };
  return {
    text: data.text ?? '',
    language: data.language ?? null,
    segments: Array.isArray(data.segments) ? data.segments : [],
  };
}

export function createTranscribeSessionAudioHandler(
  config: HandlerConfig,
  deps: CreateHandlerDeps,
): (req: Request) => Promise<Response> {
  const fetchFn = deps.fetchFn ?? fetch;
  const createClientFn = deps.createClientFn;

  return async (req: Request): Promise<Response> => {
    const traceId = req.headers.get('X-Trace-Id') ?? crypto.randomUUID();

    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return errorResponse(traceId, 405, TRANSCRIPTION_ERROR_CODES.UNKNOWN_ERROR, 'Method not allowed. Use POST.');
    }

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      return errorResponse(
        traceId,
        500,
        TRANSCRIPTION_ERROR_CODES.UNKNOWN_ERROR,
        'SUPABASE_URL / SUPABASE_ANON_KEY are not configured in the function environment.',
      );
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return errorResponse(traceId, 400, TRANSCRIPTION_ERROR_CODES.UNKNOWN_ERROR, 'Invalid JSON payload.');
    }

    const parsed = parseRequest(payload, traceId);
    if (!parsed.ok) {
      return parsed.response;
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse(traceId, 401, TRANSCRIPTION_ERROR_CODES.UNAUTHORIZED, 'Missing Authorization header.');
    }

    const supabase = createClientFn(config.supabaseUrl, config.supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse(traceId, 401, TRANSCRIPTION_ERROR_CODES.UNAUTHORIZED, 'Invalid or expired user token.');
    }

    if (user.id !== parsed.value.userId) {
      return errorResponse(traceId, 403, TRANSCRIPTION_ERROR_CODES.UNAUTHORIZED, 'userId does not match authenticated user.');
    }

    const { bucket, objectPath } = splitStoragePath(parsed.value.audioBucket, parsed.value.audioFilePath);

    let audioBytes: Uint8Array;
    try {
      const { data: blob, error: storageError } = await supabase.storage.from(bucket).download(objectPath);

      if (storageError) {
        return mapStorageErrorToResponse(traceId, storageError.message);
      }

      audioBytes = new Uint8Array(await blob.arrayBuffer());
    } catch {
      return errorResponse(traceId, 404, TRANSCRIPTION_ERROR_CODES.STORAGE_FILE_NOT_FOUND, 'Audio file not found in storage');
    }

    const filename = parsed.value.audioFilePath.split('/').pop() ?? `session-${parsed.value.sessionId}.audio`;

    try {
      if (config.sttProvider !== 'openai') {
        return errorResponse(traceId, 502, TRANSCRIPTION_ERROR_CODES.STT_PROVIDER_ERROR, `Unsupported STT provider: ${config.sttProvider}.`);
      }

      const transcription = await transcribeWithOpenAI(
        audioBytes,
        filename,
        parsed.value.expectedLanguage,
        traceId,
        config,
        fetchFn,
      );

      return successResponse(traceId, {
        rawTranscript: transcription.text,
        languageCode: transcription.language,
        segments: transcription.segments ?? [],
      });
    } catch (error) {
      return mapSttErrorToResponse(traceId, error);
    }
  };
}

export function createRuntimeHandler(createClientFn: CreateClientFn) {
  return createTranscribeSessionAudioHandler(
    {
      openAiApiKey: Deno.env.get('OPENAI_API_KEY'),
      openAiBaseUrl: Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1',
      sttProvider: Deno.env.get('STT_PROVIDER') ?? 'openai',
      sttModel: Deno.env.get('OPENAI_STT_MODEL') ?? 'gpt-4o-mini-transcribe',
      supabaseUrl: Deno.env.get('SUPABASE_URL'),
      supabaseAnonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    },
    {
      createClientFn,
    },
  );
}

export let handler: ((req: Request) => Promise<Response>) | undefined;

if (typeof Deno !== 'undefined') {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  handler = createRuntimeHandler(createClient as CreateClientFn);
  Deno.serve(handler);
}
