import { describe, expect, it } from 'vitest';
import { USAGE_GUARD_ERROR_CODES, getUsageGuardMessage, mapUsageGuardErrorToUiMessage } from '@/services/limits/usage-guards';

describe('usage-guards', () => {
  it('builds consistent hard-stop token message', () => {
    expect(getUsageGuardMessage({ code: USAGE_GUARD_ERROR_CODES.TOKEN_LIMIT_EXCEEDED, limitValue: 100.4 })).toBe(
      'Monatliches Token-Limit erreicht (100).',
    );
  });

  it('maps usage guard error codes to UI messages', () => {
    expect(mapUsageGuardErrorToUiMessage(USAGE_GUARD_ERROR_CODES.TOKEN_LIMIT_EXCEEDED)).toContain('monatliches Token-Limit');
    expect(mapUsageGuardErrorToUiMessage(USAGE_GUARD_ERROR_CODES.SESSION_LENGTH_LIMIT_EXCEEDED)).toContain('Session-Längenlimit');
    expect(mapUsageGuardErrorToUiMessage('unknown')).toBeNull();
  });
});
