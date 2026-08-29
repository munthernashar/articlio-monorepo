begin;

-- Korrektur (27.08.2026): Munther wollte für Free explizit 2 statt 5 Minuten
-- Session-Länge (Migration 20260827160000/20260827170000 hatten noch die
-- ursprünglich vorgeschlagenen 5 Minuten/300s geschrieben). Aktualisiert den
-- Katalog-Eintrag, den Trigger, der neuen Profilen automatisch Free vergibt,
-- sowie zur Sicherheit bereits bestehende Free-Zeilen in user_entitlements
-- (zum Zeitpunkt dieser Migration gab es noch keine -- der Backfill in
-- 20260827170000 fand 0 Nutzer ohne Entitlement-Zeile).

update public.billing_plan_catalog
set limits = '{"sessionsPerDay":1,"maxSessionLengthMinutes":2}'::jsonb
where plan_key = 'free';

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
    120,
    null,
    100000
  );
  return new;
end;
$$;

comment on function public.grant_free_entitlement() is 'Vergibt jedem neuen Profil automatisch ein aktives Free-Entitlement (1 Session/Tag, 2 Minuten) -- Teil der Drei-Pakete-Preisstruktur (Free/Starter/Pro), löst die frühere "kein dauerhaftes Free-Tier"-Entscheidung ab.';

update public.user_entitlements
set max_session_length_seconds = 120
where plan_key = 'free' and max_session_length_seconds = 300;

commit;
