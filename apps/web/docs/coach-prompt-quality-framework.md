# Coach Prompt Quality Framework

## Zweck

Dieses Framework schafft eine **wiederholbare, systematische Bewertung** der Runtime-Coach-Ausgaben, bevor AI-Coach-Flags produktiv aktiviert werden.

Wichtig:
- Keine Prompt-Migration in diesem Schritt.
- Keine Änderungen an Runtime-Steuerung oder UI.
- Fokus auf Bewertbarkeit, Review-Qualität und Failure-Mode-Transparenz.

## Scope

Betroffene Runtime-Prompts:
- `coach_session_plan`
- `coach_next_step`
- `coach_training_recommendation`
- `coach_session_completion`
- `coach_reflection_interpreter`

## Bewertungsprozess (Review-Loop)

1. **Stichprobe definieren**
   - Mindestens 20 reale oder realistische Input-Szenarien pro Prompt.
   - Abdeckung: Anfänger/Fortgeschrittene, kurze/lange Session-Historie, verschiedene Fokusthemen.
2. **Blind Review**
   - Bewertung ohne Kenntnis, welcher Prompt-Stand verwendet wurde.
3. **Scoring pro Dimension**
   - Skala 1–5 je Dimension (siehe unten).
4. **Red-Flag-Check**
   - Harte Verstöße werden separat erfasst.
5. **Failure-Mode-Klassifizierung**
   - Jeder schlechte Output wird einem Failure-Mode zugeordnet.
6. **Review-Protokoll**
   - Prompt-Key, Beispielausgabe, Scores, Red Flags, Empfehlung (Go/No-Go/Iterate).

## Scoring-Skala (1–5)

- **5 – Exzellent:** konsistent coachig, klar, präzise, lernförderlich, ohne Red Flags.
- **4 – Gut:** kleine Schwächen, aber ohne kritische Risiken.
- **3 – Mittel:** funktional, aber erkennbar verbesserungsbedürftig.
- **2 – Schwach:** mehrere Qualitätsprobleme oder wiederkehrende Stilbrüche.
- **1 – Kritisch:** unbrauchbar oder klar kontra Zielbild.

## Bewertungsdimensionen

| Dimension | Zielbild | Typische positive Signale | Typische negative Signale |
|---|---|---|---|
| Ruhe / Calmness | Gelassener, stabiler Ton | Nüchterne Formulierungen, keine Übererregung | Ausrufezeichen-Ketten, pushiger Ton |
| Natürlichkeit | Klingt wie ein guter Lerncoach | Alltagsnahe Sprache, flüssiger Stil | Künstliche/steife Satzmuster |
| Coach-Konsistenz | Einheitlicher Coaching-Stil | Klare Lernorientierung über Turns hinweg | Wechsel zwischen Coach- und Bot-Rolle |
| Nicht-Chatbot-Haftigkeit | Kein Assistenten- oder LLM-Ton | Konkrete Anleitung statt Meta-Erklärungen | „Als KI…“, generische Helferfloskeln |
| Kürze / Präzision | Kompakt und auf den Punkt | Klare nächste Schritte, wenig Fülltext | Redundanz, Abschweifungen |
| Lernförderlichkeit | Fördert Verstehen und Üben | Kleine, konkrete Aufgaben + Begründung | Reine Motivation ohne Lernfortschritt |
| Dialogqualität | Passender Anschluss an Nutzerkontext | Bezug auf Session-Inhalt, klare Anschlussfrage falls nötig | Kontextverlust, unpassende Rückfragen |
| Nicht-Gamification | Kein Punkte-/Badge-Framing | Sachliche Lernsprache | Scores, Streaks, Leveling |
| Nicht-KPI-Sprache | Keine Leistungs-Metrik-Rhetorik | Lernfokus statt Performance-Marketing | KPI, Conversion, Velocity, Benchmark |
| Nicht-technische Sprache | Verständlich für Lernende | Einfache Sprache, wenig Jargon | Übermäßig technischer oder interner Jargon |
| Session-Kontinuität | Baut sinnvoll auf Historie auf | Referenz auf letzte Aufgabe/Fehlerbild | Widersprüche, Neustart ohne Bezug |
| Passende Schwierigkeit | Herausfordernd, aber machbar | Scaffolding, graduelle Steigerung | Zu leicht, zu schwer, sprunghaft |
| Gute Aufgabenvariation | Abwechslung ohne Zufälligkeit | Variierende Übungsformate mit Lernziel | Wiederholung desselben Musters |

## Red Flags (harte Warnsignale)

Beispiele (nicht abschließend):
- Überdrehte Positivität wie „Super!!!“, „Mega!!!“
- Emojis
- Motivationsfloskeln ohne Lerninhalt
- Offene Chat-Aufforderungen (z. B. „Erzähl mir irgendwas…“)
- Generische AI-Phrasen („Als KI-Assistent…“, „Ich kann dir bei allem helfen…“)
- KPI-/Score-Sprache (Score, Punkte, KPI, Performance)
- Zu lange Antworten (fehlende Kürze/Handlungsfokus)
- Smalltalk ohne Lernzweck
- Therapie-/Life-Coach-Ton (emotional-therapeutisch statt lernbezogen)

## Prompt-spezifische Qualitätskriterien

### 1) `coach_session_plan`

**Guter Output**
- Liefert einen klar strukturierten, kurzen Session-Plan.
- Priorisiert 1–3 Lernziele mit logischer Reihenfolge.
- Berücksichtigt bisherigen Lernstand und Session-Kontext.

**Schlechter Output**
- Bleibt abstrakt („Wir machen etwas Übung“) ohne konkrete Schritte.
- Ist überlang oder unstrukturiert.
- Ignoriert bekannte Schwächen oder Ziele aus der Session.

**Kritische Failure-Modes**
- Falsche Schwierigkeitseinstufung.
- Kein roter Faden zwischen Planpunkten.
- KPI-/Gamification-Framing statt Lernplan.

### 2) `coach_next_step`

**Guter Output**
- Definiert genau den nächsten sinnvollen Mikro-Schritt.
- Ist direkt ausführbar und verständlich.
- Schließt sauber an die letzte Nutzeraktion an.

**Schlechter Output**
- Zu viele Schritte gleichzeitig.
- Unklare oder doppeldeutige Handlungsanweisung.
- Reagiert nicht auf den unmittelbaren Verlauf.

**Kritische Failure-Modes**
- Kontextbruch (ignoriert letzten Fehler/Nutzerantwort).
- Assistenten-Ton statt Coach-Ton.
- Offene Chat-Einladung statt task-orientierter Anleitung.

### 3) `coach_training_recommendation`

**Guter Output**
- Empfiehlt konkrete Übung mit Lernbegründung.
- Schwierigkeit passt zum Lernstand.
- Formulierung bleibt kurz, sachlich und motivierend ohne Hype.

**Schlechter Output**
- Generische „du solltest mehr üben“-Aussage.
- Zu schwierige oder triviale Empfehlung.
- Punktesystem-/Gamification-Sprache.

**Kritische Failure-Modes**
- Empfehlung ohne Bezug zu beobachteten Defiziten.
- Übermäßig lange Erklärung statt klarer Empfehlung.
- Therapie- oder Selbsthilfe-Tonlage.

### 4) `coach_session_completion`

**Guter Output**
- Prägnante, lernbezogene Zusammenfassung der Session.
- Benennt Fortschritt + nächstes realistisches Follow-up.
- Bleibt nüchtern, nicht pathetisch.

**Schlechter Output**
- Nur Lob ohne Substanz.
- Kein klarer Ausblick auf nächsten Schritt.
- Zu lang und repetitiv.

**Kritische Failure-Modes**
- Falsche Zusammenfassung (halluzinierter Fortschritt).
- Übermotivierender Abschluss mit Floskeln.
- KPI-/Erfolgsmetriken als Hauptfokus.

### 5) `coach_reflection_interpreter`

**Guter Output**
- Interpretiert Reflection-Input klar und neutral.
- Extrahiert verwertbare Lernsignale (Hürden, Muster, nächste Hebel).
- Vermeidet psychologisierende Überdeutung.

**Schlechter Output**
- Vage Interpretation ohne operative Konsequenz.
- Über-Interpretation persönlicher Aussagen.
- Technisch/jargonlastige Analyse statt lernnaher Sprache.

**Kritische Failure-Modes**
- Therapie-/Life-Coach-Ton.
- Fehlklassifizierung der Reflexion (falsche Ableitungen).
- Keine actionable Outputs für den nächsten Coaching-Schritt.

## Review-Artefakte für Wiederholbarkeit

Pro geprüftem Output dokumentieren:
- Prompt-Key
- Input-Kontext (kurz)
- Roh-Output
- Scores je Dimension (1–5)
- Gefundene Red Flags
- Failure-Mode-Tags
- Reviewer-Entscheidung: `go`, `iterate`, `block`

Empfohlene Failure-Mode-Tags:
- `tone_hype`
- `assistant_voice`
- `gamification_language`
- `kpi_language`
- `too_long`
- `context_break`
- `difficulty_mismatch`
- `non_actionable`
- `therapy_tone`
- `generic_ai_phrase`

## Go/No-Go-Heuristik (vor Flag-Aktivierung)

- **Blocker:** Ein einzelner kritischer Failure-Mode in sicherheitsrelevanter Häufung (z. B. regelmäßig therapy_tone oder context_break).
- **No-Go:** Durchschnitt < 3.5 in einer Kern-Dimension (Calmness, Präzision, Lernförderlichkeit, Session-Kontinuität).
- **Iterate:** Durchschnitt >= 3.5, aber Red-Flags > definierter Schwelle.
- **Go:** Durchschnitt >= 4.0, keine wiederkehrenden kritischen Failure-Modes.

## Abgrenzung dieses Dokuments (ursprünglicher Scope)

Dieses Framework definiert **Bewertung**, nicht die endgültige Prompt-Neugestaltung.
Prompt-Änderungen erfolgen erst auf Basis der gemessenen Findings.

Wichtiger Stand (2026-08-18): Die fünf oben genannten `coach_*`-Prompts sind in der
Produktions-DB durchgehend `is_active = false` (inklusive `coach_feedback`, dessen totes
Client-Codepfad-Gegenstück bereits entfernt wurde, siehe Launch-Readiness-Audit Befund J).
Dieser ursprüngliche Scope betrifft also aktuell **kein einziges produktiv laufendes
Feature**. Die tatsächlich live geschalteten Prompts sind die elf unten in Teil B gelisteten.

---

## Teil B: Erweiterung auf die 11 aktiven Produktivprompts (Welle 2 #14)

### Warum diese Erweiterung nötig war

Das Framework deckte ausschließlich die fünf `coach_*`-Prompts ab -- alle fünf sind inaktiv.
Munthers Frage 2 aus dem ursprünglichen Audit-Plan ("wie gut ist die fachliche/didaktische
Substanz?") ließ sich damit für den tatsächlich laufenden Teil der App nicht beantworten.
Teil B schließt diese Lücke für die elf `is_active = true`-Prompts:

`session_transcript_cleanup`, `session_analysis`, `multi_session_pattern_detection`,
`focus_topic_selector`, `improvement_check`, `understanding_check`, `tutor_explanation`,
`tutor_followup_answer`, `dashboard_summary`, `daily_prompt_generator`, `json_repair`.

### Zwei Review-Tracks

Die ursprüngliche Methodik (Abschnitt „Bewertungsprozess“ oben) verlangt **≥20 reale oder
realistische Input-Szenarien pro Prompt** und ein Blind-Scoring der tatsächlichen
Modell-Outputs. Das ist für die fünf `coach_*`-Prompts vor deren Aktivierung sinnvoll, setzt
hier aber echten Produktions-Traffic (oder aufwendig kuratierte synthetische Sessions) und
tatsächliche OpenAI-Aufrufe voraus, die in dieser Review-Sitzung nicht seriös durchführbar
sind (keine echten Lerner-Transkripte, kein Budget-Auftrag für Testaufrufe). Beide Tracks
werden deshalb explizit unterschieden:

- **Track A -- Prompt-Text-Review (in dieser Sitzung durchgeführt):** systematische Prüfung
  von `system_prompt`, `developer_prompt`, `user_prompt_template` und
  `expected_output_schema_json` gegen die Qualitätsdimensionen und Red Flags oben, plus
  Prüfung auf strukturelle Risiken (widersprüchliche Constraints, unbefüllte
  Template-Variablen, mehrdeutige Schema-Felder). Bewertet die *Anweisung*, nicht die
  tatsächliche Modellantwort.
- **Track B -- Output-Sampling-Review (noch offen, jetzt technisch möglich):** Blind-Scoring
  realer Outputs gegen die 13 Dimensionen. Seit Welle 2 #10 (`process-session` schreibt jetzt
  bei jedem Lauf einen Datensatz nach `prompt_execution_logs` inkl. `rendered_user_prompt` und
  `parsed_output`) kann Track B direkt gegen diese Tabelle laufen, sobald genug echter
  Produktions-Traffic vorliegt -- vorher bräuchte Track B künstlich erzeugte Testfälle, die
  selbst wieder Bewertungsverzerrung riskieren.

Track A ersetzt Track B nicht. Er ist der frühestmögliche, kostenlose Prüfschritt und deckt
zuverlässig strukturelle/instruktionale Probleme auf (siehe Funde unten); Tonfall-Drift,
Halluzinationsrate und Grenzfall-Verhalten über viele reale Sessions hinweg kann nur Track B
zeigen.

### Prompt-spezifische Qualitätskriterien (die 11 aktiven Prompts)

Die Dimensionen oben (Ruhe, Natürlichkeit, Nicht-Gamification usw.) sind für dialogische,
nutzersichtbare Prompts entwickelt. Bei reinen Analyse-/Extraktions-Prompts (Transkript-
Bereinigung, Muster-Erkennung, JSON-Reparatur) ist nur eine Teilmenge sinnvoll anwendbar --
angegeben ist jeweils, welche greifen.

**Nutzersichtbar (alle 13 Dimensionen relevant):** `dashboard_summary`, `tutor_explanation`,
`tutor_followup_answer`, `daily_prompt_generator`.
**Teilweise nutzersichtbar (Sprache/Fairness relevant, Coach-Tondimensionen nicht):**
`session_analysis` (Feedback-Text erreicht den Nutzer, aber als Analyse, nicht als Dialog).
**Rein intern/analytisch (nur Genauigkeit, Nicht-Halluzination, Schema-Disziplin relevant):**
`session_transcript_cleanup`, `multi_session_pattern_detection`, `focus_topic_selector`,
`improvement_check`, `understanding_check`, `json_repair`.

### Realer Review-Pass -- Track A (durchgeführt 2026-08-18)

Geprüft: aktive Version jedes Prompts direkt aus `prompt_definitions` (Supabase-Projekt
`pkmwdhjohidkkjkrlcnt`).

| Prompt | Version | Scores (relevante Dimensionen, 1-5) | Red Flags | Failure-Mode-Tags | Empfehlung |
|---|---|---|---|---|---|
| `session_analysis` | 5 | Fairness/Nicht-Shaming 5, Schema-Disziplin 5, Nicht-Halluzination 5 | keine | keine | **go** |
| `session_transcript_cleanup` | 2 | Genauigkeit/Nicht-Verfälschung 5, Schema-Disziplin 4 | keine | `unused_template_variable` | **go** (Fix empfohlen, nicht blockierend) |
| `multi_session_pattern_detection` | 3 | Nicht-Halluzination 5, Schema-Disziplin 5 | keine | keine | **go** |
| `focus_topic_selector` | 2 | Schema-Disziplin 5, Entscheidungsklarheit 5 | keine | keine | **go** |
| `improvement_check` | 2 | Nicht-Halluzination 5, Schema-Disziplin 4 | keine | `redundant_schema_field` | **go** (Vereinfachung empfohlen) |
| `understanding_check` | 3 | Lernförderlichkeit 5, Schema-Disziplin 5 | keine | keine | **go** |
| `tutor_explanation` | 2 | Nicht-technische Sprache 5, Kürze/Präzision 5, Nicht-Chatbot-Haftigkeit 5 | keine | keine | **go** |
| `tutor_followup_answer` | 2 | Gute Aufgabenvariation 5, Nicht-Chatbot-Haftigkeit 5 | keine | keine | **go** |
| `dashboard_summary` | 5 | Nicht-Halluzination 5, Nicht-KPI-Sprache 4 | keine | `field_naming_collision_risk` | **go** (Rename empfohlen) |
| `daily_prompt_generator` | 3 | Natürlichkeit 4, Lernförderlichkeit 4 | keine | `missing_tone_guardrails` | **iterate** (siehe Fund unten) |
| `json_repair` | 1 | Nicht-Halluzination 5, Schema-Disziplin 5 | keine | keine | **go** |

**Ergebnis:** 10 von 11 aktiven Prompts sind auf Textebene solide -- durchgängig
Anti-Halluzinations-Klauseln ("erfinde keine neuen Inhalte", "Never invent data ... use
null"), strikte Schemas (`additionalProperties: false`, explizite `enum`s statt Freitext für
Statuswerte), und bei den drei Befund-K-Nacharbeiten (`session_analysis`,
`multi_session_pattern_detection`, `understanding_check`) explizite Anti-Inflations-Regeln
gegen zu wohlwollende Modellantworten. Das ist im Prompt-Engineering deutlich über dem
Durchschnitt dessen, was man in einer Vor-Launch-App erwarten würde.

### Konkrete Funde (Track A)

1. **`unused_template_variable` -- `session_transcript_cleanup` (nicht blockierend).**
   `user_prompt_template` enthält `{{learner_metadata_json}}`, aber weder
   `process-session/index.ts` (`runCleanupPrompt`) noch ein anderer bekannter Aufrufer füllt
   diese Variable. `renderPromptTemplate` ersetzt unbekannte Platzhalter durch `''`, das
   Modell sieht also immer einen leeren `Learner metadata:`-Block. Kein Fehlerrisiko, aber
   verschwendeter Prompt-Platz und ein irreführendes Signal für zukünftige Prompt-Pfleger, die
   annehmen könnten, dass hier tatsächlich Lernerdaten ankommen. *Empfehlung:* entweder die
   Variable im Aufrufer befüllen (z. B. mit CEFR-Ziel-Niveau) oder aus dem Template entfernen.

2. **`redundant_schema_field` -- `improvement_check` (nicht blockierend).**
   `focus_topic_key_match` und `focus_topic_match` sind laut Beschreibung fast identisch
   ("whether the evidence you found is actually about this focus topic key" vs. "same check
   at a coarser level") -- ein 4.1-mini-Modell wird beide Felder in der Praxis vermutlich
   korreliert beantworten, ohne dass der feinere/gröbere Unterschied tatsächlich Signal
   trägt. *Empfehlung:* auf ein Feld konsolidieren, wenn die Consumer-Seite (Tutor-Flow) das
   zweite Feld nicht tatsächlich separat auswertet.

3. **`field_naming_collision_risk` -- `dashboard_summary` (nicht blockierend).**
   Das Schema verlangt gleichzeitig ein Pflichtfeld `next_action` (kurzer Text) und ein
   optionales Objekt `nextAction` (strukturierte Handlungsempfehlung) -- Namen, die sich nur
   durch Groß-/Kleinschreibung unterscheiden. Für ein `gpt-4.1-mini`-Modell ist das ein reales
   Verwechslungsrisiko (Inhalt landet im falschen Feld oder wird dupliziert). *Empfehlung:*
   das reichhaltigere Feld umbenennen (z. B. `nextActionDetail`).

4. **`missing_tone_guardrails` -- `daily_prompt_generator` (Grund für „iterate“ statt „go“).**
   Im Unterschied zu allen anderen nutzersichtbaren Prompts (`tutor_explanation`,
   `tutor_followup_answer`, `dashboard_summary`) enthält dieser Prompt **keine** der im
   restlichen System durchgängig vorhandenen Anti-Red-Flag-Klauseln -- kein Verbot von
   Ausrufezeichen-Ketten, Gamification- oder KPI-Sprache, keine Nicht-Chatbot-Anweisung. Da
   `prompt_text` direkt als Sprechanlass an den Nutzer ausgegeben wird, ist das Risiko eines
   Tonbruchs (z. B. „Super, leg direkt los!!!“) real und inkonsistent zum sonst sehr
   diszipliniert kuratierten Rest des Systems. *Empfehlung vor breiter Nutzung:* Prompt um
   dieselben Ton-Leitplanken ergänzen, die `tutor_explanation`/`tutor_followup_answer` bereits
   haben (kein Meta-Theorie-/KPI-/Gamification-Vokabular, ruhiger Ton).

### Go/No-Go-Gesamtbild für die 11 aktiven Prompts

Nach der oben definierten Heuristik: **kein Blocker, kein No-Go.** Zehn von elf Prompts sind
„go"; `daily_prompt_generator` ist „iterate" wegen fehlender Ton-Leitplanken -- niedrige
Kritikalität (kein Red Flag beobachtet, nur strukturell erhöhtes Risiko), aber vor breiterer
Nutzung nachzuziehen. Track B (Output-Sampling gegen `prompt_execution_logs`) bleibt offen und
sollte angesetzt werden, sobald aus echtem Produktions-Traffic genügend Datensätze vorliegen.

### Abgrenzung von Teil B

Wie im ursprünglichen Scope oben: Teil B definiert **Bewertung** der elf aktiven Prompts,
nicht deren Neugestaltung. Die drei nicht-blockierenden Funde (unbefüllte Template-Variable,
redundantes Schema-Feld, Feldnamen-Kollisionsrisiko) und der eine "iterate"-Fund
(`daily_prompt_generator`) sind hier dokumentiert, aber noch nicht behoben -- das ist
bewusste, nächste, separat zu entscheidende Arbeit, kein impliziter Auftrag.
