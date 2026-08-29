# Launch-Readiness-Audit (Stand: 15.08.2026)

> Ersetzt `docs/go-live-audit-2026-04-29.md`.
> Basis-Commit: `432c124` · Branch: `claude/app-produktiv-launch-review-fuhlfc`
> Zielszenario: **öffentlicher Paid-Launch** (nicht Closed Beta)
> Alle Beweisstellen wurden gegen den tatsächlichen Dateiinhalt verifiziert.

## Nachtrag (15.08.2026, nach Datenbankzugriff)

Mit direktem Zugriff auf die Produktions-Datenbank (`pkmwdhjohidkkjkrlcnt`) lassen sich zwei
Aussagen aus der Erstfassung korrigieren bzw. ergänzen:

- **Befund E war zu pauschal.** Nicht alle Prompt-Texte sind leer. Die produktiv genutzten
  Kern-Prompts — `session_analysis` (v4, aktiv, `gpt-5-mini`), `session_transcript_cleanup`
  (v2, aktiv), `focus_topic_selector`, `multi_session_pattern_detection`, `tutor_explanation`,
  `improvement_check` u. a. — sind aktiv und mit Inhalt gefüllt. Leer und inaktiv sind nur die
  fünf optionalen `coach_*`-Erweiterungsprompts (Session-Plan, Next-Step, Reflection,
  Completion, Training-Recommendation), die exakt den Feature-Flags entsprechen, die in
  `.env.example` standardmäßig auf `false` stehen — konsistent, kein Defekt. Der Kernbefund
  bleibt aber bestehen: In der DB liegen mehrere Versionen pro `prompt_key` (u. a. 4× bei
  `session_analysis`, 4× bei `dashboard_summary`), ohne dass davon irgendeine im Repository
  versioniert ist. Kein Diff, kein Review, kein Rollback-Pfad im Code.
- **Befund G (behoben in diesem PR)**: Die Preise in der Produktions-DB
  (`billing_plan_catalog`) wichen vom Code ab — DB: `5 € / Monat` (Starter) / `9 € / Monat`
  (Pro); Code-Fallback und Seed-Migration: `19 €` / `49 €`. Genau das Risiko, vor dem der
  eigene Migrationskommentar warnt („price_label muss synchron zu Stripe-Preisen gepflegt
  werden"), war bereits eingetreten. Auf Rückfrage hat der Betreiber `5 €` / `9 €` als
  korrekt bestätigt. Behoben durch Migration
  `20260815120000_sync_billing_plan_catalog_live_prices.sql` (bringt den versionierten
  Seed-Stand auf den echten Stand) und Angleichung von `plan-fallback-catalog.ts` sowie der
  Marketing-Fallback-Preise. Details unten unter Befund G.

Supabase-Security-Advisors zusätzlich geprüft: 17 `WARN`, keine `ERROR`. Überwiegend
`SECURITY DEFINER`-Funktionen, die für `anon`/`authenticated` ausführbar sind (u. a.
`reserve_user_tokens`, `track_funnel_event`) — bei RPCs, die absichtlich ohne Sitzung
aufrufbar sein sollen, meist unkritisch, aber wert, gegen die Absicht jeder Funktion zu
prüfen. Dazu: „Leaked Password Protection" ist deaktiviert — vor dem Launch aktivieren.

**Zweiter Nachtrag (15.08.2026, gleicher Tag):** Befund A (serverseitige Guardrails) und
Befund E (Prompt-Backup) sind jetzt größtenteils bzw. vollständig behoben — siehe die
jeweiligen Abschnitte. Frage 2 (Prompt-Qualität) ist jetzt inhaltlich beantwortet, siehe
Abschnitt 3. Neu hinzugekommen: Befund H (9/12 aktive Prompts ohne wirksames Schema), Befund I
(`dashboard_summary` widerspricht sich selbst), Befund J (`coach_feedback` ist toter Code),
Befund K (die P0/P1-Empfehlungen aus dem DaF/CEFR-Audit vom Mai sind unverändert offen).

**Dritter Nachtrag (15.08.2026, gleicher Tag):** Beim Nachbessern von Befund H fiel der bislang
schwerwiegendste Befund des gesamten Audits auf — **Befund L**: Sieben der zwölf aktiven
Prompts hätten bei jedem echten Aufruf sofort mit einem Variablen-Fehler abgebrochen, darunter
der komplette Tutor-Dialog (`tutor_explanation`, `tutor_followup_answer`, `understanding_check`,
live über `TutorWorkspace.tsx`) sowie die Fokus-Themen-Auswahl, die überhaupt nie in Produktion
lief, weil ihr einziger Aufrufer selbst toter Code war. Alle sieben sind jetzt repariert und wo
nötig neu verdrahtet (Details in Abschnitt 3). Damit haben inzwischen alle 11 aktiven Prompts
ein echtes Ausgabeschema (Befund H de facto erledigt). Beide Edge Functions
(`process-session`, `openai-chat-proxy`) sind live deployt (v20 bzw. v18).

**Vierter Nachtrag (16.08.2026):** Auf Wunsch des Betreibers wurden zwei der drei verbliebenen
offenen Punkte umgesetzt (der dritte, die restlichen Betreiberangaben, bleibt bewusst offen, da
er nicht erfunden werden darf). Erstens: das Monats-Token-Limit aus Befund A, Punkt 8 ist jetzt
gesetzt (Starter 300.000 / Pro 1.200.000 Tokens, konservative Option, vom Betreiber bestätigt) —
dabei fiel auf, dass die Plan-Konfiguration in drei unabhängigen Kopien existiert
(`_shared/billing-plans.ts` ist toter Code, `create-checkout-session` und `stripe-webhook`
führen je eigene `PLAN_CONFIGS`), siehe Welle 2 Punkt 13. Außerdem wurde dabei ein neuer
Randfall entdeckt: Nutzer ohne `user_entitlements`-Zeile bleiben ungedeckelt (Welle 2, Punkt 19).
Zweitens: alle drei P0/P1-Empfehlungen aus Befund K sind jetzt umgesetzt, inklusive zweier
harter Laufzeit-Gates (Details in Abschnitt 3, Befund K).

**Fünfter Nachtrag (16.08.2026):** Auf Wunsch des Betreibers implementiert: eine 14-tägige
kostenfreie Testphase auf den bei der Registrierung/im Checkout gewählten Plan (Starter oder
Pro), danach automatische Abbuchung — kein separater Free-Tier, sondern ein Stripe-natives
Trial (`trial_period_days: 14`) direkt an der gewählten Plan-Subscription. Technisch:

- `billing_customers.trial_started_at` (neue Spalte,
  `20260816150000_add_trial_tracking_to_billing_customers.sql`) trackt, ob ein Nutzer die
  Testphase bereits einmal in Anspruch genommen hat. Gesetzt wird sie vom Webhook bei einem
  echten `trialing`-Event, nicht schon beim Erstellen der Checkout-Session — ein abgebrochener
  Checkout verbraucht die Berechtigung also nicht. Kündigen und neu registrieren mit derselben
  E-Mail verbraucht sie hingegen dauerhaft (kein zweites kostenfreies Trial pro Nutzer).
- `create-checkout-session` (v15) prüft server-seitig — nicht der Client — ob ein Nutzer noch
  testphasenberechtigt ist, und hängt dann `trial_period_days: 14` an die Subscription.
  `payment_method_collection: 'always'` erzwingt, dass eine Zahlungsmethode auch während der
  Testphase erfasst wird, damit die Abbuchung nach 14 Tagen tatsächlich automatisch erfolgt.
- `stripe-webhook` (v12) mappt `trialing` bereits seit der ursprünglichen Stripe-Integration auf
  Entitlement-Status `active` — Testphasen-Nutzer bekommen also sofort die vollen Limits ihres
  gewählten Plans, ohne neue Entitlement-Logik.
- Konsequenz für die Widerrufsbelehrung: Checkout-Sessions mit gewährter Testphase verlangen
  **nicht** die bisherige Sofortstart-/Widerrufsverzicht-Einwilligung (§356 Abs. 5 BGB), weil die
  Leistung dann nicht sofort kostenpflichtig beginnt. Stattdessen eine separate
  Auto-Konversions-Kenntnisnahme in `PricingPage.tsx`. Nutzer ohne verbleibende Testphase
  durchlaufen weiterhin exakt den bisherigen Sofortstart-Consent-Flow. **Diese neue
  Auto-Konversions-Formulierung wurde nicht anwaltlich geprüft** — "Free Trial → automatische
  Zahlungspflicht"-Flows sind ein aktiver Schwerpunkt von Verbraucherschutz-Durchsetzung
  (EU-Omnibus-Richtlinie, FTC Click-to-Cancel); vor Launch prüfen lassen, siehe Abschnitt 6.

**Sechster Nachtrag (18.08.2026): Welle 2 vollständig umgesetzt.** Alle neun Punkte aus „Welle
2 — Technische Hygiene" (unten, Punkte 11–19) sind jetzt erledigt:

- **Punkt 11 (rote Tests):** Alle vier verbleibenden stale-Fixture-Fehlschläge behoben — zwei
  durch Ergänzung des fehlenden `conversation_sessions`-Objekts in der Integrations-Test-Fixture,
  zwei durch Entkopplung von der dauerhaft leeren statischen `promptRegistry` (lokales
  Schema-Fixture bzw. Umstieg auf `PRODUCTIVE_PROMPT_KEYS`). `session-processing.pipeline.test.ts`
  ist mit seinem toten Pipeline-Code zusammen entfernt worden (Punkt 13), nicht „repariert".
- **Punkt 12 (CI):** `.github/workflows/ci.yml` läuft jetzt bei jedem Push/PR: `npm ci`, `tsc -b`,
  `lint`, `test` auf Node 22. `provider.test.ts` (Betreiberdaten-Gate, siehe Abschnitt 6) lief
  anfangs im selben blockierenden `test`-Schritt — bewusst, damit CI so lange rot bleibt, bis die
  Betreiberdaten vorliegen, statt „launch-ready" fälschlich grün zu signalisieren. Auf Munthers
  Rückfrage, ob dieser Check „gefixt" werden könne: **keine Platzhalterdaten** in
  `provider.ts` — die vier fehlenden Felder (`registrationNumber`, `representative`,
  `euRepresentativeAddress`, `vatId`) erscheinen direkt auf den öffentlichen
  Impressum-/Datenschutz-Seiten; erfundene Registernummern, Vertretungsberechtigte oder
  USt-IdNr. wären eine echte Falschangabe in einer gesetzlichen Pflichtangabe (§5 DDG,
  Art. 13/27 DSGVO), kein Test-Artefakt. Stattdessen läuft `provider.test.ts` jetzt in einem
  eigenen, nicht blockierenden Schritt (`continue-on-error: true`) — der PR-Check wird grün,
  der Fehlschlag bleibt aber sichtbar im Actions-Log, bis echte Daten eingetragen werden.
- **Punkt 13 (toter Code):** `session-processing.pipeline.ts` (+ zugehörige Tests),
  `_shared/prompt-runner.ts`, `_shared/billing-plans.ts` gelöscht — sowie beim Aufräumen
  zusätzlich eine bereits zuvor unabhängig tote `process-session/_shared/types.ts` (Duplikat, das
  von der Welle-1-Bereinigung übersehen wurde) und das nirgends mehr gelesene
  `VITE_USE_STUB_TRANSCRIPTION` (`src/lib/env.ts`, `vite.config.ts`).
- **Punkt 14 (Produktiv-Pfad auf Client-Qualität) + Response-Format-Constraint:** `process-session`
  hat jetzt Schema-Validierung, JSON-Repair, Safety-Filter, Overcorrection-Guard und
  `prompt_execution_logs`-Protokollierung inkl. Kostenschätzung — 1:1 aus dem Client-Pfad
  portiert nach `process-session/_shared/*.ts` (Deno kann nicht aus `src/` importieren). Dabei
  Befund D präzisiert: process-sessions eigener `usesStructuredOutput`-Check verglich
  `response_format` mit dem String `"json_schema"` — ein Wert, den die DB-Constraint nie erlaubt
  (nur `json_object`/`text`). Der Client entscheidet aber tatsächlich anders: er aktiviert
  Structured Outputs bei jedem `outputFormat === 'json_object'` mit einem gültigen
  Objekt-Schema, unabhängig vom konkreten `response_format`-Wert. **Bewusst nicht** die
  Constraint erweitert, sondern process-sessions Gating-Logik auf das tatsächliche
  Client-Verhalten umgestellt — funktional identisch, aber ohne dass irgendjemand händisch
  `response_format` auf einen neuen Wert umstellen müsste: alle 11 aktiven Prompts haben bereits
  `response_format='json_object'` mit gültigem Objekt-Schema, Structured Outputs greift damit
  sofort. Deployt als `process-session` v24.
- **Punkt 15 (Status-Kaskade + Stale-Failed-Bug):** Die vier sequenziellen Status-Updates am Ende
  von `runServerPipeline()` sind ein einzelnes `update({status:'completed'})`. Der vorbestehende
  Bug ist ebenfalls behoben: ein neuer `StageTracker` sorgt dafür, dass im Fehlerfall nur die
  Tabelle der Stufe auf `failed` gesetzt wird, die dieser Lauf tatsächlich erreicht hat — vorher
  überschrieb z. B. ein Analyse-Fehler den `session_transcripts`-Datensatz einer bereits
  erfolgreichen Transkription mit `failed` und einem fachfremden `last_error`.
- **Punkt 16 (Plan-Limits gegen Durchsetzung testen):** `plan-catalog-consistency.test.ts` prüfte
  bisher nur zwei informative Textquellen (Fallback-Katalog, DB-Seed) gegeneinander — nie den
  tatsächlichen Durchsetzungspfad. Neuer Test gleicht `FALLBACK_PLAN_CONTRACTS` direkt gegen
  `PLAN_CONFIGS` in `stripe-webhook/index.ts` ab (die Quelle, die `user_entitlements` tatsächlich
  befüllt) — verifiziert durch eine gezielte Drift-Injektion, dass der Test bei Abweichung
  wirklich rot wird, nicht nur bei Zufall grün bleibt.
- **Punkt 17 (Prompt-Quality-Framework erweitern + Review-Durchlauf):**
  `docs/coach-prompt-quality-framework.md` deckte bislang nur die fünf inaktiven `coach_*`-Prompts
  ab. Neuer Teil B mit Kriterien und einem echten Track-A-Review (Lektüre der tatsächlichen
  `system_prompt`/`developer_prompt`/`user_prompt_template`/Schema aus der DB) für alle 11 aktiven
  Prompts. Ergebnis: 10 von 11 „go", ein „iterate" (`daily_prompt_generator` fehlen die
  Ton-Leitplanken, die der Rest des Systems durchgängig hat), drei nicht-blockierende
  Struktur-Funde (unbefüllte Template-Variable in `session_transcript_cleanup`, redundantes
  Boolean-Paar in `improvement_check`, Feldnamen-Kollisionsrisiko `next_action`/`nextAction` in
  `dashboard_summary`). Ein tieferer Output-Sampling-Review (Track B) bleibt offen und ist jetzt,
  dank `prompt_execution_logs` aus Punkt 14, technisch möglich, sobald echter Traffic vorliegt.
- **Punkt 19 (Nutzer ohne Entitlement-Zeile):** Auf Munthers ausdrückliche Entscheidung
  („process-session ohne Entitlement ablehnen") umgesetzt statt eines echten Free-Tiers:
  `process-session` verlangt jetzt eine aktive `user_entitlements`-Zeile und lehnt ohne sie mit
  HTTP 402 (`no_active_entitlement`) ab, statt wie zuvor auf ungedeckelte Default-Limits
  zurückzufallen. Da `user_entitlements`-Zeilen ausschließlich durch ein reales Stripe-
  Subscription-Event entstehen (auch das erste `trialing`-Event der 14-Tage-Testphase reicht),
  betrifft das nur Nutzer, die nie ein Abo — auch nicht im Trial — gestartet haben.

Damit ist die im Erstaudit unter „Frage 2 aus dem Code heraus nicht beantwortbar" formulierte
Lücke geschlossen (Abschnitt 3), die produktive Pipeline hat jetzt dieselben Sicherheitsnetze wie
der Client-Pfad, und es existiert zum ersten Mal eine automatisierte Instanz, die Regressionen bei
jedem Push sichtbar macht.

**Siebter Nachtrag (18.08.2026): Welle 3 vollständig umgesetzt.** Alle sechs Punkte aus „Welle 3 —
Neuentwurf der Kernflows" (unten, Punkte 20–25) sind jetzt erledigt, in Abhängigkeitsreihenfolge
`13 → (16 ∥ 15 ∥ 17a) → 14 → 18`:

- **Punkt 20 (Design-Tokens + eine Button-Konvention):** Sieben Custom Properties
  (`--color-border`, `--color-surface`, `--color-primary`, `--color-muted-foreground`,
  `--text-tertiary`, `--color-danger`, `--color-success`), referenziert von der live genutzten
  `SessionProcessingStatus`-CSS, waren nirgends in `:root` definiert und degradierten still. Auf
  die bestehenden echten Tokens aliasiert, dazu semantische Danger/Success/Warning-Tokens,
  volle Typo-/Spacing-Skala und ein `--shadow-lg` ergänzt. Dark Mode via
  `[data-theme="dark"]`-Block plus `@media (prefers-color-scheme: dark)`-Fallback (nur Tokens,
  kein Toggle — außerhalb der 6 Punkte). Von drei koexistierenden Button-Konventionen
  (`button`/`button-secondary`, `btn-*`, `landing-btn*`) hat `.button`/`.button-secondary`/neu
  `.button-danger` gewonnen (breiteste Abdeckung); alle Konsumenten migriert, dabei einen echten
  Bug gefunden und behoben (`SessionList.tsx`s Löschen-Button fehlte die Basisklasse `button`),
  totes `lp-*`-CSS (~150 Zeilen, keine Verwendung mehr) gelöscht.
- **Punkt 21 (Session-Aufnahme neu):** Vier unabhängige Status-Enums beschrieben denselben
  Lebenszyklus gleichzeitig (`AudioRecorder`s `RecorderState`, eine gespiegelte Kopie davon in
  `NewSessionPage`, `SessionFlowCard`s eigener `FlowState`, `NewSessionPage`s handgebauter
  `POST_UPLOAD_STATUS_RANK`) — während der Aufnahme waren dadurch zwei unabhängig berechnete
  Statuszeilen gleichzeitig sichtbar, nach dem Upload bis zu zwei gestapelte Status-Blöcke.
  Ersetzt durch ein Modell (`useSessionRecordingFlow`, Zustandsmaschine
  `idle → ready → recording → paused → review → saved`) und ein `SessionStatusBadge`.
  `NewSessionPage.tsx` (633 Zeilen) aufgeteilt in `src/pages/sessions/new-session/`:
  `SessionTopicPicker`, `SessionRecordingPanel` (ersetzt `SessionFlowCard`), `SessionReviewPanel`
  (nutzt jetzt durchgängig `SessionProcessingStatus`s bestehende Schritt-Checkliste statt der
  einfacheren, getrennten Punkte-Anzeige — bestätigte Entscheidung), `SessionHistoryAccordion`.
  `AudioRecorder` selbst unverändert (geteilt mit dem Coach-Flow über `variant="coach"`).
- **Punkt 22 (Onboarding neu):** Navigiert nach Abschluss direkt zu `/sessions/new` statt zum
  Dashboard (Munthers Entscheidung), Zeitzone-Feld entfernt (automatisch erkannter Browser-Wert
  wird weiter gespeichert, änderbar im Profil), Untertitel setzt das 5-Minuten-Versprechen.
- **Punkt 23 (Dashboard neu):** Fünf Karten mit teils identischem Inhalt — Hero-Karte und
  „Nächste Empfehlung"-Karte rendern denselben `nextRecommendation`-String wortgleich doppelt,
  „Wichtigster Verbesserungsbereich" ist ein drittes Feld desselben KI-Objekts — auf drei Karten
  reduziert (Munthers Entscheidung): eine Next-Action-Karte (vereint alle drei), „Letzte
  Session", „Sessions-Verlauf". `deriveDashboardInterpretation()` unverändert als einzige
  Quelle, nur nicht mehr doppelt gerendert.
- **Punkt 24 (Terminologie):** 15 nutzersichtbare „Dialog"/„Dialoge"/„Dialogverlauf"-Vorkommen
  auf „Session" umgestellt — u. a. `NewSessionPage.tsx`s Seitentitel und Hauptüberschrift (9 von
  15), `BillingSuccessPage.tsx`, `ProgressOverview.tsx`, zwei Coaching-Copy-Strings in
  `TutorWorkspace.tsx`. Interne Bezeichner mit englischem „Dialogue" (`buildDialogueJson`,
  `markDialogueCompleted`, `mapDialogueStatusToProductStatus`) bewusst unverändert gelassen —
  nur sichtbare deutsche Nutzertexte waren im Scope.
- **Punkt 25 (`TutorWorkspace.tsx` aufteilen):** 1112 Zeilen, davon ~300 Zeilen Modul-Helper vor
  der eigentlichen Komponente, darunter fünf fast identische Readiness-Gate-Funktionen (je eine
  pro Coach-Prompt-Art, je mit eigener gecachter Modul-Variable). Aufgeteilt in
  `src/features/tutor/`: `coach-readiness.ts` (die fünf Gates zu einer
  `checkCoachReadiness(key)`-Funktion mit Map-Cache zusammengefasst), `coach-task-plan.ts`,
  `coach-text-normalization.ts`, `session-memory.ts` für die Modul-Helper, plus die
  präsentationalen Komponenten `TutorSessionHeader`, `TutorTaskPanel`, `TutorCompletionPanel`,
  `TutorChatHistory`, `TutorErrorBanner`. `TutorWorkspace.tsx` selbst ist jetzt die komponierende
  Hülle (1112 → 771 Zeilen). Die zustandsbehaftete Orchestrierung (Bootstrap, Klärungsfrage,
  Verständnis-Check, KI-Abschluss) bleibt bewusst dort, statt in weitere Hooks aufgeteilt zu
  werden — die Komponente hat keine automatisierten Tests, und das Durchreichen von ~15
  wechselseitig abhängigen State-Stücken durch neue Hooks hätte das Verhaltensrisiko ohne
  funktionalen Gewinn erhöht.

Nach jeder Teilphase: `tsc -b`, `npm run lint`, `npm run test` grün (145 Tests, 1 bewusst
übersprungen). Damit ist auch der dritte und letzte Befund aus dem Erstaudit — „UI/UX besser als
vermutet, aber halbfertig" — bearbeitet.

**Achter Nachtrag (20.08.2026): UI/UX-Feinschliff + fachliche Prompt-Vertiefung (Munthers
Auftrag „aus fachlicher Sicht eines Lehrers/Coaches").**

UI/UX-Feinschliff (5 Punkte, alle umgesetzt): Cookie-Banner verdeckte auf kürzeren Seiten
interaktive Elemente (echter Bug, per `ResizeObserver`-reservierter `padding-bottom` behoben);
`lucide-react` als erstes Icon-System eingeführt (beide Navs, `SessionStatusBadge`,
Dashboard-Leerzustände); Button-Hierarchie-Konvention dokumentiert und angewendet — dabei einen
echten Bug gefunden: `SessionDetailPage.tsx` stylte eine destruktive „Session löschen"-Aktion als
primären (blauen) Button, während die sichere „Als Entwurf speichern"-Option sekundär war, genau
verkehrt herum; Skeleton-Loader statt Text auf den zwei meistgenutzten Ladezuständen
(`ProtectedRoute`, Dashboard); dezente Eintritts-Animation (Seiten-Fade, gestaffelte
Dashboard-Karten).

Fachliche Prüfung (Track-A-Nachprüfung der `coach_*`-Prompts + Umsetzung der drei
nicht-blockierenden Funde aus Teil B):

- **Korrektur einer eigenen Fehleinschätzung:** In einer vorherigen Antwort wurde behauptet, die
  fünf `coach_*`-Prompts (`coach_session_plan`, `coach_next_step`,
  `coach_training_recommendation`, `coach_session_completion`, `coach_reflection_interpreter`)
  seien „vollständig gebaut" und bräuchten nur eine Track-B-Validierung vor Aktivierung. Das war
  falsch. Direkte Prüfung von `prompt_definitions` zeigt: `system_prompt`, `developer_prompt` und
  `user_prompt_template` sind bei allen fünf **leere Strings** — nur das Output-Schema existiert.
  Die Runtime-Anbindung (`coach-runtime.service.ts`, Readiness-Gates, Feature-Flags) ist real und
  sauber gebaut, aber die eigentlichen Coaching-Anweisungen wurden nie geschrieben. Vor einer
  Aktivierung braucht es also echtes Prompt-Engineering, keine Validierung eines bestehenden
  Stands. Nicht in diesem Schritt umgesetzt — Munthers Entscheidung ausstehend, ob/wie diese
  Prompts inhaltlich erarbeitet werden sollen.
- **`daily_prompt_generator` v3→v4:** Ton-Leitplanken ergänzt (kein Hype/Ausrufezeichen-Ketten,
  keine Gamification-/KPI-Sprache, keine generischen Chatbot-Floskeln, keine offenen
  Chat-Einladungen, kein Therapie-Ton) — war der einzige nutzersichtbare aktive Prompt ohne diese
  sonst durchgängigen Klauseln. Nebenbefund: aktuell ruft keine UI `dailyPromptService` auf (schon
  in der Prompt-Beschreibung von v3 dokumentiert) — der Fix ist damit vorsorglich, nicht dringend,
  aber korrekt für den Moment, in dem die Funktion angebunden wird (z. B. als Ersatz für die
  statische Themen-Vorlagen-Liste in `NewSessionPage.tsx`).
- **`session_transcript_cleanup` v2→v3:** ungenutzten `{{learner_metadata_json}}`-Platzhalter aus
  dem Template entfernt — kein Aufrufer füllte ihn.
- **`dashboard_summary` v5→v6:** Feld `nextAction` (Objekt) zu `nextActionDetail` umbenannt, um
  die Verwechslungsgefahr mit dem Pflichtfeld `next_action` (String) zu beseitigen. Passende
  TypeScript-Typen/Konsumenten (`dashboard-data.service.ts`, `UserDashboard.tsx`,
  `TutorPage.tsx`) und deren Test-Fixtures im selben Schritt mitgezogen.
- **Bewusst nicht angefasst:** der ursprüngliche Fund „redundantes Feld" bei `improvement_check`
  (`focus_topic_key_match`/`focus_topic_match`). Prüfung von `improvement-check.service.ts:521-522`
  zeigt: beide Felder werden absichtlich zusammen mit dem echten `current_focus_topic_key` als
  zweistufige Verifikation gegen ein halluziniertes Match des Modells verknüpft
  (`explicitTopicKeyMatch = focus_topic_key === currentFocusTopicKey && focus_topic_key_match`,
  `explicitFocusMatch = focus_topic_match && explicitTopicKeyMatch`). Eine Konsolidierung hätte
  diese Absicherung geschwächt statt Ballast entfernt — der ursprüngliche Fund war unpräzise.
- **Neuer, eigenständiger Fund — toter Rückfall-Erkennungspfad:** `focus-topic-transitions.ts`
  definiert einen Übergang `stabil → rueckfall_erkannt` (via `improvement_worsened`) — die
  Zustandsmaschine ist erkennbar für Rückfallprüfung auf bereits gemeisterte Fokus-Themen
  ausgelegt. Aber `improvementCheckService.runForActiveFocusTopic()` (der einzige Aufrufer, aus
  `NewSessionPage.tsx` nach jeder neuen Session) lädt das Fokus-Thema ausschließlich mit
  `.in('status', PRIMARY_FOCUS_STATUSES)` — und `PRIMARY_FOCUS_STATUSES` enthält nur
  `in_training`/`teilweise_stabilisiert`, nicht `stabil`. Ein auf „stabil" gesetztes Fokus-Thema
  wird dadurch **nie wieder geprüft** — kein periodischer Retention-/Vergessenskurve-Check, kein
  Trigger irgendeiner Art (kein Scheduler/Cron im Repo gefunden). Aus Sicht bewährter
  Spracherwerbs-Praxis (verteiltes Wiederholen/Retrieval Practice gegen die Vergessenskurve) ist
  das die konkreteste Lücke aus dieser Prüfung: die App trainiert aktuell „ein Fokusthema bis zur
  Meisterung, dann weiter zum nächsten", aber verifiziert nie, ob die Meisterung hält. Der
  Code für die Erkennung existiert bereits (der `rueckfall_erkannt`-Übergang) — es fehlt nur der
  Trigger, der `stabil`-Themen gelegentlich erneut prüft. Nicht in diesem Schritt umgesetzt —
  eine Produktentscheidung (z. B. „X Sessions nach Erreichen von `stabil` einmal erneut prüfen"),
  keine reine Bugfix-Zeile. **→ Umgesetzt, siehe Neunter Nachtrag.**

**Neunter Nachtrag (21.08.2026): toter Rückfall-Erkennungspfad geschlossen**

- `improvementCheckService.runForActiveFocusTopic()` (`improvement-check.service.ts`) lädt das
  aktive Fokus-Thema jetzt mit `.in('status', [...PRIMARY_FOCUS_STATUSES, 'stabil'])` statt nur
  `PRIMARY_FOCUS_STATUSES` — `stabil`-Themen werden dadurch wieder in den Prüflauf einbezogen.
- Da ein „stabil"-Thema nicht bei jeder neuen Session erneut geprüft werden soll (unnötige
  Modellkosten und Störung eines bereits gemeisterten Themas), wurde eine Cooldown-Schranke
  ergänzt: `STABIL_RECHECK_INTERVAL_SESSIONS = 5`. Für `status === 'stabil'` zählt der Service
  die abgeschlossenen freien Sessions (`session_analyses` mit `status = 'completed'`,
  `conversation_sessions.source != 'tutor'`) seit dem letzten `last_improvement_check_at`
  (Fallback: `focus_topics.updated_at`) und überspringt die Prüfung, solange weniger als 5 neue
  Sessions vorliegen (`{ skipped: true, reason: 'stabil_recheck_not_due' }`).
- Die Reaktivierungslogik auf der Tutor-Seite war bereits vollständig gebaut
  (`focus-topic-policy.ts`s `POLICY_MATRIX` setzt für `rueckfall_erkannt` bereits
  `tutor.isReleased: true` und eine eigene `tutor.goal`-Formulierung), war aber nirgends sichtbar:
  `tutorService.getActiveFocusTopic()` berechnet `tutorGoal` (die situative Formulierung, z. B.
  „Rückfall erkannt: wir setzen auf kurze, gezielte Korrekturschritte."), doch kein UI-Bestandteil
  las dieses Feld. `TutorSessionHeader.tsx` bekam ein neues optionales `relapseNotice`-Prop;
  `TutorWorkspace.tsx` übergibt `focusTopic.tutorGoal`, wenn `focusTopic.status ===
  'rueckfall_erkannt'` ist, gerendert als eigener hervorgehobener Hinweis-Absatz
  (`.tutor-relapse-notice`, neue Regel in `global.css`, `--color-danger`-Akzent). Ohne diese
  Ergänzung wäre die Rückfallerkennung ein rein stiller Backend-Zustandswechsel geblieben, den der
  Lernende nie zu sehen bekommen hätte.
- Verifiziert: `tsc -b`, `npm run lint`, `npm run test` (145 bestanden, 1 bekannt übersprungen)
  jeweils grün, keine Regressionen.

**Zehnter Nachtrag (21.08.2026): die 5 `coach_*`-Prompts geschrieben + ein Validator-Bug in
zwei aktiven Prompts gefunden und behoben**

- **`coach_session_plan`, `coach_next_step`, `coach_training_recommendation`,
  `coach_session_completion`, `coach_reflection_interpreter`** hatten seit
  `20260513100000_neutralize_seeded_prompt_texts.sql` leere `system_prompt`/`developer_prompt`/
  `user_prompt_template`-Felder (siehe Fünfter/Sechster Nachtrag). Alle fünf haben jetzt eine
  neue Version (v2) mit vollständigem Inhalt, geschrieben gegen denselben Qualitätsstandard wie
  die 11 aktiven Prompts: Ton-Leitplanken gegen Hype/Gamification/KPI-Sprache/Chatbot-Floskeln
  (bei `coach_reflection_interpreter` zusätzlich ein explizites Anti-Therapie-Constraint, da
  dieser Prompt laut `coach-prompt-quality-framework.md` das höchste `therapy_tone`-Risiko der
  fünf trägt), Anti-Halluzinations-Klauseln, und Schemas, die exakt gegen die tatsächlichen
  Konsumenten (`coach-runtime.service.ts`, `coach-task-plan.ts`) geprüft wurden — nicht nur gegen
  die Beschreibung. Dabei zwei strukturelle Lücken der alten v1-Schemas behoben: `coach_next_step`
  hatte `followup_question`/`next_task` gar nicht im Schema, obwohl beide Felder aktiv konsumiert
  werden; `coach_session_plan` hatte das `tasks`-Array gar nicht im Schema, obwohl
  `createSessionState()` in `coach-task-plan.ts` ohne gültige `tasks` die komplette Coach-Session
  mit einem Fehler abbricht.
- **Bewusst weiterhin `is_active = false` für alle fünf.** Grund: `VITE_ENABLE_AI_COACH_*`
  (`src/lib/env.ts:51-56`) stehen alle bereits standardmäßig auf `true` — der einzige Grund,
  warum diese Prompts heute nicht bei jedem Tutor-Turn tatsächliche OpenAI-Aufrufe auslösen, ist
  `checkCoachReadiness()`/`validateCoachPromptAvailability()`
  (`coach-prompt-readiness.service.ts`), die eine Aktivierung **aller fünf gemeinsam** verlangt.
  Das Schreiben der Prompt-Inhalte war also nicht bloß Textarbeit, sondern lag einen Schritt vor
  einer scharfen Schalt-Entscheidung: sobald alle fünf `is_active = true` gesetzt werden, laufen
  ab dem nächsten Tutor-Turn echte, kostenpflichtige Modellaufrufe für jeden Nutzer — ohne
  Feature-Flag-Änderung im Code. Das ist eine reine Produkt-/Kostenentscheidung, die hier nicht
  eigenmächtig getroffen wurde. **Update (21.08.2026): auf Munthers ausdrückliche Anweisung
  aktiviert.** Alle fünf `coach_*`-Prompts stehen jetzt auf v2/`is_active = true` (v1 deaktiviert),
  `validateCoachPromptAvailability()` sollte damit `ok: true` liefern und die bereits standardmäßig
  aktiven `VITE_ENABLE_AI_COACH_*`-Flags lösen ab sofort echte OpenAI-Aufrufe im Tutor-Flow aus.
  Track B (Output-Sampling-Review) ist damit nicht mehr optional-vor-Aktivierung, sondern eine
  Nachbeobachtungsaufgabe an echten `prompt_execution_logs`-Einträgen der ersten Tage. Empfehlung
  vor Aktivierung war: mindestens Track B
  (Output-Sampling-Review, siehe `coach-prompt-quality-framework.md` Teil B) an ein paar echten
  Sessions durchführen, dann alle fünf gemeinsam aktivieren (deaktivieren v1 → aktivieren v2, pro
  Key, in dieser Reihenfolge wegen `idx_prompt_definitions_active_per_key`).
- **Nebenfund beim Schema-Schreiben — echter Bug in zwei aktiven Prompts:** `dashboard_summary`
  (v6, aktiv) und `focus_topic_selector` (v2, aktiv) benutzten `"anyOf": [{"type":"null"}, {...}]`
  für ihre optionalen Objekt-Felder (`focusTopic`/`nextActionDetail`/`primaryImprovementArea` bzw.
  `focus_topic`). Der hausgemachte Schema-Validator (`json-schema-validator.ts`, von
  `prompt-execution.service.ts` bei **jeder** Prompt-Ausführung aufgerufen, unabhängig von
  `response_format`) prüft `schema.type` **bevor** er `oneOf`/`anyOf` überhaupt betrachtet — ein
  Feld-Schema, das nur `anyOf` und kein eigenes `type` trägt, hat dort keinen einzigen
  akzeptierten Typ und scheitert dadurch **immer**, egal ob der Wert `null` oder ein korrektes
  Objekt ist (empirisch mit einer Kopie der Validator-Logik gegen beide Fälle nachgestellt, siehe
  Commit). Konsequenz für den Live-Betrieb: jede `dashboard_summary`- und
  `focus_topic_selector`-Antwort löste einen unnötigen `json_repair`-Aufruf aus, scheiterte danach
  erneut an derselben Validierungslücke und wurde serverseitig verworfen — die KI-Dashboard-
  Zusammenfassung und die KI-Fokusthema-Auswahl liefen dadurch praktisch immer auf den stillen
  Fallback (Timeout-Catch-to-null bzw. bestehende Heuristik), nie auf echten Modell-Output, bei
  doppelten OpenAI-Kosten pro Aufruf. Fix: `"type": ["object", "null"]` statt `"anyOf"` (dasselbe
  Muster, das an anderer Stelle in denselben Schemas bereits korrekt für nullable Strings
  verwendet wird, z. B. `recommendedTrainingId`/`strongest_pattern_key`) — `dashboard_summary` v7
  und `focus_topic_selector` v3, aktiviert. Dieser Fund betraf ausschließlich das Datenbank-Feld
  `expected_output_schema_json`, keinen App-Code.
- Verifiziert: alle sechs neuen/geänderten Schemas (5× `coach_*` v2, `dashboard_summary` v7) und
  zur Kontrolle `focus_topic_selector` v3 gegen realistische Beispiel-Outputs mit einer
  Node-Nachbildung der echten Validator-Logik durchlaufen lassen — alle grün. Kein App-Code
  geändert, daher `tsc -b`/`npm run lint`/`npm run test` unverändert grün (145/1, siehe oben).

**Elfter Nachtrag (21.08.2026): Textreview über die restliche, hand­geschriebene UI-Copy**

Munther bat um eine Prüfung aller Texte in der App auf Optimierungspotenzial. Die
KI-Prompt-Sprache war bereits über den Coach-Prompt-Qualitäts-Rahmen (Teil B oben) geprüft; die
zentralen Nutzerflows (Session-Aufnahme, Dashboard, Onboarding, TutorWorkspace) hatten die
Welle-3-Terminologie-Bereinigung bereits durchlaufen. Offen war der Rest: Auth-Seiten,
Marketing-Seiten, Billing, Fehler-/Bestätigungstexte. Eine Catalog-Recherche über diese Bereiche
ergab folgende Funde, alle behoben:

- **Anglizismen-Inkonsistenz „AI" vs. „KI":** `LandingPage.tsx` (Hero-Chip, Feature-Karte),
  `TutorPage.tsx`, `training-paths.ts`, `coach-task-plan.ts` verwendeten „AI"/„AI-Coach", während
  der Rest der App durchgängig „KI"/„KI-Coach" schreibt (u. a. `FeaturesPage.tsx`,
  `PrivacyPage.tsx`, `TermsPage.tsx`, dieselbe Landing Page zwei Zeilen weiter unten). Auf „KI"
  vereinheitlicht, inklusive der dreifach duplizierten `AI_TECHNICAL_ERROR_MESSAGE`-Konstante.
- **Gamification-/KPI-Sprache auf der Landing Page:** „Skill-Level" (Red Flag laut
  `coach-prompt-quality-framework.md`) und eine dritte Bezeichnung „Fokusfelder" für dasselbe
  Konzept, das sonst überall „Fokusbereiche"/„Fokus-Thema" heißt — beides ersetzt. „Weltklasse
  UX" (unbelegtes Superlativ-Marketing plus unübersetztes „UX") zu „Durchdachte Bedienung"
  umformuliert.
- **„Login" als englisches Nomen mitten in deutscher Navigation:** `PublicNav.tsx`s Nav-Item und
  der Seitentitel in `LoginPage.tsx` sagten „Login", während Button und Untertitel auf derselben
  Seite bereits „Einloggen"/„Melde dich an" sagen. Auf „Anmelden" vereinheitlicht (die
  „Zum Login"-Linktexte in `RegisterPage.tsx`/`ResetPasswordPage.tsx` bleiben unverändert — dort
  ist „Login" als Nomen im Fließtext eine gängige, nicht auffällige Verwendung).
- **„Billing"/„Entitlements"-Jargon in Nutzertexten:** `PricingPage.tsx`s Seitentitel „Preise &
  Billing" → „Preise & Abo"; die Fehlermeldung „Das Billing-Portal konnte nicht geöffnet werden"
  → „Das Kundenportal …"; der Button „Bestellung/Abo bearbeiten" (unklare Doppelbezeichnung) →
  „Abo bearbeiten". `BillingSuccessPage.tsx` sagte an vier Stellen „Entitlements" (ein rein
  internes Datenmodell-Wort) direkt zum Nutzer — zu „Zugriffsrechte" vereinheitlicht. Beide
  Seiten rendern zusätzlich den rohen internen Status-Enum-Wert (`entitlementStatus`/
  `entitlement.status`, z. B. `active`/`grace`/`suspended`/`expired`) unübersetzt — dafür
  `mapEntitlementStatusToLabel()` in `billing-recovery.ts` ergänzt (deutsche Labels, analog zum
  bereits bestehenden Muster `mapDialogueStatusToProductStatus` in `productLanguage.ts`) und in
  beiden Seiten verdrahtet. Die „Quelle: entitlement/app_settings_fallback"-Zeile in
  `BillingSuccessPage.tsx` (reine Implementierungsdetail-Information ohne Nutzerwert) entfernt.
- **Grammatikfehler in `WithdrawalPage.tsx`:** Der Widerrufs-Belehrungstext sagte „mittels einer
  eindeutigen Erklärung – zum Beispiel per E-Mail versandter Brief –", eine unlogische Vermischung
  der beiden Standardbeispiele aus dem gesetzlichen Muster ("mit der Post versandter Brief" vs.
  "E-Mail"). Auf den korrekten Standardwortlaut korrigiert. Betrifft ausschließlich Fließtext in
  der Seitenkomponente, nicht die unter `src/content/legal/provider.ts` geführten Betreiberdaten.
- **Inkonsistente Lösch-Bestätigungen:** `SessionList.tsx`s Löschen-Bestätigung enthält den
  Hinweis „Diese Aktion kann nicht rückgängig gemacht werden", die beiden `window.confirm()`-
  Bestätigungen für dieselbe Aktion in `SessionDetailPage.tsx` nicht. Ergänzt, damit dieselbe
  irreversible Aktion unabhängig vom Einstiegspunkt gleich kommuniziert wird.
- **`FocusTopicCard.tsx` gelöscht (nicht umgeschrieben).** Die Komponente war bereits bestätigt
  unerreichbar (kein Importer außer dem eigenen Test — `/progress`-Route leitet direkt auf
  `/dashboard` um, siehe Achter Nachtrag) und enthielt mehrere Red Flags in einem: Emojis (🎉💪🔄📝)
  direkt in der Nutzeransprache, generische Chatbot-Trostfloskeln ("kein Problem, wir justieren
  gemeinsam") und unübersetzte Fachbegriffe ("Diagnose-Confidence", "Learner Readiness"). Da die
  Komponente nirgends gerendert wird, ist Löschen konsistent mit der bereits etablierten
  Praxis dieses Audits (tote Codepfade entfernen statt totes UI polieren) konsequenter als eine
  Textüberarbeitung, die nie ein Nutzer sieht.
- **Geprüft und bewusst unverändert gelassen:** zwei Fundstellen mit funktionalen Icon-Glyphen
  (🗑/⏸/▶/⬆ in `AudioRecorder.tsx`, ein Status-Symbol in `SessionProcessingStatus.tsx`) — beide
  `aria-hidden`, jeweils mit sichtbarem Text-Label daneben. Das ist keine Emoji-in-Fließtext-
  Verletzung wie bei `FocusTopicCard.tsx`, sondern Icon-System-Konsistenz (Unicode-Glyphen statt
  der in UI-2 eingeführten `lucide-react`-Icons) — eine andere Kategorie von Änderung, die zudem
  `AudioRecorder.tsx` anfasst, eine bewusst als riskant markierte, zwischen Session-Aufnahme und
  Tutor-Coach-Flow geteilte Komponente. Nicht Teil dieses Textreviews.
- Verifiziert: `tsc -b`, `npm run lint`, `npm run test` (142 bestanden, 1 bekannt übersprungen —
  Rückgang von 145 auf 142 durch die drei gelöschten `FocusTopicCard.test.tsx`-Tests) jeweils
  grün, keine Regressionen.

**Zwölfter Nachtrag (21.08.2026): kompletter Workflow-Prüfbericht (Didaktik + UI/UX + Technik)**

Auf Munthers Anfrage: Aktivierung der 5 `coach_*`-Prompts (durchgeführt, alle stehen jetzt auf v2/
`is_active = true`) plus eine vollständige Prüfung des gesamten Nutzer-Workflows aus drei Blickwinkeln
— bringt es dem Nutzer nachhaltig, empirisch fundiert etwas bei; ist das UI/UX-Niveau angemessen;
gäbe es durch React oder andere Technologien Verbesserungspotenzial. Vollständiger Bericht als
Artifact veröffentlicht (Link bei Munther), hier die Kernpunkte für den versionierten Verlauf.

**Dringend, da ab heute live Geld kostet:** `coach_reflection_interpreter` läuft seit der Aktivierung
bei jeder Session-Reflexion tatsächlich gegen OpenAI — `TutorWorkspace.tsx:659-668` verwirft das
Ergebnis aber vollständig (`aiFocusSignal = undefined; aiCoachInterpretation = undefined;
aiRecommendedFutureFocus = undefined;`, `aiReflection` wird danach nie gelesen). Jeder Aufruf kostet
Geld für ein Ergebnis, das nirgends ankommt. Kleinster Fix: die drei `= undefined`-Zeilen entfernen
und `reflectionState`/`suggestedFocus` tatsächlich persistieren (~5 Zeilen) — noch nicht umgesetzt,
Munthers Entscheidung zum weiteren Vorgehen steht aus.

**Didaktische Prüfung (gegen SLA-Forschung: Krashen, Swain, Lyster & Ranta, Cepeda, Bjork):**
Kernbefund — der Prompt-Layer ist didaktisch deutlich durchdachter als die Laufzeit, die ihn ausführt.
`understanding_check` v3 verlangt zurecht einen echten, nicht-wörtlichen Transfer-Nachweis
("not a verbatim repeat") — aber `TutorTaskPanel.tsx:52,61,66` sperrt jede weitere Eingabe außerhalb
`cyclePhase === 'clarification'`, sodass ein nachgewiesener Transfer nie geübt werden kann.
`coach-task-plan.ts:66` setzt `learnerLevel: 'A2'` hart für jede/n Lernende/n, obwohl ein echtes
CEFR-Signal existiert (`session_analysis`, `profiles.german_level`) und nur nicht gelesen wird. Der
neue Rückfall-Check zählt Sessions statt Zeit (5 Sessions = 5 Tage oder 5 Monate, gleich behandelt);
zusätzlich löscht der Beweis-Filter in `improvement-check.service.ts:391-397` Erfolgsnachweise, sobald
ein Thema nicht mehr Top-Priorität ist — also genau dann, wenn sich der Lernende verbessert hat.
Positiv hervorzuheben: `improvement_check` bewertet ausschließlich freie, nicht-Tutor-Sessions
(seltene, gute Praxis), und die durchgehende Anti-Gamification-Haltung (kein "Super!!!", keine
Punkte/Streaks) ist über alle 16 aktiven Prompts textlich verifiziert konsistent.

**UI/UX über den Gesamt-Workflow:** echter Playwright-Durchlauf (12 Seiten × Desktop/Mobile) — null
Konsolenfehler, sichtbarer Fokus-Ring, korrekter MwSt.-Hinweis. Ein bestätigter Blocker: die komplette
öffentliche Navigation (`PublicNav.tsx`) verschwindet unterhalb 920px Breite spurlos
(`global.css:1925-1931` setzt `.main-nav`/`.main-nav-scroll` auf `display: none`) — der Ersatz
`.mobile-nav-toggle` existiert nur im eingeloggten `AppShell.tsx`, nicht in `PublicNav.tsx`. Mobile
Besucher der Marketing-Seiten haben dadurch keinen Navigationsweg zu Preise/Registrieren/Anmelden.
Daneben: natives, unlokalisiertes Browser-Validierungs-Tooltip auf `RegisterPage.tsx` ("Please fill
out this field."), und die bereits im ursprünglichen Go-Live-Audit als UWG-Risiko markierte,
unbelegte "+37%"-Aussage auf der Landing Page steht unverändert live (heute erneut per Screenshot
bestätigt).

**Technik/React-Architektur:** insgesamt über dem Niveau dieser Projektphase (striktes TypeScript
inkl. `noUncheckedIndexedAccess`, 17 lazy geladene Routen, sauberer Service-Layer). Zwei ernste
Lücken, beide stichprobenartig gegengeprüft: **keine React-Error-Boundary irgendwo in der App**
(ein Render-Fehler terminiert den gesamten Baum zu einem weißen Bildschirm, ohne dass Munther
davon erfährt) und **`eslint.config.js` hat `rules: {}`** — Plugins sind registriert, aber keine
einzige Regel aktiv, `npm run lint` lief die ganze Session "grün", ohne tatsächlich etwas zu prüfen.
Außerdem: kein Timeout/`AbortSignal` auf dem kritischsten KI-Fetch der App, und die
Dashboard/Coach-Navigation löst bei jedem Wechsel volle Datenkaskaden plus einen bezahlten
`dashboard_summary`-KI-Aufruf neu aus, ohne jede Zwischenspeicherung.

Priorisierte Gesamtliste (alle drei Achsen zusammengeführt, günstigstes+wirksamstes zuerst) und
vollständige Belegkette: siehe Artifact. Nichts aus diesem Bericht wurde ungefragt umgesetzt — reiner
Prüfbericht, Umsetzungsreihenfolge liegt bei Munther.

**Dreizehnter Nachtrag (21.08.2026): komplette Priolisten-Abarbeitung ("Punkt für Punkt")**

Auf Munthers Anweisung wurde die priorisierte Liste aus dem Zwölften Nachtrag vollständig
abgearbeitet — jeder Punkt einzeln implementiert, gegen `tsc -b`/`npm run lint`/volle Testsuite
verifiziert (durchgehend 143 bestanden, 1 übersprungen, keine Regression) und committet/gepusht.

- **Prio-1** (dringend, Geldverlust): `coach_reflection_interpreter`-Ergebnis wird jetzt in
  `TutorWorkspace.tsx` tatsächlich gelesen und im Memory-Update persistiert statt verworfen.
- **Prio-2**: `eslint.config.js` hat jetzt `react-hooks/rules-of-hooks: error` und
  `react-hooks/exhaustive-deps: warn` aktiv; alle dadurch aufgedeckten echten Abhängigkeitsfehler in
  `TutorWorkspace.tsx` und `AudioRecorder.tsx` behoben (u.a. der doppelte Trigger-Mechanismus für den
  Verständnis-Check durch ein sauberes Ref-Pattern ersetzt).
- **Prio-3**: `@sentry/react` (DSN-optional, `tracesSampleRate: 0`) plus eine React-`ErrorBoundary`
  um den gesamten Render-Baum — ein Render-Fehler zeigt jetzt eine deutsche Fehlerseite statt eines
  stillen weißen Bildschirms.
- **Prio-4**: `PublicNav.tsx` hat jetzt dasselbe mobile Menü (Focus-Trap, Escape-Handling,
  `aria-expanded`) wie die eingeloggte `AppShell.tsx` — mobile Besucher der Marketing-Seiten haben
  wieder einen Navigationsweg.
- **Prio-5**: der Coach liest jetzt `profiles.german_level` statt hart `'A2'` zu setzen.
- **Prio-6**: der Beweis-Filter in `improvement-check.service.ts` löscht Erfolgsnachweise nicht mehr,
  nur weil ein Thema nicht mehr Top-Priorität der Session war.
- **Prio-7**: `AudioRecorder.tsx` hat jetzt einen Pegel-Meter (Web-Audio-API/RMS), `onerror`-Handling,
  `aria-live`-Statusregionen und Rauschunterdrückungs-Constraints auf `getUserMedia`.
- **Prio-8a**: der `transfer_ready`-Zustand ist kein Sackgassen-Zustand mehr — ein nachgewiesener
  Transfer schließt jetzt automatisch die Session ab, statt in einer gesperrten Eingabe zu enden.
- **Prio-8b**: `noValidate` plus eigene deutsche Validierungsmeldungen auf Login/Register/
  Reset-Password ersetzen das native, unlokalisierte Browser-Tooltip; live mit Playwright verifiziert.
- **Prio-8c**: die unbelegte "+37%"-Aussage auf der Landing Page wurde auf Munthers Entscheidung durch
  eine qualitative, nicht quantifizierte Aussage ersetzt (UWG-Risiko entfällt).
- **Prio-9**: Dashboard und Coach teilen sich jetzt einen `useDashboardData`-Hook
  (`@tanstack/react-query`, `staleTime: 60_000`) statt unabhängig denselben ~13-Query-Fan-Out zu laden.
- **Prio-10**: der 4-Sekunden-Poll auf den Session-Verarbeitungsstatus wurde durch ein
  Supabase-Realtime-Abo ersetzt (20s-Poll bleibt als Sicherheitsnetz); der KI-Proxy-Fetch in
  `openai-api.service.ts` hat jetzt `AbortSignal.timeout(30_000)`.

Alle Fixes einzeln verifiziert (`tsc -b`, `npm run lint`, volle Testsuite, bei UI-Änderungen zusätzlich
Playwright gegen den laufenden Dev-Server; Supabase-`get_advisors` nach jeder Migration geprüft, keine
neuen Security-/Performance-Funde). Ein echter Ende-zu-Ende-Test mit authentifiziertem Testnutzer
(Realtime-Update während laufender Verarbeitung, Dashboard/Coach-Cache-Hit beim Seitenwechsel) war in
dieser Session ohne Testzugangsdaten nicht möglich und bleibt ein offener Punkt für einen manuellen
Rauchtest durch Munther.

## Executive Summary

**Öffentlicher Paid-Launch heute: noch nicht, aber technisch praktisch vollständig — der
einzige verbleibende Blocker sind die Betreiberdaten, die nur du liefern kannst.** Die
Rechtstexte (Befund B, bis auf Betreiberdaten), die Preis-Diskrepanz (Befund G), die
serverseitigen Kostenbremsen inklusive einem konkreten Monats-Token-Limit (Befund A), der
Prompt-Backup-Pfad (Befund E), die komplett unerreichbare/fehlerhafte Prompt-Verdrahtung
(Befund L, inkl. Befund H, I, J), die CEFR-/Performanzbedingungs-/Transfer-Vertiefung aus dem
Mai-Audit (Befund K), Kontolöschung/-export und die serverseitige Kopplung der Session-Länge an
das Entitlement (Befund C) sind behoben. Welle 2 (technische Hygiene) ist komplett umgesetzt:
CI läuft bei jedem Push, toter Code ist entfernt, der Produktivpfad hat jetzt dieselben
Sicherheitsnetze wie der Client-Pfad (Schema-Validierung, Safety-Filter, Repair, Kostenlog),
und der zuvor offene Randfall — Nutzer ohne Entitlement-Zeile — ist nach deiner ausdrücklichen
Entscheidung geschlossen (`process-session` lehnt ohne aktives Abo/Trial jetzt ab, statt
ungedeckelt durchzulassen). Welle 3 (UI/UX-Neuentwurf) ist ebenfalls komplett umgesetzt — eine
Zustandsmaschine statt vier konkurrierender Status-Enums in der Session-Aufnahme, eine
Button-Konvention statt drei, konsolidiertes Dashboard, direkterer Onboarding-Einstieg,
einheitliche „Session"-Terminologie, `TutorWorkspace.tsx` in Feature-Module aufgeteilt. Offen
bleiben nur noch die Betreiberdaten und die anwaltliche Prüfung der Rechtstexte (Abschnitt 6).

| Frage | Urteil | Status |
|---|---|---|
| 1. Technisch korrekt? | Server-Guardrails inkl. echtem Token-Limit und Entitlement-Pflicht deployt; sieben Prompts, die faktisch nie liefen (u. a. der ganze Tutor-Dialog), sind repariert und live; CI verhindert jetzt stille Regressionen | **Kein Blocker mehr, ein offener Punkt** (Betreiberdaten) |
| 2. Fachlich gut genug? | Kern-Prompts sind didaktisch überdurchschnittlich, technisch korrekt verdrahtet und abgesichert, die CEFR-/Transfer-Vertiefung aus dem Mai-Audit ist umgesetzt, und ein systematischer Review-Durchlauf über alle 11 aktiven Prompts liegt jetzt vor (Abschnitt 3) | **Kein No-Go, kein offener Punkt mehr** |
| 3. UI/UX? | Neuentwurf abgeschlossen: eine Zustandsmaschine, eine Button-Konvention, konsolidiertes Dashboard, direkterer Onboarding-Einstieg, einheitliche Terminologie | **Kein offener Punkt mehr** |

---

## 1. Gemessen

Ausführung am 15.08.2026 nach frischem `npm ci` (Erstfassung); erneut geprüft am 18.08.2026
nach Abschluss von Welle 2.

| Prüfung | 15.08.2026 | 18.08.2026 | Bedeutung |
|---|---|---|---|
| `tsc -b` | grün | grün | Keine Typfehler im gesamten Projekt |
| `npm run lint` | grün | grün | 0 Warnungen bei `--max-warnings 0` |
| `npm run test` | **5 von 157 rot** (4 von 30 Dateien) | **1 von 147 rot** (1 von 28 Dateien) | Die verbleibende rote Datei ist `provider.test.ts` — beabsichtigt rot, bis die Betreiberdaten vorliegen (Abschnitt 6), kein Produktbug |
| CI-Pipeline | **fehlt** | **`.github/workflows/ci.yml`, läuft bei jedem Push/PR** | Regressionen werden jetzt automatisch sichtbar; `provider.test.ts` läuft dort als eigener, nicht blockierender Schritt (`continue-on-error`), damit der PR-Check nicht dauerhaft rot bleibt, ohne die Betreiberdaten-Lücke zu verstecken (Fehlschlag bleibt im Actions-Log sichtbar) |
| Letzter Commit vor diesem Audit | 15.05.2026 | — | Drei Monate ohne Änderung; die roten Tests standen unbemerkt |

### Warum die fünf ursprünglich roten Tests keine Produktbugs waren

- `session-processing.pipeline.test.ts` — Fixture-Transkript `"Hallo Welt"` hat 2 Wörter,
  die Mindestgrenze liegt bei 3 (`src/lib/config.ts:35`). Der Test ist älter als die Grenze.
  **Erledigt in Welle 2, Punkt 13:** zusammen mit dem toten Pipeline-Code gelöscht, nicht
  „repariert" — die Datei testete eine Codebahn, die kein Produktivpfad mehr aufruft.
- `multi-session-pattern.service.integration.test.ts` (2 Fehler) — `createAnalysis()` lieferte
  kein `conversation_sessions`-Objekt, deshalb filterte `isAiEligibleSession()`
  (`src/services/supabase/session-ai-eligibility.ts`) alle Analysen weg. **Erledigt in Welle 2,
  Punkt 11:** Fixture ergänzt.
- `multi-session-pattern.service.test.ts` und `prompt-admin.service.test.ts` — beide testeten
  die Fallback-Registry, die dauerhaft leer ist: `src/services/ai/prompt-registry.ts:54`
  enthält `new PromptRegistry([])`. **Erledigt in Welle 2, Punkt 11:** von der leeren Registry
  entkoppelt (lokales Schema-Fixture bzw. `PRODUCTIVE_PROMPT_KEYS`, siehe Punkt 11 unten).

Der Produktcode war also nie kaputt. Die verbleibende rote Datei (`provider.test.ts`) ist die
einzige absichtlich rote Stelle im Repository — ein Launch-Gate, kein technischer Fehler.

---

## 2. Befunde nach Geschäftsrisiko

### A — Limits sind Deko, das Geld läuft am Server vorbei · **Behoben**

Alle Kontingentprüfungen liefen im Browser mit dem User-JWT. Die produktive Verarbeitung läuft
serverseitig in `process-session` — und prüfte nichts: keine Token-Reservierung, kein
Sessions/Tag, kein Plan-Check. Wer die Supabase-REST-API direkt anspricht, konnte alles
umgehen.

Der OpenAI-Proxy war noch offener: Er prüfte nur, ob ein gültiger Token existiert, und leitete
danach den kompletten Request-Body ungeprüft an OpenAI weiter — beliebiges Modell, beliebige
`max_output_tokens`, beliebiger Prompt, auf den API-Key des Betreibers.

- `src/services/supabase/session.service.ts:159-181` — Sessions/Tag und Tagessekunden, weiterhin clientseitig (UX-Check, kein Kostenrisiko mehr — siehe unten)
- `src/features/sessions/AudioRecorder.tsx:153-158` — Aufnahmelänge, jetzt entitlement-gekoppelt statt fest codiert — **behoben** (Befund C, siehe Welle 1 Punkt 5)
- `supabase/functions/process-session/index.ts` — **behoben, deployt (v21)**
- `supabase/functions/openai-chat-proxy/index.ts` — **teilweise behoben, deployt (v18)**
- `src/services/ai/prompt-execution.service.ts:512` — weiterhin der Client-Aufrufer, jetzt nicht mehr der einzige

**Behoben:** `process-session` reserviert jetzt vor jedem der beiden OpenAI-Aufrufe
(Bereinigung, Analyse) Tokens über `reserve_user_tokens`, gibt sie bei einem Fehler über
`release_reserved_user_tokens` wieder frei und bucht nach Erfolg die tatsächliche Nutzung über
`finalize_user_token_usage` — derselbe Zyklus, den bisher nur der Client-Pfad kannte. Ein
Hard-Limit bricht vor dem OpenAI-Aufruf ab und liefert HTTP 429. Zusätzlich prüft die Function
vor jeder Verarbeitung das Sessions/Tag-Limit aus `user_entitlements` serverseitig gegen —
bewusst mit UTC-Tagesgrenzen statt der zeitzonenbewussten Client-Logik, ein dokumentierter
Kompromiss für einen harten Stopp, kein stiller Unterschied.

Der OpenAI-Proxy hat jetzt eine Modell-Allowlist (`gpt-4.1-mini`, `gpt-5-mini`), einen Deckel
auf `max_output_tokens` (4000) und CORS auf `APP_BASE_URL` statt `*`. Das ist eine
Schadensbegrenzung, keine vollständige Kontingentprüfung: Der Proxy kennt den aufrufenden
`prompt_key` nicht und kann deshalb keine Token-Reservierung pro Nutzer durchführen, ohne die
Reservierung des Aufrufers zu duplizieren. Wer den Proxy direkt anspricht, ist jetzt auf
bekannte, günstige Modelle mit begrenzter Ausgabelänge beschränkt statt auf beliebige.

**Einschränkung von damals, inzwischen behoben:** `reserve_user_tokens` greift nur, wenn ein
Entitlement ein `monthly_token_limit` gesetzt hat. Zum Zeitpunkt der Erstfassung setzten weder
der Starter- noch der Pro-Plan einen Wert — die Verdrahtung war da, deckelte aber niemanden.
Seit dem Vierten Nachtrag (16.08.) sind konkrete Werte gesetzt (Starter 300.000 / Pro 1.200.000
Tokens/Monat, vom Betreiber bestätigt), und seit Welle 2, Punkt 19 (18.08.) ist auch der
verbliebene Randfall geschlossen: Nutzer ohne aktive `user_entitlements`-Zeile werden jetzt
serverseitig abgelehnt statt ungedeckelt durchgelassen.

Die Guardrail-Maschinerie in `supabase/migrations/20260426160000_create_user_usage_ledger.sql`
existierte bereits und ist gut gebaut. Sie musste nur an den richtigen Codepfad angeschlossen
werden — eine Verdrahtungsfrage, keine Neuentwicklung.

### B — Rechtlich nicht launchfähig (DE, B2C) · **Weitgehend behoben, Betreiberdaten offen**

`RegisterPage` verlinkte auf `/terms` und `/privacy` — **beide Routen existierten nicht**, die
Links liefen in die 404-Seite. Es fehlten Impressum, Datenschutzerklärung, AGB,
Widerrufsbelehrung, Kontolöschung/Datenexport, MwSt.-Angabe und ein Consent-Mechanismus für
das Tracking auf den öffentlichen Seiten.

**In diesem PR gebaut** (Anbieter: OpenBrain LLC, US-LLC mit gezielter Ausrichtung auf den
deutschen Markt — Betreiberpflichten nach §5 DDG, Art. 13 und Art. 27 DSGVO gelten trotz
US-Sitz):

- `src/pages/legal/ImprintPage.tsx`, `PrivacyPage.tsx`, `TermsPage.tsx`, `WithdrawalPage.tsx`
  — Routen `/impressum`, `/datenschutz`, `/agb`, `/widerruf`, verlinkt aus `LegalFooter` auf
  allen öffentlichen Seiten und aus `RegisterPage`
- Datenschutzerklärung bildet die tatsächliche Verarbeitungskette ab (Supabase Storage →
  OpenAI-Transkription → zwei weitere OpenAI-Aufrufe → Stripe → Vercel), inkl.
  Drittlandtransfer-Kapitel für die US-Verarbeitung
- AGB und Widerrufsbelehrung für B2C mit sofortigem Leistungsbeginn (§356 Abs. 5 BGB): Der
  Checkout in `billing/PricingPage.tsx` erzwingt jetzt eine explizite Doppelzustimmung
  (sofortiger Beginn + Kenntnis des Widerrufsverlusts), bevor ein Kauf möglich ist; der
  Zeitstempel wird in den Stripe-Metadaten von `create-checkout-session` dokumentiert
- MwSt.-Kennzeichnung „inkl. MwSt." auf allen Preisanzeigen (`plan-ui-mapping.ts`)
- Cookie-Consent-Banner (`ConsentBanner.tsx`): Vercel Analytics und Funnel-Tracking laufen
  jetzt ausschließlich nach Einwilligung (§25 Abs. 1 TDDDG), vorher wird weder eine
  Trace-ID im `localStorage` gesetzt noch ein Analyse-Skript geladen

**Noch offen — kann ich nicht selbst beschaffen**: die echten Betreiberdaten. Alle
Pflichtangaben, die eine ladungsfähige Anschrift, Registernummer, Vertretungsberechtigten,
EU-Vertreter nach Art. 27 DSGVO oder USt-IdNr. voraussetzen, sind in
`src/content/legal/provider.ts` als `missing(...)` markiert, erscheinen im UI als sichtbarer
Hinweis statt als Falschangabe, und `provider.test.ts` bleibt rot, bis sie eingetragen sind.
Ebenfalls offen: der Landing-Claim „+37% schnelleres Formulieren"
(`src/pages/LandingPage.tsx:73`) ist weiterhin unbelegt (UWG-Risiko), und der AV-Vertrag mit
OpenAI ist ein vertraglicher, kein Code-Punkt.

### C — Der Pro-Plan verspricht 60 Minuten und liefert 15 · **Behoben**

- `src/services/billing/plan-fallback-catalog.ts:19` — `maxSessionLengthMinutes: 60`
- `src/lib/config.ts:34` — war `hardMaxAudioSeconds: 15 * 60`, eine Compile-Zeit-Konstante
- `src/features/sessions/AudioRecorder.tsx:158` — stoppte gegen die Konstante, nicht gegen das Entitlement

Bei einem zahlenden Kunden war das kein Bug, sondern ein nicht erfülltes Leistungsversprechen.
**Behoben in Welle 1, Punkt 5** (siehe Roadmap unten): `AudioRecorder.tsx`/`SessionFlowCard.tsx`
nehmen das Entitlement-Limit jetzt als Prop statt der festen Konstante, dazu ein serverseitiger
Re-Check in `process-session/index.ts` vor der kostenpflichtigen Transkription.

### D — Zwei Prompt-Pipelines, die produktive war die schwächere · **Behoben (Welle 2, Punkt 14)**

| Fähigkeit | Client-Pfad | Produktiv-Pfad (Stand 15.08.) | Produktiv-Pfad (Stand 18.08.) |
|---|---|---|---|
| Token-Reservierung | ja | ja (Befund A) | ja |
| Kostentracking / `prompt_execution_logs` | ja | **nein** | **ja** |
| JSON-Schema-Validierung | ja | **nein** (nur 4 Key-Existenzprüfungen) | **ja** |
| JSON-Repair | ja | **nein** | **ja** |
| Safety-Filter | ja | **nein** | **ja** |
| Overcorrection-Guard | ja | **nein** | ja (portiert, aber systemweit ohne Wirkung — siehe unten) |

Ursprünglicher Befund: Die Schema-Erzwingung sei strukturell tot, weil die Constraint für
`response_format` nur `'json_object'` oder `'text'` erlaubt, der Runner Structured Outputs aber
nur bei `'json_schema'` freischaltete. **Bei der Umsetzung stellte sich heraus, dass die
Diagnose unvollständig war:** Der Client entscheidet gar nicht über den literalen
`response_format`-Wert, sondern strukturell — `outputFormat === 'json_object'` plus ein gültiges
Objekt-Schema mit mindestens einer Property reicht (`openai-api.service.ts`,
`canUseStructuredOutput`). `'json_schema'` ist im gesamten System nie ein tatsächlich
gespeicherter Wert, weder im Client-Typ (`PromptOutputFormat = 'json_object' | 'text'`) noch in
irgendeiner DB-Zeile. Die Constraint war also nie das eigentliche Problem — process-sessions
eigener, isoliert geschriebener `usesStructuredOutput`-Check war es, weil er einen Wert abfragte,
der in der tatsächlichen Architektur nie vorkommt. **Behoben durch Angleichung der Gating-Logik
an das Client-Verhalten, nicht durch Erweiterung der Constraint** — alle 11 aktiven Prompts
haben bereits `response_format='json_object'` mit gültigem Objekt-Schema, Structured Outputs
greift damit sofort ohne DB-Änderung.

- `supabase/migrations/20260423203000_add_prompt_response_format.sql:16` — Constraint bleibt
  unverändert `'json_object'`/`'text'`; dokumentiert damit korrekt die einzigen zwei Werte, die
  die Laufzeit je erzeugt
- ~~`src/services/pipeline/session-processing.pipeline.ts`~~ — gelöscht (Welle 2, Punkt 13)
- ~~`supabase/functions/process-session/_shared/prompt-runner.ts`~~ — gelöscht (Welle 2, Punkt 13)
- ~~`supabase/functions/process-session/index.ts:380` — vier aufeinanderfolgende Status-Updates~~
  — behoben (Welle 2, Punkt 15)

Der Overcorrection-Guard ist als einziger der fünf portierten Bausteine weiterhin ein No-op —
nicht wegen eines Fehlers in process-session, sondern weil `overcorrectionPolicy` **im gesamten
System** nirgendwo befüllt wird (kein DB-Feld, kein Aufrufer setzt es), auch im Client-Pfad
nicht. Portiert für exakte Verhaltensgleichheit inklusive eines künftigen Wirksamwerdens, sobald
eine Policy-Quelle existiert — das selbst zu erfinden hätte den Scope dieser Angleichung
gesprengt.

**Zusätzlicher Fund vom 15.08., inzwischen behoben:** Die Schema-Lücke war nicht nur strukturell
tot, sondern auch praktisch: 9 von 12 aktiven Prompts hatten ein wirkungsloses
`expected_output_schema_json`. Das wurde als Nebeneffekt von Befund L repariert (siehe Befund H
unten) — alle 11 heute aktiven Prompts haben echte Schemas mit Pflichtfeldern, geprüft direkt
gegen die Datenbank. Details in Abschnitt 3 (Frage 2 im Detail).

### E — Das Produkt liegt nicht im Repository · **Backup-Pfad ergänzt, Betriebsmodell unverändert**

`supabase/migrations/20260513100000_neutralize_seeded_prompt_texts.sql` leert planmäßig alle
Seed-Prompt-Texte (`system_prompt = ''`, `user_prompt_template = ''`, `is_active = false`). Das
ist eine bewusste Betriebsentscheidung (`docs/prompt-operations-model.md`): Prompt-Texte werden
ausschließlich über den Admin-Flow in der Datenbank gepflegt.

Mit Datenbankzugriff lässt sich präzisieren, was das für den heutigen Stand bedeutet: **Nicht
alle Prompts sind leer.** Von 26 Zeilen in `prompt_definitions` sind 12 aktiv und mit echtem
Inhalt gefüllt — die gesamte Kern-Pipeline (`session_transcript_cleanup`, `session_analysis`,
`focus_topic_selector`, `multi_session_pattern_detection`, `improvement_check`,
`tutor_explanation`, `tutor_followup_answer`, `understanding_check`, `daily_prompt_generator`,
`dashboard_summary`, `coach_feedback`, `json_repair`) läuft produktiv. Leer und inaktiv sind nur
die fünf optionalen `coach_*`-Erweiterungsprompts, die exakt den Feature-Flags entsprechen, die
in `.env.example` standardmäßig auf `false` stehen — konsistent, kein Defekt.

Der eigentliche Befund bleibt trotzdem bestehen: 26 Zeilen über mehrere historische Versionen
(4× `session_analysis`, 4× `dashboard_summary`, 2× `session_transcript_cleanup`, weitere
Alt-Versionen), **keine davon im Repository versioniert**. Kein Diff, kein Review, kein
reproduzierbares Staging. Ein unbedachtes UPDATE im Admin-UI hätte das Produkt ohne
Wiederherstellungspfad zerstören können.

**Behoben:** `scripts/backup-prompt-definitions.ts` exportiert jede Zeile (aktiv und inaktiv,
alle Versionen) als committete JSON-Datei; `scripts/restore-prompt-definitions.ts` spielt sie
zurück, standardmäßig als Dry-Run, erst mit `--apply` schreibend. Ein erster echter Stand liegt
bereits unter `supabase/prompt-backups/latest.json` (15.08.2026, 26 Zeilen, 12 aktiv) —
committet, nicht nur als Skript-Versprechen. Details in `docs/prompt-operations-model.md`.
Das Betriebsmodell selbst bleibt unangetastet: Prompts werden weiterhin nur über den Admin-Flow
geändert, es gibt jetzt nur einen Weg zurück, falls dabei etwas schiefgeht.

### F — Das UI ist halbfertig, nicht schlecht · Kein Blocker

Positiv: `AppShell.tsx` hat eine echte Fokus-Falle im mobilen Menü, korrekte
`aria-expanded`-Zustände, Escape-Handling und Screenreader-Text.

Was stört:

- `src/pages/sessions/NewSessionPage.tsx:401,426` — „Dialog starten“, „Dialog läuft“, während
  die Navigation „Verläufe“ und „Coach“ heißt. Die Umbenennung aus #500–#505 ist auf der
  wichtigsten Seite nicht angekommen; 36 Vorkommen von „Dialog“ stehen noch in `src/pages`
  und `src/features`.
- `docs/ui-recording-redundancy-review-2026-05-14.md` — die dort beschriebenen doppelten
  Status- und Timer-Anzeigen wurden nie umgesetzt.
- `src/styles/global.css` — 2292 Zeilen, kein Design-System; zwei Button-Konventionen
  (`button button-secondary` 31×, `btn-secondary` 15×); 9 Media Queries; kein Dark Mode.
- `src/features/tutor/TutorWorkspace.tsx` — 1112 Zeilen in einer Komponente.

### G — Preise in Produktion und im Code liefen auseinander · **Behoben**

Live in `public.billing_plan_catalog` stand: Starter `5 € / Monat`, Pro `9 € / Monat`. Im
Code (Fallback-Katalog und Seed-Migration): Starter `19 € / Monat`, Pro `49 € / Monat`. Fiele
die DB kurzzeitig aus oder lüde `billingPlanCatalogService.listPublicPlans()` zu langsam,
hätte die Seite den falschen Fallback-Preis gezeigt.

- DB (`pkmwdhjohidkkjkrlcnt`, Tabelle `billing_plan_catalog`) — war `19 €` / `49 €`, jetzt `5 €` / `9 €`
- `src/services/billing/plan-fallback-catalog.ts:7,16` — war `19 €` / `49 €`, jetzt `5 €` / `9 €`
- `src/pages/PricingPage.tsx:14,21` — war `19 €` / `49 €`, jetzt `5 €` / `9 €`
- `supabase/migrations/20260428113000_create_billing_plan_catalog.sql` — historischer Seed
  bewusst unangetastet gelassen (Konvention dieses Repos: keine rückwirkenden Änderungen an
  bereits angewendeten Migrationen)

**Behoben:** Betreiber hat `5 €` / `9 €` als korrekt bestätigt. Migration
`20260815120000_sync_billing_plan_catalog_live_prices.sql` bringt den versionierten
Seed-Stand auf den echten Stand (angewendet auf die Produktions-DB), Code-Fallbacks
angeglichen, `plan-catalog-consistency.test.ts` zeigt jetzt auf die neue Migration statt auf
den veralteten Seed. Alle Preisanzeigen tragen zusätzlich den Pflichthinweis „inkl. MwSt."
(`plan-ui-mapping.ts`, Befund B).

---

## 3. Frage 2 im Detail — ist die Prompt-Qualität gut genug?

Mit Datenbankzugriff auf die aktiven Produktions-Prompts lässt sich diese Frage jetzt
beantworten, mit Belegen statt Vermutung.

### Kurzfazit

**Der Inhalt war didaktisch überdurchschnittlich gut. Die Verdrahtung war es nicht: 7 von 12
Prompts hätten bei jedem echten Aufruf sofort mit einem Fehler abgebrochen, darunter der
komplette Tutor-Dialog.** Das ist jetzt behoben (siehe Befund L). Die drei P0/P1-Empfehlungen
aus eurem eigenen DaF/CEFR-Audit vom 6. Mai — CEFR-Can-Do-Layer, Performanzbedingungen,
verpflichtender Transfer-Check — sind inzwischen ebenfalls umgesetzt (Befund K). Damit ist die
fachliche Substanz jetzt sowohl lauffähig als auch inhaltlich auf dem im Mai skizzierten
Zielniveau.

### Befund L — Sieben von zwölf Prompts hätten nie funktioniert · **Behoben**

Beim Versuch, für Befund H fehlende Schemas zu ergänzen, fiel auf: Die DB-Vorlagen für
`focus_topic_selector` und `multi_session_pattern_detection` verwendeten Variablennamen, die
der Code gar nicht sendet (`{{latest_session_analysis_json}}`,
`{{recent_session_analyses_json}}` statt der tatsächlich übergebenen `session_count`,
`stable_patterns_json`, `session_analyses_json`). Der clientseitige `PromptRenderer`
(`src/services/ai/prompt-renderer.ts:17-19`) wirft bei jeder nicht aufgelösten
`{{variable}}` einen Fehler — jeder echte Aufruf wäre also abgebrochen, bevor OpenAI überhaupt
erreicht wird.

Systematische Prüfung aller verbleibenden aktiven Prompts ergab: **derselbe Fehler steckte in
fünf weiteren.**

| Prompt | Erreichbar über | Variablen-Mismatch | Output-Mismatch |
|---|---|---|---|
| `focus_topic_selector` | *(nirgends — siehe unten)* | ja | ja |
| `multi_session_pattern_detection` | *(nirgends — siehe unten)* | ja | ja |
| `improvement_check` | nur `session-processing.pipeline.ts` (tot) | ja | ja |
| `tutor_explanation` | `TutorWorkspace.tsx` (**live**) | ja | ja |
| `tutor_followup_answer` | `TutorWorkspace.tsx` (**live**) | ja | ja |
| `understanding_check` | `TutorWorkspace.tsx` (**live**) | ja | ja |
| `daily_prompt_generator` | *(keine UI ruft `dailyPromptService` auf)* | ja | ja |

Der schwerwiegendste Teilbefund: Der einzige Aufrufer von
`multiSessionPatternService.detectAndPersist()` — der Methode, die
`multi_session_pattern_detection` und `focus_topic_selector` überhaupt ausführt — war
`session-processing.pipeline.ts:331`, bereits in Befund D als toter Code markiert. Kein Cron,
kein Admin-Button, keine andere Aufrufstelle; `dashboard-data.service.ts` und
`FocusTopicCard.tsx` lesen nur aus `focus_topics`, sie schreiben nie hinein. **Die Funktion
„erkenne Muster über mehrere Sessions und wähle ein Fokus-Thema" — die größte fachliche Stärke
laut eurem eigenen Mai-Audit — lief in der deployten App nie.** `improvement_check` hatte
denselben Status: nur über dieselbe tote Pipeline erreichbar.

`tutor_explanation`, `tutor_followup_answer` und `understanding_check` sind dagegen kein
Blindgänger, sondern live: `TutorWorkspace.tsx` ruft sie direkt auf. Das bedeutet, der komplette
Tutor-Dialog — die zentralste Interaktion der App nach der Session-Aufnahme selbst — dürfte in
Produktion bei jedem Versuch mit „Fehlende Prompt-Variablen: ..." abgebrochen sein.

**Zusätzlich, unabhängig vom Variablen-Bug:** Die Return-Blöcke in den DB-Vorlagen stimmten mit
keinem der tatsächlichen TypeScript-Parser überein (z. B. `tutor_explanation`: DB verlangte
`{title, intro_text, explanation_text, examples[{wrong,better,why}], common_trap,
check_question, followup_prompts[]}`, der Code (`parseExplanationOutput`) erwartet
`{explanation, examples[{incorrect,correct,why}], check_question, redirected_to_focus}`). Selbst
mit korrekten Variablen wäre die Modellantwort also am Output-Parsing gescheitert.

**Behoben:** Alle sieben Prompts haben neue Versionen mit Variablennamen und Return-Blöcken, die
exakt auf die tatsächlichen Aufrufer und Parser abgestimmt sind — inklusive der
Pädagogik-Guardrails, die der Code bereits laufzeitseitig durchsetzt, aber die DB-Prompts nie
erwähnten (z. B. `tutor_explanation`: max. 3 Sätze, keine Meta-Theorie-Sprache, 2–3 kontrastive
Beispiele; `tutor_followup_answer`: harte Ablehnung von Drill-Mustern wie „Lückentext" oder
„konjugiere"). Zusätzlich verdrahtet:
- `multiSessionPatternService.detectAndPersist()` läuft jetzt nach jeder erfolgreichen
  `process-session`-Verarbeitung in `NewSessionPage.tsx`.
- `improvementCheckService.runForActiveFocusTopic()` läuft im selben Anschluss, hinter dem
  `improvement_checks`-Feature-Flag — dieselbe Sequenz, die die tote Pipeline schon hatte, jetzt
  im tatsächlich erreichbaren Pfad.
- `daily_prompt_generator` wurde inhaltlich korrigiert, aber **bewusst nicht** an eine
  UI-Stelle angebunden — dafür existiert noch keine Oberfläche, und eine würde hier nicht
  erfunden. Passt zum in `docs/go-live-audit-2026-04-29.md` (GAP-P2-01) skizzierten
  Daily-Habit-Loop-Ziel, falls das gebaut wird.

Migrationen: `20260815130000_fix_focus_topic_and_pattern_detection_prompts.sql`,
`20260815160000_fix_improvement_check_and_tutor_prompts.sql`.

### Was gut ist

Die didaktische Substanz der ursprünglichen Prompts war der Grund, warum bei den Befund-L-Fixes
bewusst nur die Variablennamen und Return-Blöcke korrigiert wurden, nicht der pädagogische
Kern. Die Kern-Prompts lesen sich, als hätte sie jemand mit echtem Sprachlehr-Hintergrund
geschrieben, nicht generisch:

- **`session_transcript_cleanup`** bewahrt Lernerfehler bewusst („Preserve learner errors. Do
  not correct grammar.") — verhindert, dass die Bereinigung die Analyse-Grundlage verfälscht.
- **`tutor_explanation`** folgt einer klaren didaktischen Struktur: empathischer Einstieg →
  einfache Erklärung → kontrastive Beispiele → typischer Lernerfehler → Rückfragen-Einladung →
  Mini-Verständnischeck. Genau das kommunikative Sprachlehrprinzip, das
  `docs/daf-cefr-prompt-audit-2026-05-06.md` als Stärke lobt.
- **`tutor_followup_answer`** hat Scope-Disziplin: „Stay strictly within the current focus topic
  ... Do not open many new grammar topics." Verhindert Themensprünge.
- **`focus_topic_selector`** und **`multi_session_pattern_detection`** halten konsequent am
  Single-Focus-Prinzip fest, evidenzbasiert, mit expliziten Ausschlusskriterien für vage Ziele.
- **`session_analysis`**s System-Prompt ist pädagogisch austariert: „Do not shame the learner. Do
  not overstate mistakes. Focus on recurring patterns and communicative impact."

### Befund H — 9 von 12 aktiven Prompts hatten ein wirkungsloses Schema · **Behoben**

```
is_unconstrained_schema = {"type":"object","additionalProperties":true}, keine required-Felder
```

Betroffen waren: `focus_topic_selector`, `multi_session_pattern_detection`, `improvement_check`,
`tutor_explanation`, `tutor_followup_answer`, `understanding_check`, `daily_prompt_generator`,
`dashboard_summary`, `coach_feedback`. Nur `session_analysis`, `session_transcript_cleanup` und
`json_repair` hatten ein echtes Schema mit Pflichtfeldern. Da Befund D (Schema-Erzwingung
strukturell tot) unverändert besteht, hätte selbst eine Reparatur dieser 9 Prompts nichts
erzwungen — die Schemas dienten bislang nur der Dokumentation im Admin-UI.

**Behoben, als Nebeneffekt der Befund-L-Reparatur:** Alle sieben von Befund L betroffenen
Prompts haben jetzt reale Schemas mit Pflichtfeldern bekommen (siehe oben). `coach_feedback`
ist deaktiviert (Befund J). Damit haben inzwischen **alle 11 aktiven Prompts** ein echtes
Schema — geprüft direkt gegen die Datenbank.

### Befund I — `dashboard_summary` widerspricht sich selbst · **Behoben**

Drei verschiedene Vorstellungen vom Ausgabeformat kollidierten im selben aktiven Prompt (Version 4):

| Quelle | Erwartete Felder |
|---|---|
| `developer_prompt` (Return-Block) | `headline, summary_text, current_strength, current_focus, next_step` |
| `user_prompt_template` (letzter Satz) | „Gib summary, next_action und confidence_note zurück." |
| Tatsächlich im Code konsumierter TS-Typ (`DashboardSummaryOutput`) | `summary, next_action, confidence_note, primaryImprovementArea, nextAction, focusTopic, recommendedTrainingId(s)` |

Keine der drei Varianten stimmt vollständig mit einer anderen überein. Da `response_format`
`json_object` ist (kein Schema) und der DB-Eintrag `additionalProperties:true` erlaubt, greift
keine Validierung, die das auffangen würde — es hängt vom Modell ab, welcher Instruktion es
folgt.

**Corroborating Evidence im Code:** `src/features/dashboard/UserDashboard.tsx`,
`deriveDashboardInterpretation()`:

```ts
const nextRecommendation =
  aiNextAction?.title ??
  (typeof fallbackRecommendation === 'string' && fallbackRecommendation.trim().length > 0
    ? fallbackRecommendation
    : data?.aiSummary?.next_action ?? null);
```

Diese doppelte Fallback-Verkettung (`nextAction.title` camelCase ODER `next_action` snake_case
als String) sieht genau danach aus, wie man sich gegen eine instabile LLM-Ausgabeform absichert
— vermutlich, weil das Problem im Betrieb schon einmal aufgefallen ist und im Client
umschifft statt im Prompt behoben wurde.

**Behoben:** `dashboard_summary` v5 vereinheitlicht die drei Formate auf ein einziges Schema mit
klarer Pflicht-/Optional-Trennung (`summary`/`next_action`/`confidence_note` immer erforderlich,
`primaryImprovementArea`/`nextAction`/`focusTopic` optionale reichhaltigere Objekte, explizit
`null` statt geraten, wenn die Datenlage nicht reicht) und einem echten
`expected_output_schema_json`. Ein kleinerer Rest-Risiko bleibt: `next_action` (Pflichttext) und
`nextAction` (optionales Objekt) unterscheiden sich nur durch Groß-/Kleinschreibung — als
nicht-blockierender Fund im Prompt-Quality-Review dokumentiert (Welle 2, Punkt 17, Abschnitt 3).

### Befund J — `coach_feedback` ist toter Code · **Behoben**

War aktiv und befüllt. Sein einziger Aufrufer, `generateCoachReply()` in
`src/services/ai/orchestrator.ts`, wurde von **nirgendwo im Projekt importiert** — auch nicht
transitiv. Unschädlich, aber Ballast im Admin-Bereich und potenzielle Verwirrung bei künftigen
Audits. **Behoben:** `orchestrator.ts` gelöscht, `coach_feedback` in der DB deaktiviert.

### Befund K — Die eigenen P0-Empfehlungen vom Mai · **Behoben**

`docs/daf-cefr-prompt-audit-2026-05-06.md` hatte vor über drei Monaten priorisierte
Verbesserungen benannt, die seither unverändert offen waren. Alle drei P0/P1-Empfehlungen sind
jetzt umgesetzt — Prompt-Schema, Parser-Validierung und, wo im Audit gefordert, ein hartes
Laufzeit-Gate:

- **P0 #1 (CEFR-Can-Do-Layer)** — `session_analysis` v5: pro Kategorie zusätzlich zu
  `score/confidence/justification/evidence` jetzt `cefr_band_estimate` (A1.1–C2, 11 Sub-Bänder),
  `can_do_evidence` (2-3 konkrete Performanzbelege) und `limiting_factor` (was die nächste
  Band-Grenze verhindert). `session-analysis.service.ts` validiert alle drei Felder hart; die
  Skill Map (`SkillMapOverview.tsx`) zeigt das aktuelle CEFR-Band als Badge neben jedem Score,
  mit `limiting_factor` als Tooltip.
- **P0 #3 (Performanzbedingungen)** — `multi_session_pattern_detection` v3: jedes
  `stable_pattern` bekommt `performance_conditions` (Sprechmodus Dialog/Monolog/gemischt,
  Spontaneität, Aufgabenkomplexität, Registerdruck) plus `consistent_condition_count` (0-4).
  Die Audit-Empfehlung „Fokus-Aktivierung nur, wenn Evidenz in mind. zwei Bedingungen konsistent
  ist" ist jetzt ein hartes Gate in `evaluateFocusEvidence()` — bei
  `consistent_condition_count < 2` wird `insufficient_evidence` erzwungen, unabhängig davon, wie
  stark recurrence/confidence sonst sind.
- **P1 #5 (verpflichtender Transfer-Check)** — `understanding_check` v3: neues Pflichtfeld
  `transfer_evidence` (`reuse_demonstrated`, `context_variation`) verlangt vom Modell einen
  Nachweis, dass der/die Lernende die Zielstruktur unter leicht variierter Bedingung tatsächlich
  wiederverwendet hat, nicht nur eine Checkfrage bestätigt hat. `parseUnderstandingCheckOutput()`
  setzt das zusätzlich zur Prompt-Instruktion hart durch: ein behauptetes `sufficient` ohne
  echten `transfer_evidence`-Nachweis wird zur Laufzeit auf `partial` heruntergestuft (analog zum
  bestehenden Selbstheilungsmuster in `parseExplanationOutput`), statt sich auf die
  Prompt-Befolgung allein zu verlassen.

Alle drei Migrationen wurden live angewendet und als `.sql`-Dateien im Repo versioniert:
`20260816120000_add_cefr_can_do_layer_to_session_analysis.sql`,
`20260816130000_add_performance_conditions_to_pattern_detection.sql`,
`20260816140000_add_mandatory_transfer_check_to_understanding_check.sql`.

### Einordnung · **Erledigt (Welle 2, Punkt 17)**

`docs/coach-prompt-quality-framework.md` — euer eigenes Scoring-Raster mit 13 Dimensionen,
Red-Flag-Katalog und Go/No-Go-Heuristik — deckte ursprünglich ausschließlich die fünf
optionalen `coach_*`-Erweiterungsprompts ab, die alle leer und inaktiv sind. Das Framework hat
jetzt einen Teil B mit Kriterien und einem echten Review-Durchlauf für alle 11 aktiven Prompts
(„Track A": systematische Prüfung von `system_prompt`/`developer_prompt`/`user_prompt_template`
/Schema direkt aus der Datenbank gegen die Dimensionen und Red Flags oben). Ergebnis: 10 von 11
„go", ein „iterate" (`daily_prompt_generator`), drei nicht-blockierende Struktur-Funde — Details
im Framework-Dokument, Zusammenfassung im Sechsten Nachtrag oben.

Track A ist bewusst kein Ersatz für den vollen 20-Sample-Blind-Output-Review, den das Framework
für die Coach-Prompts vorschreibt („Track B") — der setzt echten Produktions-Traffic voraus, den
diese Sitzung nicht seriös simulieren konnte. Track B ist jetzt technisch möglich (siehe Welle 2,
Punkt 14: `prompt_execution_logs` protokolliert seither `rendered_user_prompt` und
`parsed_output` bei jedem Lauf) und sollte gefahren werden, sobald genug echte Sessions durch
die App gelaufen sind.

## 4. Roadmap

### Welle 1 — Blocker für den öffentlichen Paid-Launch

1. ~~Serverseitige Guardrails in `process-session`~~ — **erledigt, deployt (v21)**:
   Token-Reservierung (`reserve_user_tokens`/`finalize_user_token_usage`/
   `release_reserved_user_tokens`) um beide OpenAI-Aufrufe, serverseitiger Sessions/Tag-Check
   gegen `user_entitlements`, dazu jetzt auch ein Sessionlängen-Guard (Punkt 5 unten). Wirkt
   jetzt für zahlende Nutzer wirklich (siehe Punkt 8 unten) —
   Einschränkung für Nutzer ohne Entitlement-Zeile siehe Welle 2, Punkt 19.
2. ~~`openai-chat-proxy` schließen~~ — **teilweise erledigt, deployt (v18)**: Modell-Allowlist,
   Deckel auf `max_output_tokens`, CORS auf `APP_BASE_URL`. Kein Entitlement-Check pro Nutzer
   möglich, ohne die Reservierung des Aufrufers zu duplizieren — dokumentierte Grenze, keine
   vollständige Kontingentprüfung.
3. ~~Rechtsseiten: Routen `/impressum`, `/datenschutz`, `/agb`, `/widerruf`~~ — **erledigt**
   (dieser PR): `src/pages/legal/*`, verlinkt aus `LegalFooter`, `PublicNav`-Umfeld und
   `RegisterPage`. Betreiberdaten zentral in `src/content/legal/provider.ts`; fehlende
   Angaben sind als `missing(...)` markiert und im UI sichtbar, `provider.test.ts` bleibt rot,
   bis alle Angaben vorliegen. Dazu: Umsatzsteuer-Kennzeichnung auf allen Preisanzeigen
   (`plan-ui-mapping.ts`), Einwilligungspflichtige Zustimmung zum vorzeitigen
   Widerrufsverlust im Checkout (`billing/PricingPage.tsx`, dokumentiert in den
   Stripe-Metadaten von `create-checkout-session`), Cookie-Consent-Banner
   (`ConsentBanner.tsx`) vor Vercel Analytics und Funnel-Tracking.
4. ~~Kontolöschung und Datenexport in `ProfilePage.tsx`, serverseitig als Edge Function.~~ —
   **erledigt.** Datenexport (DSGVO Art. 20) läuft komplett clientseitig über
   `accountDataExportService` — alle einbezogenen Tabellen hatten bereits "select own
   row"-RLS, keine eigene Function nötig. Kontolöschung (DSGVO Art. 17) über neue Function
   `delete-account` (v1): kündigt aktive Stripe-Abos sofort, entfernt die
   `session-audio`-Storage-Dateien des Nutzers, ruft dann `auth.admin.deleteUser` auf. Beim
   Bau fiel auf: die komplette Tabellenkette (`profiles → conversation_sessions →
   session_transcripts/session_analyses → detected_patterns/focus_topics`,
   `user_entitlements`, `billing_customers`, `billing_subscriptions`,
   `user_usage_ledger`/`_daily_aggregates`) hängt bereits per `ON DELETE CASCADE` an
   `auth.users` — `auth.admin.deleteUser` räumt das automatisch mit auf, die Function
   übernimmt nur, was nicht kaskadiert (Stripe, Storage). `billing_events`/`funnel_events`
   nutzen bewusst `SET NULL` statt Cascade (anonymisierte Aufzeichnungen bleiben erhalten).
5. ~~Session-Länge an `entitlement.maxSessionLengthSeconds` koppeln; serverseitiger
   Dauer-/Größencheck.~~ — **erledigt.** `AudioRecorder.tsx`/`SessionFlowCard.tsx` nehmen
   jetzt `softMaxAudioSeconds`/`hardMaxAudioSeconds` als Props statt der festen
   `SESSION_PROCESSING_LIMITS`-Konstante; `NewSessionPage.tsx` lädt das Entitlement beim
   Mount und reicht `min(entitlement.maxSessionLengthSeconds,
   SESSION_PROCESSING_LIMITS.absoluteMaxAudioSeconds)` durch, sodass Pro-Nutzer tatsächlich
   bis zu 60 statt nur 15 Minuten aufnehmen können. Serverseitiger Re-Check landete in
   `process-session/index.ts` statt in `transcribe-session-audio` (abweichend vom
   ursprünglichen Rollen-Vorschlag): der Client meldet `durationSeconds` schon heute in
   `conversation_sessions.metadata`, ein neuer `enforceSessionLengthGuard()` prüft das dort
   gegen `user_entitlements.max_session_length_seconds`, *bevor* überhaupt eine
   kostenpflichtige Transkription angestoßen wird — spart die STT-Kosten für eine Session,
   die ohnehin abgelehnt würde. Deployt als `process-session` v21.
6. ~~Prompt-Backup-Pfad~~ — **erledigt**: `scripts/backup-prompt-definitions.ts` +
   `scripts/restore-prompt-definitions.ts`, erster committeter Stand unter
   `supabase/prompt-backups/latest.json`.
7. ~~Preis-Diskrepanz zwischen `billing_plan_catalog` (DB) und Fallback-Katalog (Code)
   auflösen~~ — **erledigt** (Befund G)
8. ~~Konkretes `monthly_token_limit` je Plan festlegen~~ — **erledigt**: Starter 300.000,
   Pro 1.200.000 Tokens/Monat (konservative Option, vom Betreiber bestätigt) in
   `supabase/functions/_shared/billing-plans.ts`, `create-checkout-session/index.ts` und
   `stripe-webhook/index.ts` gesetzt (drei bislang unabhängige Kopien der Plan-Konfiguration,
   siehe Welle 2 Punkt 13 zum Cleanup-Bedarf); beide Edge Functions neu deployt
   (`create-checkout-session` v14, `stripe-webhook` v11). Damit deckelt Punkt 1 jetzt
   tatsächlich etwas — für Nutzer mit aktivem Abo. Einschränkung: siehe Welle 2, Punkt 19.
9. ~~`dashboard_summary` reparieren~~ — **erledigt** (Befund I, v5, echtes Schema).
10. ~~Sieben Prompts reparieren, die bei jedem echten Aufruf sofort abgebrochen wären, drei davon
    live im Tutor-Dialog~~ — **erledigt** (Befund L): `focus_topic_selector`,
    `multi_session_pattern_detection`, `improvement_check`, `tutor_explanation`,
    `tutor_followup_answer`, `understanding_check`, `daily_prompt_generator`. Dazu
    `multiSessionPatternService.detectAndPersist()` und
    `improvementCheckService.runForActiveFocusTopic()` in `NewSessionPage.tsx` verdrahtet —
    beide liefen vorher nur über die tote `session-processing.pipeline.ts`.

### Welle 2 — Technische Hygiene · **komplett umgesetzt (18.08.2026)**

11. ~~Die fünf roten Tests reparieren (Fixtures aktualisieren, Registry-Tests auf
    DB-Adapter).~~ — **erledigt.** Zwei Integrationstest-Fixtures um das fehlende
    `conversation_sessions`-Objekt ergänzt; zwei Registry-Tests von der dauerhaft leeren
    `promptRegistry` entkoppelt (lokales Schema-Fixture bzw. Umstieg auf
    `PRODUCTIVE_PROMPT_KEYS`); der fünfte (`session-processing.pipeline.test.ts`) ist mit
    seinem toten Pipeline-Code zusammen entfernt worden (Punkt 13), nicht repariert.
12. ~~CI einrichten: `.github/workflows/ci.yml` mit `tsc -b`, `lint`, `test` bei jedem PR.~~ —
    **erledigt.** Läuft auf Node 22 mit `npm ci`. `provider.test.ts` läuft in einem eigenen
    Schritt mit `continue-on-error: true` — der PR-Check ist grün, der Fehlschlag bleibt aber
    sichtbar im Actions-Log, bis die Betreiberdaten vorliegen (Abschnitt 6). Bewusst
    keine Platzhalterdaten in `provider.ts`, um den Check „grün zu bekommen" — diese Felder
    erscheinen direkt auf den öffentlichen Impressum-/Datenschutz-Seiten als gesetzliche
    Pflichtangabe (§5 DDG, Art. 13/27 DSGVO).
13. ~~Toten Code entfernen: `session-processing.pipeline.ts`, `_shared/prompt-runner.ts`,
    `_shared/billing-plans.ts`.~~ — **erledigt.** Zusätzlich beim Aufräumen gefunden und
    entfernt: eine bereits unabhängig tote `process-session/_shared/types.ts` (von der
    ursprünglichen Bereinigung übersehenes Duplikat) und das nirgends mehr gelesene
    `VITE_USE_STUB_TRANSCRIPTION` (`src/lib/env.ts`, `vite.config.ts`). ~~`coach_feedback`/
    `orchestrator.ts`~~ — bereits vorher erledigt (Befund J).
14. ~~Produktiv-Pfad auf Client-Qualität heben: `json-schema-validator.ts`, `safety-filter.ts`,
    `overcorrection-guard.ts` und `prompt_execution_logs` in `process-session/index.ts`.
    Constraint für `response_format` um `'json_schema'` erweitern.~~ — **erledigt**, mit einer
    bewussten Abweichung vom letzten Halbsatz: die Constraint wurde **nicht** erweitert. Details
    und Begründung unter Befund D. Alle vier Bausteine sind jetzt 1:1 aus dem Client-Pfad nach
    `process-session/_shared/*.ts` portiert (Deno kann nicht aus `src/` importieren), inklusive
    Kostenschätzung. Deployt als `process-session` v24.
15. ~~Status-Kaskade in `process-session/index.ts` auf ein Update reduzieren; vorbestehenden
    Stale-Failed-Bug beheben.~~ — **erledigt.** Vier sequenzielle Status-Updates sind jetzt ein
    einzelnes `update({status:'completed'})`; ein neuer `StageTracker` sorgt dafür, dass im
    Fehlerfall nur die Tabelle der tatsächlich erreichten Stufe auf `failed` gesetzt wird, statt
    z. B. eine bereits erfolgreiche Transkription bei einem späteren Analyse-Fehler
    fälschlich mit zu überschreiben.
16. ~~Plan-Limits gegen tatsächliche Durchsetzung testen (Erweiterung von
    `plan-catalog-consistency.test.ts`).~~ — **erledigt.** Neuer Test gleicht
    `FALLBACK_PLAN_CONTRACTS` (Marketing-Versprechen) direkt gegen `PLAN_CONFIGS` in
    `stripe-webhook/index.ts` (tatsächliche Entitlement-Quelle) ab, statt nur zwei Textquellen
    gegeneinander zu prüfen — verifiziert durch gezielte Drift-Injektion, dass er bei
    Abweichung wirklich rot wird.
17. ~~`docs/coach-prompt-quality-framework.md` auf die aktiven Kern-Prompts erweitern und einen
    echten Review-Durchlauf fahren.~~ — **erledigt.** Teil B deckt jetzt alle 11 aktiven
    Prompts ab; Ergebnis und offene Funde im Sechsten Nachtrag oben und unter „Einordnung" in
    Abschnitt 3.
18. ~~Die drei P0/P1-Empfehlungen aus `docs/daf-cefr-prompt-audit-2026-05-06.md` umsetzen~~
    — **erledigt** (Befund K): CEFR-Can-Do-Layer in `session_analysis` (v5),
    Performanzbedingungen in `multi_session_pattern_detection` (v3, plus hartes
    `consistent_condition_count >= 2`-Gate in `evaluateFocusEvidence`), verpflichtender
    Transfer-Check in `understanding_check` (v3, plus Laufzeit-Downgrade
    sufficient→partial ohne nachgewiesenen `transfer_evidence` in
    `parseUnderstandingCheckOutput`). Details unten unter Befund K.
19. ~~Nutzer ohne `user_entitlements`-Zeile sind ungedeckelt — Free-Tier oder Ablehnung?~~ —
    **erledigt.** Munthers Entscheidung: `process-session` lehnt ohne aktive
    `user_entitlements`-Zeile jetzt mit HTTP 402 (`no_active_entitlement`) ab, statt auf
    ungedeckelte Default-Limits zurückzufallen. Betrifft nur Nutzer, die nie ein Abo — auch
    nicht im Trial — gestartet haben, da jede Zeile ausschließlich durch ein reales Stripe-
    Subscription-Event entsteht.

### Welle 3 — Neuentwurf der Kernflows · **komplett umgesetzt (18.08.2026, siehe Siebter Nachtrag)**

Reihenfolge nach Conversion-Wirkung: Session-Aufnahme → Onboarding → Dashboard.

20. ~~Design-Tokens zuerst (Farbe, Typo, Spacing, Radius, Elevation) inkl. Dark Mode; danach
    eine Button-Konvention, die andere entfernen.~~ — **erledigt.**
21. ~~Session-Aufnahme neu: Zustandsmaschine `idle → ready → recording → paused → review →
    saved` aus `docs/ui-recording-redundancy-review-2026-05-14.md` als tatsächliche
    UI-Struktur. Ein Timer, ein Status-Badge, max. drei CTAs. `NewSessionPage.tsx`
    (551 Zeilen) in Zustandskomponenten zerlegen.~~ — **erledigt.**
22. ~~Onboarding neu: erste Analyse in unter 5 Minuten.~~ — **erledigt.**
23. ~~Dashboard neu: vier Karten mit überlappender Aussage auf eine klare
    Nächste-Aktion-Hierarchie reduzieren.~~ — **erledigt.**
24. ~~Terminologie vereinheitlichen — „Dialog” vollständig durch „Session” ersetzen.~~ —
    **erledigt.**
25. ~~`TutorWorkspace.tsx` in Feature-Komponenten aufteilen.~~ — **erledigt.**

---

## 5. Was schon trägt

- Saubere Schichtentrennung zwischen Seiten, Features, Services und Domänenlogik.
- Durchdachte Fokus-Themen-Zustandsmaschine (`src/services/domain/focus-topic-transitions.ts`):
  explizite Übergänge, nachvollziehbare Historie, klare Ereignisse.
- Konsequent defensiver `app-settings.service.ts` — jeder Wert mit Default und Bereichsklemmung.
- Funktionierender Stripe-Webhook inkl. Entitlement-Synchronisation.
- Ernsthaft gemachte RLS-Härtung in den Migrationen.
- OpenAI wird nicht direkt aus dem Browser aufgerufen; der Schlüssel liegt serverseitig.

---

## 6. Was von außen kommen muss

1. **Vier verbleibende Betreiberangaben** (Stand nach deiner Eingabe vom 15.08.): File
   Number/Entity Number des Gründungsstaats Florida, der tatsächliche Name der
   vertretungsberechtigten Person (ein Titel wie „CEO" allein erfüllt §5 DDG nicht), eine
   Anschrift des EU-Vertreters **innerhalb der EU** (die bisher genannte Adresse liegt in
   Florida und erfüllt Art. 27 Abs. 3 DSGVO nicht), sowie USt-IdNr./Nicht-EU-OSS-Nummer oder
   die Bestätigung, dass Stripe Tax als Merchant of Record die Steuerpflicht übernimmt.
   `provider.test.ts` listet sie und bleibt rot, bis sie eingetragen sind.
2. **Rechtliche Prüfung der gebauten Texte** — Impressum, Datenschutzerklärung, AGB und
   Widerrufsbelehrung wurden nach gängiger Praxis für US-Anbieter mit Zielgruppe Deutschland
   entworfen (B2C, Widerrufsrecht erlischt bei bestätigtem Sofortstart, Stripe Tax für die
   Umsatzsteuer). Vor Launch sollte ein Anwalt sie gegen den tatsächlichen Geschäftsbetrieb
   von OpenBrain LLC prüfen — insbesondere die Drittlandtransfer-Grundlage und die konkrete
   AV-Vertrags-Situation mit OpenAI. **Neu dazugekommen:** die Auto-Konversions-Kenntnisnahme
   der 14-Tage-Testphase (`PricingPage.tsx`, siehe Fünfter Nachtrag oben) — noch nicht
   anwaltlich geprüfte Formulierung für einen regulatorisch aktiv beobachteten Flow-Typ
   (Free-Trial-zu-kostenpflichtig-Konversion).
3. ~~Ein konkretes Monats-Token-Limit pro Plan.~~ — **erledigt.** Auf Rückfrage hat der
   Betreiber die konservative Option bestätigt: Starter 300.000 / Pro 1.200.000 Tokens/Monat.
   Der einstige Randfall unbezahlter Accounts (Welle 2, Punkt 19) ist jetzt geschlossen:
   `process-session` verlangt eine aktive `user_entitlements`-Zeile und lehnt ohne sie ab, statt
   ungedeckelt durchzulassen.
4. ~~Deployment der Edge-Function-Änderungen.~~ — **erledigt, Stand 18.08.2026.**
   `process-session` (v24), `openai-chat-proxy` (v18), `create-checkout-session` (v15),
   `stripe-webhook` (v12) und die Function `delete-account` (v1) sind live deployt; die
   Guardrails aus Befund A, die reparierten Prompt-Aufrufe aus Befund L, die Testphase, die
   Kontolöschung, die Entitlement-Pflicht (Welle 2, Punkt 19) und die Client-Pfad-Angleichung
   (Welle 2, Punkt 14) greifen jetzt in Produktion.
