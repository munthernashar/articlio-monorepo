import { describe, expect, it } from 'vitest';

import { getFocusTopicPolicy, isLearningLoopOpen, isTutorReleasedForFocus } from '@/services/domain/focus-topic-policy';

describe('focus-topic-policy mastery outcomes', () => {
  it('berücksichtigt mastery_level aktiv im Progress-Outcome (Narrativ + CTA)', () => {
    const low = getFocusTopicPolicy({ status: 'in_training', masteryLevel: 1 });
    const high = getFocusTopicPolicy({ status: 'in_training', masteryLevel: 5 });

    expect(low?.progress.narrative).not.toBe(high?.progress.narrative);
    expect(low?.progress.cta).not.toBe(high?.progress.cta);
  });

  it('steuert Tutor-Freigabe und Learning-Loop ausschließlich über Policy', () => {
    expect(isTutorReleasedForFocus({ status: 'stabil', masteryLevel: 5 })).toBe(false);
    expect(isTutorReleasedForFocus({ status: 'in_training', masteryLevel: 0 })).toBe(true);

    expect(isLearningLoopOpen({ status: 'stabil', masteryLevel: 5 })).toBe(false);
    expect(isLearningLoopOpen({ status: 'teilweise_stabilisiert', masteryLevel: 3 })).toBe(true);
  });
});
