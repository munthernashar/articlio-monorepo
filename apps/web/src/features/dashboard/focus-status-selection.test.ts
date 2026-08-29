import { describe, expect, it } from 'vitest';

import { getFocusStatusDisplay } from '@/features/focus-topic/status-display';
import { mapFocusAreaStatusToProductStatus } from '@/lib/src/lib/productLanguage';
import type { FocusTopicStatus } from '@/types/database';

const ALL_FOCUS_STATUSES: FocusTopicStatus[] = [
  'unentdeckt',
  'beobachtet',
  'wiederkehrend',
  'in_training',
  'teilweise_stabilisiert',
  'stabil',
  'rueckfall_erkannt',
];

describe('UI Fokus-Status-Selektion', () => {
  it.each(ALL_FOCUS_STATUSES)('Status-Display rendert short/long korrekt für %s', (status) => {
    const display = getFocusStatusDisplay(status);
    const productStatus = mapFocusAreaStatusToProductStatus(status);

    expect(display.short).toBe(productStatus.label);
    expect(display.long).toBe(productStatus.description);
    expect(display.short.length).toBeGreaterThan(0);
    expect(display.long.length).toBeGreaterThan(0);
  });
});
