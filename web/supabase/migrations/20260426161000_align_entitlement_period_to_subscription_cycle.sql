begin;

create or replace function public.sync_user_entitlements_from_billing(
  p_user_id uuid,
  p_plan_key text,
  p_status text,
  p_current_period_start timestamptz,
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
    p_current_period_start,
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

revoke all on function public.sync_user_entitlements_from_billing(uuid, text, text, timestamptz, timestamptz, integer, integer, integer, integer) from public;
grant execute on function public.sync_user_entitlements_from_billing(uuid, text, text, timestamptz, timestamptz, integer, integer, integer, integer) to service_role;

commit;
