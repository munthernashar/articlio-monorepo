const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type CustomerPortalRequest = {
  returnUrl: string;
};

type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

type CustomerPortalRequest = {
  returnUrl: string;
};

type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  const body: ErrorBody = {
    error: {
      code,
      message,
    },
  };

  return jsonResponse(body, status);
}

function isAllowedOrigin(url: URL, allowedAppOrigin: string): boolean {
  if (url.origin === allowedAppOrigin) {
    return true;
  }

  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

function parseAndValidateUrl(input: string, allowedAppOrigin: string): URL | null {
  try {
    const parsed = new URL(input);
    if (!isAllowedOrigin(parsed, allowedAppOrigin)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getAllowedAppOrigin(): string | null {
  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim() ?? '';
  if (!appBaseUrl) {
    return null;
  }

  try {
    return new URL(appBaseUrl).origin;
  } catch {
    return null;
  }
}

function validateRequest(payload: unknown, allowedAppOrigin: string): CustomerPortalRequest | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const { returnUrl } = payload as Record<string, unknown>;
  if (typeof returnUrl !== 'string' || returnUrl.trim().length === 0) {
    return null;
  }

  const parsedReturnUrl = parseAndValidateUrl(returnUrl.trim(), allowedAppOrigin);
  if (!parsedReturnUrl) {
    return null;
  }

  return {
    returnUrl: parsedReturnUrl.toString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed. Use POST.', 405);
  }

  const allowedAppOrigin = getAllowedAppOrigin();
  if (!allowedAppOrigin) {
    return errorResponse(
      'SERVER_MISCONFIGURED',
      'Server configuration error: APP_BASE_URL is missing or invalid.',
      500,
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('INVALID_JSON', 'Invalid JSON payload.', 400);
  }

  const parsed = validateRequest(payload, allowedAppOrigin);
  if (!parsed) {
    return errorResponse(
      'INVALID_RETURN_URL_ORIGIN',
      'Invalid input. returnUrl must use an allowed origin.',
      400,
    );
  }

  return errorResponse(
    'FUNCTION_DEPRECATED',
    'This endpoint is deprecated. Please use create-billing-portal-session with { returnUrl, flowType? }.',
    410,
  );
});
