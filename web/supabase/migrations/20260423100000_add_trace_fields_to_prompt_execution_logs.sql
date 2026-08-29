begin;

alter table public.prompt_execution_logs
  add column if not exists trace_id text,
  add column if not exists workflow_id text,
  add column if not exists pipeline_step text,
  add column if not exists attempt_number integer,
  add column if not exists validation_repair_status text,
  add column if not exists error_class text;

update public.prompt_execution_logs
set attempt_number = 1
where attempt_number is null;

alter table public.prompt_execution_logs
  alter column attempt_number set default 1,
  alter column attempt_number set not null;

alter table public.prompt_execution_logs
  add constraint prompt_execution_logs_attempt_number_positive
    check (attempt_number > 0),
  add constraint prompt_execution_logs_validation_repair_status_allowed
    check (
      validation_repair_status is null
      or validation_repair_status in ('not_needed', 'repaired', 'failed')
    );

create index if not exists idx_prompt_execution_logs_trace_created
  on public.prompt_execution_logs (trace_id, created_at desc);

create index if not exists idx_prompt_execution_logs_workflow_created
  on public.prompt_execution_logs (workflow_id, created_at desc);

commit;
