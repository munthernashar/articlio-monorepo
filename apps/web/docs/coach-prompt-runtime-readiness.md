# Coach Prompt Runtime Readiness

Diese Notiz beschreibt, wie die Runtime-Verfügbarkeit der erforderlichen `coach_*`-Prompts geprüft wird.

## Required Prompt Keys

Folgende Prompt-Keys sind für die Coach-Runtime zwingend erforderlich:

- `coach_training_recommendation`
- `coach_session_plan`
- `coach_next_step`
- `coach_session_completion`
- `coach_reflection_interpreter`

## Technischer Check

Verwende `validateCoachPromptAvailability()` aus `src/services/coach/coach-prompt-readiness.service.ts`.

Die Prüfung validiert pro Required Key:

- genau **eine** aktive Definition in `public.prompt_definitions`
- `response_format = 'json_object'`
- `expected_output_schema_json` ist ein JSON-Objekt
- `prompt_variables_definition_json` ist ein JSON-Array
- `category = 'coach'`

Rückgabeformat:

```ts
{
  ok: boolean,
  missingKeys: string[],
  invalidKeys: Array<{ promptKey: string; reason: string }>
}
```

## Seed ausführen

Die Coach-Prompts liegen in:

- `supabase/seed/coach_prompt_definitions.sql`

Beispiel (lokale Supabase-DB):

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed/coach_prompt_definitions.sql
```

## Woran erkenne ich Runtime-Bereitschaft?

Coach Runtime gilt als bereit, wenn `validateCoachPromptAvailability()` folgendes liefert:

- `ok === true`
- `missingKeys.length === 0`
- `invalidKeys.length === 0`

## Wichtiger Hinweis

Für `coach_*`-Prompts gibt es **keine Code-Fallbacks**. Fehlende oder ungültige DB-Definitionen müssen in der Prompt-Registry (DB/Seed) korrigiert werden.
