import type { ConversationSession, SessionProcessingStatusValue } from '@/types/domain';

type StepState = 'pending' | 'active' | 'completed' | 'failed';
type UiSessionState =
  | 'ready'
  | 'recording'
  | 'uploading'
  | 'transcribing'
  | 'analyzing'
  | 'done'
  | 'insufficient_data'
  | 'completed_capped'
  | 'rejected_too_long'
  | 'failed';

type SessionProcessingStatusProps = {
  session: ConversationSession;
};

type StepItem = {
  key: string;
  label: string;
  state: StepState;
  description?: string;
};

const UI_STATUS_TEXT: Record<UiSessionState, string> = {
  ready: 'Alles bereit – starte deine Aufnahme.',
  recording: 'Aufnahme läuft …',
  uploading: 'Deine Aufnahme wird sicher hochgeladen.',
  transcribing: 'Wir erstellen gerade dein Transkript.',
  analyzing: 'Dein Feedback wird vorbereitet.',
  done: 'Fertig! Öffne jetzt dein Coaching.',
  insufficient_data: 'Zu wenig Sprache für eine Auswertung.',
  completed_capped: 'Analyse fertig – bei sehr langen Aufnahmen werten wir nur einen Teil aus.',
  rejected_too_long: 'Die Aufnahme war zu lang, wir konnten sie nicht auswerten.',
  failed: "Das hat leider nicht geklappt. Versuch's noch mal.",
};

const PROGRESS_BY_STATE: Record<UiSessionState, { percent: number; eta: string }> = {
  ready: { percent: 0, eta: 'ca. 5–7 Min. nach Aufnahmeende' },
  recording: { percent: 15, eta: 'noch offen – beende zuerst die Aufnahme' },
  uploading: { percent: 35, eta: 'weniger als 1 Min.' },
  transcribing: { percent: 60, eta: 'ca. 1–2 Min.' },
  analyzing: { percent: 85, eta: 'ca. 1 Min.' },
  done: { percent: 100, eta: 'abgeschlossen' },
  insufficient_data: { percent: 100, eta: 'abgeschlossen (ohne Analyse)' },
  completed_capped: { percent: 100, eta: 'abgeschlossen (nur ein Teil ausgewertet)' },
  rejected_too_long: { percent: 100, eta: 'abgeschlossen (Aufnahme zu lang)' },
  failed: { percent: 100, eta: 'abgeschlossen (fehlgeschlagen)' },
};

// Bug (27.08.2026): resolveUiState/resolveStepStates lasen bislang
// session.processing?.transcriptStatus/analysisStatus -- Felder aus
// conversation_sessions.metadata.processing, die process-session/index.ts nie schreibt (die
// Function setzt dort nur {traceId, startedAt} bzw. {lastError, traceId, failedAt}, nie
// transcriptStatus/analysisStatus). Diese Felder waren dadurch immer undefined, wodurch die
// Schritt-Liste bis zum Erreichen eines Terminalstatus komplett auf "pending" hängen blieb,
// während die Fortschrittsanzeige (die bereits korrekt auf session.status basierte) längst
// weitergezählt hatte. Fix: beide Funktionen leiten den Zustand jetzt ausschließlich aus
// session.status ab -- dem einen Feld, das process-session/index.ts tatsächlich zuverlässig
// aktualisiert (uploaded -> processing -> transcribed -> completed/insufficient_data/...).
function resolveUiState(session: ConversationSession): UiSessionState {
  switch (session.status) {
    case 'recording':
      return 'recording';
    case 'draft':
      return 'ready';
    case 'completed':
      return 'done';
    case 'insufficient_data':
      return 'insufficient_data';
    case 'completed_capped':
      return 'completed_capped';
    case 'rejected_too_long':
      return 'rejected_too_long';
    case 'failed':
      return 'failed';
    case 'uploaded':
      return 'uploading';
    case 'processing':
      return 'transcribing';
    case 'transcribed':
    case 'analyzed':
    case 'feedback_ready':
    case 'training_in_progress':
      return 'analyzing';
    default:
      return 'uploading';
  }
}

function resolveStepStates(session: ConversationSession): StepItem[] {
  const hasFailed = session.status === 'failed';
  // 'transcribed' und die drei Legacy-Zwischenstati (mittlerweile durch ein einzelnes
  // Abschluss-Update ersetzt, siehe process-session/index.ts) bedeuten alle: Transkript fertig,
  // Analyse läuft gerade.
  const isAnalyzing =
    session.status === 'transcribed' ||
    session.status === 'analyzed' ||
    session.status === 'feedback_ready' ||
    session.status === 'training_in_progress';
  const hasCompleted =
    session.status === 'completed' ||
    session.status === 'insufficient_data' ||
    session.status === 'completed_capped' ||
    session.status === 'rejected_too_long';
  const isTranscriptDone = hasCompleted || isAnalyzing;

  const uploadState: StepState = session.status === 'draft' || session.status === 'recording' ? 'pending' : 'completed';

  const transcriptState: StepState = isTranscriptDone
    ? 'completed'
    : hasFailed
      ? 'failed'
      : session.status === 'processing' || session.status === 'uploaded'
        ? 'active'
        : 'pending';

  const analysisState: StepState = hasCompleted
    ? 'completed'
    : hasFailed
      ? 'failed'
      : isAnalyzing
        ? 'active'
        : 'pending';

  const feedbackState: StepState = hasFailed ? 'failed' : hasCompleted ? 'completed' : isAnalyzing ? 'active' : 'pending';

  const finishedState: StepState = hasFailed ? 'failed' : hasCompleted ? 'completed' : 'pending';

  return [
    { key: 'upload', label: 'Upload', state: uploadState },
    { key: 'transcript', label: 'Transkript', state: transcriptState },
    { key: 'analysis', label: 'Analyse', state: analysisState },
    { key: 'feedback', label: 'Coaching', state: feedbackState },
    { key: 'finished', label: 'Fertig', state: finishedState },
  ];
}

function getErrorMessage(session: ConversationSession): string | null {
  if (session.status !== 'failed' && session.processing?.transcriptStatus !== 'failed' && session.processing?.analysisStatus !== 'failed') {
    return null;
  }

  return session.processing?.lastError ?? session.processingLastError ?? "Das hat leider nicht geklappt. Versuch's noch mal.";
}


function getStatusHint(session: ConversationSession): { title: string; message: string; ctaLabel?: string; ctaHref?: string } | null {
  switch (session.status) {
    case 'insufficient_data':
      return {
        title: 'Hinweis',
        message: 'Für diese Session liegen nicht genug stabile Sprachdaten vor. Nimm bitte eine neue Session auf, damit wir dir verlässliches Coaching geben können.',
        ctaLabel: 'Neue Session aufnehmen',
        ctaHref: '/sessions/new',
      };
    case 'completed_capped':
      return {
        title: 'Hinweis',
        message: 'Deine Aufnahme war sehr lang -- wir haben trotzdem eine Analyse für dich erstellt, nur eben nicht für die komplette Aufnahme.',
      };
    case 'rejected_too_long':
      return {
        title: 'Hinweis',
        message: 'Deine Aufnahme war zu lang für eine Auswertung. Starte gern eine neue, etwas kürzere Session.',
      };
    default:
      return null;
  }
}

function getStatusSymbol(state: StepState): string {
  switch (state) {
    case 'completed':
      return '✓';
    case 'active':
      return '●';
    case 'failed':
      return '!';
    default:
      return '○';
  }
}

function getProcessingValueLabel(value: SessionProcessingStatusValue | undefined): string {
  if (!value) return 'unbekannt';
  return value;
}

export function SessionProcessingStatus({ session }: SessionProcessingStatusProps) {
  const steps = resolveStepStates(session);
  const uiState = resolveUiState(session);
  const errorMessage = getErrorMessage(session);
  const progress = PROGRESS_BY_STATE[uiState];
  const statusHint = getStatusHint(session);

  return (
    <section className="session-processing-status" aria-live="polite" aria-label="Verarbeitungsstatus">
      <h4>Verarbeitung</h4>
      <p className="session-processing-status-message">{UI_STATUS_TEXT[uiState]}</p>
      <p className="session-processing-status-progress-meta">
        <strong>{progress.percent}%</strong> · ETA: {progress.eta}
      </p>
      <div className="session-processing-status-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
        <span style={{ width: `${progress.percent}%` }} />
      </div>

      <ol className="session-processing-status-list" aria-label="Verarbeitungsschritte">
        {steps.map((step) => (
          <li key={step.key} className={`session-processing-status-item is-${step.state}`}>
            <span className="session-processing-status-indicator" aria-hidden="true">
              {getStatusSymbol(step.state)}
            </span>
            <span>
              <strong>{step.label}</strong>
              {step.description ? <small>{step.description}</small> : null}
            </span>
          </li>
        ))}
      </ol>

      {statusHint ? (
        <p className="session-processing-status-meta" role="status">
          <strong>{statusHint.title}:</strong> {statusHint.message}{' '}
          {statusHint.ctaLabel && statusHint.ctaHref ? <a href={statusHint.ctaHref}>{statusHint.ctaLabel}</a> : null}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="auth-error" role="alert">
          <strong>Fehler:</strong> {errorMessage}
        </p>
      ) : null}

      {import.meta.env.DEV ? (
        <p className="session-processing-status-meta">
          Technischer Status: Session <strong>{session.status}</strong>, Transkript{' '}
          <strong>{getProcessingValueLabel(session.processing?.transcriptStatus)}</strong>, Analyse{' '}
          <strong>{getProcessingValueLabel(session.processing?.analysisStatus)}</strong>.
        </p>
      ) : null}
    </section>
  );
}
