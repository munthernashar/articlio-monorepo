import type { FocusTopicStatus } from '@/types/database';
import { TUTOR_RELEASED_FOCUS_STATUSES } from '@/services/domain/focus-topic-policy';

// Keep in sync with partial unique index `idx_single_active_focus`
// from `supabase/migrations/20260424213000_align_primary_focus_index.sql`.
export const PRIMARY_FOCUS_STATUSES: FocusTopicStatus[] = [
  'in_training',
  'teilweise_stabilisiert',
];

export const TUTOR_ELIGIBLE_FOCUS_STATUSES: FocusTopicStatus[] = [
  ...TUTOR_RELEASED_FOCUS_STATUSES,
];

export const OBSERVED_FOCUS_STATUSES: FocusTopicStatus[] = [
  'unentdeckt',
  'beobachtet',
  'wiederkehrend',
];

export const COMPLETED_FOCUS_STATUSES: FocusTopicStatus[] = [
  'stabil',
];

export function isPrimaryFocusStatus(status: FocusTopicStatus): boolean {
  return PRIMARY_FOCUS_STATUSES.includes(status);
}

export function isTutorEligibleStatus(status: FocusTopicStatus): boolean {
  return TUTOR_ELIGIBLE_FOCUS_STATUSES.includes(status);
}
