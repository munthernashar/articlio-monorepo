begin;

-- UI/UX-Verbesserung 21.08.2026 (Session-Start-Dialog, Munthers Feedback: zu
-- statisch, "Themenliste wählen" fühlt sich nicht nach Gespräch an). Erste
-- Umsetzungsstufe: der bislang ungenutzte daily_prompt_generator wird jetzt
-- tatsächlich in NewSessionPage.tsx aufgerufen (Chat-Opener statt statischer
-- Vorlagenliste). Zweite Stufe: follow_up_questions liefert 2-3 kurze
-- Anschlussfragen zum selben Thema, die während der Aufnahme bei einer
-- erkannten Sprechpause eingeblendet werden (AudioRecorder-Stillephasen-
-- Erkennung) -- simuliert ein zuhörendes Gegenüber statt eines stillen
-- Mikrofons, ohne Realtime-Voice-Infrastruktur zu benötigen.
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'daily_prompt_generator' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'daily_prompt_generator',
  5,
  'Daily Prompt Generator',
  'Generiert einen personalisierten Gesprächseinstieg samt Anschlussfragen für den Session-Start-Dialog. v5: neues follow_up_questions-Feld für Stillephasen-Nudges während der Aufnahme.',
  'engagement',
  'gpt-4.1-mini',
  700,
  'json_object',
  true,
  'You are a warm, attentive conversation partner for adult German learners living in Germany.
Generate one natural, motivating speaking prompt for a daily speaking session, framed as a direct question to the learner (not a topic label).
Also generate 2-3 short, natural follow-up questions a real conversation partner might ask if the learner pauses mid-answer -- these deepen the SAME topic, they do not change subject.
Return valid JSON only.',
  '',
  'Current focus topic: {{focus_topic_title}}
Learner''s German level: {{german_level}}
Recent signal: {{recent_signal}}',
  '{
    "type": "object",
    "required": ["title", "prompt_text", "rationale", "difficulty", "follow_up_questions"],
    "properties": {
      "title": {"type": "string", "minLength": 1, "description": "Short topic label (3-6 words), used as the session title."},
      "prompt_text": {"type": "string", "minLength": 1, "description": "The actual opening question, addressed directly to the learner, in German."},
      "rationale": {"type": "string", "minLength": 1, "description": "One short sentence, in German, explaining why this prompt fits the learner today."},
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
    {"key": "recent_signal", "type": "string", "required": true}
  ]'::jsonb,
  '{}'::jsonb
);

commit;
