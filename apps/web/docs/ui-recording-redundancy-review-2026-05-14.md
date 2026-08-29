# UX/UI Review – "Dialog starten" (Aufnahme-Ansicht)

## Kurzfazit
Die Ansicht wirkt funktional, enthält aber während der laufenden Aufnahme mehrere **redundante Status- und Zeitangaben**. Das erhöht kognitive Last und erschwert schnellen Fokus auf die primäre Aktion (Aufnahme steuern und anschließend speichern).

## Redundanzen (Ist-Zustand)
1. **Status doppelt**
   - Oben: `Status: Aktiv`
   - Im Session-Flow: `Status: recording`
   - Zusätzlich Text: `Aufnahme läuft ...` und `Der Dialog läuft gerade.`

2. **Dauer doppelt**
   - Oben: `Dauer: 00:00`
   - Im Session-Flow: `Dauer: 00:07`
   - Unterschiedliche Werte können als Fehler wahrgenommen werden.

3. **Fortschritt doppelt visualisiert**
   - Linke Stepper-Navigation zeigt Schritt 3 aktiv.
   - Hauptbereich zeigt nochmals implizit denselben Zustand.

4. **Mischsprache / inkonsistente Terminologie**
   - `Aktiv`, `recording`, `Aufnahme läuft`.
   - Inkonsistenz verlangsamt Verständnis.

## Best-Practice-Leitlinie (ex-Tech-Lead UX/UI)

### 1) Eine "Single Source of Truth" pro Informationsart
- **Status nur einmal prominent** (z. B. Badge im Header des Hauptpanels).
- **Timer nur einmal zentral** und groß genug.
- Sekundäre Panels dürfen Details enthalten, aber keine konkurrierenden Primärwerte.

### 2) Information-Hierarchy nach Nutzungsfrequenz
- Primär während Aufnahme:
  1. Aufnahmezustand (Live/Pause)
  2. Timer
  3. Primäre Controls (`Pause/Fortsetzen`, `Beenden & Speichern`)
- Sekundär:
  - Verlauf/Logs (einklappbar)
  - technische Details

### 3) Action-Set reduzieren
Während "Recording" maximal 3 klare CTAs:
- **Pause** (oder Fortsetzen)
- **Beenden & Speichern** (Primary)
- **Abbrechen/Löschen** (destruktiv, visuell getrennt)

Buttons wie `Start`, `Weiter`, `Neu` parallel im Recording-State nur anzeigen, wenn wirklich aktiv nutzbar.

### 4) State-Machine sichtbar im UI-Design verankern
Empfohlene Zustände:
- `idle` → `ready` → `recording` → `paused` → `review` → `saved`

Für jeden Zustand definieren:
- sichtbare Elemente
- erlaubte Aktionen
- eindeutige Beschriftung

So verhindert man widersprüchliche UI (z. B. deaktivierter Start trotz laufender Aufnahme).

### 5) Konsistente Sprache
- Durchgängig Deutsch **oder** Englisch.
- Beispiel Deutsch:
  - Status: `Aufnahme läuft`
  - Pause: `Pausiert`
  - Fertig: `Gespeichert`

## Konkreter Soll-Zustand (kompakt)

### Header im Hauptpanel
- `● Aufnahme läuft` (grün)
- `00:07` (einziger Timer)
- optional: Thema

### Linke Stepper-Spalte
- Nur Phasen-Navigation, **keine Live-Statusdetails**.

### Session-Flow-Karte
- Nur inhaltliche Ereignisse (Transkript, Hinweise, Marker)
- Keine erneute globale Status-/Zeitwiederholung.

### Footer-Aktionen
- `Pause` / `Fortsetzen`
- `Beenden & speichern` (Primary)
- `Abbrechen` (destruktiv)

## Priorisierte Quick Wins (ohne großes Redesign)
1. Obere Zeile `Status: Aktiv · Dauer: 00:00` entfernen oder mit Session-Flow synchronisieren.
2. `Status: recording` durch einheitliches deutsches Label ersetzen.
3. Einen einzigen Live-Timer festlegen und überall referenzieren.
4. CTA-Satz im Recording-State auf maximal 3 sichtbare Aktionen reduzieren.

## KPI-Check nach Umsetzung
- Time-to-understand (erste 5 Sekunden): Nutzer erkennt sofort Zustand + nächste Aktion.
- Fehlklickrate auf sekundäre Buttons sinkt.
- Weniger Rückfragen wie "Läuft die Aufnahme jetzt wirklich?".
