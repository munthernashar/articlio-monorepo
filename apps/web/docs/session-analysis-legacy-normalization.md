# Session-Analysis Legacy-Normalisierung

Diese Doku beschreibt die zentrale Kompatibilitätsschicht für gespeicherte Analysen (`session_analyses.*_json`).

## Zielmodell

### `category_scores_json`
Pro Kategorie wird ein Objekt erwartet:

```json
{
  "score": 0,
  "confidence": 0.0,
  "justification": "string",
  "evidence": ["string"]
}
```

### `detected_patterns_json`
Array von:

```json
{
  "pattern_key": "string",
  "label": "string",
  "description": "string",
  "frequency_estimate": "low|medium|high",
  "communicative_impact": "low|medium|high",
  "category": "one_of_analysis_categories"
}
```

### `priority_intervention_json`

```json
{
  "pattern_key": "string",
  "label": "string",
  "reason": "string"
}
```

## Legacy-Erkennung

Der Adapter erkennt und normalisiert:

1. `category_scores_json` als Zahlen-Map in `0..100`.
2. Alte `detected_patterns`-Einträge mit Feldern wie `pattern`, `impact`, `evidence` (String).
3. Alte `priority_intervention`-Einträge mit `focus_area`, `next_step`.

## Mapping-Regeln

### Score-Mapping `0..100` nach `0..5`

Deterministisch:

```text
new_score = clamp( round(old_score / 20), 0, 5 )
```

Beispiele:

- `0 -> 0`
- `19 -> 1`
- `20 -> 1`
- `49 -> 2`
- `50 -> 3`
- `80 -> 4`
- `100 -> 5`

### Confidence-Mapping

Priorität:

1. `category_scores_json[category].confidence` (wenn vorhanden)
2. konservativer Fallback `0.55`

Zusätzlich: Werte `>1` werden als Prozent interpretiert (`x/100`) und auf `0..1` begrenzt.

### `justification` und `evidence[]`

- `justification`: aus Kategorie-Feld, sonst Fallback-Text.
- `evidence[]`: aus vorhandenem Array; falls nicht vorhanden, aus normalisierten Pattern-Beschreibungen der Kategorie + `priority_intervention.reason` abgeleitet.

## Schreibregel (Single Source of Truth)

- `category_scores_json` ist die kanonische Quelle und wird vollständig gespeichert (`score`, `confidence`, `justification`, `evidence`).
- `metrics` enthält keine zweite, implizit konkurrierende Kopie von `category_scores`.
- Der Kompatibilitätsadapter liest Legacy-Formate weiterhin aus `category_scores_json` (z. B. numerische 0..100-Werte) und normalisiert sie zentral.

### `detected_patterns`

Legacy -> Neu:

- `pattern` -> `label`
- `pattern_key` wird aus `pattern` slugifiziert (spaces zu `_`), falls nicht vorhanden
- `evidence` (String) -> `description`
- `impact` -> `communicative_impact` (`low|medium|high`)
- `frequency_estimate` fallback `medium`

### `priority_intervention`

Legacy -> Neu:

- `focus_area` -> `pattern_key` und `label`
- `next_step` -> `reason`
- Falls Felder fehlen: Fallback auf erstes normalisiertes Pattern.

## Beispiele Alt -> Neu

### Beispiel 1: Kategorie-Score (alt)

```json
{
  "fluency": 84
}
```

Wird zu:

```json
{
  "fluency": {
    "score": 4,
    "confidence": 0.55,
    "justification": "Legacy-Normalisierung für Kategorie fluency.",
    "evidence": ["Legacy-Daten ohne explizite Evidenzliste."]
  }
}
```

### Beispiel 2: Pattern (alt)

```json
[
  {
    "pattern": "Article omission",
    "impact": "high",
    "evidence": "I went to store"
  }
]
```

Wird zu:

```json
[
  {
    "pattern_key": "article_omission",
    "label": "Article omission",
    "description": "I went to store",
    "frequency_estimate": "medium",
    "communicative_impact": "high",
    "category": "grammatical_accuracy"
  }
]
```

### Beispiel 3: Priority (alt)

```json
{
  "focus_area": "fluency",
  "next_step": "Übe Shadowing mit 2-minütigen Monologen"
}
```

Wird zu:

```json
{
  "pattern_key": "fluency",
  "label": "fluency",
  "reason": "Übe Shadowing mit 2-minütigen Monologen"
}
```

## Read-Pfade mit Adapter

- Session Detail (`sessionAnalysisService.getBySessionId`)
- Dashboard (`dashboardDataService`)
- Progress (`ProgressOverview`, `SkillMapOverview`)
- Improvement-Check-Service
- Multi-Session-Pattern-Service

## Optionale Hintergrund-Migration

Zusätzlich existiert ein Backfill-Service:

- `src/services/supabase/session-analysis-backfill.service.ts`

Dieser lädt `completed`-Analysen batchweise, normalisiert die JSON-Felder und schreibt nur geänderte Records zurück.
