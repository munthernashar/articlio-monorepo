# Arbeitspaket 3 – Konkreter Umsetzungsplan (Lifecycle + Metadaten)

Stand: 2026-04-23

## 1) Zielbild

Wir bringen das bestehende Audio-Session-Modul von einem groben Statusmodell (`active/processing/...`) auf den geforderten AP3-Lifecycle:

`draft -> recording -> uploaded -> transcribed -> analyzed -> feedback_ready -> training_in_progress -> completed`

Zusätzlich ergänzen wir die geforderten Metadaten:
- Dauer
- Thema
- Datum
- Sprache
- (optional) Hintergrundrauschen-Qualität

---

## 2) Architektur-Entscheidung

### 2.1 Session-Status als „Business-Lifecycle“
Die Session-Tabelle (`conversation_sessions.status`) wird zur führenden Quelle für den AP3-Lifecycle.

### 2.2 Processing-Details bleiben erhalten
`metadata.processing` (transcriptStatus/analysisStatus/lastError) bleibt für technische Diagnostik bestehen, wird aber nicht mehr als Ersatz-Lifecycle verwendet.

### 2.3 Metadaten als strukturiertes JSON
Neue Session-Metadaten werden in `conversation_sessions.metadata` gespeichert:

```json
{
  "durationSeconds": 123,
  "topic": "Arbeit im Homeoffice",
  "language": "de",
  "audioFilePath": "bucket/path/file.webm",
  "audioQuality": {
    "backgroundNoiseLevel": "low",
    "snrEstimateDb": 24.1,
    "confidence": 0.78
  },
  "processing": {
    "transcriptStatus": "completed",
    "analysisStatus": "completed",
    "lastError": null
  }
}
```

---

## 3) Datenbank-Änderungen (Supabase Migrationen)

## 3.1 Migration A: Enum erweitern
**Datei (neu):** `supabase/migrations/20260424xxxxxx_expand_session_status_lifecycle.sql`

Aktionen:
1. `alter type public.conversation_session_status add value if not exists 'recording';`
2. `alter type public.conversation_session_status add value if not exists 'uploaded';`
3. `alter type public.conversation_session_status add value if not exists 'transcribed';`
4. `alter type public.conversation_session_status add value if not exists 'analyzed';`
5. `alter type public.conversation_session_status add value if not exists 'feedback_ready';`
6. `alter type public.conversation_session_status add value if not exists 'training_in_progress';`

Hinweis:
- `active` und `processing` zunächst **nicht** entfernen (abwärtskompatibel).

## 3.2 Migration B: Backfill + Mapping alter Statuswerte
**Datei (neu):** `supabase/migrations/20260424xxxxxx_backfill_session_lifecycle.sql`

Vorschlag für Mapping:
- `active` -> `recording`
- `processing` ->
  - falls `metadata.processing.analysisStatus = 'completed'` => `analyzed`
  - falls `metadata.processing.transcriptStatus = 'completed'` => `transcribed`
  - sonst => `uploaded`
- `failed`, `archived`, `completed` bleiben unverändert

## 3.3 Migration C: Hilfsfunktion für erlaubte Transitions (optional, empfohlen)
**Datei (neu):** `supabase/migrations/20260424xxxxxx_add_session_status_transition_guard.sql`

- SQL-Funktion `public.is_valid_session_transition(from_status, to_status)`
- Trigger auf `conversation_sessions`, der ungültige Sprünge blockiert.

Erlaubte Transitionen:
- `draft -> recording`
- `recording -> uploaded`
- `uploaded -> transcribed`
- `transcribed -> analyzed`
- `analyzed -> feedback_ready`
- `feedback_ready -> training_in_progress`
- `training_in_progress -> completed`

Zusatzpfade (robust):
- jeder Status -> `failed`
- `failed -> recording` (Retry)

---

## 4) TypeScript-Typen aktualisieren

## 4.1 `src/types/database.ts`
`ConversationSessionStatus` ergänzen auf:
- `draft`
- `recording`
- `uploaded`
- `transcribed`
- `analyzed`
- `feedback_ready`
- `training_in_progress`
- `completed`
- `failed`
- `archived`
- (temporär: `active`, `processing` als Legacy während Migration)

## 4.2 Domänenmodell (`src/types/domain.ts`)
`ConversationSession` um optionale Metadaten erweitern:
- `topic?: string`
- `language?: string`
- `audioQuality?: { backgroundNoiseLevel?: 'low' | 'medium' | 'high'; snrEstimateDb?: number; confidence?: number }`

---

## 5) Backend/Service-Flow anpassen

## 5.1 `src/services/supabase/session.service.ts`

### createConversationSession()
- Status von `active` auf `draft` (oder direkt `recording` wenn UX sofort startet).
- Beim Start der Aufnahme: explizit `recording` setzen.

### updateConversationSessionAfterUpload()
- Status auf `uploaded` setzen.
- `metadata` setzen/mergen: `audioFilePath`, `durationSeconds`, optional `topic`.

### updateConversationSessionStatus()
- Utility für sichere Transitionen (optional Vorprüfung im Client/Service).
- Bestehende Metadata-Merge-Logik behalten und um neue Felder erweitern.

## 5.2 `src/services/pipeline/session-processing.pipeline.ts`

Pipeline-Schritte auf AP3-Lifecycle mappen:
1. Nach erfolgreichem Upload: `uploaded`
2. Nach abgeschlossener Transkription: `transcribed`
3. Nach abgeschlossener Analyse: `analyzed`
4. Wenn Feedback-Artefakte erzeugt sind: `feedback_ready`
5. Wenn Training ausgelöst wurde: `training_in_progress`
6. Nach Abschluss: `completed`

Fehlerpfad:
- Bei Fehlern: `failed` + `metadata.processing.lastError`.

## 5.3 Sprache aus STT übernehmen
In `sessionTranscriptService.markCompleted` wird `language_code` schon persistiert.
Zusätzlich nach Session-Metadaten spiegeln (`metadata.language`), damit UI nicht joinen muss.

## 5.4 Hintergrundrauschen-Qualität (Phase 2, optional)
Variante A (schnell):
- Client-seitig Heuristik (`MediaStreamTrack` Einstellungen + Pegelvarianz) -> `backgroundNoiseLevel`.

Variante B (sauber):
- Server-seitig Audio-Feature-Analyse (z. B. RMS/SNR) beim Upload.

---

## 6) UI-Anpassungen

## 6.1 `src/pages/sessions/NewSessionPage.tsx`

- Eingabefeld `Thema` ergänzen.
- Bei „Neue Session starten“: Session mit `topic` vorbereiten.
- Recorder-Flow:
  - Start: Status `recording`
  - Stop+Upload: Status `uploaded`

- Session-Status als Stepper anzeigen (8 Schritte).

## 6.2 `src/features/sessions/AudioRecorder.tsx`

- Optionaler Callback `onStart` / `onStop`, damit Seite Statuswechsel sauber triggern kann.
- Optional: einfache Messung für Hintergrundrauschen starten/sammeln.

## 6.3 `src/features/sessions/SessionList.tsx`

- Neue Statuslabels/Badges für AP3-Lifecycle.
- Filter „in Bearbeitung“ vs „abgeschlossen“.

## 6.4 `src/pages/sessions/SessionDetailPage.tsx`

Metadatenkarte erweitern um:
- Thema
- Sprache
- Hintergrundrauschen-Qualität (falls vorhanden)
- Datum (bereits vorhanden) und Dauer (bereits vorhanden)

Zusätzlich:
- Lifecycle-Timeline (z. B. vertikale Step-Liste mit aktuellem Schritt).

---

## 7) API-/Kontraktanpassungen

Falls externe API-Contracts genutzt werden (`src/services/api/contracts.ts`):
- `ConversationSessionStatus` dort ebenfalls erweitern.
- DTO für Session-Metadaten um `topic/language/audioQuality` ergänzen.

---

## 8) Rollout-Strategie

## Phase 1 (kompatibel, risikoarm)
1. Enum erweitern.
2. TypeScript-Union um neue + Legacy-Status erweitern.
3. Service/Pipeline schreiben beide Modelle korrekt.
4. UI kann alte und neue Status rendern.

## Phase 2 (Umstellung)
1. Backfill-Migration ausführen.
2. Neue Status aktiv nutzen (create/upload/pipeline).
3. Monitoring auf fehlerhafte Transitionen.

## Phase 3 (Bereinigung)
1. Legacy-Status `active/processing` aus Codepfaden entfernen.
2. Optional später DB-seitig Migration auf reines AP3-Set.

---

## 9) Testplan (konkret)

## 9.1 Unit-Tests
- `session.service`:
  - create setzt korrekten Startstatus.
  - upload setzt `uploaded` + Metadata.
  - Statusübergänge validieren.

- `session-processing.pipeline`:
  - Happy Path durchläuft `uploaded -> transcribed -> analyzed -> feedback_ready -> training_in_progress -> completed`.
  - Fehlerpfad setzt `failed` + lastError.

## 9.2 Integrations-Tests (Supabase lokal)
- Migrationen laufen ohne Fehler.
- Backfill mappt Alt-Daten korrekt.
- Trigger blockiert ungültige Sprünge.

## 9.3 E2E (UI)
- Nutzer startet Session, nimmt auf, stoppt, Upload erfolgreich.
- History zeigt neuen Status.
- Detailseite zeigt Thema, Sprache, Dauer, Datum.
- Optional: Hintergrundrauschen wird angezeigt, wenn vorhanden.

---

## 10) Task Breakdown (ready for tickets)

1. **DB:** Enum erweitern + Backfill + Transition-Guard.
2. **Types:** Status/Metadaten in `database.ts` + `domain.ts`.
3. **Service:** Session-Metadaten und neue Statuspfade.
4. **Pipeline:** Lifecycle-Mapping bis `completed`.
5. **UI New Session:** Thema + Stepper + Statushooks Recorder.
6. **UI History/Detail:** Neue Statusbadges + Metadatenfelder.
7. **Tests:** Unit + Integration + E2E.
8. **Cleanup:** Legacy-Status entfernen (nach Stabilisierung).

---

## 11) Definition of Done (DoD)

- AP3-Lifecycle vollständig im System abbildbar.
- Session-Detail zeigt alle geforderten Metadaten (inkl. Sprache, Thema; Noise optional falls aktiviert).
- Historie zeigt korrekten Lifecycle-Status.
- Migrationen + Backfill erfolgreich auf Staging.
- Tests für Happy/Error-Pfade grün.
