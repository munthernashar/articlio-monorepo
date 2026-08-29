begin;

update public.prompt_definitions
set
  user_prompt_template = 'Fehlerhinweis: {{repair_error_hint}}. Defekter Text: {{invalid_json_text}}. Ziel-Schema (JSON): {{target_schema_json}}. Gib repaired_json zurück.',
  developer_prompt = 'Repariere kaputtes JSON minimal-invasiv, beachte strikt das Ziel-Schema und erfinde keine neuen Inhalte.',
  updated_at = timezone('utc', now())
where prompt_key in ('json_repair', 'json_repair_v1')
  and version = 1;

commit;
