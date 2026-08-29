# Go-Live Audit (Stand: 29.04.2026)

> **Veraltet.** Nachfolger: [`docs/launch-readiness-audit-2026-08-14.md`](./launch-readiness-audit-2026-08-14.md)
>
> Dieser Bericht beschreibt mehrere Lücken als „strukturell angelegt“, die inzwischen
> nachweislich im falschen Codepfad liegen — insbesondere die Usage-Guards, die seit dem
> Umzug der Session-Verarbeitung in die Edge Function `process-session` nicht mehr greifen.
> Für Launch-Entscheidungen bitte den Nachfolger heranziehen. Dieses Dokument bleibt als
> historischer Stand erhalten.

## Executive Summary

**Wenn Articlio heute live geht:**
- **Wird funktionieren:** Kern-Funnel (Landing → Signup/Login → Onboarding → Tutor/Sessions), Stripe Checkout + Webhook-Verarbeitung, Entitlement-Sync, Admin-Billing-Übersicht.
- **Wird nicht stabil genug funktionieren:** Vollständige monetäre Guardrails (Usage-Limits), konsistente Billing-Randfälle (Portal-/Recovery-Pfade), belastbare Funnel-Messbarkeit und operatives Incident-Handling in der UI.

**Go-Live-Empfehlung:**
- **Ja für kontrollierten Beta-Launch** (kleiner Nutzerkreis).
- **Nein für breiten Paid-Rollout**, bis P0/P1-Gaps geschlossen sind.

---

## 1) Live-heute-Check: Was funktioniert / was nicht

## 1.1 Was voraussichtlich funktioniert

1. **Produktzugang & Routing**
   - Öffentliche Seiten, Auth-Seiten und geschützte Bereiche sind sauber getrennt.
   - Onboarding und App-Bereiche sind via Protected/Auth-Gates abgesichert.

2. **Auth-Basisprozess**
   - Registrierung, Login, Passwort-Reset vorhanden.
   - User-Kontext ist zentral über Auth-Feature strukturiert.

3. **Kernwert des Produkts (Tutor + Sessions)**
   - Session-Erstellung, Session-Historie, Detailseiten und Tutor-Workspace sind vorhanden.
   - Session-Processing-Pipeline inkl. Tests vorhanden.

4. **Billing-Basis**
   - Checkout-Session wird serverseitig erstellt.
   - Stripe-Webhook verarbeitet Subscription-/Invoice-Events.
   - Entitlement-Sync und Billing-Events sind als Services/Funktionen vorhanden.

5. **Admin-Basis**
   - Admin-Bereiche für Prompts, Billing-Events und Entitlements sind im Frontend integriert.

## 1.2 Was heute **nicht** robust genug ist

1. **Usage-Limits nicht Ende-zu-Ende hart erzwungen**
   - Teile der Entitlement-Limits sind strukturell angelegt, aber nicht überall als harte, deterministische Server-Guardrails sichtbar.
   - Risiko: Kosten-/Leistungs-Leckage und inkonsistente UX.

2. **Billing-Recovery & Self-Service noch zu dünn**
   - Für echte Produktionsfälle fehlen stärker geführte Recovery-Flows (z. B. failed payment/past_due → gezielte Nutzerführung).

3. **Funnel-Analytics für Growth-Steuerung nicht vollständig**
   - Event-Taxonomie ist dokumentiert, aber für ein belastbares Go-to-Market-Monitoring noch nicht durchgehend als Instrumentierungsstandard abgesichert.

4. **Operative Runbooks nicht vollständig in Produktabläufe integriert**
   - Doku vorhanden, aber Incident-Replay/Triage sind nicht als vollständig integrierte UI-Operations-Pfade erkennbar.

---

## 2) Vergleich mit Wettbewerbern (produktstrategisch)

Vergleichsbasis: **BoldVoice**, **ELSA Speak**, **Speak** (direkte Kategorie: AI-gestütztes Sprech-/Aussprachetraining).

| Kriterium | Articlio (heute) | BoldVoice / ELSA / Speak (typisch) | GAP |
|---|---|---|---|
| Positionierung | Deutsch-Konversationscoach mit Session- und Analysefokus | Starke Spezialisierung auf Aussprache + tägliche Drills + mobile-first | Articlio muss Nutzenversprechen stärker „Outcome-first“ kommunizieren |
| Kern-Experience | Web-App mit Tutor-, Session- und Dashboard-Flow | Sehr polierte, hochfrequente Mobile-Lernloops | Mobile UX/Loop-Design als nächster Hebel |
| Feedback-Loop | Session- und Prompt-basierte Analyse | Sofortiges Mikrofeedback pro Übung ist Kernfeature | Niedrigschwellige Sofortfeedback-Schleifen ausbauen |
| Monetarisierung | Stripe-Basis sauber angelegt, Entitlements vorhanden | Stark getestete Subscriptions, Paywalls, Recovery-Mechaniken | Dunning/Recovery/Upgrade-Flows produktisieren |
| Experimentierbarkeit | Technische Basis vorhanden, Analytics noch nicht lückenlos | Kontinuierliche Conversion-Optimierung typisch | Event-Tracking + Experimente als Growth-Betrieb aufsetzen |
| Trust/Compliance | Gute Basis, aber rechtliche/ops UX noch ausbaufähig | Reife User-Flows inkl. Billing-Selbsthilfe | Support-/Transparenz-Flows priorisieren |

### Kurzfazit Wettbewerb
- Articlio ist **architektonisch nah an einem echten SaaS-Produkt**.
- Wettbewerber sind vor allem in **Produkt-Polish, Daily Habit Loops, und Revenue Operations** weiter.
- Der größte Hebel liegt nicht in „mehr Features“, sondern in **operativer Reife + messbarer Conversion-Steuerung**.

---

## 3) GAP-Plan mit kleinen Arbeitspaketen (2–8h Pakete)

## P0 – vor breitem Livegang

### GAP-P0-01: Hard-Stop Usage Guards
- **Ziel:** Alle monetären Limits serverseitig deterministisch enforce'n.
- **Arbeitspakete:**
  1. Guard-Checks zentralisieren (2h)
  2. Einheitliche Error-Codes/-Messages definieren (2h)
  3. UI-Mapping für Limit-Fehler ergänzen (3h)
  4. Regressionstests für Grenzwerte (4h)
- **DoD:** Bei Überschreitung stoppt jeder Pfad konsistent, inkl. klarer UX.

### GAP-P0-02: Billing Recovery Minimum
- **Ziel:** Nutzer mit Billing-Problemen in einen klaren Self-Service-Pfad führen.
- **Arbeitspakete:**
  1. Status→CTA-Matrix definieren (2h)
  2. UI-Banner/Interception für `past_due`/`suspended` (4h)
  3. Portal-Deep-Linking validieren (2h)
  4. E2E-Testfälle für Recovery-Flows (4h)
- **DoD:** Betroffene User können ohne Support wieder aktiv werden.

### GAP-P0-03: Go-Live Monitoring Pack
- **Ziel:** Die ersten 14 Tage mit klaren SLO-/Alarm-Signalen betreiben.
- **Arbeitspakete:**
  1. Error-Budget/SLO-Minimum festlegen (2h)
  2. Top-5 Alerts konfigurieren (3h)
  3. Daily Triage Ritual dokumentieren (2h)
- **DoD:** Team erkennt Incidents proaktiv statt reaktiv.

## P1 – 1 bis 2 Wochen nach Beta-Start

### GAP-P1-01: Funnel Event Instrumentation E2E
- **Ziel:** Von Landing bis Payment jede Stufe messbar machen.
- **Arbeitspakete:**
  1. Event-Schema finalisieren (2h)
  2. Frontend Events an kritischen Touchpoints (6h)
  3. Backend-Korrelation/Trace ergänzen (4h)
  4. Dashboard für Conversion-Trichter (6h)
- **DoD:** Conversion je Funnel-Stufe täglich auswertbar.

### GAP-P1-02: Pricing & Plan Source of Truth
- **Ziel:** Preise/Planlimits nur aus zentralem Katalog rendern.
- **Arbeitspakete:**
  1. Katalogfelder auf UI-Bedarf mappen (2h)
  2. Frontend-Hardcodes entfernen (3h)
  3. Fallback- und Versionierungslogik (3h)
  4. Smoke-Test für Stripe↔Katalog-Konsistenz (3h)
- **DoD:** Keine divergierenden Preis-/Limit-Angaben mehr.

### GAP-P1-03: Signup & Trust UX
- **Ziel:** Drop-offs im Auth-Onboarding reduzieren.
- **Arbeitspakete:**
  1. Verify-E-Mail-Interimscreen (3h)
  2. Terms/Privacy-Consent-Checkpoint (3h)
  3. Messaging-Polish für nächste Schritte (2h)
- **DoD:** Klarer, rechtskonformer Signup-Flow ohne Verwirrung.

## P2 – Skalierung

### GAP-P2-01: Daily Habit Loop
- **Ziel:** Wiederkehrrate durch kurze tägliche Lernimpulse erhöhen.
- **Arbeitspakete:**
  1. „Heute-Task“ Konzept & KPI (2h)
  2. Reminder/Prompt Triggerlogik (4h)
  3. Completion-Tracking (3h)
  4. A/B-Test Variante A/B (6h)
- **DoD:** Messbarer Uplift in D7/D30 Retention.

**Umsetzungsnotizen (konkret):**
- **KPI-Definition (Tag 0):** Primary = `retention_d7`, Secondary = `retention_d30`, Guardrail = `daily_active_users` und `session_completion_rate`.
- **Heute-Task UX (MVP):** 1 klarer Mikro-Task pro Tag (3–7 Minuten), sichtbar auf Dashboard + Session-Start, mit „Jetzt starten“-CTA.
- **Triggerlogik:**
  1. Wenn Nutzer am Kalendertag noch keine Session abgeschlossen hat → Daily Prompt ausspielen.
  2. Nach 20:00 lokaler Zeit ohne Completion → Reminder (In-App, optional E-Mail/Push je Consent).
  3. Cooldown: max. 1 Reminder pro Tag, keine Trigger bei `suspended/past_due`.
- **Tracking-Events (minimal):** `daily_task_impression`, `daily_task_started`, `daily_task_completed`, `daily_task_reminder_sent`, `daily_task_reminder_opened`.
- **A/B-Test Setup:**
  - **Variante A:** Motivational Prompt + Streak-Nudge.
  - **Variante B:** Konkreter Nutzen-Prompt + CTA auf kurzes Speaking-Drill.
  - Laufzeit mindestens 14 Tage oder bis statistische Mindestpower erreicht ist.
- **Messbare Akzeptanzkriterien:**
  1. +3–5% relativer Uplift in D7 gegenüber Kontroll- oder Pre-Period-Baseline.
  2. Kein negativer Effekt >2% auf Session-Completion-Rate.
  3. Reminder-Opt-out-Rate bleibt <10%.

### GAP-P2-02: Support Ops in Admin
- **Ziel:** Supportfälle unter 5 Minuten triagierbar machen.
- **Arbeitspakete:**
  1. Kunden-Timeline View (6h)
  2. Replay-/Retry-Aktionen für Billing-Events (6h)
  3. Audit-/Trace-Linking (4h)
- **DoD:** First-response-time und MTTR sinken signifikant.

---

## 4) Entscheidungsrahmen „Heute live?“

## Empfehlung nach Launch-Szenario

- **Closed Beta (50–200 Nutzer): JA**
  - Mit P0-Minimum + täglichem Monitoring vertretbar.
- **Open Paid Launch: NOCH NEIN**
  - Erst nach P0-Abschluss und mindestens P1-01/P1-02.

## Konkrete Exit-Kriterien für breiten Launch

1. >99% erfolgreiche Checkout- und Entitlement-Sync-Rate über 7 Tage.
2. 0 kritische Billing-Recovery-Dead-Ends in E2E-Tests.
3. 100% Funnel-Sichtbarkeit für Kernevents.
4. Incident-Reaktionszeit < 30 Minuten im Regelbetrieb.

---

## 5) 14-Tage Umsetzungsfahrplan (kompakt)

- **Tag 1–3:** GAP-P0-01 (Usage Guards)
- **Tag 4–6:** GAP-P0-02 (Billing Recovery)
- **Tag 7:** GAP-P0-03 (Monitoring Pack)
- **Tag 8–11:** GAP-P1-01 (Funnel E2E)
- **Tag 12–14:** GAP-P1-02 + P1-03 (Pricing/Signup Trust)

Danach: kontrollierter Paid-Rollout mit täglicher KPI-/Incident-Runde.
