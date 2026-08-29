# Audit Arbeitspaket 6 – Fehlercluster- und Mustererkennung über mehrere Sessions

## Ergebnis (Kurzfassung)

AP6 ist **weitgehend umgesetzt**. Die Kernanforderungen (Multi-Session-Analyse, Häufigkeits-/Stabilitätsbezug, Trend/Entwicklung, Fokus-Thema, Rückfall-Erkennung sowie die definierten Regeln) sind in Service-Logik, Prompting und Datenmodell abgebildet.

## Abgleich gegen Anforderungen

| Anforderung | Status | Evidenz |
|---|---|---|
| Analyse über mehrere Sessions | ✅ umgesetzt | `multiSessionPatternService` lädt mehrere abgeschlossene Analysen (`limit 8`) und übergibt sie gesammelt an den Prompt `multi_session_pattern_detection`. |
| Fehlerhäufigkeiten | ✅ überwiegend umgesetzt | Häufigkeit wird nicht als expliziter Zähler gespeichert, aber indirekt über wiederholte Multi-Session-Evidenz und `session_count` in `detected_patterns.evidence` geführt. |
| Stabilität eines Musters | ✅ umgesetzt | Prompt fordert explizit „stabile, wiederkehrende Muster“, Service persistiert nur `stable_patterns`. |
| Trend | ✅ umgesetzt | `improvementCheckService` vergleicht Baseline mit neueren freien Sessions und klassifiziert konservativ in `improved/unchanged/worsened/insufficient_data`. |
| Fokus-Thema bestimmen | ✅ umgesetzt | `focus_topic_selector` wählt genau ein Hauptthema, wird in `focus_topics` gespeichert; vorherige aktive Themen werden auf `paused` gesetzt. |
| Rückfall erkennen | ✅ umgesetzt | `improvement_check` erlaubt `worsened`; Ergebnis wird als Check gespeichert und am Fokus-Thema als Improvement-Status fortgeschrieben. |

## Regelprüfung

| Regel | Status | Evidenz |
|---|---|---|
| Fokus-Thema erst nach ausreichend Daten | ✅ umgesetzt | In Prompting: bei <3 Sessions `enough_data=false`; zusätzlich allgemeine Mindestschwelle über `minSessionsForDiagnosis` vor Pattern/Fokus-Verarbeitung. |
| Nur ein Hauptthema gleichzeitig | ✅ umgesetzt | Nach Upsert des aktiven Fokus-Themas werden andere aktive Themen auf `paused` gesetzt. |
| Neue Intervention nur bei stabiler Evidenz | ✅ umgesetzt | Fokus-Thema entsteht nur aus `stable_patterns`; bei fehlender stabiler Evidenz wird mit `no_stable_patterns`/`focus_topic_not_ready` abgebrochen. |

## Technische Evidenzquellen

- **Prompt-Ebene**: `multi_session_pattern_detection`, `focus_topic_selector`, `improvement_check` enthalten konservative Regeln zur Datenmenge, Stabilität und Ein-Themen-Fokus.
- **Service-Ebene**: `multiSessionPatternService.detectAndPersist()` steuert Persistenz stabiler Muster und Fokus-Thema-Selektion.
- **Trend-/Rückfall-Ebene**: `improvementCheckService.runForActiveFocusTopic()` prüft Entwicklung gegen Baseline und aktualisiert Status.
- **Datenmodell**: Tabellen `detected_patterns`, `focus_topics`, `improvement_checks` unterstützen Musterhistorie, Hauptthema und Trend-Checks.

## Offene Feinheiten / Hinweise

1. **Fehlerhäufigkeiten sind implizit statt explizit**: Es gibt keine dedizierte numerische Häufigkeit pro Muster über Zeitfenster, sondern eine evidenzbasierte Ableitung via Prompt + `session_count`.
2. **Session-Schwellen sind zweistufig**: global `minSessionsForDiagnosis` plus promptseitige Spezifika (z. B. Fokus-Thema erst ab 3 Sessions). Das ist sinnvoll, sollte aber als Produktregel klar dokumentiert bleiben.
3. **Rückfalllogik ist vorhanden, aber KI-abhängig**: Die Klassifikation `worsened` beruht auf Promptausgabe + Baseline-Vergleich, nicht auf rein deterministischer Schwellenregel.

## Fazit

Für Arbeitspaket 6 ist der geforderte Funktionsumfang in der aktuellen Codebasis **im Kern erfüllt**. Falls gewünscht, kann als nächster Schritt ein expliziter Häufigkeitsindikator (z. B. `occurrence_count` pro Pattern und Zeitfenster) ergänzt werden, um „Fehlerhäufigkeiten“ stärker quantifizierbar zu machen.
