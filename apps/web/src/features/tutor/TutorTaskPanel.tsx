import { Mic, PenLine } from 'lucide-react';
import { AudioRecorder } from '@/features/sessions/AudioRecorder';
import { ICON_SIZE_SM } from '@/lib/icon-sizes';
import type { TutorCyclePhase } from '@/services/supabase/tutor.service';

/** Mirrors AudioRecorder's own (unexported) RecorderState -- kept in sync manually. */
type CoachRecorderState = 'idle' | 'requesting_permission' | 'recording' | 'paused' | 'ready_to_upload' | 'uploading' | 'error';

type Props = {
  taskTransition: string;
  microFeedback: string;
  currentPrompt: string;
  audioCoachHint: string;
  audioSuccessNote: string;
  writtenAnswer: string;
  onWrittenAnswerChange: (value: string) => void;
  isBusy: boolean;
  cyclePhase: TutorCyclePhase;
  onAudioStateChange: (state: CoachRecorderState) => void;
  onAudioRecorded: (payload: { blob: Blob; durationSeconds: number }) => Promise<void> | void;
  onSubmitWrittenAnswer: () => Promise<void> | void;
};

export function TutorTaskPanel({
  taskTransition,
  microFeedback,
  currentPrompt,
  audioCoachHint,
  audioSuccessNote,
  writtenAnswer,
  onWrittenAnswerChange,
  isBusy,
  cyclePhase,
  onAudioStateChange,
  onAudioRecorded,
  onSubmitWrittenAnswer,
}: Props) {
  return (
    <div className="card tutor-panel-spacing">
      <p>
        <strong>Übungsaufgabe</strong>
      </p>
      <p className="tutor-session-intro">{taskTransition}</p>
      {microFeedback ? (
        <p>
          <strong>{microFeedback}</strong>
        </p>
      ) : null}
      <div className="tutor-task-spacer" aria-hidden />
      <p>{currentPrompt}</p>
      <div className="auth-form">
        <label className="auth-label auth-label--with-icon">
          <Mic aria-hidden="true" size={ICON_SIZE_SM} className="item-icon" />
          Antwort aufnehmen
        </label>
        <p className="tutor-audio-hint">{audioCoachHint}</p>
        <AudioRecorder compact variant="coach" disabled={isBusy || cyclePhase !== 'clarification'} onStateChange={onAudioStateChange} onRecorded={onAudioRecorded} />
        {audioSuccessNote ? <p className="tutor-audio-note">{audioSuccessNote}</p> : null}
        <label className="auth-label auth-label--with-icon">
          <PenLine aria-hidden="true" size={ICON_SIZE_SM} className="item-icon" />
          Lieber schreiben
        </label>
        <textarea
          className="auth-input"
          value={writtenAnswer}
          onChange={(e) => onWrittenAnswerChange(e.target.value)}
          placeholder="Schreibe deine Übungsantwort hier…"
          rows={3}
          disabled={isBusy || cyclePhase !== 'clarification'}
        />
        <button
          className="button button-secondary"
          type="button"
          disabled={isBusy || cyclePhase !== 'clarification' || !writtenAnswer.trim()}
          onClick={() => {
            void onSubmitWrittenAnswer();
          }}
        >
          Antwort abgeben
        </button>
      </div>
    </div>
  );
}
