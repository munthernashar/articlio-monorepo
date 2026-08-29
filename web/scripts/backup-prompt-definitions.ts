/**
 * Launch-Readiness-Audit, Befund E: Prompt-Texte werden ausschließlich über
 * die Admin-Oberfläche in `public.prompt_definitions` gepflegt
 * (siehe docs/prompt-operations-model.md) und existieren nirgends im Repo –
 * kein Diff, kein Review, kein Rollback-Pfad. Dieses Skript exportiert JEDE
 * Zeile (alle Versionen, aktiv und inaktiv) als versionierbare JSON-Datei,
 * die committet werden kann.
 *
 * Löst NICHT das Betriebsmodell ab: Prompts werden weiterhin nur über den
 * Admin-Flow in der DB geändert. Dieses Skript liefert lediglich einen
 * Wiederherstellungspfad, falls die Produktionstabelle beschädigt wird.
 *
 * Nutzung:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run backup:prompts
 *
 * Erwartet Server-Secrets, niemals die VITE_-Variante des anon keys – ein
 * vollständiger Export inkl. inaktiver/historischer Versionen erfordert
 * Service-Role-Rechte, weil RLS auf `prompt_definitions` normale Nutzer auf
 * aktive Zeilen beschränkt.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BACKUP_DIR = 'supabase/prompt-backups';

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein (Server-Secrets, nicht die VITE_-Variante).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const { data, error } = await supabase
    .from('prompt_definitions')
    .select('*')
    .order('prompt_key', { ascending: true })
    .order('version', { ascending: true });

  if (error) {
    console.error('❌ Export fehlgeschlagen:', error.message);
    process.exit(1);
  }

  const rows = data ?? [];
  const timestamp = new Date().toISOString();
  const fileSafeTimestamp = timestamp.replace(/[:.]/g, '-');

  const backup = {
    exportedAt: timestamp,
    rowCount: rows.length,
    activeCount: rows.filter((row) => row.is_active).length,
    rows,
  };

  mkdirSync(BACKUP_DIR, { recursive: true });

  const timestampedPath = join(BACKUP_DIR, `${fileSafeTimestamp}_prompt_definitions.json`);
  const latestPath = join(BACKUP_DIR, 'latest.json');

  const serialized = `${JSON.stringify(backup, null, 2)}\n`;
  writeFileSync(timestampedPath, serialized, 'utf8');
  writeFileSync(latestPath, serialized, 'utf8');

  console.log(`✅ ${rows.length} Prompt-Definitionen exportiert (${backup.activeCount} aktiv).`);
  console.log(`   ${timestampedPath}`);
  console.log(`   ${latestPath}`);
  console.log('   Bitte committen, damit der Stand versioniert ist.');
}

void main();
