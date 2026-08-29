export type ApiRetryHint = {
  recommended: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  retryAfterMs?: number;
};

export type ApiSuccessMeta = {
  traceId: string;
  timestamp: string;
  status: number;
  retry?: ApiRetryHint;
};

export type ApiSuccessResponse<TData> = {
  data: TData;
  meta: ApiSuccessMeta;
};

export type ApiErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'upstream_timeout'
  | 'upstream_unavailable'
  | 'upstream_error'
  | 'network_error'
  | 'parse_error'
  | 'token_limit_exceeded'
  | 'unknown_error';

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
  traceId: string;
  status: number;
  retry: ApiRetryHint;
};

export type ApiResult<TData> =
  | {
      ok: true;
      response: ApiSuccessResponse<TData>;
    }
  | {
      ok: false;
      response: ApiErrorResponse;
    };

export function createTraceId(prefix = 'api'): string {
  const randomSegment = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${randomSegment}`;
}

export function parseRetryAfterToMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber * 1000;
  }

  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return undefined;
}

export function createApiSuccess<TData>(params: {
  data: TData;
  traceId: string;
  status: number;
  retry?: ApiRetryHint;
}): ApiResult<TData> {
  return {
    ok: true,
    response: {
      data: params.data,
      meta: {
        traceId: params.traceId,
        timestamp: new Date().toISOString(),
        status: params.status,
        retry: params.retry,
      },
    },
  };
}

export function createApiError<TData = never>(params: {
  code: ApiErrorCode;
  message: string;
  traceId: string;
  status: number;
  retry?: ApiRetryHint;
}): ApiResult<TData> {
  return {
    ok: false,
    response: {
      error: {
        code: params.code,
        message: params.message,
      },
      traceId: params.traceId,
      status: params.status,
      retry: params.retry ?? { recommended: false },
    },
  };
}


export type BillingPlanFeatureFlags = Record<string, boolean>;

export type BillingPlanLimits = Record<string, number>;

export type BillingPlanContract = {
  planKey: 'free' | 'starter' | 'pro';
  displayName: string;
  priceLabel: string;
  note: string;
  featureFlags: BillingPlanFeatureFlags;
  limits: BillingPlanLimits;
  sortOrder: number;
};
