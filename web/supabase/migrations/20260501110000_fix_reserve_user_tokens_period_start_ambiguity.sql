drop function if exists public.reserve_user_tokens(uuid, integer, numeric, timestamp with time zone);

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
  tokens_used integer,
  tokens_reserved integer,
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entitlement public.user_entitlements%rowtype;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_monthly_token_limit integer;
  v_tokens_used integer := 0;
  v_tokens_reserved integer := 0;
  v_projected_total integer := 0;
begin
  select ue.*
  into v_entitlement
  from public.user_entitlements ue
  where ue.user_id = p_user_id
    and ue.status = 'active'
  order by ue.updated_at desc, ue.created_at desc
  limit 1;

  if not found then
    allowed := true;
    hard_limit_reached := false;
    soft_limit_reached := false;
    error_code := null;
    limit_value := null;
    tokens_used := 0;
    tokens_reserved := 0;
    period_start := date_trunc('month', p_now);
    period_end := date_trunc('month', p_now) + interval '1 month';
    return next;
    return;
  end if;

  v_monthly_token_limit := v_entitlement.monthly_token_limit;
  v_period_start := coalesce(v_entitlement.billing_period_start, date_trunc('month', p_now));
  v_period_end := coalesce(v_entitlement.billing_period_end, v_period_start + interval '1 month');

  if v_monthly_token_limit is null then
    allowed := true;
    hard_limit_reached := false;
    soft_limit_reached := false;
    error_code := null;
    limit_value := null;
    tokens_used := 0;
    tokens_reserved := 0;
    period_start := v_period_start;
    period_end := v_period_end;
    return next;
    return;
  end if;

  insert into public.user_usage_ledger (
    user_id,
    period_start,
    period_end,
    tokens_used,
    tokens_reserved,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    v_period_start,
    v_period_end,
    0,
    0,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (user_id, period_start)
  do nothing;

  select
    coalesce(uul.tokens_used, 0),
    coalesce(uul.tokens_reserved, 0)
  into
    v_tokens_used,
    v_tokens_reserved
  from public.user_usage_ledger uul
  where uul.user_id = p_user_id
    and uul.period_start = v_period_start
  for update;

  v_projected_total := v_tokens_used + v_tokens_reserved + greatest(p_tokens, 0);

  if v_projected_total > v_monthly_token_limit then
    allowed := false;
    hard_limit_reached := true;
    soft_limit_reached := true;
    error_code := 'monthly_token_limit_exceeded';
    limit_value := v_monthly_token_limit;
    tokens_used := v_tokens_used;
    tokens_reserved := v_tokens_reserved;
    period_start := v_period_start;
    period_end := v_period_end;
    return next;
    return;
  end if;

  update public.user_usage_ledger uul
  set
    tokens_reserved = coalesce(uul.tokens_reserved, 0) + greatest(p_tokens, 0),
    updated_at = timezone('utc', now())
  where uul.user_id = p_user_id
    and uul.period_start = v_period_start
  returning
    coalesce(uul.tokens_used, 0),
    coalesce(uul.tokens_reserved, 0)
  into
    v_tokens_used,
    v_tokens_reserved;

  allowed := true;
  hard_limit_reached := false;
  soft_limit_reached := v_tokens_used + v_tokens_reserved >= ceil(v_monthly_token_limit * p_soft_limit_ratio);
  error_code := null;
  limit_value := v_monthly_token_limit;
  tokens_used := v_tokens_used;
  tokens_reserved := v_tokens_reserved;
  period_start := v_period_start;
  period_end := v_period_end;

  return next;
end;
$$;

revoke all on function public.reserve_user_tokens(uuid, integer, numeric, timestamptz) from public;
grant execute on function public.reserve_user_tokens(uuid, integer, numeric, timestamptz) to authenticated;

notify pgrst, 'reload schema';
