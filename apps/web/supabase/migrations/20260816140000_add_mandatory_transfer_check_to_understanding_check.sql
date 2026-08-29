-- Launch-Readiness-Audit, Befund K (P1 #5, docs/daf-cefr-prompt-audit-2026-05-06.md):
-- "verpflichtender Transfer-Check" -- "sufficient" darf erst nach
-- nachgewiesenem Re-Use unter leicht variierter Bedingung vergeben werden,
-- nicht schon nach einer reinen Checkfrage. src/services/supabase/tutor.service.ts
-- (parseUnderstandingCheckOutput) stuft "sufficient" ohne echten
-- transfer_evidence-Nachweis zur Laufzeit hart auf "partial" herunter -- das
-- Prompt-Update hier reduziert nur, wie oft dieser Fall überhaupt eintritt.
--
-- Deaktiviert v2, fuegt v3 mit erweitertem Schema/Prompt ein.

update public.prompt_definitions
set is_active = false
where prompt_key = 'understanding_check' and version = 2 and is_active = true;

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
  'understanding_check',
  3,
  true,
  'gpt-4.1-mini',
  800,
  'json_object',
  'Understanding Check',
  'Prüft das Verständnis im Tutor-Dialog. v3: verpflichtender Transfer-Check vor "sufficient" ergänzt (Launch-Readiness-Audit Befund K, P1 #5).',
  'understanding',
  '[{"key": "topic_title", "type": "string", "required": true}, {"key": "topic_description", "type": "string", "required": true}, {"key": "explanation_text", "type": "string", "required": true}, {"key": "dialogue_json", "type": "string", "required": true}, {"key": "tutor_language", "type": "string", "required": true}, {"key": "feedback_hardness", "type": "string", "required": true}]'::jsonb,
  '{"fix_reason": "befund_k_p1_5_mandatory_transfer_check", "supersedes_version": 2}'::jsonb,
  'You are an instructional checker for a German speaking coach app. Assess whether the learner appears to understand the current focus topic. Return valid JSON only.',
  'Use the dialogue so far to judge whether the learner understands the current focus topic. Judge understanding cautiously -- prefer "partial" over "sufficient" when in doubt.

MANDATORY TRANSFER CHECK (Launch-Readiness-Audit Befund K, P1 #5):

Do not award "sufficient" merely because the learner answered a comprehension question correctly or restated an explanation. "sufficient" requires evidence of actual RE-USE of the target structure/pattern under a SLIGHTLY VARIED context (a different topic, a different tense/person, a spontaneous reformulation) -- not a verbatim repeat of the explanation''s own example.

Look at the dialogue for a moment where the learner produced the target structure themselves, in a context that differs even slightly from how it was first presented. If you find that:
- set transfer_evidence.reuse_demonstrated to true
- set transfer_evidence.context_variation to a short description of HOW the context varied from the original explanation (e.g. "wandte die Regel auf ein neues Zeitverhältnis an statt das Beispiel zu wiederholen")

If the dialogue does NOT yet contain such re-use (the learner has only answered a check question, agreed, or repeated the given example):
- set transfer_evidence.reuse_demonstrated to false
- set transfer_evidence.context_variation to an empty string
- do NOT set status to "sufficient" in this case -- use "partial" or "not_yet" instead, and let next_step ask for exactly this: a spontaneous re-use in a new context

Return exactly this JSON shape:
{
  "status": "not_yet", "partial", or "sufficient",
  "feedback": "string, short, concrete feedback on where the learner stands",
  "next_step": "clarification" or "transfer_ready" -- use "transfer_ready" only when status is "sufficient", otherwise "clarification",
  "redirected_to_focus": true or false, whether you had to steer the check back to the focus topic,
  "transfer_evidence": {
    "reuse_demonstrated": true or false,
    "context_variation": "string, empty if reuse_demonstrated is false"
  }
}',
  'Focus topic: {{topic_title}}
Description: {{topic_description}}
Prior explanation: {{explanation_text}}
Dialogue so far (JSON): {{dialogue_json}}
Tutor language: {{tutor_language}}
Feedback hardness: {{feedback_hardness}}',
  '{
    "type": "object",
    "required": ["status", "feedback", "next_step", "redirected_to_focus", "transfer_evidence"],
    "properties": {
      "status": {"enum": ["not_yet", "partial", "sufficient"], "type": "string"},
      "feedback": {"type": "string", "minLength": 1},
      "next_step": {"enum": ["clarification", "transfer_ready"], "type": "string"},
      "redirected_to_focus": {"type": "boolean"},
      "transfer_evidence": {
        "type": "object",
        "required": ["reuse_demonstrated", "context_variation"],
        "properties": {
          "reuse_demonstrated": {"type": "boolean"},
          "context_variation": {"type": "string"}
        },
        "additionalProperties": false
      }
    },
    "additionalProperties": false
  }'::jsonb
);
