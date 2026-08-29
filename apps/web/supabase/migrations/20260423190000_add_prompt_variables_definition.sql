begin;

alter table public.prompt_definitions
  add column if not exists prompt_variables_definition_json jsonb;

update public.prompt_definitions
set prompt_variables_definition_json = coalesce(prompt_variables_definition_json, '[]'::jsonb);

alter table public.prompt_definitions
  alter column prompt_variables_definition_json set not null,
  alter column prompt_variables_definition_json set default '[]'::jsonb;

alter table public.prompt_definitions
  add constraint prompt_definitions_prompt_variables_definition_json_array
  check (jsonb_typeof(prompt_variables_definition_json) = 'array');

commit;
