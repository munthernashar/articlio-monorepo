alter table public.prompt_execution_logs
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists total_tokens integer,
  add column if not exists estimated_cost_usd numeric(12, 8),
  add column if not exists pricing_version text;

create index if not exists idx_prompt_execution_logs_user_cost_created
  on public.prompt_execution_logs (user_id, created_at desc)
  where estimated_cost_usd is not null;
