import { supabaseClient } from '@/services/supabase/client';
import type { AdminAuditLogEntryRow } from '@/types/database';

export const adminAuditLogService = {
  async listRecent(limit = 50): Promise<AdminAuditLogEntryRow[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
    const { data, error } = await supabaseClient
      .from('admin_audit_log_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(safeLimit)
      .returns<AdminAuditLogEntryRow[]>();

    if (error) {
      throw new Error(`Audit-Logs konnten nicht geladen werden: ${error.message}`);
    }

    return data ?? [];
  },
};
