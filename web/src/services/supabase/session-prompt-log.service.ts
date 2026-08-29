import { supabaseClient } from '@/services/supabase/client';
import type { PromptExecutionLogDbRow } from '@/types/database';

export type SessionPromptExecutionLogRecord = {
  id: string;
  userId: string | null;
  sessionId: string | null;
  promptKey: string;
  status: 'success' | 'failed';
  renderedUserPrompt: string;
  errorMessage: string | null;
  createdAt: string;
};

function mapPromptExecutionLog(row: PromptExecutionLogDbRow): SessionPromptExecutionLogRecord {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    promptKey: row.prompt_key,
    status: row.status,
    renderedUserPrompt: row.rendered_user_prompt,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export const sessionPromptLogService = {
  async getBySessionId(params: { sessionId: string; userId: string }): Promise<SessionPromptExecutionLogRecord[]> {
    const { sessionId, userId } = params;

    const { data, error } = await supabaseClient
      .from('prompt_execution_logs')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .returns<PromptExecutionLogDbRow[]>();

    if (error) {
      throw new Error(`Prompt-Logs konnten nicht geladen werden: ${error.message}`);
    }

    return (data ?? []).map(mapPromptExecutionLog);
  },
};
