# SaaS-Readiness Audit (Stand: 28.04.2026)

## Executive Summary

**Kurzurteil:** Das Projekt ist **produktnah**, aber noch nicht vollständig „production-ready“ als SaaS.

- **Stark:** Solider Auth- und Routing-Stack, Stripe-Checkout + Webhook-Verarbeitung, Entitlement-Synchronisation, Admin-Override für Supportfälle.
- **Kritische Lücken vor Go-Live:** Inkonsistente Portal-Architektur, unvollständige Enforcements für Usage-Limits, teilweise inkonsistente Perioden-/Timezone-Logik, fehlende Produktbausteine für Billing-Compliance und Funnel-Optimierung.

Empfehlung: **Kein breiter Produktiv-Rollout**, sondern ein kontrollierter Beta-Rollout nach Umsetzung der **P0/P1-Gaps**.

---

## 1) Funnel-Check: Interessent → Kunde → zahlender Bestandskunde

## 1.1 Acquisition / Erstkontakt

### Vorhanden
- Öffentliche Seiten inkl. Landing, Features, Pricing und Demo sind im Routing eingebunden.
- Klarer Übergang zu Auth-Flows vorhanden.

### Gaps
- Keine sichtbare Instrumentierung für Conversion-Events (z. B. `pricing_viewed`, `checkout_started`, `checkout_completed`) im Frontend-Code.
- Kein ausgewiesener Experiment-/A/B-Mechanismus für Pricing oder CTA-Optimierung.

## 1.2 Signup / Auth

### Vorhanden
- Registrierung, Login, Passwort-Reset vorhanden.
- Schutz privater Routen inkl. Onboarding-Gate.

### Gaps
- Registrierung navigiert direkt ins Dashboard nach `signUp`; bei aktivierter E-Mail-Bestätigung kann das UX-seitig inkonsistent wirken.
- Kein expliziter Schritt für Zustimmung zu Terms/Privacy beim Signup sichtbar.

## 1.3 Activation / Onboarding

### Vorhanden
- Onboarding erfasst Name, Muttersprache, Niveau und Zeitzone.
- Onboarding ist durch ProtectedRoute erzwungen.

### Gaps
- Keine Onboarding-Qualitätschecks (z. B. Plausibilität Zeitzone, progressive Profilanreicherung).
- Kein In-App-Trigger für „First Value“ (z. B. guided first session + success checkpoint mit KPI).

## 1.4 Conversion / Zahlung

### Vorhanden
- Stripe Checkout Session wird serverseitig erzeugt.
- Stripe Webhook verarbeitet zentrale Subscription- und Invoice-Events.
- Entitlements werden bei relevanten Events synchronisiert.

### Gaps
- Zwei unterschiedliche Portal-Functions (`create-billing-portal-session` und `create-customer-portal-session`) mit divergierenden Validierungs- und API-Standards.
- `create-customer-portal-session` validiert `returnUrl` nicht gegen erlaubte Origins.
- Plan-/Preis-Informationen im Frontend sind statisch, statt aus Single Source of Truth (Stripe/DB) zu kommen.
- Fehlende explizite Unterstützung für Trial/Coupon/Tax/VAT-Logik und deren UX.

## 1.5 Retention / Usage Management

### Vorhanden
- Session-Limit pro Tag und Max-Session-Länge werden vor Session-Erstellung/Upload geprüft.
- Dashboard-Usage-Endpoint liefert Verbrauchswerte.

### Gaps
- Vorhandene Entitlement-Felder `dailyConversationSecondsLimit` und `monthlyTokenLimit` werden nicht hart im Session-/Prompt-Lifecycle erzwungen.
- Dashboard zählt Tagesverbrauch in UTC statt nutzerbezogener Zeitzone; potenziell inkonsistente Anzeige vs. Enforcement.
- Fallback-Perioden im Dashboard können ohne Entitlement zu nicht-intuitiven Zeiträumen führen.

## 1.6 Billing Operations / Support / Recovery

### Vorhanden
- Billing-Events werden als Gatekeeper persistiert (Dedup via `stripe_event_id`).
- Admin kann Entitlements manuell überschreiben.

### Gaps
- Keine klar sichtbare Outbox/Retry-Strategie für fehlgeschlagene Webhook-Nachbearbeitung (operativ dokumentiert, aber nicht als Work-Queue ersichtlich).
- Kein offensichtlicher Runbook-Linking-Pfad in der Admin-UI (z. B. „why suspended“, „replay webhook“, „customer timeline“).

---

## 2) Konkrete Bugs & Risiken (priorisiert)

## P0 (vor Produktivsetzung beheben)

1. **Inkonsistente Billing-Portal-Architektur**
   - Symptom: Zwei verschiedene Edge Functions für Portal-Sessions mit unterschiedlichem Verhalten.
   - Risiko: Unterschiedliche Sicherheits-/Validierungsregeln, schwer wartbar, höheres Fehlerrisiko.

2. **Fehlende Origin-Validierung in `create-customer-portal-session`**
   - Symptom: `returnUrl` wird nur auf „nicht leer“ geprüft.
   - Risiko: Open-Redirect-/Missbrauchsvektor im Billing-Kontext.

3. **Entitlement-Limits nicht vollständig enforced**
   - Symptom: `monthlyTokenLimit` und `dailyConversationSecondsLimit` vorhanden, aber nicht als harte Guardrails implementiert.
   - Risiko: Umsatz-/Kosten-Leckage und unklare SLA gegenüber Kunden.

## P1 (kurz nach P0)

4. **Timezone-Inkonsistenz zwischen Enforcement und Reporting**
   - Symptom: Session-Erstellung nutzt Nutzerzeitzone, Dashboard-Usage nutzt UTC.
   - Risiko: Nutzer sehen „falschen“ Verbrauch und erhalten Support-Tickets.

5. **Hardcoded Pricing im Frontend**
   - Symptom: Preistexte/Features sind statisch im UI hinterlegt.
   - Risiko: Drift zwischen Stripe-Preisen, Entitlements und UI-Kommunikation.

6. **Signup-UX bei E-Mail-Verification nicht robust genug**
   - Symptom: Direkte Navigation nach Registrierung, auch wenn Session ggf. noch nicht aktiv.
   - Risiko: Verwirrung im Funnel, unnötige Drop-offs.

## P2 (Skalierungs-/Optimierungshebel)

7. **Unvollständige Conversion- und Retention-Analytics**
   - Symptom: Kein durchgängiges Event-Taxonomie-/Attributionsmodell im Code sichtbar.
   - Risiko: Schlechtere Steuerbarkeit von CAC→LTV.

8. **Fehlende Self-Service-/Support-Bausteine**
   - Symptom: Kein klarer Endkundenpfad für „Warum gesperrt?“, „Wie reaktiviere ich?“ inkl. kontextualisierter Maßnahmen.
   - Risiko: Höherer Supportaufwand, schlechtere Churn-Recovery.

---

## 3) Umsetzungs-Backlog (Tasks für Gap-Schließung)

| ID | Priorität | Aufgabe | Ergebnis / DoD |
|---|---|---|---|
| GAP-001 | P0 | Billing-Portal konsolidieren: auf **eine** Function + **einen** Client-Service standardisieren. | Nur noch ein Endpoint produktiv; veralteter Endpoint entfernt/deaktiviert; Tests für Request/Response-Contract vorhanden. |
| GAP-002 | P0 | `returnUrl`-Allowlist für alle Billing-Portal-Flows erzwingen (APP_BASE_URL + localhost nur in non-prod). | Sicherheitstest zeigt: fremde Origins werden mit 400/403 abgelehnt. |
| GAP-003 | P0 | Harte Enforcement-Guards für `dailyConversationSecondsLimit` und `monthlyTokenLimit` implementieren. | Überschreitung blockiert Erstellung/Verarbeitung deterministisch; klare Fehlermeldung im UI. |
| GAP-004 | P1 | Zeitlogik vereinheitlichen (Nutzerzeitzone) für Dashboard, Limits und Abrechnungsanzeige. | Gleicher Tagesverbrauch in Session-Guard und Dashboard bei identischem User-Timezone-Setup. |
| GAP-005 | P1 | Plan-/Preis-Source zentralisieren (z. B. DB/Stripe-synced Plan-Katalog statt Hardcode). | Pricing-UI rendert aus zentralem Katalog; kein statischer Preistext im Code. |
| GAP-006 | P1 | Signup-Flow für E-Mail-Verification sauber gestalten (State-basiertes Redirect + „E-Mail bestätigen“-Screen). | Nutzer erhalten klaren nächsten Schritt; keine Redirect-Schleife bei unbestätigter E-Mail. |
| GAP-007 | P1 | Billing-Lifecycle-Runbook + Admin-Timeline (Events, Status, letzte Fehler) bereitstellen. | Support kann Fall in <5 Min triagieren; notwendige Daten in Admin sichtbar. |
| GAP-008 | P2 | Event-Taxonomie für Funnel-KPIs implementieren (`visit`, `signup_started`, `checkout_started`, `checkout_success`, `churn_risk`). | KPI-Dashboard kann Conversion je Funnel-Stufe ausweisen. |
| GAP-009 | P2 | Dunning-/Recovery-UX verbessern (past_due/suspended → klare CTA zu Payment Update). | Betroffene Nutzer sehen kontextuelle Recovery-Aktion statt generischer Fehlermeldung. |
| GAP-010 | P2 | Compliance-Härtung (Terms/Privacy-Consent, Invoice-/Tax-Hinweise je Markt) ergänzen. | Rechtliche Pflichtpunkte dokumentiert und im Signup/Checkout nachvollziehbar. |

---

## 4) Best-Practice Zielbild (kompakt)

1. **Single Source of Truth für Plans & Entitlements** (Stripe Price ↔ DB Plan ↔ UI).
2. **Deterministische Guardrails** für alle monetären Limits auf Server-Seite.
3. **Klare Statusmaschine** für Billing (`active`, `grace`, `suspended`, `expired`) inkl. UX pro Status.
4. **Observability by default**: Trace-ID end-to-end, Event-Timeline pro Kunde, Retry-/Replay-Werkzeug für Webhooks.
5. **Funnel-Messbarkeit**: jeder Übergang von Interessent bis zahlender Kunde ist als Event messbar.

---

## 5) Go-Live Empfehlung

- **Heute:** technische Beta möglich (mit internem/kleinem Early-Access-Kreis).
- **Vor externem Rollout:** mindestens **GAP-001 bis GAP-006** umsetzen.
- **Nachgelagert:** P2-Themen für Conversion-Optimierung und Support-Skalierung priorisieren.
