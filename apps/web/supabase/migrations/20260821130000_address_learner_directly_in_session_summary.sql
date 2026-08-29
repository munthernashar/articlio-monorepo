begin;

-- Munthers Feedback 21.08.2026: session_summary (im UI als "Highlights" in der
-- Coaching-Einstieg-Karte gezeigt, siehe TutorPage.tsx/SessionDetailPage.tsx)
-- war in unpersönlicher dritter Person formuliert ("Der/die Lernende
-- kommuniziert ..."). Der Prompt gab dafür bislang gar keinen Formulierungsstil
-- vor. Neue Regel: session_summary spricht den Lernenden direkt mit "Du" an.
-- Die internen Bewertungsfelder (justification, can_do_evidence,
-- limiting_factor) werden dem Nutzer nirgends direkt angezeigt (nur
-- session_summary landet im UI) und bleiben bewusst im analytischen Stil.
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'session_analysis' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
)
select
  prompt_key,
  version + 1,
  name,
  description || ' v' || (version + 1)::text || ': session_summary spricht den Lernenden jetzt direkt mit "Du" an statt in der dritten Person ("Der/die Lernende").',
  category,
  model,
  max_output_tokens,
  response_format,
  true,
  system_prompt,
  developer_prompt || '

SESSION_SUMMARY -- ANREDE (PFLICHT):

10. session_summary spricht den Lernenden IMMER direkt mit "Du" an, niemals in der dritten Person.
- Richtig: "Du kommunizierst insgesamt funktional und gut verständlich auf B1-Niveau. Du kannst Absichten und Handlungen beschreiben und dialogisch reagieren."
- Falsch: "Der/die Lernende kommuniziert ...", "Er/sie kann ..."
- Das gilt nur für session_summary, nicht für justification/can_do_evidence/limiting_factor in den category_scores (die bleiben im analytischen Stil, da sie dem Nutzer nicht direkt angezeigt werden).',
  user_prompt_template,
  expected_output_schema_json,
  prompt_variables_definition_json,
  metadata
from public.prompt_definitions
where prompt_key = 'session_analysis'
order by version desc
limit 1;

commit;
