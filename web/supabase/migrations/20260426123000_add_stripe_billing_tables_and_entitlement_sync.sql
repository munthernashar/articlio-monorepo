begin;

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  email text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_customers_user_id_unique unique (user_id),
  constraint billing_customers_stripe_customer_id_unique unique (stripe_customer_id),
  constraint billing_customers_stripe_customer_id_length check (char_length(stripe_customer_id) between 3 and 255)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  stripe_price_id text,
  plan_key text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_subscriptions_user_id_unique unique (user_id),
  constraint billing_subscriptions_stripe_subscription_id_unique unique (stripe_subscription_id),
  constraint billing_subscriptions_status_allowed check (
    status in ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')
  ),
  constraint billing_subscriptions_plan_key_length check (char_length(plan_key) between 1 and 80),
  constraint billing_subscriptions_period_order check (
    current_period_start is null
    or current_period_end is null
    or current_period_start <= current_period_end
  )
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null,
  event_type text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  user_id uuid references auth.users (id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint billing_events_stripe_event_unique unique (stripe_event_id),
  constraint billing_events_event_type_length check (char_length(event_type) between 3 and 120)
);

create index if not exists idx_billing_subscriptions_stripe_customer_id on public.billing_subscriptions (stripe_customer_id);
create index if not exists idx_billing_subscriptions_status on public.billing_subscriptions (status);
create index if not exists idx_billing_events_user_id on public.billing_events (user_id);
create index if not exists idx_billing_events_type_created on public.billing_events (event_type, created_at desc);

create trigger trg_billing_customers_set_updated_at
before update on public.billing_customers
for each row
execute function public.set_updated_at();

create trigger trg_billing_subscriptions_set_updated_at
before update on public.billing_subscriptions
for each row
execute function public.set_updated_at();

create or replace function public.sync_user_entitlements_from_billing(
  p_user_id uuid,
  p_plan_key text,
  p_status text,
  p_current_period_end timestamptz,
  p_sessions_per_day_limit integer,
  p_max_session_length_seconds integer,
  p_daily_conversation_seconds_limit integer,
  p_monthly_token_limit integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_entitlements (
    user_id,
    plan_key,
    sessions_per_day_limit,
    max_session_length_seconds,
    daily_conversation_seconds_limit,
    monthly_token_limit,
    billing_period_start,
    billing_period_end,
    status
  )
  values (
    p_user_id,
    p_plan_key,
    p_sessions_per_day_limit,
    p_max_session_length_seconds,
    p_daily_conversation_seconds_limit,
    p_monthly_token_limit,
    timezone('utc', now()),
    p_current_period_end,
    p_status
  )
  on conflict (user_id)
  do update set
    plan_key = excluded.plan_key,
    sessions_per_day_limit = excluded.sessions_per_day_limit,
    max_session_length_seconds = excluded.max_session_length_seconds,
    daily_conversation_seconds_limit = excluded.daily_conversation_seconds_limit,
    monthly_token_limit = excluded.monthly_token_limit,
    billing_period_start = excluded.billing_period_start,
    billing_period_end = excluded.billing_period_end,
    status = excluded.status;
end;
$$;

revoke all on function public.sync_user_entitlements_from_billing(uuid, text, text, timestamptz, integer, integer, integer, integer) from public;
grant execute on function public.sync_user_entitlements_from_billing(uuid, text, text, timestamptz, integer, integer, integer, integer) to service_role;

comment on table public.billing_customers is 'Zuordnung von App-Usern zu Stripe Customers.';
comment on table public.billing_subscriptions is 'Aktive Stripe-Abos pro User inklusive Preis-/Plan-Zuordnung.';
comment on table public.billing_events is 'Idempotente Ablage verarbeiteter Stripe Events.';

commit;
