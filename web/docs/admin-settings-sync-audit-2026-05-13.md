# Admin Settings Sync Audit (2026-05-13)

## Scope
Verglichen wurden:
- Konfigurierbare Felder im Admin-Menü (`AdminSettingsPage`)
- Persistierte `app_settings` Felder (`AppSettings`/`app_settings.service`)
- Tatsächliche Nutzung dieser Einstellungen im Runtime-Code

## 1) Einstellungen im Code, die **nicht** im Admin-Menü steuerbar sind

### Ergebnis: keine `app_settings`-Felder gefunden, die im Runtime-Code genutzt werden, aber im Menü fehlen
Alle Felder aus `AppSettings` sind in `AdminSettingsPage` editierbar:
- `minSessionsForDiagnosis`
- `improvementMinRecentSessions`
- `improvementMinConfidence`
- `improvementRequiredStreak`
- `maxSessionsPerDay`
- `maxSessionLengthSeconds`
- `primaryScoreSessionIndex`
- `categoryWeights[*]`
- `feedbackHardness`
- `tutorExplanationLanguage`
- `featureFlags.*`

## 2) Einstellungen im Admin-Menü, die im Code **nicht** genutzt werden (obsolet)

### Ergebnis: keine obsoleten Felder gefunden
Alle im Menü veränderbaren Einstellungen werden in Services verwendet:
- Multi-Session/Diagnose: `minSessionsForDiagnosis`, `featureFlags.multi_session_patterns`, `featureFlags.focus_topic_selection`
- Improvement-Check: `improvementMinRecentSessions`, `improvementMinConfidence`, `improvementRequiredStreak`
- Entitlement-Fallbacks: `maxSessionsPerDay`, `maxSessionLengthSeconds`
- Session-Scoring: `categoryWeights`, `primaryScoreSessionIndex`
- Tutor: `featureFlags.tutor`, `feedbackHardness`, `tutorExplanationLanguage`
- Session-Analyse Toggle: `featureFlags.session_analysis`
- Improvement-Checks Toggle: `featureFlags.improvement_checks`

## 3) Wichtige Hinweise (nicht obsolet, aber hart codierte Logik außerhalb Admin-Settings)

Diese Punkte sind aktuell **bewusst nicht** im Admin-Menü enthalten und weiterhin im Code fest:
- `DIAGNOSIS_MAX_SESSIONS = 5` und `SESSION_LOOKBACK_LIMIT = 8` in `multi-session-pattern.service`.
- Score-Multiplikator für nicht-primäre Session: `0.5` in `session-analysis.service`.
- Diverse Schwellenwerte in Improvement-/Pattern-Logik (z. B. `delta <= -0.5`, Recurrence-Schwelle `0.5`).

Wenn „Admin-Menü ist vollständig führend“ strikt gelten soll, wären diese Konstanten die nächsten Kandidaten für zusätzliche App-Settings-Felder.

## Fazit
Der aktuelle Stand ist für die vorhandenen `app_settings` bereits synchron:
- Kein fehlendes Admin-Feld für tatsächlich genutzte `app_settings`
- Kein offensichtliches obsoletes Admin-Feld ohne Runtime-Nutzung

Der einzige verbleibende Gap ist „Business-Logik-Konstanten“, die nicht Teil von `app_settings` sind.
