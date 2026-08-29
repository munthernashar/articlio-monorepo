import { useMemo } from 'react';
import type { ConversationSession } from '@/types/domain';

/**
 * Target state machine from docs/ui-recording-redundancy-review-2026-05-14.md.
 * This is the single source of truth for "what is happening right now" --
 * it replaces AudioRecorder's RecorderState mirror, SessionFlowCard's own
 * FlowState, and NewSessionPage's POST_UPLOAD_STATUS_RANK, which previously
 * derived up to four independent, occasionally-disagreeing answers to the
 * same question.
 */
export type SessionUiState = 'idle' | 'ready' | 'recording' | 'paused' | 'review' | 'saved';

/** Mirrors AudioRecorder's own (unexported) RecorderState -- kept in sync manually. */
export type RecorderUiState = 'idle' | 'requesting_permission' | 'recording' | 'paused' | 'ready_to_upload' | 'uploading' | 'error';

export const SAVED_SESSION_STATUSES: ReadonlySet<string> = new Set(['completed', 'completed_capped']);

const REVIEW_SESSION_STATUSES: ReadonlySet<string> = new Set([
  'uploaded',
  'transcribed',
  'analyzed',
  'feedback_ready',
  'training_in_progress',
]);

type UseSessionRecordingFlowArgs = {
  session: ConversationSession | null;
  recorderState: RecorderUiState;
  isProcessingRecording: boolean;
};

export function useSessionRecordingFlow({ session, recorderState, isProcessingRecording }: UseSessionRecordingFlowArgs): SessionUiState {
  return useMemo(() => {
    if (!session) return 'idle';
    if (SAVED_SESSION_STATUSES.has(session.status)) return 'saved';
    if (recorderState === 'paused') return 'paused';
    if (recorderState === 'recording' || session.status === 'recording') return 'recording';
    if (
      isProcessingRecording ||
      recorderState === 'uploading' ||
      recorderState === 'ready_to_upload' ||
      REVIEW_SESSION_STATUSES.has(session.status)
    ) {
      return 'review';
    }
    return 'ready';
  }, [isProcessingRecording, recorderState, session]);
}
