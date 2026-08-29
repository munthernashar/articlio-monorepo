export const USAGE_GUARD_ERROR_CODES = {
  TOKEN_LIMIT_EXCEEDED: 'token_limit_exceeded',
  SESSION_LENGTH_LIMIT_EXCEEDED: 'session_length_limit_exceeded',
} as const;

export type UsageGuardErrorCode = (typeof USAGE_GUARD_ERROR_CODES)[keyof typeof USAGE_GUARD_ERROR_CODES];

export function getUsageGuardMessage(params: { code: UsageGuardErrorCode; limitValue?: number | null }): string {
  if (params.code === USAGE_GUARD_ERROR_CODES.TOKEN_LIMIT_EXCEEDED) {
    return `Monatliches Token-Limit erreicht (${Math.max(0, Math.round(params.limitValue ?? 0))}).`;
  }

  const maxSeconds = Math.max(0, Math.round(params.limitValue ?? 0));
  return `Aufnahme zu lang: maximal ${maxSeconds} Sekunden (${Math.round(maxSeconds / 60)} Minuten).`;
}

export function mapUsageGuardErrorToUiMessage(errorCode: string | null | undefined): string | null {
  if (errorCode === USAGE_GUARD_ERROR_CODES.TOKEN_LIMIT_EXCEEDED) {
    return 'Dein monatliches Token-Limit ist erreicht. Bitte prüfe dein Abo im Billing-Bereich.';
  }

  if (errorCode === USAGE_GUARD_ERROR_CODES.SESSION_LENGTH_LIMIT_EXCEEDED) {
    return 'Diese Aufnahme überschreitet dein Session-Längenlimit.';
  }

  return null;
}
