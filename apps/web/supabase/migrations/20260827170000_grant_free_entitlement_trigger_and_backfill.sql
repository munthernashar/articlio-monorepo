begin;

-- Pricing-Umstellung Phase 1b: jedes neue Profil bekommt sofort ein aktives Free-Entitlement,
-- ohne über Stripe zu laufen (Free hat keinen Stripe-Preis und keinen Checkout-Pfad). Nutzt
-- dieselbe sync_user_entitlements_from_billing-Funktion, die auch der Stripe-Webhook für
-- bezahlte Pläne aufruft -- ein Entitlement entsteht damit weiterhin nur über diese eine
-- Funktion, nie über einen zweiten Schreibpfad direkt in user_entitlements.
create or replace function public.grant_free_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_user_entitlements_from_billing(
    new.id,
    'free',
    'active',
    null,
    1,
    300,
    null,
    100000
  );
  return new;
end;
$$;

create trigger trg_grant_free_entitlement
after insert on public.profiles
for each row execute procedure public.grant_free_entitlement();

comment on function public.grant_free_entitlement() is 'Vergibt jedem neuen Profil automatisch ein aktives Free-Entitlement (1 Session/Tag, 5 Minuten) -- Teil der Drei-Pakete-Preisstruktur (Free/Starter/Pro), löst die frühere "kein dauerhaftes Free-Tier"-Entscheidung ab.';

-- Backfill: bestehende Nutzer ohne user_entitlements-Zeile (bislang dauerhaft blockiert, siehe
-- process-session/index.ts) bekommen rückwirkend Free statt weiterhin keinen Zugang zu haben.
insert into public.user_entitlements (
  user_id, plan_key, sessions_per_day_limit, max_session_length_seconds,
  daily_conversation_seconds_limit, monthly_token_limit, billing_period_start, billing_period_end, status
)
select
  p.id, 'free', 1, 300, null, 100000, timezone('utc', now()), null, 'active'
from public.profiles p
where not exists (
  select 1 from public.user_entitlements ue where ue.user_id = p.id
);

commit;
