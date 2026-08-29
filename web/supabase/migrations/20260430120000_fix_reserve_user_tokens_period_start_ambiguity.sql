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
  from public.resolve_billing_cycle_period(p_user_id, p_now) as rbcp
  limit 1;

  insert into public.user_usage_ledger as usage (
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

  select usage.*
    into v_row
  from public.user_usage_ledger as usage
  where usage.user_id = p_user_id
    and usage.period_start = v_period_start
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

  update public.user_usage_ledger as usage
  set tokens_reserved = v_row.tokens_reserved + v_tokens,
      updated_at = timezone('utc', now())
  where usage.user_id = p_user_id
    and usage.period_start = v_period_start
  returning usage.tokens_used, usage.tokens_reserved
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
