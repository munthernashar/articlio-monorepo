import type { FocusTopicStatus, Json } from '@/types/database';

export const ALLOWED_FOCUS_STATES: FocusTopicStatus[] = [
  'unentdeckt',
  'beobachtet',
  'wiederkehrend',
  'in_training',
  'teilweise_stabilisiert',
  'stabil',
  'rueckfall_erkannt',
];

export type FocusEvent =
  | 'focus_selected'
  | 'focus_replaced_by_new_selection'
  | 'improvement_improved'
  | 'improvement_worsened'
  | 'improvement_unchanged'
  | 'tutor_mark_sufficient'
  | 'tutor_mark_partial'
  | 'tutor_mark_not_yet';

export type FocusStatusHistorySource =
  | 'multi_session_pattern.service'
  | 'improvement_check.service'
  | 'tutor.service'
  | 'system';

export type FocusStatusHistoryEntry = {
  timestamp: string;
  from: FocusTopicStatus | null;
  to: FocusTopicStatus;
  reason: string;
  source: FocusStatusHistorySource;
};

export type FocusMetadataWithHistory = Record<string, unknown> & {
  status_history: FocusStatusHistoryEntry[];
};

export type ApplyFocusEventContext = {
  metadata?: Json | Record<string, unknown>;
  reason: string;
  source: FocusStatusHistorySource;
  timestamp?: string;
};

export type FocusTransitionResult = {
  nextStatus: FocusTopicStatus;
  metadata: FocusMetadataWithHistory;
  historyEntry: FocusStatusHistoryEntry;
};

const TRANSITIONS: Record<
  FocusEvent,
  {
    any?: FocusTopicStatus;
    from?: Partial<Record<FocusTopicStatus, FocusTopicStatus>>;
    fromNull?: FocusTopicStatus;
  }
> = {
  focus_selected: {
    any: 'in_training',
    fromNull: 'in_training',
  },
  focus_replaced_by_new_selection: {
    from: {
      in_training: 'beobachtet',
      teilweise_stabilisiert: 'beobachtet',
      rueckfall_erkannt: 'beobachtet',
    },
  },
  improvement_improved: {
    from: {
      wiederkehrend: 'in_training',
      in_training: 'teilweise_stabilisiert',
      teilweise_stabilisiert: 'stabil',
      stabil: 'stabil',
      rueckfall_erkannt: 'in_training',
    },
  },
  improvement_worsened: {
    from: {
      in_training: 'wiederkehrend',
      teilweise_stabilisiert: 'wiederkehrend',
      stabil: 'rueckfall_erkannt',
      rueckfall_erkannt: 'rueckfall_erkannt',
      wiederkehrend: 'wiederkehrend',
    },
  },
  improvement_unchanged: {
    from: {
      in_training: 'in_training',
      teilweise_stabilisiert: 'teilweise_stabilisiert',
      stabil: 'stabil',
      rueckfall_erkannt: 'rueckfall_erkannt',
      wiederkehrend: 'wiederkehrend',
    },
  },
  tutor_mark_sufficient: {
    from: {
      in_training: 'teilweise_stabilisiert',
      teilweise_stabilisiert: 'stabil',
      rueckfall_erkannt: 'stabil',
      stabil: 'stabil',
    },
  },
  tutor_mark_partial: {
    from: {
      in_training: 'in_training',
      teilweise_stabilisiert: 'teilweise_stabilisiert',
      rueckfall_erkannt: 'in_training',
      stabil: 'teilweise_stabilisiert',
      wiederkehrend: 'in_training',
    },
  },
  tutor_mark_not_yet: {
    from: {
      in_training: 'in_training',
      teilweise_stabilisiert: 'in_training',
      rueckfall_erkannt: 'in_training',
      stabil: 'in_training',
      wiederkehrend: 'in_training',
    },
  },
};

function asRecord(value: Json | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseHistoryEntry(value: unknown): FocusStatusHistoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const timestamp = typeof row.timestamp === 'string' ? row.timestamp : null;
  const from = row.from;
  const to = row.to;
  const reason = typeof row.reason === 'string' ? row.reason : null;
  const source = row.source;

  const legacyStatus = typeof row.status === 'string' ? row.status : null;
  const normalizedTo = (typeof to === 'string' ? to : legacyStatus) as FocusTopicStatus | null;
  if (!timestamp || !normalizedTo || !reason) {
    return null;
  }
  if (!ALLOWED_FOCUS_STATES.includes(normalizedTo)) {
    return null;
  }

  const normalizedFrom =
    from === null ? null : typeof from === 'string' && ALLOWED_FOCUS_STATES.includes(from as FocusTopicStatus) ? (from as FocusTopicStatus) : null;

  const normalizedSource: FocusStatusHistorySource =
    source === 'multi_session_pattern.service' ||
    source === 'improvement_check.service' ||
    source === 'tutor.service' ||
    source === 'system'
      ? source
      : 'system';

  return {
    timestamp,
    from: normalizedFrom,
    to: normalizedTo,
    reason,
    source: normalizedSource,
  };
}

export function withNormalizedStatusHistory(metadata: Json | Record<string, unknown> | undefined): FocusMetadataWithHistory {
  const base = asRecord(metadata);
  const statusHistoryRaw = Array.isArray(base.status_history) ? base.status_history : [];
  const statusHistory = statusHistoryRaw
    .map((entry) => parseHistoryEntry(entry))
    .filter((entry): entry is FocusStatusHistoryEntry => Boolean(entry));

  return {
    ...base,
    status_history: statusHistory,
  };
}

function resolveNextStatus(current: FocusTopicStatus | null, event: FocusEvent): FocusTopicStatus | null {
  const transition = TRANSITIONS[event];
  if (!transition) return null;

  if (current === null) {
    return transition.fromNull ?? null;
  }
  if (transition.any) {
    return transition.any;
  }
  return transition.from?.[current] ?? null;
}

export function applyFocusEvent(
  current: FocusTopicStatus | null,
  event: FocusEvent,
  context: ApplyFocusEventContext,
): FocusTransitionResult {
  const nextStatus = resolveNextStatus(current, event);
  if (!nextStatus) {
    throw new Error(`Ungültige Fokus-Transition: ${current ?? 'null'} --(${event})-> ?`);
  }

  const historyEntry: FocusStatusHistoryEntry = {
    timestamp: context.timestamp ?? new Date().toISOString(),
    from: current,
    to: nextStatus,
    reason: context.reason,
    source: context.source,
  };

  const normalizedMetadata = withNormalizedStatusHistory(context.metadata);

  return {
    nextStatus,
    historyEntry,
    metadata: {
      ...normalizedMetadata,
      status_history: [...normalizedMetadata.status_history, historyEntry],
    },
  };
}
