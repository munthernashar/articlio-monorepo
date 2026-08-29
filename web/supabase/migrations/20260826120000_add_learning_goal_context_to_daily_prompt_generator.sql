begin;

-- Lernpfade Phase C (26.08.2026): daily_prompt_generator bekommt eine neue,
-- optionale Variable learning_goal_context (aus learning_goal_catalog
-- zusammengesetzter Text, leer wenn kein Lernziel gewählt ist). Bei gesetztem
-- Ziel bevorzugt der generierte Gesprächseinstieg Szenarien, die direkt auf
-- das Ziel einzahlen (z. B. Anamnese-Gespräch bei einem medizinischen
-- Fachsprach-Ziel, Übergabegespräch bei einem Pflege-Ziel). Ohne Ziel bleibt
-- das Verhalten exakt wie in v6 (leerer String -> keine zusätzliche Weisung).
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'daily_prompt_generator' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'daily_prompt_generator',
  7,
  'Daily Prompt Generator',
  'Generiert einen personalisierten Gesprächseinstieg samt Anschlussfragen für den Session-Start-Dialog. v7: neue Variable learning_goal_context -- bei gesetztem Prüfungsziel richtet sich das Szenario danach aus.',
  'engagement',
  'gpt-4.1-mini',
  700,
  'json_object',
  true,
  'You are a warm, attentive conversation partner for adult German learners living in Germany.
Generate one natural, motivating speaking prompt for a daily speaking session, framed as a direct question to the learner (not a topic label).
Also generate 2-3 short, natural follow-up questions a real conversation partner might ask if the learner pauses mid-answer -- these deepen the SAME topic, they do not change subject.
The rationale sentence must speak about the TOPIC, never about the prompt itself: start it with "Dieses Thema passt ..." (never "Dieser Prompt passt ..." or any other phrasing that refers to "der Prompt").
If a learning goal context is provided and non-empty, prefer a topic, scenario and vocabulary that directly rehearses what that goal''s exam requires (e.g. a patient handover scenario for a nursing-German goal, an authority-office scenario for an integration exam, a doctor-patient anamnesis scenario for a medical-German goal) instead of a generic everyday topic. If the learning goal context is empty, choose the topic as before, based only on the focus topic and recent signal.
Return valid JSON only.',
  '',
  'Current focus topic: {{focus_topic_title}}
Learner''s German level: {{german_level}}
Recent signal: {{recent_signal}}
Learning goal context: {{learning_goal_context}}',
  '{
    "type": "object",
    "required": ["title", "prompt_text", "rationale", "difficulty", "follow_up_questions"],
    "properties": {
      "title": {"type": "string", "minLength": 1, "description": "Short topic label (3-6 words), used as the session title."},
      "prompt_text": {"type": "string", "minLength": 1, "description": "The actual opening question, addressed directly to the learner, in German."},
      "rationale": {"type": "string", "minLength": 1, "description": "One short sentence, in German, explaining why this TOPIC fits the learner today. Must start with \"Dieses Thema passt ...\"."},
      "difficulty": {"type": "string", "minLength": 1},
      "follow_up_questions": {
        "type": "array",
        "minItems": 2,
        "maxItems": 3,
        "items": {"type": "string", "minLength": 1},
        "description": "Short natural follow-up questions in German, same topic, for use if the learner pauses while speaking."
      }
    },
    "additionalProperties": false
  }'::jsonb,
  '[
    {"key": "focus_topic_title", "type": "string", "required": true},
    {"key": "german_level", "type": "string", "required": true},
    {"key": "recent_signal", "type": "string", "required": true},
    {"key": "learning_goal_context", "type": "string", "required": true}
  ]'::jsonb,
  '{}'::jsonb
);

commit;
