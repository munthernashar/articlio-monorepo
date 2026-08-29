# Kleine Umsetzungsaufgaben aus dem SaaS-Readiness-Audit (28.04.2026)

## 1) Billing-Portal vereinheitlichen (GAP-001)
Zwei unterschiedliche Portal-Functions erhöhen Wartungs- und Sicherheitsrisiko.

:::task-stub{title="Eine einzige Billing-Portal-Function als Standard etablieren"}
1. Prüfe in `src/services/billing/billing-portal.service.ts` und `src/services/supabase/dashboard-subscription.service.ts`, welche Function-Namen aktuell im Frontend genutzt werden.
2. Lege eine Ziel-Function fest (empfohlen: `create-billing-portal-session`) und migriere alle Aufrufer auf diesen Endpoint.
3. Entferne oder deaktiviere den nicht mehr verwendeten Endpoint in `supabase/functions/create-customer-portal-session/index.ts`.
4. Ergänze einen kurzen Migrationshinweis in `README.md` unter dem Stripe-/Functions-Abschnitt.
5. Prüfe anschließend, dass alle Portal-Aufrufe denselben Response-Contract (`{ url }`) erwarten.
:::

## 2) Return-URL absichern (GAP-002)
Die Return-URL muss konsistent gegen erlaubte Origins validiert werden.

:::task-stub{title="Allowlist-Validierung für returnUrl in allen Billing-Portal-Flows erzwingen"}
1. Übernimm die Origin-Validierungslogik aus `supabase/functions/create-billing-portal-session/index.ts` (Funktionen `isAllowedOrigin`, `parseAndValidateUrl`) als gemeinsamen Standard.
2. Wende die gleiche Prüfung auf `supabase/functions/create-customer-portal-session/index.ts` an (falls Endpoint vorübergehend bestehen bleibt).
3. Stelle sicher, dass `APP_BASE_URL` als Pflicht-Konfiguration genutzt wird und bei Fehlen ein klarer 500-Fehlercode mit Diagnose kommt.
4. Gib bei ungültiger Origin einen 400-Fehler mit stabiler Fehlerkennung zurück.
5. Ergänze eine kurze Sicherheitsnotiz in `docs/security-hardening-supabase.md`.
:::

## 3) Monats-Tokenlimit hart durchsetzen (GAP-003)
`monthlyTokenLimit` ist modelliert, aber nicht durchgehend als Guardrail erzwungen.

:::task-stub{title="Serverseitigen Guard für monthlyTokenLimit im Prompt-Lifecycle ergänzen"}
1. Identifiziere den zentralen Ausführungspfad für Prompt-Calls in `src/services/ai/prompt-execution.service.ts` und/oder `src/services/ai/orchestrator.ts`.
2. Lade vor Ausführung das effektive Entitlement über `userEntitlementsService.getEffectiveForUser`.
3. Ermittle den Tokenverbrauch im aktuellen Abrechnungszeitraum (Start/Ende aus Entitlement, sonst definierter Fallback).
4. Blockiere die Ausführung mit klarer Fehlermeldung, wenn `tokensUsed + estimatedTokens > monthlyTokenLimit`.
5. Logge den Blockierungsgrund strukturiert (inkl. userId, planKey, periodStart, periodEnd) für Support/Monitoring.
:::

## 4) Daily-Conversation-Limit durchsetzen (GAP-003)
`dailyConversationSecondsLimit` sollte genauso strikt erzwungen werden wie Session-Länge.

:::task-stub{title="Tageslimit für Gesprächssekunden bei Session-Erstellung und Upload prüfen"}
1. Ergänze in `src/services/supabase/session.service.ts` vor `createConversationSession` und `updateConversationSessionAfterUpload` eine Summenprüfung der Tagessekunden.
2. Nutze dieselbe Tagesgrenze (Zeitzonenlogik) wie beim bestehenden Sessions-per-Day-Check.
3. Vergleiche `sum(durationSecondsToday) + neueSessionDauer` gegen `dailyConversationSecondsLimit`.
4. Gib bei Überschreitung eine UX-taugliche Fehlermeldung mit Limit und Zeitzone zurück.
5. Dokumentiere den neuen Guard kurz in `docs/api-conventions.md` (Fehlercode + Message-Schema).
:::

## 5) Zeitzonenlogik angleichen (GAP-004)
Enforcement und Reporting sollen denselben Tagesbegriff nutzen.

:::task-stub{title="Dashboard-Usage von UTC auf User-Timezone umstellen"}
1. Prüfe die Tagesberechnung in `supabase/functions/dashboard-subscription-usage/index.ts` (`dayStart`/`nextDayStart`).
2. Lies die User-Zeitzone aus `profiles.timezone` und berechne Tagesgrenzen analog zu `getCurrentDayBoundsUtcForTimezone`.
3. Ersetze UTC-Filter für `conversation_sessions` durch die neue userbezogene Tagesgrenze.
4. Führe eine Querprüfung durch: identischer User muss in Dashboard und Session-Guard denselben SessionsToday-Wert sehen.
5. Ergänze einen Kommentar im Code, dass Reporting und Enforcement dieselbe Zeitbasis teilen müssen.
:::

## 6) Pricing-Quelle zentralisieren (GAP-005)
Statische Preise im Frontend können von Stripe/Entitlements abweichen.

:::task-stub{title="Plan- und Preisdaten aus zentraler Quelle statt Hardcode laden"}
1. Ersetze das statische `plans`-Array in `src/pages/billing/PricingPage.tsx` durch Daten aus einer zentralen Plan-Quelle (DB-Tabelle oder Function).
2. Definiere ein typsicheres Contract-Modell in `src/services/api/contracts.ts` (planKey, displayName, priceLabel, featureFlags/limits).
3. Implementiere einen Service (`src/services/billing/...`) zum Laden der Planliste.
4. Rendere die Pricing-Karten ausschließlich aus den geladenen Daten und baue einen Fallback-Status für Ladefehler ein.
5. Ergänze einen Admin-/Seed-Hinweis, wie Preistext und Limits synchron gepflegt werden.
:::

## 7) Signup-Flow für E-Mail-Bestätigung härten (GAP-006)
Direkte Redirects nach Signup sind bei aktivierter Mail-Verification fehleranfällig.

:::task-stub{title="Registrierungsflow mit explizitem Verify-Schritt ausstatten"}
1. Passe `src/pages/auth/RegisterPage.tsx` so an, dass nach erfolgreichem Signup ohne aktive Session ein eigener „E-Mail bestätigen“-State gezeigt wird.
2. Navigiere nur dann zu `paths.dashboard`, wenn `data.session` tatsächlich vorhanden ist.
3. Zeige klare Nutzerhinweise für „Bestätigungs-E-Mail erneut senden“ (falls unterstützt) und „zum Login zurück“.
4. Ergänze in `src/features/auth/AuthContext.tsx` eine robuste Behandlung für `signUp`-Antworten ohne Session.
5. Ergänze einen kurzen QA-Testfall in der Projektdoku (Auth mit/ohne Mail-Verification).
:::

**QA-Testfall (Auth mit/ohne Mail-Verification):**
- **Setup A (Mail-Verification aktiv):** Registriere einen neuen Nutzer und prüfe, dass die UI auf der Seite „E-Mail bestätigen“ bleibt (kein Redirect ins Dashboard), eine Aktion zum erneuten Senden der Bestätigungs-E-Mail anbietet und ein klarer Link zurück zum Login sichtbar ist.
- **Setup B (Mail-Verification inaktiv):** Registriere einen neuen Nutzer und prüfe, dass bei sofort verfügbarer Session direkt nach `paths.dashboard` navigiert wird.

## 8) Billing-Status im UI besser erklären (GAP-009)
Nutzer im Status `grace`/`suspended` brauchen gezielte Recovery-CTAs.

:::task-stub{title="Kontextuelle Billing-Recovery-Hinweise in Pricing/Dashboard einbauen"}
1. Ermittle im UI den Entitlement-Status über bestehende Services (`userEntitlementsService` oder `dashboardSubscriptionService`).
2. Zeige für `grace` und `suspended` klar unterscheidbare Hinweisbanner mit Handlungsoption.
3. Verknüpfe CTA direkt mit Billing-Portal-Öffnung (`payment_method_update` oder Standard-Portal-Flow).
4. Ergänze eine kurze Fehlerfall-UX für `BILLING_CUSTOMER_NOT_FOUND`.
5. Definiere Erfolgskriterien (z. B. Anteil erfolgreich reaktivierter Konten nach Reminder).
:::

## 9) Funnel-Events minimal instrumentieren (GAP-008)
Ohne Event-Taxonomie sind Conversion-Optimierungen schwer messbar.

:::task-stub{title="MVP-Eventtracking für Signup- und Checkout-Funnel einführen"}
1. Definiere ein kleines Eventset: `pricing_viewed`, `signup_started`, `signup_completed`, `checkout_started`, `checkout_completed`.
2. Ergänze Trigger an den relevanten Stellen (`src/pages/PricingPage.tsx`, `src/pages/auth/RegisterPage.tsx`, `src/pages/billing/PricingPage.tsx`).
3. Leite Events über einen zentralen Tracking-Adapter (z. B. neues Modul `src/services/analytics/...`).
4. Stelle sicher, dass keine sensiblen Daten (Passwörter, komplette E-Mails) in Event-Payloads landen.
5. Dokumentiere die Eventfelder kompakt in einer neuen Datei `docs/funnel-event-taxonomy.md`.
:::

## 10) Operative Webhook-Transparenz verbessern (GAP-007)
Support braucht schnelle Sicht auf fehlerhafte Billing-Events.

:::task-stub{title="Admin-Sicht auf fehlgeschlagene Stripe-Webhooks bereitstellen"}
1. Nutze die vorhandenen Daten aus `billing_events` (inkl. `processing_status` und `processing_error`) in einer Admin-Übersicht.
2. Ergänze in `src/pages/admin/` eine einfache Liste mit Filter `failed` und Sortierung nach Aktualität.
3. Zeige pro Event mindestens: `event_type`, `stripe_event_id`, `user_id`, `processing_error`, `updated_at`.
4. Verlinke aus der Admin-Seite auf ein kurzes Runbook in `docs/` für Standardmaßnahmen.
5. Definiere einen minimalen Support-Workflow („triage“, „replay“, „escalate“) als Abschnitt im Runbook.
:::


## 11) Go-Live Monitoring Pack (GAP-P0-03)
Die ersten 14 Tage nach Go-Live brauchen eine klare minimale Betriebsroutine mit SLO- und Alarmfokus.

:::task-stub{title="Go-Live Monitoring Pack für die ersten 14 Tage definieren"}
1. Definiere ein schlankes Error-Budget-/SLO-Minimum für die kritischen User-Flows (Zeitbudget: 2h).
2. Konfiguriere Top-5 Alerts mit hoher Signalqualität (Zeitbudget: 3h).
3. Dokumentiere ein Daily-Triage-Ritual für die Go-Live-Phase (Zeitbudget: 2h).
4. Lege einen festen 14-Tage-Zeitraum mit täglichen Review-Terminen und klaren Owners fest.
5. Ergänze eine messbare DoD-Prüfung: Team erkennt Incidents proaktiv statt reaktiv.
:::

**Top-5-Alerts (MVP-Vorschlag):**
- **A1: API-Fehlerrate kritisch** – 5xx-Rate über SLO-Schwelle in 5-Minuten-Fenster.
- **A2: Latenz kritisch** – p95-Latenz der Kern-Endpoints über Zielwert.
- **A3: Checkout/Billing-Ausfall** – Spike bei fehlgeschlagenen Checkout-/Portal-Requests.
- **A4: Auth-Anomalie** – ungewöhnlicher Anstieg bei Login-/Signup-Fehlern.
- **A5: Webhook-Backlog** – wachsende Anzahl `failed`/`pending` Billing-Webhooks über Schwellwert.

**Daily-Triage-Ritual (MVP):**
- 15 Minuten täglich (fixer Slot), Review von Alert-Historie, offenen Incidents und Error-Budget-Trend.
- Entscheidung je Signal: `ignore` (false positive), `monitor`, `incident`, `follow-up task`.
- Kurzes Ergebnisprotokoll (Owner, ETA, nächster Check), damit Folgemaßnahmen nachvollziehbar bleiben.
