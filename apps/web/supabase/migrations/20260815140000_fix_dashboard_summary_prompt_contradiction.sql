begin;

-- Launch-Readiness-Audit, Befund I: dashboard_summary (v4) widersprach sich selbst.
-- developer_prompt sagte "Return: {headline, summary_text, current_strength, current_focus,
-- next_step}", der letzte Satz von user_prompt_template sagte "Gib summary, next_action und
-- confidence_note zurück", und der tatsächlich konsumierte TS-Typ (DashboardSummaryOutput in
-- src/services/supabase/dashboard-data.service.ts) erwartet eine dritte, andere Mischung aus
-- beidem plus primaryImprovementArea/nextAction/focusTopic. Keine der drei Varianten stimmte
-- vollständig mit einer anderen überein. v5 vereinheitlicht auf den tatsächlich konsumierten
-- Vertrag und ergänzt ein echtes Schema.

update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'dashboard_summary' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'dashboard_summary',
  5,
  'Dashboard Summary',
  'Fasst den Lernfortschritt fürs Dashboard zusammen. v5: developer_prompt, user_prompt_template und expected_output_schema_json widersprachen sich (drei verschiedene Feldsätze) und stimmten mit keinem davon vollständig mit dem tatsächlich konsumierten DashboardSummaryOutput-Typ überein. Jetzt auf einen Vertrag vereinheitlicht (Befund I, Launch-Readiness-Audit 2026-08-15).',
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

Return exactly this JSON shape:
{
  "summary": "string, 1-2 sentences, the main takeaway",
  "next_action": "string, one concrete next step in plain language",
  "confidence_note": "string, one sentence on how confident this assessment is and why",
  "primaryImprovementArea": null, or an object with "skill" (string), "title" (string), "reason" (string), "confidence" ("low", "medium", or "high"),
  "nextAction": null, or an object with "title" (string), "description" (string), "targetSkill" (string), "recommendedTrainingId" (string or null), "reason" (string),
  "focusTopic": null, or an object with "title" (string), "reason" (string)
}

summary, next_action and confidence_note are always required plain-text fields -- never omit them even when the richer objects are null. primaryImprovementArea, nextAction and focusTopic are optional richer objects: include them only when the dashboard payload gives you enough signal, otherwise set them to null explicitly rather than guessing.',
  'Dashboard-Daten (JSON): {{dashboard_payload_json}}

Gib summary, next_action und confidence_note zurück (immer erforderlich). Ergänze primaryImprovementArea, nextAction und focusTopic nur, wenn die Daten das hergeben -- sonst null.',
  '{"type":"object","required":["summary","next_action","confidence_note","primaryImprovementArea","nextAction","focusTopic"],"properties":{"summary":{"type":"string","minLength":1},"next_action":{"type":"string","minLength":1},"confidence_note":{"type":"string","minLength":1},"primaryImprovementArea":{"anyOf":[{"type":"null"},{"type":"object","required":["skill","title","reason","confidence"],"properties":{"skill":{"type":"string","minLength":1},"title":{"type":"string","minLength":1},"reason":{"type":"string","minLength":1},"confidence":{"type":"string","enum":["low","medium","high"]}},"additionalProperties":false}]},"nextAction":{"anyOf":[{"type":"null"},{"type":"object","required":["title","description","targetSkill","recommendedTrainingId","reason"],"properties":{"title":{"type":"string","minLength":1},"description":{"type":"string","minLength":1},"targetSkill":{"type":"string","minLength":1},"recommendedTrainingId":{"type":["string","null"]},"reason":{"type":"string","minLength":1}},"additionalProperties":false}]},"focusTopic":{"anyOf":[{"type":"null"},{"type":"object","required":["title","reason"],"properties":{"title":{"type":"string","minLength":1},"reason":{"type":"string","minLength":1}},"additionalProperties":false}]}},"additionalProperties":false}'::jsonb,
  '[{"key":"dashboard_payload_json","type":"string","required":true}]'::jsonb,
  jsonb_build_object('fix_reason', 'befund_i_self_contradictory_output_contract', 'fixed_at', timezone('utc', now()), 'supersedes_version', 4)
);

commit;
