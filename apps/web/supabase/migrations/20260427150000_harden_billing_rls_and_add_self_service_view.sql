begin;

alter table public.billing_customers enable row level security;
alter table public.billing_customers force row level security;

alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscriptions force row level security;

alter table public.billing_events enable row level security;
alter table public.billing_events force row level security;

revoke all on table public.billing_customers from anon, authenticated;
revoke all on table public.billing_subscriptions from anon, authenticated;
revoke all on table public.billing_events from anon, authenticated;

grant all on table public.billing_customers to service_role;
grant all on table public.billing_subscriptions to service_role;
grant all on table public.billing_events to service_role;

drop policy if exists "billing_customers_user_select_own" on public.billing_customers;
drop policy if exists "billing_subscriptions_user_select_own" on public.billing_subscriptions;
drop policy if exists "billing_events_admin_select" on public.billing_events;

create policy "billing_customers_user_select_own"
on public.billing_customers
for select
to authenticated
using (auth.uid() = user_id);

create policy "billing_subscriptions_user_select_own"
on public.billing_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

create policy "billing_events_admin_select"
on public.billing_events
for select
to authenticated
using (public.is_admin());

create or replace view public.my_billing_status
with (security_invoker = true)
as
select
  bs.user_id,
  bs.plan_key,
  bs.status,
  bs.current_period_start,
  bs.current_period_end,
  bs.cancel_at_period_end,
  bs.canceled_at,
  bc.email as billing_email,
  bs.updated_at
from public.billing_subscriptions bs
left join public.billing_customers bc
  on bc.user_id = bs.user_id;

revoke all on public.my_billing_status from public;
grant select on public.my_billing_status to authenticated;
grant select on public.my_billing_status to service_role;

comment on view public.my_billing_status is 'Sichere Lesesicht für den eigenen Billing-Status im Frontend (RLS + security_invoker).';

commit;
