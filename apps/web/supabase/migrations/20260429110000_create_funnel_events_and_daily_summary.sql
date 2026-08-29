create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name in ('landing_viewed','pricing_viewed','signup_started','signup_completed','checkout_started','checkout_completed','payment_succeeded')),
  event_date date not null default (now() at time zone 'utc')::date,
  user_id uuid null references auth.users (id) on delete set null,
  session_id text null,
  trace_id text not null,
  source text null,
  plan_key text null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_funnel_events_event_date on public.funnel_events (event_date desc);
create index if not exists idx_funnel_events_name_date on public.funnel_events (event_name, event_date desc);
create index if not exists idx_funnel_events_trace on public.funnel_events (trace_id, occurred_at desc);

alter table public.funnel_events enable row level security;

drop policy if exists "service_role_manage_funnel_events" on public.funnel_events;

create policy "service_role_manage_funnel_events"
  on public.funnel_events
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.track_funnel_event(
  p_event_name text,
  p_occurred_at timestamptz,
  p_trace_id text,
  p_session_id text default null,
  p_source text default null,
  p_plan_key text default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_name not in ('landing_viewed','pricing_viewed','signup_started','signup_completed','checkout_started','checkout_completed','payment_succeeded') then
    raise exception 'INVALID_FUNNEL_EVENT: %', p_event_name;
  end if;

  if coalesce(length(trim(p_trace_id)), 0) = 0 then
    raise exception 'MISSING_TRACE_ID';
  end if;

  insert into public.funnel_events (
    event_name,
    event_date,
    user_id,
    session_id,
    trace_id,
    source,
    plan_key,
    payload,
    occurred_at
  )
  values (
    p_event_name,
    (p_occurred_at at time zone 'utc')::date,
    auth.uid(),
    nullif(trim(p_session_id), ''),
    p_trace_id,
    nullif(trim(p_source), ''),
    nullif(trim(p_plan_key), ''),
    coalesce(p_payload, '{}'::jsonb),
    p_occurred_at
  );
end;
$$;

grant execute on function public.track_funnel_event(text, timestamptz, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.get_funnel_daily_summary(p_days integer default 30)
returns table (
  event_date date,
  landing_viewed bigint,
  pricing_viewed bigint,
  signup_started bigint,
  signup_completed bigint,
  checkout_started bigint,
  checkout_completed bigint,
  payment_succeeded bigint
)
language sql
security definer
set search_path = public
as $$
  with daily as (
    select
      event_date,
      count(*) filter (where event_name = 'landing_viewed') as landing_viewed,
      count(*) filter (where event_name = 'pricing_viewed') as pricing_viewed,
      count(*) filter (where event_name = 'signup_started') as signup_started,
      count(*) filter (where event_name = 'signup_completed') as signup_completed,
      count(*) filter (where event_name = 'checkout_started') as checkout_started,
      count(*) filter (where event_name = 'checkout_completed') as checkout_completed,
      count(*) filter (where event_name = 'payment_succeeded') as payment_succeeded
    from public.funnel_events
    where event_date >= ((timezone('utc', now()))::date - greatest(p_days, 1) + 1)
    group by event_date
  )
  select *
  from daily
  order by event_date desc;
$$;

grant execute on function public.get_funnel_daily_summary(integer) to authenticated;
