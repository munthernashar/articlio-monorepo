import { useState } from 'react';
import { AudioRecorder } from '@/features/sessions/AudioRecorder';
import type { ConversationSession } from '@/types/domain';
import { SessionStatusBadge } from './SessionStatusBadge';
import type { RecorderUiState, SessionUiState } from './useSessionRecordingFlow';

type Props = {
  session: ConversationSession;
  uiState: SessionUiState;
  errorMessage: string | null;
  isProcessingRecording: boolean;
  isStubTranscriptionDetected: boolean;
  onRecordingStarted: () => Promise<void> | void;
  onRecorded: (payload: { blob: Blob; durationSeconds: number }) => Promise<void> | void;
  onRecorderStateChange: (state: RecorderUiState) => void;
  softMaxAudioSeconds?: number;
  hardMaxAudioSeconds?: number;
  /** Die Einstiegsfrage aus dem Session-Start-Dialog, als Erinnerung während der Aufnahme. */
  openingQuestion?: string;
  /**
   * Anschlussfragen zum selben Thema (aus daily_prompt_generator), die bei erkannten
   * Sprechpausen nacheinander eingeblendet werden -- simuliert ein zuhörendes
   * Gegenüber statt eines stillen Mikrofons.
   */
  followUpQuestions?: string[];
};

/**
 * Replaces SessionFlowCard for the ready/recording/paused states. One status
 * badge (SessionStatusBadge), one timer and CTA set (AudioRecorder's own),
 * matching the "single source of truth per information type" rule from
 * docs/ui-recording-redundancy-review-2026-05-14.md.
 */
export function SessionRecordingPanel({
  session,
  uiState,
  errorMessage,
  isProcessingRecording,
  isStubTranscriptionDetected,
  onRecordingStarted,
  onRecorded,
  onRecorderStateChange,
  softMaxAudioSeconds,
  hardMaxAudioSeconds,
  openingQuestion,
  followUpQuestions = [],
}: Props) {
  const [revealedNudges, setRevealedNudges] = useState<string[]>([]);
  const [pausedForSilenceMessage, setPausedForSilenceMessage] = useState<string | null>(null);

  const onSustainedSilence = () => {
    setRevealedNudges((current) => {
      if (current.length >= followUpQuestions.length) return current;
      const next = followUpQuestions[current.length];
      return next ? [...current, next] : current;
    });
  };

  // Feuert, sobald AudioRecorder nach followUpQuestions.length + 1 anhaltenden
  // Stillephasen selbst pausiert hat (Best Practice bei Voice-Agents/IVR-Systemen:
  // ein bis zwei erneute Nachfragen bei Stille, danach ein echter Fallback-Zustand
  // statt endloser Wiederholung derselben leeren Nachfrage). Ersetzt das vorherige
  // Verhalten, bei dem nach Verbrauch aller Anschlussfragen bei jeder weiteren
  // Sprechpause schlicht nichts mehr passierte, egal wie lange sie dauerte.
  const onAutoPaused = () => {
    setPausedForSilenceMessage('Ich habe die Aufnahme kurz pausiert, falls du eine Pause brauchst. Setze fort, wenn du bereit bist.');
  };

  return (
    <section className="session-inline-status">
      <h3>Aufnahme</h3>
      <SessionStatusBadge state={uiState} />
      {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

      {openingQuestion || pausedForSilenceMessage ? (
        <div className="session-conversation-log" aria-live="polite">
          {openingQuestion ? <p className="session-conversation-bubble">{openingQuestion}</p> : null}
          {revealedNudges.map((nudge, index) => (
            <p key={`${index}-${nudge}`} className="session-conversation-bubble session-conversation-bubble--nudge">
              {nudge}
            </p>
          ))}
          {pausedForSilenceMessage ? (
            <p className="session-conversation-bubble session-conversation-bubble--nudge">{pausedForSilenceMessage}</p>
          ) : null}
        </div>
      ) : null}

      <AudioRecorder
        compact
        showStatusLabel={false}
        disabled={isProcessingRecording || session.status === 'completed'}
        onStart={onRecordingStarted}
        onRecorded={onRecorded}
        onStateChange={onRecorderStateChange}
        softMaxAudioSeconds={softMaxAudioSeconds}
        hardMaxAudioSeconds={hardMaxAudioSeconds}
        onSustainedSilence={onSustainedSilence}
        autoPauseAfterSilenceCount={followUpQuestions.length + 1}
        onAutoPaused={onAutoPaused}
      />

      {isStubTranscriptionDetected ? (
        <p className="auth-error">
          <strong>Entwicklungsmodus:</strong> Transkription ist simuliert.
        </p>
      ) : null}
    </section>
  );
}
