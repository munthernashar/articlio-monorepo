import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, GraduationCap, Mic, Trash2 } from 'lucide-react';

import { paths } from '@/app/routes/paths';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { ICON_SIZE_SM } from '@/lib/icon-sizes';
import { mapDialogueStatusToProductStatus, type ProductStatusTone } from '@/lib/src/lib/productLanguage';
import { sessionService } from '@/services/supabase/session.service';
import type { ConversationSession } from '@/types/domain';

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('de-DE');
}

function formatDurationLabel(durationSeconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(durationSeconds ?? 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes} min ${seconds}s` : `${seconds}s`;
}

/** Übersetzt das bestehende ProductStatus-Ton-Vokabular auf die Badge-Töne,
 *  damit der Status hier nicht ein zweites Mal eigenständig klassifiziert wird. */
const PRODUCT_TONE_TO_BADGE_TONE: Record<ProductStatusTone, BadgeTone> = {
  neutral: 'neutral',
  positive: 'success',
  progress: 'info',
  warning: 'warning',
  critical: 'danger',
};

export function SessionList() {
  const { user } = useCurrentUser();
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionPendingDeletion, setSessionPendingDeletion] = useState<ConversationSession | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      if (!user?.id) {
        setSessions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await sessionService.listConversationSessions(user.id);
        setSessions(data);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Sessionverlauf konnte nicht geladen werden.');
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSessions();
  }, [user?.id]);

  const todaySessionId = useMemo(() => {
    const today = new Date();
    return sessions.find((session) => {
      const created = new Date(session.createdAt);
      return (
        created.getFullYear() === today.getFullYear() &&
        created.getMonth() === today.getMonth() &&
        created.getDate() === today.getDate()
      );
    })?.id;
  }, [sessions]);

  const canDeleteSession = (status: ConversationSession['status']): boolean => status === 'draft' || status === 'recording';

  const handleDeleteSession = async (session: ConversationSession) => {
    if (!user?.id || deletingSessionId) return;

    setSessionPendingDeletion(null);
    setDeletingSessionId(session.id);
    setErrorMessage(null);

    try {
      await sessionService.deleteConversationSession(user.id, session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Session konnte nicht gelöscht werden.');
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <article className="card">
      <div className="page-header">
        <div>
          <h3>Sessionverlauf</h3>
          <p>Heute, letzte Sessions und alle Details zu deinem Training.</p>
        </div>
        <Link to={paths.sessions.new} className="button">
          Session starten
        </Link>
      </div>

      {isLoading ? <p>Sessions werden vorbereitet…</p> : null}
      {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

      {!isLoading && !errorMessage && sessions.length === 0 ? (
        <p>Starte deine erste Session.</p>
      ) : (
        <div className="session-list">
          {sessions.map((session) => {
            const productStatus = mapDialogueStatusToProductStatus(session.status);
            const isCoaching = session.source === 'tutor';
            const SourceIcon = isCoaching ? GraduationCap : Mic;

            return (
              <article key={session.id} className="card session-list-item">
                <Link to={paths.sessions.detail.replace(':sessionId', session.id)} className="session-list-item-link">
                  <div className="session-list-item-head">
                    <h4>{session.title}</h4>
                    {todaySessionId === session.id ? <Badge tone="info">Heute</Badge> : null}
                  </div>
                  <p className="session-list-item-meta">
                    <span className="session-list-item-meta-entry">
                      <SourceIcon aria-hidden="true" size={ICON_SIZE_SM} className="item-icon" />
                      {isCoaching ? 'Coaching' : 'Freie Session'}
                    </span>
                    <span className="session-list-item-meta-entry">
                      <CalendarDays aria-hidden="true" size={ICON_SIZE_SM} className="item-icon" />
                      {formatDate(session.createdAt)}
                    </span>
                    <span className="session-list-item-meta-entry">
                      <Clock aria-hidden="true" size={ICON_SIZE_SM} className="item-icon" />
                      {formatDurationLabel(session.durationSeconds)}
                    </span>
                  </p>
                  <Badge tone={PRODUCT_TONE_TO_BADGE_TONE[productStatus.tone]}>{productStatus.label}</Badge>
                </Link>
                {canDeleteSession(session.status) ? (
                  <button
                    type="button"
                    className="button button-danger session-delete-button"
                    disabled={deletingSessionId === session.id}
                    onClick={() => setSessionPendingDeletion(session)}
                  >
                    <Trash2 aria-hidden="true" size={ICON_SIZE_SM} className="item-icon" />
                    {deletingSessionId === session.id ? 'Lösche ...' : 'Löschen'}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {sessionPendingDeletion ? (
        <ConfirmDialog
          tone="danger"
          title={`„${sessionPendingDeletion.title}“ wirklich löschen?`}
          description="Diese Aktion kann nicht rückgängig gemacht werden."
          confirmLabel="Löschen"
          onConfirm={() => {
            void handleDeleteSession(sessionPendingDeletion);
          }}
          onCancel={() => setSessionPendingDeletion(null)}
        />
      ) : null}
    </article>
  );
}
