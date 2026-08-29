begin;

create table if not exists public.user_usage_ledger (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  tokens_used bigint not null default 0,
  tokens_reserved bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_usage_ledger_period_order check (period_start < period_end),
  constraint user_usage_ledger_tokens_non_negative check (tokens_used >= 0 and tokens_reserved >= 0),
  primary key (user_id, period_start)
);

create index if not exists idx_user_usage_ledger_user_period_end
  on public.user_usage_ledger (user_id, period_end desc);

create table if not exists public.user_usage_daily_aggregates (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  tokens_used bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_usage_daily_aggregates_tokens_non_negative check (tokens_used >= 0),
  primary key (user_id, usage_date)
);

create index if not exists idx_user_usage_daily_aggregates_user_date
  on public.user_usage_daily_aggregates (user_id, usage_date desc);

drop trigger if exists trg_user_usage_ledger_set_updated_at on public.user_usage_ledger;
create trigger trg_user_usage_ledger_set_updated_at
before update on public.user_usage_ledger
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_usage_daily_aggregates_set_updated_at on public.user_usage_daily_aggregates;
create trigger trg_user_usage_daily_aggregates_set_updated_at
before update on public.user_usage_daily_aggregates
for each row
execute function public.set_updated_at();

create or replace function public.resolve_billing_cycle_period(
  p_user_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  period_start timestamptz,
  period_end timestamptz,
  monthly_token_limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_limit integer;
  v_span interval;
begin
  select ue.billing_period_start, ue.billing_period_end, ue.monthly_token_limit
    into v_start, v_end, v_limit
  from public.user_entitlements ue
  where ue.user_id = p_user_id;

  if v_start is null or v_end is null or v_start >= v_end then
    select bs.current_period_start, bs.current_period_end
      into v_start, v_end
    from public.billing_subscriptions bs
    where bs.user_id = p_user_id
    order by bs.updated_at desc
    limit 1;
  end if;

  if v_start is null or v_end is null or v_start >= v_end then
    v_start := p_now;
    v_end := p_now + interval '30 days';
  end if;

  if p_now < v_start then
    v_span := v_end - v_start;
    if v_span <= interval '0 seconds' then
      v_span := interval '30 days';
    end if;

    while p_now < v_start loop
      v_end := v_start;
      v_start := v_start - v_span;
    end loop;
  elsif p_now >= v_end then
    v_span := v_end - v_start;
    if v_span <= interval '0 seconds' then
      v_span := interval '30 days';
    end if;

    while p_now >= v_end loop
      v_start := v_end;
      v_end := v_end + v_span;
    end loop;
  end if;

  period_start := v_start;
  period_end := v_end;
  monthly_token_limit := v_limit;
  return next;
end;
$$;

create or replace function public.reserve_user_tokens(
  p_user_id uuid,
  p_tokens integer,
  p_soft_limit_ratio numeric default 0.8,
  p_now timestamptz default timezone('utc', now())
)
returns table (
  allowed boolean,
  hard_limit_reached boolean,
  soft_limit_reached boolean,
  error_code text,
  limit_value integer,
  tokens_used bigint,
  tokens_reserved bigint,
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tokens integer := greatest(coalesce(p_tokens, 0), 0);
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit integer;
  v_row public.user_usage_ledger%rowtype;
  v_next_total bigint;
  v_threshold bigint;
begin
  select rbcp.period_start, rbcp.period_end, rbcp.monthly_token_limit
    into v_period_start, v_period_end, v_limit
  from public.resolve_billing_cycle_period(p_user_id, p_now) rbcp
  limit 1;

  insert into public.user_usage_ledger as uul (
    user_id,
    period_start,
    period_end,
    tokens_used,
    tokens_reserved
  )
  values (p_user_id, v_period_start, v_period_end, 0, 0)
  on conflict (user_id, period_start)
  do update set
    period_end = excluded.period_end,
    updated_at = timezone('utc', now());

  select *
    into v_row
  from public.user_usage_ledger
  where user_id = p_user_id
    and period_start = v_period_start
  for update;

  v_next_total := v_row.tokens_used + v_row.tokens_reserved + v_tokens;

  if v_limit is not null and v_next_total > v_limit then
    allowed := false;
    hard_limit_reached := true;
    soft_limit_reached := true;
    error_code := 'token_limit_exceeded';
    limit_value := v_limit;
    tokens_used := v_row.tokens_used;
    tokens_reserved := v_row.tokens_reserved;
    period_start := v_period_start;
    period_end := v_period_end;
    return next;
    return;
  end if;

  update public.user_usage_ledger
  set tokens_reserved = v_row.tokens_reserved + v_tokens,
      updated_at = timezone('utc', now())
  where user_id = p_user_id
    and period_start = v_period_start
  returning tokens_used, tokens_reserved
    into tokens_used, tokens_reserved;

  v_threshold := case
    when v_limit is null then 0
    else ceil(v_limit * greatest(least(coalesce(p_soft_limit_ratio, 0.8), 1), 0))::bigint
  end;

  allowed := true;
  hard_limit_reached := false;
  soft_limit_reached := v_limit is not null and (tokens_used + tokens_reserved) >= v_threshold;
  error_code := null;
  limit_value := v_limit;
  period_start := v_period_start;
  period_end := v_period_end;
  return next;
end;
$$;

create or replace function public.finalize_user_token_usage(
  p_user_id uuid,
  p_period_start timestamptz,
  p_reserved_tokens integer,
  p_actual_used integer,
  p_usage_date date default timezone('utc', now())::date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved integer := greatest(coalesce(p_reserved_tokens, 0), 0);
  v_used integer := greatest(coalesce(p_actual_used, 0), 0);
begin
  update public.user_usage_ledger
  set tokens_reserved = greatest(tokens_reserved - v_reserved, 0),
      tokens_used = greatest(tokens_used + v_used, 0),
      updated_at = timezone('utc', now())
  where user_id = p_user_id
    and period_start = p_period_start;

  if v_used > 0 then
    insert into public.user_usage_daily_aggregates as uuda (
      user_id,
      usage_date,
      tokens_used
    )
    values (p_user_id, p_usage_date, v_used)
    on conflict (user_id, usage_date)
    do update set
      tokens_used = uuda.tokens_used + excluded.tokens_used,
      updated_at = timezone('utc', now());
  end if;
end;
$$;

create or replace function public.release_reserved_user_tokens(
  p_user_id uuid,
  p_period_start timestamptz,
  p_reserved_tokens integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved integer := greatest(coalesce(p_reserved_tokens, 0), 0);
begin
  update public.user_usage_ledger
  set tokens_reserved = greatest(tokens_reserved - v_reserved, 0),
      updated_at = timezone('utc', now())
  where user_id = p_user_id
    and period_start = p_period_start;
end;
$$;

revoke all on function public.resolve_billing_cycle_period(uuid, timestamptz) from public;
revoke all on function public.reserve_user_tokens(uuid, integer, numeric, timestamptz) from public;
revoke all on function public.finalize_user_token_usage(uuid, timestamptz, integer, integer, date) from public;
revoke all on function public.release_reserved_user_tokens(uuid, timestamptz, integer) from public;

grant execute on function public.resolve_billing_cycle_period(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.reserve_user_tokens(uuid, integer, numeric, timestamptz) to authenticated, service_role;
grant execute on function public.finalize_user_token_usage(uuid, timestamptz, integer, integer, date) to authenticated, service_role;
grant execute on function public.release_reserved_user_tokens(uuid, timestamptz, integer) to authenticated, service_role;

alter table public.user_usage_ledger enable row level security;
alter table public.user_usage_ledger force row level security;
alter table public.user_usage_daily_aggregates enable row level security;
alter table public.user_usage_daily_aggregates force row level security;

drop policy if exists "user_usage_ledger_user_select_own" on public.user_usage_ledger;
create policy "user_usage_ledger_user_select_own"
on public.user_usage_ledger
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_usage_daily_aggregates_user_select_own" on public.user_usage_daily_aggregates;
create policy "user_usage_daily_aggregates_user_select_own"
on public.user_usage_daily_aggregates
for select
to authenticated
using (auth.uid() = user_id);

comment on table public.user_usage_ledger is 'Tokenverbrauch je User und Billing-Zyklus (used/reserved) für Hard-/Soft-Limits.';
comment on table public.user_usage_daily_aggregates is 'Optionale Tagesaggregate des tatsächlichen Tokenverbrauchs je User.';

commit;
