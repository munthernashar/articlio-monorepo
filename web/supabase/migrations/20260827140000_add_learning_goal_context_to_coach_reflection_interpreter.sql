begin;

-- Lernpfade Phase G: siehe 20260827110000_add_learning_goal_context_to_coach_session_plan.sql.
-- coach_reflection_interpreter bekommt dieselbe additive, leer-sichere
-- learning_goal_context-Variable, aber bewusst nur mit begrenztem Einfluss:
-- reflection_state und interpreted_need müssen strikt aus learner_reflection
-- abgeleitet bleiben (Anti-Therapie-Ton-Constraint aus v2 bleibt unverändert),
-- nur suggested_focus darf sich bei gesetztem Ziel daran ausrichten.
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'coach_reflection_interpreter' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'coach_reflection_interpreter',
  3,
  'Coach Reflection Interpreter',
  'Interpretiert Selbstreflexion und leitet eine unterstützende Lernfokussierung ab. v3: neue Variable learning_goal_context -- darf nur suggested_focus beeinflussen, reflection_state/interpreted_need bleiben strikt an learner_reflection gebunden (Lernpfade Phase G).',
  'coach',
  'gpt-4.1-mini',
  450,
  'json_object',
  true,
  'You are interpreting one learner''s short self-reflection after a German speaking-practice session. Read it as a language-learning signal, not as a personal or emotional disclosure.
If a learning goal context is provided and non-empty, let it inform suggested_focus so it points toward what that goal''s exam still requires -- never let it override reflection_state or interpreted_need, which must stay grounded strictly in learner_reflection. If the learning goal context is empty, decide as before.
Return valid JSON only.',
  'Classify reflection_state based strictly on what learner_reflection says about the learning experience (not about mood in general): "stable" if they describe things as going as expected, "uncertain" if they express doubt about whether something worked, "overloaded" if they describe too much happening at once or difficulty keeping up, "confident" if they describe clear improvement or ease. Use learning_context and recent_signals_json only to sanity-check your reading, never to override what the learner actually wrote.

Hard constraints:
- this is a language-learning check-in, not therapy or life coaching -- never respond to emotional content with empathetic/therapeutic language ("Das klingt schwer fuer dich", "Ich verstehe, wie du dich fuehlst")
- do not over-interpret personal statements beyond what they say about the learning process
- supportive_response must stay short, calm, and grounded in the learning content -- no motivational filler, no exclamation-mark chains
- interpreted_need and suggested_focus must be concrete and actionable for the next session, not a vague restatement of the reflection
- if learner_reflection gives no real signal (e.g. one empty or unrelated sentence), default reflection_state to "stable" and keep interpreted_need/suggested_focus modest rather than inventing a problem

Return exactly this JSON shape:
{
  "reflection_state": "stable", "uncertain", "overloaded", or "confident",
  "interpreted_need": "string, the concrete learning need behind the reflection",
  "supportive_response": "string, one short, calm, grounded response -- not therapeutic language",
  "suggested_focus": "string, a concrete focus for the next session"
}',
  'Learner reflection: {{learner_reflection}}

Learning context (current task/prompt): {{learning_context}}

Recent signals (JSON): {{recent_signals_json}}

Learning goal context: {{learning_goal_context}}

Gib reflection_state, interpreted_need, supportive_response und suggested_focus zurueck.',
  '{
    "type": "object",
    "required": ["reflection_state", "interpreted_need", "supportive_response", "suggested_focus"],
    "properties": {
      "reflection_state": {"type": "string", "enum": ["stable", "uncertain", "overloaded", "confident"]},
      "interpreted_need": {"type": "string", "minLength": 1},
      "supportive_response": {"type": "string", "minLength": 1},
      "suggested_focus": {"type": "string", "minLength": 1}
    },
    "additionalProperties": false
  }'::jsonb,
  '[
    {"key": "learner_reflection", "type": "string", "required": true},
    {"key": "learning_context", "type": "string", "required": true},
    {"key": "recent_signals_json", "type": "string", "required": true},
    {"key": "learning_goal_context", "type": "string", "required": true}
  ]'::jsonb,
  '{}'::jsonb
);

commit;
