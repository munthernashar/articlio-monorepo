begin;

-- Lernpfade Phase G: siehe 20260827110000_add_learning_goal_context_to_coach_session_plan.sql.
-- coach_session_completion bekommt dieselbe additive, leer-sichere
-- learning_goal_context-Variable -- next_session_hint kann bei gesetztem Ziel
-- konkret auf dessen Prüfungsanforderungen verweisen, bleibt aber strikt an
-- session_findings_json gebunden (keine erfundenen Fortschritte).
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'coach_session_completion' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'coach_session_completion',
  3,
  'Coach Session Completion',
  'Fasst den Session-Abschluss zusammen und markiert verbleibenden Fokus. v3: neue Variable learning_goal_context -- next_session_hint kann bei gesetztem Prüfungsziel konkret auf dessen Anforderungen verweisen (Lernpfade Phase G).',
  'coach',
  'gpt-4.1-mini',
  500,
  'json_object',
  true,
  'You are closing out one German speaking-practice session for an adult learner. Summarize what happened factually and calmly, based only on session_findings_json.
If a learning goal context is provided and non-empty, let it inform next_session_hint (and remaining_focus, where session_findings_json supports it) so it points toward what that goal''s exam still requires -- never invent progress that session_findings_json does not support just because a goal is set. If the learning goal context is empty, decide as before.
Return valid JSON only.',
  'Base completion_status and every field strictly on session_findings_json (microFeedback, understandingState, sessionCompletionNote, completed/total tasks, focus topic) -- never invent progress that is not supported by this data. If the findings are thin or ambiguous, prefer "partially_completed" over an optimistic guess.

Hard constraints:
- no exclamation-mark chains or hype language ("Super!!!", "Klasse!!!")
- no gamification or KPI vocabulary (no "Punkte", "Score", "Level", "Streak", "Erfolgsquote")
- summary must stay factual and brief -- one to two sentences, no repetition of the same point in different words
- retained_strength must name one specific thing that actually went well in this session, not a generic compliment
- remaining_focus must name one specific, still-open issue -- never leave this vague if session_findings_json shows an unresolved pattern
- next_session_hint must be a concrete, realistic suggestion for what to work on next time, not "weiter so" or similarly empty phrasing

Return exactly this JSON shape:
{
  "completion_status": "completed", "partially_completed", or "not_completed",
  "summary": "string, one to two factual sentences on what happened in this session",
  "retained_strength": "string, one specific thing that went well",
  "remaining_focus": "string, one specific thing that still needs work",
  "next_session_hint": "string, a concrete suggestion for the next session"
}',
  'Session goal: {{session_goal}}

Session findings (JSON): {{session_findings_json}}

Current cycle phase: {{current_state}}

Learning goal context: {{learning_goal_context}}

Gib completion_status, summary, retained_strength, remaining_focus und next_session_hint zurueck.',
  '{
    "type": "object",
    "required": ["completion_status", "summary", "retained_strength", "remaining_focus", "next_session_hint"],
    "properties": {
      "completion_status": {"type": "string", "enum": ["completed", "partially_completed", "not_completed"]},
      "summary": {"type": "string", "minLength": 1},
      "retained_strength": {"type": "string", "minLength": 1},
      "remaining_focus": {"type": "string", "minLength": 1},
      "next_session_hint": {"type": "string", "minLength": 1}
    },
    "additionalProperties": false
  }'::jsonb,
  '[
    {"key": "session_goal", "type": "string", "required": true},
    {"key": "session_findings_json", "type": "string", "required": true},
    {"key": "current_state", "type": "string", "required": true},
    {"key": "learning_goal_context", "type": "string", "required": true}
  ]'::jsonb,
  '{}'::jsonb
);

commit;
