# Prompt-Migration Grep Report (2026-04-24, Update)

Nach Bereinigung der letzten Prompt-Modell-Reste wurden folgende Checks ausgeführt.

## 1) `rg -n "promptId" src supabase/migrations`

### Verbleibende Treffer und Bewertung

1. `src/services/ai/types.ts:134` — `promptId?: PromptKey` in `LegacyPromptExecutionRequestInput`  
   **Darf bleiben (Legacy-Kompatibilität):** bewusst isoliertes Legacy-Eingabefeld nur für Normalisierung am äußersten Eingangsrand; nicht mehr Teil von `PromptExecutionRequest`.

2. `src/services/ai/prompt-execution.service.ts:89` — `request.promptKey ?? request.promptId ?? request.legacyPromptId`  
   **Darf bleiben (Legacy-Kompatibilität):** zentrale, randnahe Normalisierung von Legacy-Input auf kanonisches `promptKey`.

3. `src/services/supabase/prompt-admin.service.ts:212` — Kommentar mit `promptId` ("kein promptId/semver-Mix")  
   **Darf bleiben:** erklärender Migrationskommentar, keine fachliche Identifier-Verwendung.

4. `src/services/ai/db-prompt-registry.ts` und `src/services/ai/prompt-registry.ts` (`promptIdentifier`)  
   **Darf bleiben:** diese Treffer entstehen nur wegen Teilstring-Match (`promptId` in `promptIdentifier`); kein `promptId`-Feld/Identifier im Ausführungsmodell.

## 2) `rg -n "getPromptDefinitionById" src supabase/migrations`

**Keine Treffer.** (Umbenennung auf `getPromptDefinitionByRowId(promptDefinitionId)` umgesetzt.)

## 3) `rg -n "@1\.0\.0" src supabase/migrations`

**Keine Treffer.** (`session_analysis@1.0.0` entfernt.)

## 4) `_v1` als `prompt_key`

Ausgeführt mit:

```bash
rg -n "prompt_key\s*=\s*'[^']*_v1'|prompt_key\s+in\s*\([^\)]*'_v1'" supabase/migrations src/services/ai
```

**Keine Treffer.**

## Ausgeführte Befehle

```bash
rg -n "promptId" src supabase/migrations
rg -n "getPromptDefinitionById" src supabase/migrations
rg -n "@1\.0\.0" src supabase/migrations
rg -n "prompt_key\s*=\s*'[^']*_v1'|prompt_key\s+in\s*\([^\)]*'_v1'" supabase/migrations src/services/ai
```
