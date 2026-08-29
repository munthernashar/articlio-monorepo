begin;

create table public.prompt_definitions (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,
  version integer not null,
  system_prompt text not null,
  developer_prompt text not null,
  user_prompt_template text not null,
  model text not null,
  max_output_tokens integer not null default 700,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint prompt_definitions_prompt_key_length check (char_length(prompt_key) between 3 and 120),
  constraint prompt_definitions_version_positive check (version > 0),
  constraint prompt_definitions_max_output_tokens_positive check (max_output_tokens > 0),
  constraint prompt_definitions_model_length check (char_length(model) between 3 and 120),
  constraint prompt_definitions_prompt_key_version_unique unique (prompt_key, version)
);

create unique index idx_prompt_definitions_active_per_key
  on public.prompt_definitions (prompt_key)
  where is_active;

create index idx_prompt_definitions_key_updated
  on public.prompt_definitions (prompt_key, updated_at desc);

create table public.prompt_execution_logs (
  id uuid primary key default gen_random_uuid(),
  prompt_definition_id uuid not null references public.prompt_definitions (id) on delete cascade,
  prompt_key text not null,
  prompt_version integer not null,
  model text not null,
  max_output_tokens integer not null,
  test_input jsonb not null default '{}'::jsonb,
  rendered_user_prompt text not null,
  request_payload jsonb not null default '{}'::jsonb,
  raw_response text,
  parsed_output jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  status text not null,
  latency_ms integer,
  error_message text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint prompt_execution_logs_status_allowed check (status in ('success', 'failed')),
  constraint prompt_execution_logs_prompt_version_positive check (prompt_version > 0),
  constraint prompt_execution_logs_max_output_tokens_positive check (max_output_tokens > 0),
  constraint prompt_execution_logs_latency_non_negative check (latency_ms is null or latency_ms >= 0)
);

create index idx_prompt_execution_logs_prompt_created
  on public.prompt_execution_logs (prompt_definition_id, created_at desc);

create index idx_prompt_execution_logs_key_created
  on public.prompt_execution_logs (prompt_key, created_at desc);

create trigger trg_prompt_definitions_set_updated_at
before update on public.prompt_definitions
for each row
execute function public.set_updated_at();

alter table public.prompt_definitions enable row level security;
alter table public.prompt_definitions force row level security;

alter table public.prompt_execution_logs enable row level security;
alter table public.prompt_execution_logs force row level security;

create policy "prompt_definitions_admin_select"
on public.prompt_definitions
for select
using (public.is_admin());

create policy "prompt_definitions_admin_insert"
on public.prompt_definitions
for insert
with check (public.is_admin());

create policy "prompt_definitions_admin_update"
on public.prompt_definitions
for update
using (public.is_admin())
with check (public.is_admin());

create policy "prompt_execution_logs_admin_select"
on public.prompt_execution_logs
for select
using (public.is_admin());

create policy "prompt_execution_logs_admin_insert"
on public.prompt_execution_logs
for insert
with check (public.is_admin());

commit;
