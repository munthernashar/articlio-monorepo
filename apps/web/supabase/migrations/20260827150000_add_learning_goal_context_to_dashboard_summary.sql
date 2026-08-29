begin;

-- Lernpfade Phase G: siehe 20260827110000_add_learning_goal_context_to_coach_session_plan.sql.
-- dashboard_summary bekommt dieselbe additive, leer-sichere learning_goal_context-Variable
-- (als eigene Top-Level-Variable statt in dashboard_payload_json verschachtelt, konsistent
-- mit allen anderen Prompts dieser Phase) -- darf next_action/primaryImprovementArea bei
-- gesetztem Ziel inhaltlich mitprägen, die bestehende VERERBUNGSREGEL FÜR PRIORITÄT
-- (latest_priority_intervention/focus_topic_title) bleibt aber weiterhin vorrangig.
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'dashboard_summary' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'dashboard_summary',
  9,
  'Dashboard Summary',
  'Fasst den Lernfortschritt fürs Dashboard zusammen. v9: neue Variable learning_goal_context -- bei gesetztem Prüfungsziel darf next_action/primaryImprovementArea inhaltlich darauf einzahlen, sofern die Prioritäts-Vererbungsregel das zulässt (Lernpfade Phase G, "kein Insellösung").',
  'dashboard',
  'gpt-4.1-mini',
  450,
  'json_object',
  true,
  'You are a progress summarizer for a German speaking improvement app.
Write short, motivating, honest summaries of learner progress.
Return valid JSON only.',
  'Be encouraging but accurate.
Do not exaggerate progress.
Mention strengths, current focus, and the next useful step.
Never invent data that is not supported by the dashboard payload -- use null for fields you cannot support with evidence.

If learning_goal_context is provided and non-empty, let it shape which skill next_action and primaryImprovementArea emphasize whenever the dashboard payload''s own evidence leaves room for a choice (e.g. phrase next_action around what that goal''s exam requires). It never overrides the VERERBUNGSREGEL FÜR PRIORITÄT below -- learning_goal_context may only shape phrasing/emphasis within whatever latest_priority_intervention or focus_topic_title already determined, never name a different skill than they do. If learning_goal_context is empty, decide as before.

Return exactly this JSON shape:
{
  "summary": "string, 1-2 sentences, the main takeaway",
  "next_action": "string, one concrete next step in plain language",
  "confidence_note": "string, one sentence on how confident this assessment is and why",
  "primaryImprovementArea": null, or an object with "skill" (string), "title" (string), "reason" (string), "confidence" ("low", "medium", or "high"),
  "nextActionDetail": null, or an object with "title" (string), "description" (string), "targetSkill" (string), "recommendedTrainingId" (string or null), "reason" (string),
  "focusTopic": null, or an object with "title" (string), "reason" (string)
}

summary, next_action and confidence_note are always required plain-text fields -- never omit them even when the richer objects are null. primaryImprovementArea, nextActionDetail and focusTopic are optional richer objects: include them only when the dashboard payload gives you enough signal, otherwise set them to null explicitly rather than guessing.

VERERBUNGSREGEL FÜR PRIORITÄT (PFLICHT):

- Das dashboard_payload_json enthält latest_priority_intervention -- die bereits
  von session_analysis für die letzte Session getroffene Entscheidung
  ({pattern_key, label, reason}). Das ist keine Anregung, sondern eine bereits
  getroffene Entscheidung.
- Ist latest_priority_intervention vorhanden (nicht null, label nicht leer) UND
  focus_topic_title ist NICHT gesetzt (noch kein über mehrere Sessions etabliertes
  Fokus-Thema): primaryImprovementArea.title und nextActionDetail.title müssen sich
  inhaltlich an latest_priority_intervention.label orientieren, primaryImprovementArea.reason
  an latest_priority_intervention.reason. Erfinde KEINE eigene, davon abweichende
  Priorität.
- Ist zusätzlich focus_topic_title gesetzt: das Fokus-Thema hat Vorrang (es ist die
  über mehrere Sessions bestätigte, stabilere Einschätzung). latest_priority_intervention
  dient dann nur als ergänzender Kontext für nextActionDetail.description, nicht als
  Gegenvorschlag zum Fokus-Thema.
- next_action muss inhaltlich immer zu primaryImprovementArea.title passen, falls
  primaryImprovementArea gesetzt ist -- nie eine andere Priorität benennen.',
  'Dashboard-Daten (JSON): {{dashboard_payload_json}}

Learning goal context: {{learning_goal_context}}

Gib summary, next_action und confidence_note zurück (immer erforderlich). Ergänze primaryImprovementArea, nextActionDetail und focusTopic nur, wenn die Daten das hergeben -- sonst null.',
  '{
    "type": "object",
    "required": ["summary", "next_action", "confidence_note", "primaryImprovementArea", "nextActionDetail", "focusTopic"],
    "properties": {
      "summary": {"type": "string", "minLength": 1},
      "next_action": {"type": "string", "minLength": 1},
      "confidence_note": {"type": "string", "minLength": 1},
      "primaryImprovementArea": {
        "type": ["object", "null"],
        "required": ["skill", "title", "reason", "confidence"],
        "properties": {
          "skill": {"type": "string", "minLength": 1},
          "title": {"type": "string", "minLength": 1},
          "reason": {"type": "string", "minLength": 1},
          "confidence": {"type": "string", "enum": ["low", "medium", "high"]}
        },
        "additionalProperties": false
      },
      "nextActionDetail": {
        "type": ["object", "null"],
        "required": ["title", "description", "targetSkill", "recommendedTrainingId", "reason"],
        "properties": {
          "title": {"type": "string", "minLength": 1},
          "description": {"type": "string", "minLength": 1},
          "targetSkill": {"type": "string", "minLength": 1},
          "recommendedTrainingId": {"type": ["string", "null"]},
          "reason": {"type": "string", "minLength": 1}
        },
        "additionalProperties": false
      },
      "focusTopic": {
        "type": ["object", "null"],
        "required": ["title", "reason"],
        "properties": {
          "title": {"type": "string", "minLength": 1},
          "reason": {"type": "string", "minLength": 1}
        },
        "additionalProperties": false
      }
    },
    "additionalProperties": false
  }'::jsonb,
  '[
    {"key": "dashboard_payload_json", "type": "string", "required": true},
    {"key": "learning_goal_context", "type": "string", "required": true}
  ]'::jsonb,
  '{}'::jsonb
);

commit;
