import type { FocusTopicRow } from '@/types/database';

export type FocusTopicStatus = FocusTopicRow['status'];
export type FocusTopicStatusLabelVariant = 'short' | 'long';

const FOCUS_TOPIC_STATUS_LABELS: Record<FocusTopicStatus, Record<FocusTopicStatusLabelVariant, string>> = {
  unentdeckt: {
    short: 'Unentdeckt',
    long: 'Wir haben noch kein Thema für dich gefunden',
  },
  beobachtet: {
    short: 'Beobachtet',
    long: 'Wir sehen ein erstes Muster, brauchen aber noch mehr Sessions',
  },
  wiederkehrend: {
    short: 'Wiederkehrend',
    long: 'Das taucht öfter auf -- das üben wir als Nächstes',
  },
  in_training: {
    short: 'In Training',
    long: 'Du übst gerade aktiv an diesem Thema',
  },
  teilweise_stabilisiert: {
    short: 'Teilweise stabilisiert',
    long: 'Deutliche Fortschritte, aber noch nicht durchgehend sicher',
  },
  stabil: {
    short: 'Stabil',
    long: 'Das sitzt schon gut, wir behalten es locker im Blick',
  },
  rueckfall_erkannt: {
    short: 'Rückfall erkannt',
    long: 'Das ist gerade wieder wackliger geworden -- wir arbeiten daran',
  },
};

export function getFocusTopicStatusLabel(status: FocusTopicStatus, variant: FocusTopicStatusLabelVariant = 'short'): string {
  return FOCUS_TOPIC_STATUS_LABELS[status][variant];
}

export const FOCUS_TOPIC_STATUS_SHORT_LABELS: Record<FocusTopicStatus, string> = Object.fromEntries(
  Object.entries(FOCUS_TOPIC_STATUS_LABELS).map(([status, labels]) => [status, labels.short]),
) as Record<FocusTopicStatus, string>;

export const FOCUS_TOPIC_STATUS_LONG_LABELS: Record<FocusTopicStatus, string> = Object.fromEntries(
  Object.entries(FOCUS_TOPIC_STATUS_LABELS).map(([status, labels]) => [status, labels.long]),
) as Record<FocusTopicStatus, string>;
