begin;

alter table public.prompt_execution_logs
  add column if not exists fallback_used boolean not null default false,
  add column if not exists fallback_reason text,
  add column if not exists prompt_source text not null default 'db';

update public.prompt_execution_logs
set fallback_used = coalesce(fallback_used, false)
where fallback_used is null;

update public.prompt_execution_logs
set prompt_source = case
  when coalesce(fallback_used, false) then 'seed_fallback'
  else 'db'
end
where prompt_source is null
   or prompt_source not in ('db', 'seed_fallback');

update public.prompt_execution_logs
set fallback_reason = null
where fallback_reason is not null
  and fallback_reason not in (
    'db_missing',
    'db_inactive',
    'db_invalid_schema',
    'db_parse_error',
    'db_mapping_error',
    'db_duplicate_active_version'
  );

alter table public.prompt_execution_logs
  alter column fallback_used set not null,
  alter column fallback_used set default false,
  alter column prompt_source set not null,
  alter column prompt_source set default 'db';

alter table public.prompt_execution_logs
  drop constraint if exists prompt_execution_logs_prompt_source_check;

alter table public.prompt_execution_logs
  add constraint prompt_execution_logs_prompt_source_check
  check (prompt_source in ('db', 'seed_fallback'));

alter table public.prompt_execution_logs
  drop constraint if exists prompt_execution_logs_fallback_reason_check;

alter table public.prompt_execution_logs
  add constraint prompt_execution_logs_fallback_reason_check
  check (
    fallback_reason is null
    or fallback_reason in (
      'db_missing',
      'db_inactive',
      'db_invalid_schema',
      'db_parse_error',
      'db_mapping_error',
      'db_duplicate_active_version'
    )
  );

commit;
