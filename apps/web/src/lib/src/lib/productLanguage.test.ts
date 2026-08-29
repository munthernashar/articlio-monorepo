import { describe, expect, it } from 'vitest';

import { mapDialogueStatusToProductStatus } from './productLanguage';

describe('mapDialogueStatusToProductStatus', () => {
  it('zeigt für analyzed nicht mehr den laufenden Analyse-Status an', () => {
    const status = mapDialogueStatusToProductStatus('analyzed');

    expect(status.label).toBe('Analysiert');
    expect(status.tone).toBe('positive');
  });
});
