begin;

alter table public.prompt_definitions
  add column response_format text;

update public.prompt_definitions
set response_format = 'json_object'
where response_format is null;

alter table public.prompt_definitions
  alter column response_format set default 'json_object',
  alter column response_format set not null;

alter table public.prompt_definitions
  add constraint prompt_definitions_response_format_allowed
  check (response_format in ('json_object', 'text'));

commit;
