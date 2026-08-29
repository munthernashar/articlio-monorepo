begin;

-- Korrektur (27.08.2026, zweite Runde): 2 Minuten (Migration 20260827180000) sind zu riskant --
-- das erhöht die Chance, dass eine Free-Session in den insufficient_data-Bereich rutscht (zu
-- wenig Sprachmaterial für eine verlässliche 7-Kategorien-Analyse). Auf 3 Minuten angehoben.
-- Aktualisiert Katalog-Eintrag, Trigger und zur Sicherheit bereits bestehende Free-Zeilen in
-- user_entitlements.

update public.billing_plan_catalog
set limits = '{"sessionsPerDay":1,"maxSessionLengthMinutes":3}'::jsonb
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
    180,
    null,
    100000
  );
  return new;
end;
$$;

comment on function public.grant_free_entitlement() is 'Vergibt jedem neuen Profil automatisch ein aktives Free-Entitlement (1 Session/Tag, 3 Minuten) -- Teil der Drei-Pakete-Preisstruktur (Free/Starter/Pro), löst die frühere "kein dauerhaftes Free-Tier"-Entscheidung ab.';

update public.user_entitlements
set max_session_length_seconds = 180
where plan_key = 'free' and max_session_length_seconds in (120, 300);

commit;
