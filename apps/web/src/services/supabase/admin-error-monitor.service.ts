import { supabaseClient } from '@/services/supabase/client';
import type { ConversationSessionRow, Json, PromptExecutionLogDbRow } from '@/types/database';

function asRecord(value: Json): Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function getProcessingLastError(metadata: Json): string | null {
  const metadataRecord = asRecord(metadata);
  const processingRaw = asRecord(metadataRecord.processing ?? null);
  const lastError = processingRaw.lastError;
  return typeof lastError === 'string' && lastError.trim().length > 0 ? lastError : null;
}

export type AdminSessionFailure = {
  id: string;
  userId: string;
  title: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

export const adminErrorMonitorService = {
  async listFailedSessions(limit = 100): Promise<AdminSessionFailure[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
    const { data, error } = await supabaseClient
      .from('conversation_sessions')
      .select('*')
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(safeLimit)
      .returns<ConversationSessionRow[]>();

    if (error) {
      throw new Error(`Session-Fehler konnten nicht geladen werden: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastError: getProcessingLastError(row.metadata),
    }));
  },

  async listPromptExecutionFailures(limit = 100): Promise<PromptExecutionLogDbRow[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
    const { data, error } = await supabaseClient
      .from('prompt_execution_logs')
      .select('*')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(safeLimit)
      .returns<PromptExecutionLogDbRow[]>();

    if (error) {
      throw new Error(`Prompt-Fehler konnten nicht geladen werden: ${error.message}`);
    }

    return data ?? [];
  },
};
