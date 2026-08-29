import { describe, expect, it } from 'vitest';

import { isAiEligibleSession } from '@/services/supabase/session-ai-eligibility';

describe('session-ai-eligibility gate decision', () => {
  it.each([
    { status: 'valid', expected: true },
    { status: 'insufficient_data', expected: false },
    { status: 'capped', expected: true },
    { status: 'rejected_too_long', expected: false },
  ])('entscheidet $status korrekt', ({ status, expected }) => {
    const result = isAiEligibleSession({
      status: 'uploaded',
      metadata: { qualityGate: { status } },
    });

    expect(result).toBe(expected);
  });
});

describe('pipeline gate for AI follow-up prompts', () => {
  it.each(['insufficient_data', 'rejected_too_long'])('kein AI-Folgeprompt bei %s', (status) => {
    const shouldRunFollowupPrompt = isAiEligibleSession({
      status: 'uploaded',
      metadata: { qualityGate: { status } },
    });

    expect(shouldRunFollowupPrompt).toBe(false);
  });

  it.each(['valid', 'capped'])('AI-Folgeprompt nur bei %s', (status) => {
    const shouldRunFollowupPrompt = isAiEligibleSession({
      status: 'uploaded',
      metadata: { qualityGate: { status } },
    });

    expect(shouldRunFollowupPrompt).toBe(true);
  });
});
