# Coach Runtime Smoke Test (Supabase Prompt Runtime)

## Ziel

Dieser Smoke Test prüft die Coach Runtime isoliert gegen aktive `prompt_definitions` in Supabase, **ohne Änderungen an der normalen Nutzer-UI**.

## Voraussetzungen

- In `public.prompt_definitions` existiert für jeden Coach-Runtime-Key **genau eine aktive** Definition.
- Die benötigten Prompt Keys sind aktiv:
  - `coach_training_recommendation`
  - `coach_session_plan`
  - `coach_next_step`
  - `coach_session_completion`
  - `coach_reflection_interpreter`
- Der OpenAI-Proxy / die Supabase Function ist erreichbar (abhängig von eurer Runtime-Konfiguration).

## Benötigte Environment-Variablen

Mindestens:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_OPENAI_PROXY_PATH` (optional, Standard im Projekt: `/functions/v1/openai-chat-proxy`)
- `VITE_APP_ENV` (z. B. `development`)
- `RUN_COACH_RUNTIME_SMOKE_TEST=true` (aktiviert den Smoke-Test explizit)

Optional (falls eure Umgebung es verlangt):

- Auth-Kontext (z. B. gültiger Supabase Login), falls Prompt-/Proxy-Zugriffe nicht anonym erlaubt sind.

## Ausführung

```bash
npm run smoke:coach-runtime
```

Der Test ist absichtlich per Flag geschützt. Ohne `RUN_COACH_RUNTIME_SMOKE_TEST=true` wird er übersprungen.

Beispiel:

```bash
RUN_COACH_RUNTIME_SMOKE_TEST=true \
VITE_SUPABASE_URL="https://<project>.supabase.co" \
VITE_SUPABASE_ANON_KEY="<anon-key>" \
npm run smoke:coach-runtime
```

## Was wird geprüft?

Der Smoke Test führt nacheinander aus:

1. `validateCoachPromptAvailability()`
2. `coachRuntimeService.getTrainingRecommendation(...)`
3. `coachRuntimeService.createSessionPlan(...)`
4. `coachRuntimeService.getNextStep(...)`
5. `coachRuntimeService.completeSession(...)`
6. `coachRuntimeService.interpretReflection(...)`

Verwendet werden sichere Mock-Daten für:

- Beispiel-TrainingPath
- Beispiel-SessionMemory
- Beispiel-UserAnswer
- Beispiel-Reflection

Pro Schritt wird geprüft:

- Kein Throw
- Output entspricht grob dem erwarteten Contract
- Pflichtfelder vorhanden
- Textfelder sind nicht leer

## Erwartete Outputs

Bei erfolgreichem Lauf:

- Keine fehlenden oder doppelten aktiven Prompt Keys in der Readiness-Prüfung.
- Jede Runtime-Methode liefert ein valides Ergebnisobjekt gemäß Contract.
- Vitest beendet den Run mit `PASS`.

Bei Fehlern (frühes Signal):

- Fehlende/inkonsistente Prompt-Definitionen
- Ungültiges JSON/Schema in Prompt-Antworten
- Netzwerk-/Proxy-/Auth-Probleme

Damit können Prompt-Probleme früh erkannt werden, bevor produktive AI-Flags aktiviert werden.
