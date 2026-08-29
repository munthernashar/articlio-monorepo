begin;

alter table public.prompt_definitions
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists category text,
  add column if not exists expected_output_schema_json jsonb;

update public.prompt_definitions
set
  name = coalesce(nullif(trim(name), ''), initcap(replace(prompt_key, '_', ' '))),
  description = coalesce(description, ''),
  category = coalesce(nullif(trim(category), ''), split_part(prompt_key, '_', 1)),
  expected_output_schema_json = coalesce(
    expected_output_schema_json,
    jsonb_build_object('type', 'object', 'additionalProperties', true)
  );

alter table public.prompt_definitions
  alter column name set not null,
  alter column description set not null,
  alter column category set not null,
  alter column expected_output_schema_json set not null,
  alter column name set default '',
  alter column description set default '',
  alter column category set default 'general',
  alter column expected_output_schema_json set default '{"type":"object","additionalProperties":true}'::jsonb;

update public.prompt_definitions
set
  name = initcap(replace(prompt_key, '_', ' '))
where trim(name) = '';

update public.prompt_definitions
set
  category = 'general'
where trim(category) = '';

alter table public.prompt_definitions
  add constraint prompt_definitions_name_length check (char_length(trim(name)) between 3 and 120),
  add constraint prompt_definitions_description_length check (char_length(description) <= 4000),
  add constraint prompt_definitions_category_length check (char_length(trim(category)) between 2 and 60),
  add constraint prompt_definitions_expected_output_schema_json_object check (jsonb_typeof(expected_output_schema_json) = 'object');

create index if not exists idx_prompt_definitions_category on public.prompt_definitions (category);

create index if not exists idx_prompt_definitions_category_active on public.prompt_definitions (category, is_active);

commit;
