import { supabaseClient } from '@/services/supabase/client';
import type { Json, ProcessingStatus, SessionTranscriptRow } from '@/types/database';

export type SessionTranscriptRecord = {
  id: string;
  sessionId: string;
  userId: string;
  status: ProcessingStatus;
  rawTranscript: string | null;
  cleanedTranscript: string | null;
  utterances: Json;
  notes: Json;
  languageCode: string | null;
  attemptCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  updatedAt: string;
};

function mapTranscript(row: SessionTranscriptRow): SessionTranscriptRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status,
    rawTranscript: row.raw_transcript,
    cleanedTranscript: row.cleaned_transcript,
    utterances: row.utterances_json,
    notes: row.notes_json,
    languageCode: row.language_code,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    nextRetryAt: row.next_retry_at,
    updatedAt: row.updated_at,
  };
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export const sessionTranscriptService = {
  async upsertPendingTranscript(params: { sessionId: string; userId: string }) {
    const { sessionId, userId } = params;

    const { data, error } = await supabaseClient
      .from('session_transcripts')
      .upsert(
        {
          session_id: sessionId,
          user_id: userId,
          status: 'pending',
          utterances_json: [],
          notes_json: {},
        },
        {
          onConflict: 'session_id',
          ignoreDuplicates: false,
        },
      )
      .select('*')
      .single<SessionTranscriptRow>();

    if (error || !data) {
      throw new Error(`Transkript-Record konnte nicht vorbereitet werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapTranscript(data);
  },

  async markProcessing(params: { sessionId: string; userId: string; attemptCount: number }) {
    const { sessionId, userId, attemptCount } = params;

    const { data, error } = await supabaseClient
      .from('session_transcripts')
      .update({
        status: 'processing',
        attempt_count: attemptCount,
        last_error: null,
        next_retry_at: null,
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select('*')
      .single<SessionTranscriptRow>();

    if (error || !data) {
      throw new Error(`Transkript-Status konnte nicht auf processing gesetzt werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapTranscript(data);
  },

  async markCompleted(params: {
    sessionId: string;
    userId: string;
    rawTranscript: string;
    cleanedTranscript: string;
    utterances: Json;
    notes: Record<string, unknown>;
    languageCode: string | null;
    wordCount: number;
  }) {
    const { sessionId, userId, rawTranscript, cleanedTranscript, utterances, notes, languageCode, wordCount } = params;

    const { data, error } = await supabaseClient
      .from('session_transcripts')
      .update({
        status: 'completed',
        transcript_text: cleanedTranscript,
        raw_transcript: rawTranscript,
        cleaned_transcript: cleanedTranscript,
        utterances_json: toJson(utterances),
        notes_json: toJson(notes),
        raw_payload: {
          source: 'session-processing-pipeline',
        },
        language_code: languageCode,
        word_count: wordCount,
        last_error: null,
        last_processed_at: new Date().toISOString(),
        next_retry_at: null,
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select('*')
      .single<SessionTranscriptRow>();

    if (error || !data) {
      throw new Error(`Transkript konnte nicht als completed gespeichert werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapTranscript(data);
  },

  async markFailed(params: {
    sessionId: string;
    userId: string;
    errorMessage: string;
    retryAt: string | null;
    partialRawTranscript?: string;
  }) {
    const { sessionId, userId, errorMessage, retryAt, partialRawTranscript } = params;

    const updatePayload: {
      status: ProcessingStatus;
      last_error: string;
      next_retry_at: string | null;
      last_processed_at: string;
      raw_transcript?: string;
    } = {
      status: 'failed',
      last_error: errorMessage,
      next_retry_at: retryAt,
      last_processed_at: new Date().toISOString(),
    };

    if (partialRawTranscript) {
      updatePayload.raw_transcript = partialRawTranscript;
    }

    const { data, error } = await supabaseClient
      .from('session_transcripts')
      .update(updatePayload)
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select('*')
      .single<SessionTranscriptRow>();

    if (error || !data) {
      throw new Error(`Transkript-Fehlerstatus konnte nicht gespeichert werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapTranscript(data);
  },

  async getBySessionId(params: { sessionId: string; userId: string }) {
    const { sessionId, userId } = params;

    const { data, error } = await supabaseClient
      .from('session_transcripts')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle<SessionTranscriptRow>();

    if (error) {
      throw new Error(`Transkript konnte nicht geladen werden: ${error.message}`);
    }

    return data ? mapTranscript(data) : null;
  },

  async loadCleanedTranscriptForAnalysis(params: { sessionId: string; userId: string }): Promise<
    SessionTranscriptRecord & { cleanedTranscript: string }
  > {
    const transcript = await this.getBySessionId(params);

    if (!transcript) {
      throw new Error('Kein Transkript für diese Session gefunden.');
    }
    if (transcript.status !== 'completed') {
      throw new Error('Transkript ist noch nicht abgeschlossen und kann nicht analysiert werden.');
    }
    if (!transcript.cleanedTranscript || !transcript.cleanedTranscript.trim()) {
      throw new Error('Bereinigtes Transkript ist leer.');
    }

    return {
      ...transcript,
      cleanedTranscript: transcript.cleanedTranscript,
    };
  },
};
