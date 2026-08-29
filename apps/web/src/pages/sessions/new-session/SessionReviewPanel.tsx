import { SessionProcessingStatus } from '@/features/sessions/SessionProcessingStatus';
import type { ConversationSession } from '@/types/domain';

type Props = {
  session: ConversationSession;
  hasAutoNavigatedToCoaching: boolean;
  showNotifyOption: boolean;
  notifyRequested: boolean;
  onNotifyRequested: () => void;
};

/**
 * Replaces NewSessionPage's old postUploadStatus dots-block and the separate
 * "Analyse läuft noch" block. SessionProcessingStatus's step-checklist +
 * progress bar + ETA is the single review-state status display (confirmed
 * design decision -- see Welle 3 plan).
 */
export function SessionReviewPanel({ session, hasAutoNavigatedToCoaching, showNotifyOption, notifyRequested, onNotifyRequested }: Props) {
  return (
    <div className="session-flow-meta" role="status" aria-live="polite">
      <SessionProcessingStatus session={session} />
      {session.status === 'completed' && !hasAutoNavigatedToCoaching ? (
        <>
          <p>Wir zeigen dir dein Ergebnis automatisch, sobald die Analyse steht.</p>
          {showNotifyOption ? (
            <button type="button" className="button button-secondary" onClick={onNotifyRequested}>
              {notifyRequested ? 'Benachrichtigung aktiviert' : 'Wir benachrichtigen dich'}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
