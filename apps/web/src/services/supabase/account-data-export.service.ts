import { supabaseClient } from '@/services/supabase/client';

// Launch-Readiness-Audit, Welle 1 Punkt 4 (DSGVO Art. 20, Recht auf
// Datenübertragbarkeit): Export aller personenbezogenen Daten des
// angemeldeten Nutzers als JSON-Download. Läuft komplett clientseitig über
// den bestehenden anon+User-JWT-Client -- alle einbezogenen Tabellen haben
// bereits "select own row"-RLS-Policies (dieselben, mit denen die App auch
// sonst arbeitet), es ist also keine eigene Edge Function mit
// Service-Role-Zugriff nötig. `billing_events` (Rohdaten der
// Stripe-Webhooks) ist bewusst ausgeschlossen: nur Admin-lesbar und enthält
// keine eigenständigen personenbezogenen Angaben über das hinaus, was in
// billing_subscriptions/billing_customers bereits enthalten ist.

const USER_ID_FILTERED_TABLES = [
  'conversation_sessions',
  'session_transcripts',
  'session_analyses',
  'detected_patterns',
  'focus_topics',
  'user_entitlements',
  'billing_customers',
  'billing_subscriptions',
  'user_usage_ledger',
] as const;

type UserIdFilteredTableName = (typeof USER_ID_FILTERED_TABLES)[number];
type ExportTableName = UserIdFilteredTableName | 'profiles';

type UserDataExport = {
  exportedAt: string;
  userId: string;
  tables: Partial<Record<ExportTableName, unknown[]>>;
};

async function fetchProfileForUser(userId: string): Promise<unknown[]> {
  const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId);
  if (error) {
    throw new Error(`Export fehlgeschlagen (profiles): ${error.message}`);
  }
  return data ?? [];
}

async function fetchTableForUser(table: UserIdFilteredTableName, userId: string): Promise<unknown[]> {
  const { data, error } = await supabaseClient.from(table).select('*').eq('user_id', userId);
  if (error) {
    throw new Error(`Export fehlgeschlagen (${table}): ${error.message}`);
  }
  return data ?? [];
}

export const accountDataExportService = {
  async buildExport(userId: string): Promise<UserDataExport> {
    const tables: Partial<Record<ExportTableName, unknown[]>> = {
      profiles: await fetchProfileForUser(userId),
    };

    for (const table of USER_ID_FILTERED_TABLES) {
      tables[table] = await fetchTableForUser(table, userId);
    }

    return {
      exportedAt: new Date().toISOString(),
      userId,
      tables,
    };
  },

  async downloadExport(userId: string): Promise<void> {
    const payload = await this.buildExport(userId);
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `articlio-datenexport-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};
