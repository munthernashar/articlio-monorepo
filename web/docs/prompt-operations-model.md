# Betriebsmodell Prompt-Management

## Zielbild

Produktive Prompttexte (`system_prompt`, `developer_prompt`, `user_prompt_template`) werden **ausschließlich** in `public.prompt_definitions` gepflegt – über den Admin-Flow in der Datenbank.

## Verbindliche Regeln

1. **Keine produktiven Prompttexte in statischen Repo-Seeds**
   - Seed-Dateien dürfen nur technische Metadaten, Struktur oder leere Platzhalter enthalten.
   - Aktivierung produktiver Varianten erfolgt nicht per Git-Seed, sondern per Admin-Workflow.

2. **Historische Migrationen bleiben historisch, werden aber neutralisiert**
   - Falls frühere Migrationen produktive Texte enthalten, erfolgt eine nachgelagerte Bereinigung per Migration.
   - Bereinigung bedeutet: produktive Texte entfernen/leeren und Einträge deaktivieren.

3. **Fail-fast zur Laufzeit**
   - Fehlt ein aktiver Prompt oder ist `user_prompt_template` leer/ungültig, schlägt die Runtime technisch fehl.
   - Es gibt keinen lokalen Prompt-Fallback aus Repo-Dateien und keine stillen Defaults für fehlende/inaktive DB-Prompts.

## Operativer Prozess

### Rollen
- **Prompt Owner (Produkt/Didaktik)**: verantwortet Inhalt und Zielqualität.
- **Admin (Betrieb)**: pflegt Versionen/Aktivierung in `public.prompt_definitions`.
- **Engineering**: verantwortet nur Runtime, Validierung, Schemas, Monitoring.

### Aktivierung & Versionierung
1. Neue Version in `public.prompt_definitions` anlegen.
2. Inhaltlich validieren (Schema/Tests/Smoke-Test).
3. Genau eine Zielversion je `prompt_key` aktiv setzen (`is_active=true`).
4. Vorherige Version deaktivieren.
5. Änderungen über Audit-Log nachvollziehen.

## Referenzen im Repo
- Seed-Neutralisierung: `supabase/seed/coach_prompt_definitions.sql`
- Nachgelagerte Bereinigung: `supabase/migrations/20260513100000_neutralize_seeded_prompt_texts.sql`
- Runtime Fail-fast (ohne lokalen Prompt-Fallback): `supabase/functions/process-session/_shared/prompt-runner.ts`

## Backup & Restore (Launch-Readiness-Audit, Befund E)

Da produktive Prompt-Texte ausschließlich in `public.prompt_definitions` liegen, gibt es ohne
zusätzliche Sicherung keinen Rollback-Pfad, falls eine Admin-Änderung die Tabelle beschädigt.
Dieses Betriebsmodell bleibt unverändert – es kommt lediglich ein Sicherungspfad hinzu:

```bash
# Export: alle Zeilen (aktiv + inaktiv, alle Versionen) als JSON
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run backup:prompts

# Restore: Dry-Run zuerst (Standard, schreibt nichts)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run restore:prompts -- supabase/prompt-backups/latest.json

# Restore: tatsächlich schreiben
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run restore:prompts -- supabase/prompt-backups/latest.json --apply
```

- `scripts/backup-prompt-definitions.ts` schreibt sowohl eine Zeitstempel-Datei als auch
  `supabase/prompt-backups/latest.json`. Beide werden committet – nur so entstehen Diff,
  Review und eine Historie im Git-Log, die es für Prompt-Texte bislang nicht gab.
- `scripts/restore-prompt-definitions.ts` schreibt nur mit explizitem `--apply`; ohne das
  Flag zeigt es lediglich, welche `prompt_key`/`version`-Kombinationen betroffen wären.
- Empfehlung: vor jeder größeren Admin-Änderung (insbesondere Massenänderungen an
  `is_active`) `npm run backup:prompts` laufen lassen und den erzeugten Diff committen.
- Ein erster realer Stand liegt bereits unter `supabase/prompt-backups/latest.json`
  (Stand 15.08.2026, 26 Zeilen, 12 aktiv).
