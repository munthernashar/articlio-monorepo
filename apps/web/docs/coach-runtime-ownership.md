# Coach Runtime Ownership Analyse

## Zweck
Diese Analyse dokumentiert den aktuellen Stand der Runtime-Ownership in der Coach-Architektur: welche Entscheidungen bereits AI-driven laufen, welche noch lokal/hardcoded sind und welche Legacy-Fallbacks temporär bestehen.

> Stand: 2026-05-12 (UTC), nur Transparenz – keine Logik-/UI-/Prompt-Änderungen.

## A) Bereits AI-driven (mit lokalem Fallback)

### 1) Session Plan
- **Prompt-Key:** `coach_session_plan`
- **Runtime-Service-Methode:** `coachRuntimeService.createSessionPlan(...)`
- **Feature-Flag:** `appConfig.features.enableAiCoachSessionPlan` (Env: `VITE_ENABLE_AI_COACH_SESSION_PLAN`, Default `false`)
- **Readiness-Gate:** `isCoachSessionPlanReady()` → `validateCoachPromptAvailability()`
- **Validierung:** Schema-/Feldvalidierung in `CoachRuntimeService` (`objective`, `priorities`, `session_focus`, `success_signal`, optionale Tasks mit Mode/Prompt/Transition/PreferredInput) plus Mapping-Sanitization via `mapAiTaskPlan(...)`.
- **Aktueller Fallback:** `createInitialSessionState(...)` + `buildTaskPlan(...)`.

### 2) Next Step Feedback
- **Prompt-Key:** `coach_next_step`
- **Runtime-Service-Methode:** `coachRuntimeService.getNextStep(...)`
- **Feature-Flag:** `appConfig.features.enableAiCoachNextStep` (Env: `VITE_ENABLE_AI_COACH_NEXT_STEP`, Default `false`)
- **Readiness-Gate:** `isCoachNextStepReady()` → `validateCoachPromptAvailability()`
- **Validierung:** `CoachRuntimeService` validiert `step_type` (`clarify|practice|transfer|review`) sowie Pflichtfelder; UI-seitig `normalizeMicroFeedback(...)` und `normalizeFollowupQuestion(...)` filtern unsafe/ungeeignete Texte.
- **Aktueller Fallback:** `buildMicroFeedback(...)`.

### 3) Dynamic Next Task
- **Prompt-Key:** `coach_next_step` (Feld `next_task`)
- **Runtime-Service-Methode:** `coachRuntimeService.getNextStep(...)` + `normalizeAiNextTask(...)`
- **Feature-Flag:** `appConfig.features.enableAiCoachDynamicNextStep` (Env: `VITE_ENABLE_AI_COACH_DYNAMIC_NEXT_STEP`, Default `false`)
- **Readiness-Gate:** `isCoachDynamicNextStepReady()` → `validateCoachPromptAvailability()`
- **Validierung:** `normalizeAiNextTask(...)` + `isCoachTaskMode(...)` + `isSafeTaskPrompt(...)` + PreferredInput-Whitelist.
- **Aktueller Fallback:** Task aus lokalem `taskPlan` bzw. `buildAdaptiveTask(...)`.

### 4) Training Recommendation
- **Prompt-Key:** `coach_training_recommendation`
- **Runtime-Service-Methode:** `coachRuntimeService.getTrainingRecommendation(...)`
- **Feature-Flag:** `appConfig.features.enableAiCoachRecommendations`
- **Readiness-Gate:** `isCoachTrainingRecommendationReady()` → `validateCoachPromptAvailability()`
- **Validierung:** Runtime-Feldvalidierung (`recommendation`, `rationale`, `practice_format`, `time_scope`) + UI-Validierung via `isCalmCoachCopy(...)` und Title→Path-Mapping.
- **Aktueller Fallback:** Lokale Priorisierung `prioritizeTrainingPaths(...)` + lokale Text-Helfer (`getPriorityReason`, `getCoachPresenceLine` etc.).

### 5) Session Completion
- **Prompt-Key:** `coach_session_completion`
- **Runtime-Service-Methode:** `coachRuntimeService.completeSession(...)`
- **Feature-Flag:** `appConfig.features.enableAiCoachCompletion`
- **Readiness-Gate:** `isCoachSessionCompletionReady()` → `validateCoachPromptAvailability()`
- **Validierung:** Runtime validiert `completion_status` Enum + Pflichtfelder; UI sanitisiert über `normalizeCompletionLine(...)` und `normalizeTrainedItems(...)`.
- **Aktueller Fallback:** lokale Completion-Helfer (`buildCompletionCoachLine`, `buildTrainedTodayPoints`, `buildCompletionAssessment`) und statische Completion-Copy.

### 6) Reflection Interpretation
- **Prompt-Key:** `coach_reflection_interpreter`
- **Runtime-Service-Methode:** `coachRuntimeService.interpretReflection(...)`
- **Feature-Flag:** `appConfig.features.enableAiCoachReflection`
- **Readiness-Gate:** `isCoachReflectionReady()` → `validateCoachPromptAvailability()`
- **Validierung:** Runtime validiert `reflection_state` Enum + Pflichtfelder; UI begrenzt Reflection-Fokus über `resolveReflectionFocusSignal(...)`/Allowlist.
- **Aktueller Fallback:** lokale Reflection-Interpretation via `extractReflectionFocus(...)`.

---

## B) Noch lokal/hardcoded

### Lokale Helper (Auswahl)
- Session-Plan/Task-Erzeugung: `buildTaskPlan`, `buildAdaptiveTask`, `buildTaskTransition`
- Next-Step-Feedback: `buildMicroFeedback`
- Presence/Continuity: `getCoachPresenceLine`, `getContinuityMoment`, `buildSessionContinuityIntro`
- Priorisierung: `prioritizeTrainingPaths`, `getPriorityReason`, `getRhythmOrientation`
- Reflection/Memory: `extractReflectionFocus`, `buildReflectionCarryoverLine`, `readSessionMemory`, `writeSessionMemory`
- Completion/Assessment: `buildCompletionCoachLine`, `buildTrainedTodayPoints`, `buildCompletionAssessment`

### Lokale Priorisierung
- Training-Path Ranking und Label-Rewrite in `prioritizeTrainingPaths(...)` (score-basiert, deterministic).

### Lokale Development-/Presence-Logik
- Presence-Line, Continuity-Moment, Path-Personal-Line lokal in `TutorPage`.
- Session-Continuity-Intro lokal in `TutorWorkspace`.

### Lokale Task-/Difficulty-Logik
- Level-basierte Aufgaben- und Übergangserzeugung lokal (`buildAdaptiveTask`, `buildTaskTransition`).
- Delta-Berechnung und Level-Fortschritt aus lokalem Micro-Feedback.

### Lokale Reflection-/Memory-Logik
- Reflection-Focus-Extraktion regex-basiert.
- Session-Memory in `localStorage` (`articlio.coach.path-memory.v1`) inkl. Transfer-Readiness.

### Lokale Completion-/Assessment-Helfer
- Abschluss-Text, Assessment-Label und „Heute trainiert“-Punkte lokal erzeugt.

---

## C) Temporäre Legacy-Fallbacks (explizit)

- `buildTaskPlan` (Session-Plan-Fallback)
- `buildAdaptiveTask` (Dynamic-Task-Fallback)
- `buildTaskTransition` (Transition-Fallback)
- `buildMicroFeedback` (Next-Step-Feedback-Fallback)
- `getPriorityReason` (Recommendation-Rationale-Fallback)
- `getCoachPresenceLine` (Presence-Fallback)
- `getContinuityMoment` / `getPathPersonalLine` (lokale Intro-/Development-Texte)
- lokale Reflection-Interpretation (`extractReflectionFocus`)
- lokale Completion-Builder (`buildCompletionCoachLine`, `buildTrainedTodayPoints`, `buildCompletionAssessment`)
- lokale Priorisierung (`prioritizeTrainingPaths`, `getRhythmOrientation`)

Diese Fallbacks sind weiterhin produktiv relevant, weil mehrere AI-Pfade aktuell per Feature-Flag deaktiviert sind und/oder Readiness-Gates fehlschlagen können.

---

## D) Geplante spätere Runtime-Ownership

### Bleibt lokal/UI
- Rein darstellungsbezogene UI-Komposition (Layout, Komponentenstruktur, UX-Timing).
- Sanitization-/Safety-Guards für Darstellung (`normalize*`, `isCalmCoachCopy`, `isSafeTaskPrompt`) als letzte UI-Sicherheitsstufe.

### Wird AI-owned
- Session-Plan-Generierung
- Next-Step-Coaching inkl. Mikro-Feedback
- Dynamic Next Task Vorschlag
- Training-Recommendation inkl. Reason/Presence/Development-Copy
- Session-Completion-Copy
- Reflection-Interpretation

### Wird entfernt
- Harte Builder/Fallbacks mit inhaltlicher Coach-Entscheidungslogik (siehe Abschnitt C), sobald Runtime vollständig und stabil owns.

### Wird Runtime-Validation
- Prompt-/Output-Kontrakte, Enum-Checks und Feld-Pflichten zentral in Runtime-Service + Prompt-Readiness.

### Wird Runtime-Memory
- Mittelfristig Verlagerung des lokalen Session-Memory (localStorage) in Runtime-/persistente Memory-Strategie.

---

## Readiness- und Flag-Matrix (Kurzüberblick)

| Bereich | Flag | Readiness-Gate | Fallback heute |
|---|---|---|---|
| Session plan | `enableAiCoachSessionPlan` (Env: `VITE_ENABLE_AI_COACH_SESSION_PLAN`, `false`) | `isCoachSessionPlanReady()` | `buildTaskPlan` |
| Next step feedback | `enableAiCoachNextStep` (Env: `VITE_ENABLE_AI_COACH_NEXT_STEP`, `false`) | `isCoachNextStepReady()` | `buildMicroFeedback` |
| Dynamic next task | `enableAiCoachDynamicNextStep` (Env: `VITE_ENABLE_AI_COACH_DYNAMIC_NEXT_STEP`, `false`) | `isCoachDynamicNextStepReady()` | `taskPlan` / `buildAdaptiveTask` |
| Training recommendation | `enableAiCoachRecommendations` | `isCoachTrainingRecommendationReady()` | lokale Priorisierung + Presence/Reason |
| Session completion | `enableAiCoachCompletion` | `isCoachSessionCompletionReady()` | lokale Completion-Builder |
| Reflection interpretation | `enableAiCoachReflection` | `isCoachReflectionReady()` | `extractReflectionFocus` |
