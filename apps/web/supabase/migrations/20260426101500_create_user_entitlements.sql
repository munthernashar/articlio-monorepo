begin;

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_key text not null default 'default',
  sessions_per_day_limit integer not null default 3,
  max_session_length_seconds integer not null default 900,
  daily_conversation_seconds_limit integer,
  monthly_token_limit integer,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_entitlements_plan_key_length check (char_length(plan_key) between 1 and 80),
  constraint user_entitlements_sessions_per_day_range check (sessions_per_day_limit between 1 and 100),
  constraint user_entitlements_max_session_length_range check (max_session_length_seconds between 60 and 86400),
  constraint user_entitlements_daily_conversation_seconds_limit_range check (
    daily_conversation_seconds_limit is null
    or daily_conversation_seconds_limit >= 60
  ),
  constraint user_entitlements_monthly_token_limit_range check (
    monthly_token_limit is null
    or monthly_token_limit >= 1
  ),
  constraint user_entitlements_status_allowed check (status in ('active', 'grace', 'suspended', 'expired')),
  constraint user_entitlements_billing_period_order check (
    billing_period_start is null
    or billing_period_end is null
    or billing_period_start <= billing_period_end
  )
);

create index if not exists idx_user_entitlements_plan_key on public.user_entitlements (plan_key);
create index if not exists idx_user_entitlements_status on public.user_entitlements (status);

drop trigger if exists trg_user_entitlements_set_updated_at on public.user_entitlements;
create trigger trg_user_entitlements_set_updated_at
before update on public.user_entitlements
for each row
execute function public.set_updated_at();

alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force row level security;

drop policy if exists "user_entitlements_user_select_own" on public.user_entitlements;
drop policy if exists "user_entitlements_admin_select_all" on public.user_entitlements;
drop policy if exists "user_entitlements_admin_insert" on public.user_entitlements;
drop policy if exists "user_entitlements_admin_update" on public.user_entitlements;
drop policy if exists "user_entitlements_admin_delete" on public.user_entitlements;

create policy "user_entitlements_user_select_own"
on public.user_entitlements
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_entitlements_admin_select_all"
on public.user_entitlements
for select
to authenticated
using (public.is_admin());

create policy "user_entitlements_admin_insert"
on public.user_entitlements
for insert
to authenticated
with check (public.is_admin());

create policy "user_entitlements_admin_update"
on public.user_entitlements
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "user_entitlements_admin_delete"
on public.user_entitlements
for delete
to authenticated
using (public.is_admin());

comment on table public.user_entitlements is 'Plan-/Abrechnungs-Entitlements und manuelle Overrides je User.';

commit;
