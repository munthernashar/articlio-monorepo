import { mapFocusAreaStatusToProductStatus } from '@/lib/src/lib/productLanguage';
import type { FocusTopicStatus } from '@/features/focus-topic/status-labels';

export function getFocusStatusDisplay(status: FocusTopicStatus) {
  const productStatus = mapFocusAreaStatusToProductStatus(status);
  return {
    short: productStatus.label,
    long: productStatus.description,
  };
}
