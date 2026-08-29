begin;

-- Munthers Feedback 21.08.2026: die Session-Detailseite zeigt priority_intervention
-- aus session_analysis (pro Session entschieden), das Dashboard/Coaching-Einstieg
-- zeigte aber primaryImprovementArea/nextActionDetail aus dashboard_summary -- einer
-- zweiten, unabhängigen KI-Einschätzung, die dieselbe Frage ("was ist als Nächstes
-- wichtig?") separat und ohne Kenntnis der ersten Entscheidung beantwortete. Beide
-- konnten dadurch unterschiedliche Dinge sagen. dashboard-data.service.ts liefert
-- jetzt zusätzlich latest_priority_intervention im Payload (die tatsächliche
-- Entscheidung aus session_analysis) -- diese Version macht daraus eine
-- Vererbungsregel statt einer zweiten unabhängigen Meinung.
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'dashboard_summary' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
)
select
  prompt_key,
  version + 1,
  name,
  description || ' v' || (version + 1)::text || ': übernimmt latest_priority_intervention aus session_analysis statt unabhängig eine neue Priorität zu erfinden (Munthers Feedback: Session-Detailseite und Dashboard zeigten unterschiedliche "wichtigste nächste Aktion").',
  category,
  model,
  max_output_tokens,
  response_format,
  true,
  system_prompt,
  developer_prompt || '

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
  user_prompt_template,
  expected_output_schema_json,
  prompt_variables_definition_json,
  metadata
from public.prompt_definitions
where prompt_key = 'dashboard_summary'
order by version desc
limit 1;

commit;
