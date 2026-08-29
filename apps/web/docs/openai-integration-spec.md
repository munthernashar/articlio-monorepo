# OpenAI-Integrationsspezifikation (verbindlich)

Status: **verbindliche Team-Richtlinie** für alle neuen und erweiterten KI-Features.

Diese Spezifikation ergänzt die zentralen API-Konventionen und definiert den Mindeststandard für Architektur, Prompts, Validierung, Logging und Fehlertoleranz.

## Geltungsbereich
- Alle KI-Features in Frontend, Backend, Edge Functions und Jobs.
- Alle OpenAI-bezogenen Integrationen, inklusive zukünftiger Tool-/Agent-Workflows.

## 1) Responses API als Standard
- Für **neue KI-Features ist die OpenAI Responses API der Standard**.
- Abweichungen (z. B. Legacy-Chat-Endpoints) sind nur temporär erlaubt und müssen im Ticket/ADR begründet, datiert und mit Migrationsplan versehen werden.
- Neue Feature-Designs sind auf Responses-native Konzepte auszurichten (strukturierte Outputs, Tool-Aufrufe, nachvollziehbare Run-Schritte).

## 2) Verbot direkter OpenAI-Calls außerhalb des zentralen API-Layers
- Direkte OpenAI-HTTP-Calls sind ausschließlich in der zentralen API-Schicht zulässig (`src/services/api/*`).
- Fachlogik (`src/services/ai/*`, UI, Hooks, Stores, Komponenten) konsumiert nur die zentralen API-Funktionen/Services.
- Verstöße (z. B. `fetch("https://api.openai.com/...`) außerhalb des API-Layers) sind als Architekturfehler zu behandeln.

## 3) Keine Prompt-Strings in UI-Komponenten
- UI-Komponenten dürfen keine produktiven Prompt-Texte enthalten.
- Prompts liegen zentral in dedizierten Prompt-Modulen/-Registries (z. B. `src/services/ai/prompts/*`).
- Die UI übergibt nur fachliche Eingaben/Kontext; Prompt-Selektion und -Zusammenbau passiert in Service-Schichten.

## 4) JSON-first Output + Schema-Validierung
- Modellantworten sind standardmäßig als strukturierter JSON-Output anzufordern.
- Jede produktive Modellantwort wird gegen ein explizites Schema validiert (z. B. Zod/JSON Schema).
- Ungültige oder unvollständige Antworten gelten als Fehlerzustand und durchlaufen den Reparaturpfad (siehe Abschnitt 7).
- Downstream-Code verarbeitet nur validierte, typisierte Daten.

## 5) Prompt-Versionierung + Nachvollziehbarkeit
- Jeder produktive Prompt besitzt eine stabile Kennung und Version (z. B. `article_summary:v3`).
- Änderungen an Prompt-Inhalt, Output-Schema oder Parametern erhöhen mindestens die Patch-/Minor-Version gemäß Team-Konvention.
- Pro Run muss nachvollziehbar sein:
  - welche Prompt-ID/Version verwendet wurde,
  - welches Modell und welche relevanten Parameter aktiv waren,
  - aus welchem Codepfad/Feature der Run stammt.

## 6) Pflicht-Logging pro Run (trace/workflow/attempt)
Für jeden Modell-Run sind strukturierte Logs Pflicht. Mindestens:
- `traceId`: End-to-end Korrelation über Request, API-Layer und Downstream.
- `workflowId`: fachlicher Ablauf/Use-Case (z. B. "article-generation").
- `attempt`: laufender Versuch (1..n) für Retry-/Repair-Sequenzen.
- Zusätzlich empfohlen: Prompt-ID/-Version, Modell, Latenz, Token-Nutzung, Ergebnisstatus, Fehlercode.

Logging muss datenschutzkonform erfolgen:
- Keine Secrets.
- Kein unnötiges Logging sensibler personenbezogener Inhalte.
- Nutzdaten nur in notwendigem Umfang und mit geeigneter Redaction.

## 7) Fehlerbehandlung inkl. Reparaturpfad
Jeder KI-Use-Case benötigt einen definierten Fehlerpfad:
1. **Klassifikation**: Transportfehler, Upstream-Fehler, Validierungsfehler, Sicherheits-/Policy-Fehler.
2. **Retry-Regeln**: nur für temporäre Fehler (Timeout, 429, 5xx) gemäß API-Konvention.
3. **Reparaturpfad bei Strukturfehlern**:
   - erneuter Run mit klarer Reparaturinstruktion,
   - begrenzte Anzahl Attempts,
   - weiterhin schema-validiert.
4. **Fail-safe Output**: falls Reparatur scheitert, definierter Fehlercode + nutzbare Rückmeldung für UI/Caller.

## 8) Erweiterbarkeit für Tools/agentische Flows
- Architektur muss Tool-Aufrufe und mehrstufige agentische Abläufe unterstützen, ohne UI- oder Fachmodule mit Provider-Details zu koppeln.
- Tool-Definitionen, Tool-Berechtigungen und Orchestrierungslogik gehören in den zentralen KI/API-Layer.
- Jeder Tool-Call ist im Run-Log nachvollziehbar (inkl. trace/workflow/attempt).
- Neue Tools dürfen bestehende Contracts nicht brechen; stattdessen versionierte Erweiterung.

## Umsetzungs-Checkliste (DoD)
Ein KI-Feature gilt nur dann als "done", wenn:
- [ ] Responses API verwendet wird (oder dokumentierte, befristete Ausnahme vorliegt).
- [ ] Keine direkten OpenAI-Calls außerhalb `src/services/api/*` existieren.
- [ ] Keine Prompt-Strings in UI-Komponenten liegen.
- [ ] JSON-first + Schema-Validierung umgesetzt ist.
- [ ] Prompt-ID/Version pro Run nachvollziehbar ist.
- [ ] Pflicht-Logging (`traceId`, `workflowId`, `attempt`) vorhanden ist.
- [ ] Fehlerbehandlung inkl. Reparaturpfad implementiert ist.
- [ ] Tool-/Agent-Erweiterbarkeit im API-/Orchestrierungsdesign berücksichtigt ist.

## Referenzen
- API-Konventionen: `docs/api-conventions.md`
- Lokale Proxy-Einrichtung: `docs/openai-proxy-local-setup.md`
