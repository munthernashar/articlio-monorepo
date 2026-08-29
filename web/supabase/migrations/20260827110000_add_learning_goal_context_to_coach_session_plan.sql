begin;

-- Lernpfade Phase G (27.08.2026): Munthers Vorgabe, dass die Lernziel-Integration
-- "kein Insellösung" bleiben darf -- bislang kannten nur daily_prompt_generator und
-- session_analysis das gewählte Lernziel (Phase C), der komplette Coach/Tutor-Flow
-- (Pro-exklusiv) lief unverändert generisch weiter, selbst wenn z. B. "Fachsprachprüfung
-- Ärzte" gesetzt war. coach_session_plan bekommt dieselbe additive, leer-sichere
-- learning_goal_context-Variable wie die beiden Phase-C-Prompts: bei gesetztem Ziel
-- richten sich die 5 Session-Tasks nach dessen Prüfungsanforderungen aus, bei leerem
-- Kontext (kein Ziel gewählt) bleibt das Verhalten exakt wie in v2.
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'coach_session_plan' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'coach_session_plan',
  3,
  'Coach Session Plan',
  'Erstellt einen strukturierten Plan für die aktuelle Coach-Session. v3: neue Variable learning_goal_context -- bei gesetztem Prüfungsziel (z. B. Fachsprachprüfung Ärzte, Pflege B1-B2) richten sich die 5 Tasks nach dessen Anforderungen statt nach generischer Satzverknüpfung (Lernpfade Phase G, "kein Insellösung").',
  'coach',
  'gpt-4.1-mini',
  700,
  'json_object',
  true,
  'You are a session planning engine for a German speaking-practice coach. Design one short practice session plan for one focus topic.
If a learning goal context is provided and non-empty, calibrate the 5 tasks toward what that goal''s exam actually requires (e.g. patient-handover phrasing for a nursing-German goal, an authority-office scenario for an integration exam, doctor-patient anamnesis structure for a medical-German goal) instead of generic connector practice. If the learning goal context is empty, plan as before, based only on focus_topic, learner_level and observed_patterns_json.
Return valid JSON only.',
  'Build a session plan of exactly 5 short speaking tasks around focus_topic, using learner_level and observed_patterns_json to calibrate difficulty and recent_notes for continuity with the learner''s last reflection. Order the 5 tasks with a logical progression (e.g. from guided/connect tasks toward freer/transfer tasks).

Hard constraints (the app discards any task that violates these, which can break the whole session):
- each task''s "mode" must be exactly one of: connect, fill_connector, rephrase, free_response, daily_situation, explain_cause, contrast, continue_dialogue
- each task must include a non-empty "prompt" (the actual speaking prompt shown to the learner) and a non-empty "transition" (a short spoken bridge line into the task)
- "preferredInput" must be exactly "text", "voice", or "mixed"
- no gamification or KPI vocabulary anywhere (no "Punkte", "Level", "Streak", "Erfolg")
- objective and success_signal must describe learning, not scores or completion percentages
- if observed_patterns_json is empty, plan a solid general practice session for focus_topic instead of inventing patterns that are not there

Return exactly this JSON shape:
{
  "objective": "string, the concrete learning objective for this session",
  "priorities": ["string", ...], 1 to 3 entries, the specific things this session should achieve,
  "session_focus": "string, one sentence naming what stays constant across the 5 tasks",
  "success_signal": "string, one concrete, observable sign that the session worked",
  "tasks": [
    { "mode": "one of the 8 allowed values", "prompt": "string, the speaking prompt", "transition": "string, short spoken bridge line", "preferredInput": "text, voice, or mixed" }
  ], exactly 5 entries
}',
  'Learner level: {{learner_level}}
Focus topic: {{focus_topic}}
Observed patterns (JSON): {{observed_patterns_json}}
Recent reflection notes: {{recent_notes}}
Learning goal context: {{learning_goal_context}}

Gib objective, priorities, session_focus, success_signal und genau 5 tasks zurueck.',
  '{
    "type": "object",
    "required": ["objective", "priorities", "session_focus", "success_signal", "tasks"],
    "properties": {
      "objective": {"type": "string", "minLength": 1},
      "priorities": {"type": "array", "items": {"type": "string", "minLength": 1}, "minItems": 1, "maxItems": 3},
      "session_focus": {"type": "string", "minLength": 1},
      "success_signal": {"type": "string", "minLength": 1},
      "tasks": {
        "type": "array",
        "minItems": 5,
        "maxItems": 5,
        "items": {
          "type": "object",
          "required": ["mode", "prompt", "transition", "preferredInput"],
          "properties": {
            "mode": {"type": "string", "enum": ["connect", "fill_connector", "rephrase", "free_response", "daily_situation", "explain_cause", "contrast", "continue_dialogue"]},
            "prompt": {"type": "string", "minLength": 1},
            "transition": {"type": "string", "minLength": 1},
            "preferredInput": {"type": "string", "enum": ["text", "voice", "mixed"]}
          },
          "additionalProperties": false
        }
      }
    },
    "additionalProperties": false
  }'::jsonb,
  '[
    {"key": "learner_level", "type": "string", "required": true},
    {"key": "focus_topic", "type": "string", "required": true},
    {"key": "observed_patterns_json", "type": "string", "required": true},
    {"key": "recent_notes", "type": "string", "required": true},
    {"key": "learning_goal_context", "type": "string", "required": true}
  ]'::jsonb,
  '{}'::jsonb
);

commit;
