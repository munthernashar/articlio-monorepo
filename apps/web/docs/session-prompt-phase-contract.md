# Session Prompt Phase Contract

Dieses Dokument beschreibt **transparent** die Prompt-Ausführungen je Session-Phase.

## 1) Beim Sessionstart

- **Aktuell keine neue Prompt-Ausführung vorgesehen.**
- Beim Start wird die Session erstellt (`conversation_sessions`), aber es läuft **kein zusätzlicher Start-Prompt**.
- Sichtbarkeit erfolgt über Session-Status + Timeline-Eintrag „Session gestartet“.

## 2) Nach Upload / Transkription

- Prompt: `session_transcript_cleanup`
- Zweck: Roh-Transkript normalisieren (Bereinigung, Segmentierung, Notizen).
- Logging:
  - Ausführung läuft über `aiOrchestratorService.executePrompt`.
  - `sessionId` wird im `executionContext` und im `logging`-Payload mitgegeben, damit Einträge in `prompt_execution_logs` eindeutig zur Session zugeordnet sind.

## 3) Nach Analyse

- Prompt: `session_analysis`
- Zweck: Kategorien, Muster, Prioritäts-Intervention und Session-Zusammenfassung erzeugen.
- Logging:
  - Ausführung läuft über `aiOrchestratorService.executePrompt`.
  - `sessionId` wird ebenso im `executionContext` und `logging` gesetzt und in `prompt_execution_logs` sichtbar.

## UI-Transparenz (NewSessionPage + SessionDetailPage)

Die Session-Timeline zeigt u. a.:

- Session gestartet
- Aufnahme/Upload-Status
- „Prompt X gelaufen“ (aus `prompt_execution_logs`)
- „Transkript fertig“ / Fehler
- „Analyse fertig“ / Fehler
- Session abgeschlossen

Damit ist nachvollziehbar, **welcher Prompt wann** für eine Session lief – auch ohne neue Prompt-Ausführung beim Sessionstart.
