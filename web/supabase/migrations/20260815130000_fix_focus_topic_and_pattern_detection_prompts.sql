begin;

-- Launch-Readiness-Audit, Befund L: focus_topic_selector und
-- multi_session_pattern_detection (v1) verwendeten Variablennamen und ein
-- Ausgabeformat, die nicht zu dem passen, was der Code tatsächlich sendet
-- bzw. parst (parseFocusTopicSelectorOutput / parseMultiSessionPatternOutput
-- in src/services/supabase/multi-session-pattern.service.ts). Jeder Aufruf
-- hätte am clientseitigen PromptRenderer scheitern müssen
-- ("Fehlende Prompt-Variablen: ..."), noch bevor OpenAI überhaupt erreicht
-- wird. v1 bleibt zur Historie erhalten, wird aber deaktiviert.

update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key in ('focus_topic_selector', 'multi_session_pattern_detection')
  and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values
(
  'focus_topic_selector',
  2,
  'Focus Topic Selector',
  'Wählt genau ein Fokus-Thema aus stabilen Lernmustern. v2: Variablennamen und Ausgabeformat auf parseFocusTopicSelectorOutput ausgerichtet (Befund L, Launch-Readiness-Audit 2026-08-15).',
  'focus',
  'gpt-4.1-mini',
  900,
  'json_object',
  true,
  'You are a pedagogical decision engine for a German speaking coach app. Choose exactly one focus topic for the next intervention. Return valid JSON only.',
  'Choose one and only one focus topic.

Selection criteria:
- recurring pattern
- high communicative value
- learner readiness
- not too broad
- explainable in a short dialog
- measurable in future spontaneous speech

Avoid:
- selecting multiple topics
- choosing vague goals
- choosing issues with weak evidence

Decide selection_status first: "selected" only if the evidence clearly supports one focus topic, otherwise "insufficient_evidence".

Return exactly this JSON shape:
{
  "selection_status": "selected" or "insufficient_evidence",
  "reason": "string, 1-2 sentences explaining the decision",
  "evidence_summary": {
    "sessions_analyzed": integer,
    "strongest_pattern_key": "string or null",
    "recurrence": "0.0-1.0",
    "confidence": "0.0-1.0",
    "communicative_impact": "low, medium, high, or null",
    "learner_readiness": "0.0-1.0"
  },
  "focus_topic": null when selection_status is "insufficient_evidence", otherwise an object with:
    "topic_key": "string, stable machine-readable key, never the literal insufficient_evidence",
    "label": "string, short human-readable name",
    "short_explanation": "string, 1-2 sentences",
    "reason": "string, why this topic now",
    "source_pattern_key": "string, must match a pattern_key from the stable learner patterns input"
}

evidence_summary is always required. When selection_status is "insufficient_evidence", focus_topic MUST be null, never an object.',
  'Stable learner patterns:
{{stable_patterns_json}}

Number of sessions analyzed: {{session_count}}
Minimum sessions required for diagnosis: {{min_sessions_for_diagnosis}}',
  '{"type":"object","required":["selection_status","reason","evidence_summary","focus_topic"],"properties":{"selection_status":{"type":"string","enum":["selected","insufficient_evidence"]},"reason":{"type":"string","minLength":1},"evidence_summary":{"type":"object","required":["sessions_analyzed","strongest_pattern_key","recurrence","confidence","communicative_impact","learner_readiness"],"properties":{"sessions_analyzed":{"type":"integer","minimum":0},"strongest_pattern_key":{"type":["string","null"]},"recurrence":{"type":"number","minimum":0,"maximum":1},"confidence":{"type":"number","minimum":0,"maximum":1},"communicative_impact":{"type":["string","null"],"enum":["low","medium","high",null]},"learner_readiness":{"type":"number","minimum":0,"maximum":1}},"additionalProperties":false},"focus_topic":{"anyOf":[{"type":"null"},{"type":"object","required":["topic_key","label","short_explanation","reason","source_pattern_key"],"properties":{"topic_key":{"type":"string","minLength":1},"label":{"type":"string","minLength":1},"short_explanation":{"type":"string","minLength":1},"reason":{"type":"string","minLength":1},"source_pattern_key":{"type":"string","minLength":1}},"additionalProperties":false}]}},"additionalProperties":false}'::jsonb,
  '[{"key":"stable_patterns_json","type":"string","required":true},{"key":"session_count","type":"string","required":true},{"key":"min_sessions_for_diagnosis","type":"string","required":true}]'::jsonb,
  jsonb_build_object('fix_reason', 'befund_l_variable_and_schema_mismatch', 'fixed_at', timezone('utc', now()), 'supersedes_version', 1)
),
(
  'multi_session_pattern_detection',
  2,
  'Multi Session Pattern Detection',
  'Erkennt stabile Lernmuster über mehrere Sessions hinweg. v2: Variablennamen und Ausgabeformat auf parseMultiSessionPatternOutput ausgerichtet (Befund L, Launch-Readiness-Audit 2026-08-15).',
  'multi',
  'gpt-4.1-mini',
  1200,
  'json_object',
  true,
  'You are a longitudinal language learning analyst for spoken German development. Your task is to identify stable recurring learner patterns across multiple sessions. Return valid JSON only.',
  'You will receive multiple analyzed learner sessions, each with its own detected_patterns.
Identify only patterns that are stable enough across sessions to matter instructionally.

Rules:
- prefer recurring patterns over isolated mistakes
- reuse pattern_key values from the input sessions'' detected_patterns where the same issue recurs; only introduce a new pattern_key if no existing one fits
- consider frequency, consistency, and communicative impact
- if there is not enough data to identify any stable pattern, set enough_data to false and return an empty stable_patterns array

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
      "evidence": ["short quote or paraphrase from the transcripts", "..."]
    }
  ]
}

All fields are required for every entry in stable_patterns. If enough_data is false, stable_patterns must be an empty array, never omitted.',
  'Analyzed sessions ({{session_count}} total, minimum {{min_sessions_for_diagnosis}} required for diagnosis):
{{session_analyses_json}}',
  '{"type":"object","required":["enough_data","stable_patterns"],"properties":{"enough_data":{"type":"boolean"},"stable_patterns":{"type":"array","items":{"type":"object","required":["pattern_key","label","description","recurrence","confidence","supporting_sessions","communicative_impact","evidence"],"properties":{"pattern_key":{"type":"string","minLength":1},"label":{"type":"string","minLength":1},"description":{"type":"string","minLength":1},"recurrence":{"type":"number","minimum":0,"maximum":1},"confidence":{"type":"number","minimum":0,"maximum":1},"supporting_sessions":{"type":"array","items":{"type":"string"}},"communicative_impact":{"type":"string","enum":["low","medium","high"]},"evidence":{"type":"array","items":{"type":"string"}}},"additionalProperties":false}}},"additionalProperties":false}'::jsonb,
  '[{"key":"session_analyses_json","type":"string","required":true},{"key":"session_count","type":"string","required":true},{"key":"min_sessions_for_diagnosis","type":"string","required":true}]'::jsonb,
  jsonb_build_object('fix_reason', 'befund_l_variable_and_schema_mismatch', 'fixed_at', timezone('utc', now()), 'supersedes_version', 1)
);

commit;
