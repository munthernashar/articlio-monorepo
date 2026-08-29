begin;

-- Launch-Readiness-Audit, Befund L (Fortsetzung): improvement_check, tutor_explanation,
-- tutor_followup_answer, understanding_check und daily_prompt_generator hatten denselben Bug wie
-- focus_topic_selector/multi_session_pattern_detection -- Variablennamen in der DB-Vorlage
-- passten nicht zu dem, was der Code tatsächlich sendet, und die Return-Bloecke stimmten nicht
-- mit den tatsächlichen Parsern/Typen in tutor.service.ts, improvement-check.service.ts und
-- daily-prompt.service.ts ueberein. tutor_explanation/tutor_followup_answer/understanding_check
-- sind über TutorWorkspace.tsx live erreichbar -- der komplette Tutor-Dialog war betroffen.
-- improvement_check läuft bislang nur über die tote session-processing.pipeline.ts (wird in
-- einem separaten Schritt in NewSessionPage.tsx verdrahtet). daily_prompt_generator hat aktuell
-- gar keine aufrufende UI -- Inhalt trotzdem korrigiert für Konsistenz, Deaktivierung nicht
-- sinnvoll, da es dem in docs/go-live-audit-2026-04-29.md (GAP-P2-01, Daily Habit Loop)
-- dokumentierten Produktziel entspricht.

update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key in ('improvement_check','tutor_explanation','tutor_followup_answer','understanding_check','daily_prompt_generator')
  and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values
(
  'improvement_check',
  2,
  'Improvement Check',
  'Prüft, ob sich ein Lernender im aktiven Fokus-Thema verbessert hat. v2: Variablennamen und Ausgabeformat auf parseImprovementCheckPromptOutput ausgerichtet (Befund L).',
  'improvement',
  'gpt-4.1-mini',
  900,
  'json_object',
  true,
  'You are a progress evaluator for a German conversation coaching app. Measure whether the learner has improved in one previously trained focus topic. Return valid JSON only.',
  'Compare baseline evidence before the intervention with newer spontaneous speech.
Focus only on the trained topic. Be conservative and evidence-based. Default to "insufficient_data" if the recent sessions do not contain enough evidence about the focus topic.

Return exactly this JSON shape:
{
  "decision": "improved", "unchanged", "worsened", or "insufficient_data",
  "confidence": "0.0-1.0",
  "rationale": "string, 1-2 sentences explaining the decision",
  "focus_evidence": "string, what evidence about the focus topic you found",
  "baseline_evidence": ["short quote or paraphrase from the baseline", "..."],
  "current_evidence": ["short quote or paraphrase from the recent sessions", "..."],
  "focus_topic_key": "string, must match the current focus topic key",
  "focus_topic_key_match": true or false, whether the evidence you found is actually about this focus topic key,
  "focus_topic_match": true or false, same check at a coarser level,
  "evidence_quality": "low", "medium", or "high" (optional, omit entirely if unsure),
  "recommendation": "string, one concrete next step"
}',
  'Current focus topic key: {{current_focus_topic_key}}
Focus topic title: {{focus_topic_title}}
Focus pattern type: {{focus_pattern_type}}

Baseline evidence (before training):
{{baseline_json}}

Recent post-training sessions ({{recent_session_count}} total):
{{recent_sessions_json}}',
  '{"type":"object","required":["decision","confidence","rationale","focus_evidence","baseline_evidence","current_evidence","focus_topic_key","focus_topic_key_match","focus_topic_match","recommendation"],"properties":{"decision":{"type":"string","enum":["improved","unchanged","worsened","insufficient_data"]},"confidence":{"type":"number","minimum":0,"maximum":1},"rationale":{"type":"string","minLength":1},"focus_evidence":{"type":"string","minLength":1},"baseline_evidence":{"type":"array","items":{"type":"string"}},"current_evidence":{"type":"array","items":{"type":"string"}},"focus_topic_key":{"type":"string","minLength":1},"focus_topic_key_match":{"type":"boolean"},"focus_topic_match":{"type":"boolean"},"evidence_quality":{"type":"string","enum":["low","medium","high"]},"recommendation":{"type":"string","minLength":1}},"additionalProperties":false}'::jsonb,
  '[{"key":"current_focus_topic_key","type":"string","required":true},{"key":"focus_topic_title","type":"string","required":true},{"key":"focus_pattern_type","type":"string","required":true},{"key":"baseline_json","type":"string","required":true},{"key":"recent_sessions_json","type":"string","required":true},{"key":"recent_session_count","type":"string","required":true}]'::jsonb,
  jsonb_build_object('fix_reason', 'befund_l_variable_and_schema_mismatch', 'fixed_at', timezone('utc', now()), 'supersedes_version', 1)
),
(
  'tutor_explanation',
  2,
  'Tutor Explanation',
  'Erklärt ein Fokus-Thema im Tutor-Dialog. v2: Variablennamen und Ausgabeformat auf parseExplanationOutput ausgerichtet, inkl. der Hard-Constraints, die der Code bereits durchsetzt (Befund L).',
  'tutor',
  'gpt-4.1-mini',
  1200,
  'json_object',
  true,
  'You are a patient German tutor for adult migrants living in Germany. Explain one specific German language issue in a simple, respectful, practical way. Do not sound academic unless necessary. Use short explanations, clear examples, and natural German. Return valid JSON only.',
  'Teach exactly one focus topic through explanation and contrastive examples, not through worksheets.

Hard constraints (the app enforces these programmatically -- follow them precisely or your answer will be rejected/rewritten):
- explanation must be at most 3 sentences and must not contain meta-theory language (no "Theorie", "Grammatikregel", "Definition", "Regel:", "Merke:") -- teach through the examples, not abstract rule statements
- examples must contain between 2 and 3 entries, each with a concrete, realistic incorrect/correct pair and a short "why"
- set redirected_to_focus to true only if the learner''s context required steering back to the current focus topic, otherwise false

Return exactly this JSON shape:
{
  "explanation": "string, at most 3 sentences, concrete and example-driven, no meta-theory language",
  "examples": [
    { "incorrect": "string, a realistic wrong utterance", "correct": "string, the corrected version", "why": "string, short reason" }
  ],
  "check_question": "string, one short question to check understanding",
  "redirected_to_focus": true or false
}',
  'Focus topic: {{topic_title}}
Description: {{topic_description}}
Tutor language: {{tutor_language}}
Feedback hardness: {{feedback_hardness}}',
  '{"type":"object","required":["explanation","examples","check_question","redirected_to_focus"],"properties":{"explanation":{"type":"string","minLength":1},"examples":{"type":"array","minItems":2,"maxItems":3,"items":{"type":"object","required":["incorrect","correct","why"],"properties":{"incorrect":{"type":"string","minLength":1},"correct":{"type":"string","minLength":1},"why":{"type":"string","minLength":1}},"additionalProperties":false}},"check_question":{"type":"string","minLength":1},"redirected_to_focus":{"type":"boolean"}},"additionalProperties":false}'::jsonb,
  '[{"key":"topic_title","type":"string","required":true},{"key":"topic_description","type":"string","required":true},{"key":"tutor_language","type":"string","required":true},{"key":"feedback_hardness","type":"string","required":true}]'::jsonb,
  jsonb_build_object('fix_reason', 'befund_l_variable_and_schema_mismatch', 'fixed_at', timezone('utc', now()), 'supersedes_version', 1)
),
(
  'tutor_followup_answer',
  2,
  'Tutor Followup Answer',
  'Beantwortet Rückfragen im Tutor-Dialog. v2: Variablennamen und Ausgabeformat auf parseFollowupOutput ausgerichtet, inkl. Anti-Drill-Constraint, die der Code bereits durchsetzt (Befund L).',
  'tutor',
  'gpt-4.1-mini',
  900,
  'json_object',
  true,
  'You are a supportive German tutor in a live learning dialog. Answer the learner''s follow-up question about one specific language issue. Keep the answer practical, clear, and concise. Return valid JSON only.',
  'Stay strictly within the current focus topic unless a short clarification is necessary. Do not open new grammar topics. Use natural German appropriate to the tutor language setting.

Hard constraint (the app rejects any answer containing these): never produce classic drill exercises. Do not use words or patterns like "Lückentext", "Drill", "fülle ... Lücke", "setze ... ein", "Übungsblatt", "20 Sätze", or "konjugiere". Explain and ask, never assign mechanical exercises.

Return exactly this JSON shape:
{
  "answer": "string, a direct, concrete answer to the learner''s question",
  "scope_ok": true or false, whether the learner''s question stayed within the current focus topic,
  "redirected_to_focus": true or false, whether you had to steer the answer back to the focus topic,
  "next_question": "string, one short follow-up question that keeps the dialogue moving"
}',
  'Focus topic: {{topic_title}}
Description: {{topic_description}}
Prior explanation: {{explanation_text}}
Dialogue so far (JSON): {{dialogue_json}}
Learner''s follow-up question: {{learner_question}}
Tutor language: {{tutor_language}}
Feedback hardness: {{feedback_hardness}}',
  '{"type":"object","required":["answer","scope_ok","redirected_to_focus","next_question"],"properties":{"answer":{"type":"string","minLength":1},"scope_ok":{"type":"boolean"},"redirected_to_focus":{"type":"boolean"},"next_question":{"type":"string","minLength":1}},"additionalProperties":false}'::jsonb,
  '[{"key":"topic_title","type":"string","required":true},{"key":"topic_description","type":"string","required":true},{"key":"explanation_text","type":"string","required":true},{"key":"dialogue_json","type":"string","required":true},{"key":"learner_question","type":"string","required":true},{"key":"tutor_language","type":"string","required":true},{"key":"feedback_hardness","type":"string","required":true}]'::jsonb,
  jsonb_build_object('fix_reason', 'befund_l_variable_and_schema_mismatch', 'fixed_at', timezone('utc', now()), 'supersedes_version', 1)
),
(
  'understanding_check',
  2,
  'Understanding Check',
  'Prüft das Verständnis im Tutor-Dialog. v2: Variablennamen und Ausgabeformat auf parseUnderstandingCheckOutput ausgerichtet (Befund L).',
  'understanding',
  'gpt-4.1-mini',
  700,
  'json_object',
  true,
  'You are an instructional checker for a German speaking coach app. Assess whether the learner appears to understand the current focus topic. Return valid JSON only.',
  'Use the dialogue so far to judge whether the learner understands the current focus topic. Judge understanding cautiously -- prefer "partial" over "sufficient" when in doubt.

Return exactly this JSON shape:
{
  "status": "not_yet", "partial", or "sufficient",
  "feedback": "string, short, concrete feedback on where the learner stands",
  "next_step": "clarification" or "transfer_ready" -- use "transfer_ready" only when status is "sufficient", otherwise "clarification",
  "redirected_to_focus": true or false, whether you had to steer the check back to the focus topic
}',
  'Focus topic: {{topic_title}}
Description: {{topic_description}}
Prior explanation: {{explanation_text}}
Dialogue so far (JSON): {{dialogue_json}}
Tutor language: {{tutor_language}}
Feedback hardness: {{feedback_hardness}}',
  '{"type":"object","required":["status","feedback","next_step","redirected_to_focus"],"properties":{"status":{"type":"string","enum":["not_yet","partial","sufficient"]},"feedback":{"type":"string","minLength":1},"next_step":{"type":"string","enum":["clarification","transfer_ready"]},"redirected_to_focus":{"type":"boolean"}},"additionalProperties":false}'::jsonb,
  '[{"key":"topic_title","type":"string","required":true},{"key":"topic_description","type":"string","required":true},{"key":"explanation_text","type":"string","required":true},{"key":"dialogue_json","type":"string","required":true},{"key":"tutor_language","type":"string","required":true},{"key":"feedback_hardness","type":"string","required":true}]'::jsonb,
  jsonb_build_object('fix_reason', 'befund_l_variable_and_schema_mismatch', 'fixed_at', timezone('utc', now()), 'supersedes_version', 1)
),
(
  'daily_prompt_generator',
  3,
  'Daily Prompt Generator',
  'Erzeugt einen täglichen Sprechimpuls. v3: Variablennamen und Ausgabeformat auf DailyPromptOutput (daily-prompt.service.ts) ausgerichtet (Befund L). Hinweis: aktuell ruft keine UI dailyPromptService auf -- Inhalt korrigiert für Konsistenz, Aktivierung ist ein separater Schritt.',
  'daily',
  'gpt-4.1-mini',
  500,
  'json_object',
  true,
  'You are a conversation prompt generator for adult German learners living in Germany.
Generate one natural, motivating speaking prompt for a daily speaking session.
Return valid JSON only.',
  'The prompt should feel realistic, encourage spontaneous speaking, fit the learner''s level, be neither childish nor academic, and ideally create opportunities to observe the current focus topic indirectly.

Return exactly this JSON shape:
{
  "title": "string, short topic title",
  "prompt_text": "string, the actual speaking prompt for the learner",
  "rationale": "string, one sentence on why this prompt fits the learner right now",
  "difficulty": "string, a level label matching the learner''s German level"
}',
  'Current focus topic: {{focus_topic_title}}
Learner''s German level: {{german_level}}
Recent signal: {{recent_signal}}',
  '{"type":"object","required":["title","prompt_text","rationale","difficulty"],"properties":{"title":{"type":"string","minLength":1},"prompt_text":{"type":"string","minLength":1},"rationale":{"type":"string","minLength":1},"difficulty":{"type":"string","minLength":1}},"additionalProperties":false}'::jsonb,
  '[{"key":"focus_topic_title","type":"string","required":true},{"key":"german_level","type":"string","required":true},{"key":"recent_signal","type":"string","required":true}]'::jsonb,
  jsonb_build_object('fix_reason', 'befund_l_variable_and_schema_mismatch', 'fixed_at', timezone('utc', now()), 'supersedes_version', 2, 'note', 'no_reachable_ui_caller_yet')
);

commit;
