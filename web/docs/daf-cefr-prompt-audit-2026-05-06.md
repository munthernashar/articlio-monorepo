# Audit: Prompt-Logik für DaF (Deutsch als Fremdsprache) vs. CEFR-Best-Practice

**Datum:** 2026-05-06  
**Scope:** Session-Pipeline (Transkript -> Session-Analyse -> Multi-Session-Matching -> Fokus-Thema -> Tutor-Zyklus)  
**Ziel:** Fachliche Bewertung aus Sicht eines sehr erfahrenen Sprachtrainers/Sprachinstituts, ohne Implementierungsänderungen.

## Kurzfazit

Die aktuelle Architektur ist **technisch solide und für produktive Lernsysteme ungewöhnlich reif** (Schema-Validierung, konservative Evidence-Gates, Fokus-Beschränkung, Anti-Drill-Guardrails).

Aus Perspektive eines Weltklasse-DaF-Instituts ist der Hauptabstand zur Exzellenz **nicht die Pipeline-Technik**, sondern die **didaktische Feinkalibrierung entlang CEFR-Can-Do-Deskriptoren, Performanzbedingungen und Test-Reliabilität**.

**Gesamturteil:**
- **Engineering-Reife:** sehr hoch
- **Didaktische CEFR-Operationalisierung:** mittel bis gut
- **Weltklasse-DaF-Niveau:** noch nicht erreicht, aber mit klaren, inkrementellen Anpassungen erreichbar

---

## Was bereits stark ist

1. **Saubere Phasen-Transparenz pro Session** (Cleanup, Analyse, Logging) fördert Nachvollziehbarkeit und Auditierbarkeit.
2. **Strikte JSON-/Schema-Validierung** reduziert Halluzinationen in kritischen Entscheidungen.
3. **Konservative Fokus-Entscheidung** (Mindestanzahl Sessions, Confidence-, Recurrence-, Readiness-Gates) verhindert didaktisch schädliche Übersteuerung.
4. **Single-Focus-Strategie** ist für DaF-Mikroprogression oft wirksamer als Multi-Ziel-Überladung.
5. **Tutor-Grenzen** (kurz, kontrastiv, no-drill, scope-bound) entsprechen modernen kommunikativen Didaktikprinzipien.

---

## Zentrale Lücken gegen CEFR-/DaF-Best-Practice

### 1) CEFR ist implizit, nicht operationalisiert
Aktuell wirken Kategorien generisch stark, aber CEFR-typische **Can-Do-Anker je Niveau (A1-C2)** sind nicht als harte Bewertungsbasis im Scoring/Matching sichtbar.

**Risiko:** Scores bleiben intern konsistent, aber extern nur begrenzt interpretierbar (z. B. „4/5“ ohne CEFR-Bezug).

### 2) Skalenmischung (0-5, 0-100, 0-1) bleibt erklärungsbedürftig
Technisch wird sauber normalisiert; pädagogisch fehlt jedoch eine explizite **Messmodell-Definition** (welche Skala bedeutet welche Kompetenzprogression?).

**Risiko:** Stakeholder lesen numerische Präzision hinein, die didaktisch nicht vollständig abgesichert ist.

### 3) Evidenzqualität ist noch zu „global“, zu wenig task-gebunden
Weltklasse-Institute bewerten Leistung stark **aufgaben- und bedingungsbezogen** (Monolog/Dialog, Planung vs. spontan, Interaktionsdruck, Register, Gesprächsziel).

**Risiko:** Verbesserungen in einem Kontext werden zu breit generalisiert.

### 4) Fokus-Themenwahl ist stark evidenzbasiert, aber wenig lernpsychologisch sequenziert
Die Logik priorisiert Stabilität/Impact gut, enthält aber noch wenig explizite Regeln für **teachability-now**, Interlanguage-Entwicklungslogik, Fehler-Treatability und kognitive Last.

### 5) Tutor-Dialog ist didaktisch vorsichtig, aber Output-Metrik für „echten Transfer“ fehlt
Es gibt Verständnischeck-Logik, aber noch keine belastbare Brücke von „verstanden“ zu „in spontaner Produktion stabil angewendet“.

---

## Empfehlungen (priorisiert)

## P0 (sofort, hoher Impact)

1. **CEFR-Can-Do-Layer in Session-Analyse einziehen**
   - Ergänze pro Kategorie einen Pflichtblock:
     - `cefr_band_estimate` (z. B. A2.1/A2.2/B1.1 ...),
     - `can_do_evidence` (2-3 konkrete Performanzbelege),
     - `limiting_factor` (wodurch nächste Band-Grenze verpasst wird).
   - Ziel: Jeder Score bekommt externe didaktische Bedeutung.

2. **Messmodell dokumentieren und im UI/Reporting offenlegen**
   - Klare Semantik für 0-5 vs. 0-1 vs. 0-100 (Diagnose, Confidence, Priorität).
   - Ein Satz pro Skala: „Was bedeutet +1 Punkt didaktisch?“

3. **Evidence-Qualität um Performanzbedingungen erweitern**
   - Für jedes Pattern: Tagging von Sprechmodus (Dialog/Monolog), Spontaneität, Aufgabenkomplexität, Registerdruck.
   - Fokus-Aktivierung nur, wenn Evidenz in mind. zwei Bedingungen konsistent ist.

## P1 (nächster Zyklus)

4. **Fokus-Selection um Teachability-Regeln erweitern**
   - Zusatzfeatures im Decision-Score:
     - Fehlerbehandelbarkeit in kurzer Intervention,
     - Transferwahrscheinlichkeit in Alltagssprache,
     - Interferenzpotenzial mit Parallelphänomenen.
   - Ergebnis: weniger „richtig diagnostiziert, aber schlecht trainierbar“-Themen.

5. **Tutor-Session auf Mikrozyklus mit Transferkriterium härten**
   - Nicht nur Erklärung + Checkfrage, sondern:
     - Mini-Reconstruction,
     - gelenkte freie Äußerung,
     - spontane Re-Use-Frage mit neuem Kontext.
   - Abschluss nur bei nachweislichem Re-Use unter leicht variierter Bedingung.

6. **Anti-Overcorrection als Lernzielbalance ausbauen**
   - Guardrail nicht nur technisch, sondern didaktisch: wann Fehler bewusst toleriert werden (Fluency/Interaction vor Form).

## P2 (Qualitätssystem/Weltklasse-Niveau)

7. **Rater-Reliability-Schicht aufbauen**
   - Stichprobenweise Doppelrating (LLM+Human oder LLM+LLM mit Blind-Prompts),
   - Monitoring von Drift je Kategorie.

8. **Outcome-Metriken auf CEFR-Progressionssignale ausrichten**
   - Nicht nur Session-internes besser/schlechter,
   - sondern: Stabilität über 3-5 Sessions, Transfer über Aufgabenarten, Rückfallquote je Fokus-Typ.

9. **Prompt-Bibliothek didaktisch versionieren**
   - Zusätzlich zur technischen Versionierung: didaktische Versionstags (z. B. `cefrop:v1`, `task-constraint:v2`).

---

## Konkrete Soll-Änderungen nach Pipeline-Schritt

### A) Session-Analyse
- Soll: Von Kategorie-Score auf **Kategorie-Score + CEFR-Can-Do-Evidenz + Kontextbedingungen**.
- Soll: `confidence` nicht nur Modell-Sicherheit, sondern Evidenzabdeckung widerspiegeln.

### B) Multi-Session-Matching
- Soll: Pattern-Stabilität getrennt nach Bedingungen berechnen (z. B. spontan vs. vorbereitet).
- Soll: Trendgewichtung stärker auf jüngere Sessions, aber nur bei vergleichbarer Aufgabenart.

### C) Focus-Selection/Scoring
- Soll: aktuelles Evidenz-Scoring beibehalten, aber um teachability/transferability erweitern.
- Soll: explizite Ausschlussregeln für zu breite/vage Fokus-Themen.

### D) Tutor-Ableitung
- Soll: Erklärung weiterhin kurz/kontrastiv.
- Soll: verpflichtender Transfer-Check mit minimaler Kontextvariation vor „sufficient“.
- Soll: bei „partial“ automatisch vereinfachte Reformulierung plus ein einziges Kernziel.

---

## Zielbild für „Weltklasse-DaF-Institut“

Ein Weltklasse-System erfüllt gleichzeitig:
1. **Diagnostische Validität** (CEFR-ankerfähig),
2. **Didaktische Wirksamkeit** (teachability + transfer),
3. **Reliabilität** (stabile Entscheidungen über Zeit/Rater),
4. **Lernerzentrierung** (kontextangemessen, kognitiv dosiert, motivationsschonend).

Eure aktuelle Basis erfüllt (2) und (4) in Ansätzen stark sowie (technisch) Teile von (3). Der größte Hebel liegt jetzt klar in (1) + didaktischer Messschärfe.

---

## Empfohlene Umsetzungsreihenfolge (ohne jetzige Implementierung)

1. CEFR-Operationalisierung in Prompt-/Schema-Verträgen spezifizieren.
2. Decision-Score um teachability/transferability erweitern (nur Design-Spezifikation).
3. Tutor-Zyklus um verbindliche Transferprüfung ergänzen (Prompt-/State-Design).
4. Reliability-/Drift-Monitoring-Konzept aufsetzen.

Wenn ihr diese Reihenfolge umsetzt, wird das System sehr wahrscheinlich von „starkes AI-Lernprodukt“ zu „institutsfähiger DaF-Qualitätsstandard“ aufsteigen.
