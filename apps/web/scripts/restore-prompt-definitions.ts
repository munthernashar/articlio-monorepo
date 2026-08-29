/**
 * Gegenstück zu `backup-prompt-definitions.ts`. Spielt eine zuvor exportierte
 * JSON-Sicherung zurück in `public.prompt_definitions`.
 *
 * Sicherheitsdesign, bewusst zweistufig:
 *   1. Ohne `--apply` wird NUR angezeigt, was passieren würde (Dry-Run,
 *      Standard). Kein Schreibzugriff.
 *   2. Erst mit `--apply` wird tatsächlich geschrieben (upsert über die
 *      Unique-Constraint `prompt_key, version`).
 *
 * `id`, `created_by`, `updated_by` werden beim Restore NICHT übernommen:
 * `id` wird von Postgres neu vergeben (Konfliktauflösung läuft über
 * `prompt_key, version`, nicht über `id`), und `created_by`/`updated_by`
 * verweisen auf `profiles(id)` – diese IDs sind nicht zwingend portabel
 * zwischen Umgebungen und würden bei einem Restore in eine andere
 * Datenbank mit Fremdschlüssel-Fehlern abbrechen.
 *
 * Nutzung:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run restore:prompts -- supabase/prompt-backups/latest.json
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run restore:prompts -- supabase/prompt-backups/latest.json --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

type BackupRow = {
  prompt_key: string;
  version: number;
  is_active: boolean;
  model: string;
  max_output_tokens: number;
  response_format: string;
  expected_output_schema_json: unknown;
  system_prompt: string;
  developer_prompt: string;
  user_prompt_template: string;
  name: string;
  description: string;
  category: string;
  metadata: unknown;
  prompt_variables_definition_json: unknown;
};

type BackupFile = {
  exportedAt: string;
  rowCount: number;
  activeCount: number;
  rows: BackupRow[];
};

const args = process.argv.slice(2);
const applyFlagIndex = args.indexOf('--apply');
const shouldApply = applyFlagIndex !== -1;
const filePath = args.filter((arg) => arg !== '--apply')[0];

if (!filePath) {
  console.error('❌ Bitte Pfad zur Backup-Datei angeben, z. B.:');
  console.error('   npm run restore:prompts -- supabase/prompt-backups/latest.json');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein (Server-Secrets, nicht die VITE_-Variante).');
  process.exit(1);
}

const backup = JSON.parse(readFileSync(filePath, 'utf8')) as BackupFile;

if (!Array.isArray(backup.rows) || backup.rows.length === 0) {
  console.error('❌ Backup-Datei enthält keine Zeilen.');
  process.exit(1);
}

console.log(`Backup vom ${backup.exportedAt}: ${backup.rowCount} Zeile(n), davon ${backup.activeCount} aktiv.`);
console.log(`Ziel: ${supabaseUrl}`);
console.log(shouldApply ? '⚠️  --apply gesetzt: Es wird tatsächlich geschrieben.' : 'ℹ️  Dry-Run (Standard). Zum Schreiben --apply anhängen.');
console.log('');

for (const row of backup.rows) {
  console.log(`  ${row.prompt_key} v${row.version} — is_active=${row.is_active}`);
}

if (!shouldApply) {
  console.log('\nDry-Run beendet. Keine Änderungen vorgenommen.');
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const payload = backup.rows.map((row) => ({
    prompt_key: row.prompt_key,
    version: row.version,
    is_active: row.is_active,
    model: row.model,
    max_output_tokens: row.max_output_tokens,
    response_format: row.response_format,
    expected_output_schema_json: row.expected_output_schema_json,
    system_prompt: row.system_prompt,
    developer_prompt: row.developer_prompt,
    user_prompt_template: row.user_prompt_template,
    name: row.name,
    description: row.description,
    category: row.category,
    metadata: row.metadata,
    prompt_variables_definition_json: row.prompt_variables_definition_json,
  }));

  const { error, count } = await supabase
    .from('prompt_definitions')
    .upsert(payload, { onConflict: 'prompt_key,version', count: 'exact' });

  if (error) {
    console.error('❌ Restore fehlgeschlagen:', error.message);
    process.exit(1);
  }

  console.log(`\n✅ ${count ?? backup.rows.length} Zeile(n) wiederhergestellt.`);
  console.log('   Bitte im Admin-Bereich prüfen, welche Version je prompt_key jetzt aktiv ist –');
  console.log('   der Restore kann mehrere is_active=true-Zeilen pro prompt_key zurückschreiben,');
  console.log('   falls das Backup zu einem inkonsistenten Zeitpunkt gezogen wurde.');
}

void main();
