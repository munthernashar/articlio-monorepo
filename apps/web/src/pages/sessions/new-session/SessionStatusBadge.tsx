import { Check, Circle, Loader2, Mic, Pause } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SessionUiState } from './useSessionRecordingFlow';

const SESSION_UI_STATE_LABELS: Record<SessionUiState, string> = {
  idle: 'Bereit',
  ready: 'Bereit zur Aufnahme',
  recording: 'Aufnahme läuft',
  paused: 'Pausiert',
  review: 'Wird verarbeitet',
  saved: 'Gespeichert',
};

const SESSION_UI_STATE_ICONS: Record<SessionUiState, LucideIcon> = {
  idle: Circle,
  ready: Mic,
  recording: Mic,
  paused: Pause,
  review: Loader2,
  saved: Check,
};

type Props = {
  state: SessionUiState;
};

export function SessionStatusBadge({ state }: Props) {
  const Icon = SESSION_UI_STATE_ICONS[state];

  return (
    <p className={`session-status-badge session-status-badge--${state}`}>
      <Icon aria-hidden="true" size={16} className={state === 'review' ? 'session-status-badge-icon is-spinning' : 'session-status-badge-icon'} />
      <strong>{SESSION_UI_STATE_LABELS[state]}</strong>
    </p>
  );
}
