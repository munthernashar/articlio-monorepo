-- Launch-Readiness-Audit, Befund K (P0 #3, docs/daf-cefr-prompt-audit-2026-05-06.md):
-- "Evidenz-Qualität um Performanzbedingungen erweitern" -- Tagging von
-- Sprechmodus (Dialog/Monolog), Spontaneität, Aufgabenkomplexität und
-- Registerdruck je stabilem Muster, plus ein Konsistenz-Zaehler ueber die
-- unterstuetzenden Sessions. src/services/supabase/multi-session-pattern.service.ts
-- (evaluateFocusEvidence) nutzt consistent_condition_count >= 2 als hartes
-- Gate fuer Fokus-Aktivierung.
--
-- Deaktiviert v2, fuegt v3 mit erweitertem Schema/Prompt ein.

update public.prompt_definitions
set is_active = false
where prompt_key = 'multi_session_pattern_detection' and version = 2 and is_active = true;

insert into public.prompt_definitions (
  prompt_key,
  version,
  is_active,
  model,
  max_output_tokens,
  response_format,
  name,
  description,
  category,
  prompt_variables_definition_json,
  metadata,
  system_prompt,
  developer_prompt,
  user_prompt_template,
  expected_output_schema_json
)
values (
  'multi_session_pattern_detection',
  3,
  true,
  'gpt-4.1-mini',
  1500,
  'json_object',
  'Multi Session Pattern Detection',
  'Erkennt stabile Lernmuster über mehrere Sessions hinweg. v3: Performanzbedingungen (Sprechmodus, Spontaneität, Aufgabenkomplexität, Registerdruck) je Muster ergänzt (Launch-Readiness-Audit Befund K, P0 #3).',
  'multi',
  '[{"key": "session_analyses_json", "type": "string", "required": true}, {"key": "session_count", "type": "string", "required": true}, {"key": "min_sessions_for_diagnosis", "type": "string", "required": true}]'::jsonb,
  '{"fix_reason": "befund_k_p0_3_performance_conditions", "supersedes_version": 2}'::jsonb,
  'You are a longitudinal language learning analyst for spoken German development. Your task is to identify stable recurring learner patterns across multiple sessions. Return valid JSON only.',
  'You will receive multiple analyzed learner sessions, each with its own detected_patterns.
Identify only patterns that are stable enough across sessions to matter instructionally.

Rules:
- prefer recurring patterns over isolated mistakes
- reuse pattern_key values from the input sessions'' detected_patterns where the same issue recurs; only introduce a new pattern_key if no existing one fits
- consider frequency, consistency, and communicative impact
- if there is not enough data to identify any stable pattern, set enough_data to false and return an empty stable_patterns array

PERFORMANCE CONDITIONS (REQUIRED, Launch-Readiness-Audit Befund K, P0 #3):

For every entry in stable_patterns, also assess performance_conditions -- the task/communication conditions under which the pattern was observed across the supporting_sessions:
- speech_mode: "dialog" (interactive exchange), "monolog" (extended single-speaker turns), or "mixed" if both occur meaningfully across the supporting sessions
- spontaneity: "spontaneous" (unplanned, real-time), "prepared" (rehearsed/read/pre-planned), or "mixed"
- task_complexity: "low", "medium", or "high" -- how demanding the communicative task was (topic abstractness, vocabulary range required, structural demands)
- register_pressure: "low", "medium", or "high" -- how much the situation demanded formal/careful register versus casual speech
- consistent_condition_count: integer 0-4 -- count how many of the four dimensions above showed essentially the SAME value across all supporting_sessions (i.e. the pattern was not just observed once under one specific condition, but recurs under a stable combination of conditions). 0 means the conditions varied on every dimension; 4 means all four were consistent.

Do not inflate consistent_condition_count -- if you only have one supporting session, or the sessions clearly differ in speech mode/spontaneity/complexity/register, count only what is genuinely consistent.

Return exactly this JSON shape:
{
  "enough_data": true or false,
  "stable_patterns": [
    {
      "pattern_key": "string, matches or extends a pattern_key seen in the input",
      "label": "string, short human-readable name",
      "description": "string, what the pattern looks like in practice",
      "recurrence": "0.0-1.0",
      "confidence": "0.0-1.0",
      "supporting_sessions": ["session_id", "..."],
      "communicative_impact": "low, medium, or high",
      "evidence": ["short quote or paraphrase from the transcripts", "..."],
      "performance_conditions": {
        "speech_mode": "dialog, monolog, or mixed",
        "spontaneity": "spontaneous, prepared, or mixed",
        "task_complexity": "low, medium, or high",
        "register_pressure": "low, medium, or high",
        "consistent_condition_count": "integer 0-4"
      }
    }
  ]
}

All fields are required for every entry in stable_patterns, including performance_conditions with all five of its sub-fields. If enough_data is false, stable_patterns must be an empty array, never omitted.',
  'Analyzed sessions ({{session_count}} total, minimum {{min_sessions_for_diagnosis}} required for diagnosis):
{{session_analyses_json}}',
  '{
    "type": "object",
    "required": ["enough_data", "stable_patterns"],
    "properties": {
      "enough_data": {"type": "boolean"},
      "stable_patterns": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["pattern_key", "label", "description", "recurrence", "confidence", "supporting_sessions", "communicative_impact", "evidence", "performance_conditions"],
          "properties": {
            "label": {"type": "string", "minLength": 1},
            "evidence": {"type": "array", "items": {"type": "string"}},
            "confidence": {"type": "number", "maximum": 1, "minimum": 0},
            "recurrence": {"type": "number", "maximum": 1, "minimum": 0},
            "description": {"type": "string", "minLength": 1},
            "pattern_key": {"type": "string", "minLength": 1},
            "supporting_sessions": {"type": "array", "items": {"type": "string"}},
            "communicative_impact": {"enum": ["low", "medium", "high"], "type": "string"},
            "performance_conditions": {
              "type": "object",
              "required": ["speech_mode", "spontaneity", "task_complexity", "register_pressure", "consistent_condition_count"],
              "properties": {
                "speech_mode": {"type": "string", "enum": ["dialog", "monolog", "mixed"]},
                "spontaneity": {"type": "string", "enum": ["spontaneous", "prepared", "mixed"]},
                "task_complexity": {"type": "string", "enum": ["low", "medium", "high"]},
                "register_pressure": {"type": "string", "enum": ["low", "medium", "high"]},
                "consistent_condition_count": {"type": "integer", "minimum": 0, "maximum": 4}
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        }
      }
    },
    "additionalProperties": false
  }'::jsonb
);
