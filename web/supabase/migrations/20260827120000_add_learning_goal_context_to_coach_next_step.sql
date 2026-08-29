begin;

-- Lernpfade Phase G: siehe 20260827110000_add_learning_goal_context_to_coach_session_plan.sql.
-- coach_next_step steuert den laufenden Turn-für-Turn-Coaching-Schritt -- bekommt
-- dieselbe additive, leer-sichere learning_goal_context-Variable, damit die
-- Zielausrichtung nicht nur beim Session-Start (coach_session_plan), sondern über
-- die ganze Session hinweg erhalten bleibt.
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'coach_next_step' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'coach_next_step',
  3,
  'Coach Next Step',
  'Bestimmt den nächsten didaktischen Schritt im laufenden Session-Verlauf. v3: neue Variable learning_goal_context -- bei gesetztem Prüfungsziel bleibt die Zielausrichtung über die ganze Session erhalten, nicht nur beim Start (Lernpfade Phase G).',
  'coach',
  'gpt-4.1-mini',
  550,
  'json_object',
  true,
  'You are a live speaking coach guiding one micro-step at a time for an adult German learner. Decide the single next coaching step based on what the learner just said.
If a learning goal context is provided and non-empty, let it bias which step_type and next_task you pick toward what that goal''s exam requires (e.g. push toward patient-handover phrasing for a nursing-German goal, toward authority-office register for an integration exam) -- but never at the expense of directly responding to what the learner actually just said in learner_turn. If the learning goal context is empty, decide as before, based only on learner_turn and context_json.
Return valid JSON only.',
  'Read learner_turn together with context_json (recent dialogue history, current task, session memory) and decide exactly one next step -- never propose several steps at once. step_type must reflect what the learner actually needs right now: "clarify" if their last turn shows confusion or a direct question, "practice" to continue the current task type, "transfer" to move the pattern into a new, freer context, "review" to briefly revisit something from earlier in the session. coach_message is what the coach says out loud next; learner_action is the concrete thing the learner should now do; reason is a short internal justification, not shown to the learner.

Hard constraints:
- never phrase coach_message as an open chat invitation ("Erzaehl mir irgendwas...", "Frag mich alles...") -- it must point at one concrete task
- never use assistant/chatbot phrasing ("Als KI...", "Ich helfe dir gerne...")
- coach_message must directly reference what the learner just said in learner_turn, not restart the topic from scratch
- if you include "next_task", its "mode" must be exactly one of: connect, fill_connector, rephrase, free_response, daily_situation, explain_cause, contrast, continue_dialogue, and "preferredInput" must be exactly "text", "voice", or "mixed" -- set next_task to null if you are not proposing a new task

Return exactly this JSON shape:
{
  "step_type": "clarify", "practice", "transfer", or "review",
  "coach_message": "string, what the coach says next, grounded in learner_turn",
  "learner_action": "string, the concrete next action for the learner",
  "reason": "string, short internal justification",
  "followup_question": null, or a string, a short question to ask if useful,
  "next_task": null, or an object with "mode" (one of the 8 allowed values), "prompt" (string), "preferredInput" ("text", "voice", or "mixed")
}',
  'Session goal: {{session_goal}}

Learner''s last turn: {{learner_turn}}

Context (JSON: recent dialogue, current task, session memory): {{context_json}}

Learning goal context: {{learning_goal_context}}

Gib step_type, coach_message, learner_action und reason zurueck. Ergaenze followup_question und next_task nur, wenn sinnvoll -- sonst null.',
  '{
    "type": "object",
    "required": ["step_type", "coach_message", "learner_action", "reason", "followup_question", "next_task"],
    "properties": {
      "step_type": {"type": "string", "enum": ["clarify", "practice", "transfer", "review"]},
      "coach_message": {"type": "string", "minLength": 1},
      "learner_action": {"type": "string", "minLength": 1},
      "reason": {"type": "string", "minLength": 1},
      "followup_question": {"type": ["string", "null"]},
      "next_task": {
        "type": ["object", "null"],
        "required": ["mode", "prompt", "preferredInput"],
        "properties": {
          "mode": {"type": "string", "enum": ["connect", "fill_connector", "rephrase", "free_response", "daily_situation", "explain_cause", "contrast", "continue_dialogue"]},
          "prompt": {"type": "string", "minLength": 1},
          "preferredInput": {"type": "string", "enum": ["text", "voice", "mixed"]}
        },
        "additionalProperties": false
      }
    },
    "additionalProperties": false
  }'::jsonb,
  '[
    {"key": "session_goal", "type": "string", "required": true},
    {"key": "learner_turn", "type": "string", "required": true},
    {"key": "context_json", "type": "string", "required": true},
    {"key": "learning_goal_context", "type": "string", "required": true}
  ]'::jsonb,
  '{}'::jsonb
);

commit;
