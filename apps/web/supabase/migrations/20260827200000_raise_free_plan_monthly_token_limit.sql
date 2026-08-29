begin;

-- Korrektur (27.08.2026): grant_free_entitlement() vergab bislang ein monthly_token_limit von
-- 100.000 -- ein bei der Trigger-Erstellung eher beiläufig gewählter Default, nicht anhand
-- echten Verbrauchs kalkuliert. Bei realistischem Verbrauch (~6.000-6.900 Tokens für
-- Transkript-Cleanup + session_analysis pro Session, Transkription reserviert keine Tokens)
-- greift dieses Limit schon nach ~14-15 Sessions im Monat -- deutlich vor Monatsende.
--
-- Der eigentliche "Kalendertage-Mechanismus", den man für ein Tageslimit braucht, existiert
-- bereits: enforceSessionsPerDayGuard() in process-session/index.ts prüft pro UTC-Kalendertag
-- und erlaubt dadurch automatisch bis zu 28, 30 oder 31 Sessions/Monat, je nach echter
-- Monatslänge -- dafür muss nichts Neues gebaut werden. Das monthly_token_limit ist ein davon
-- unabhängiges, zweites Gate und muss nur großzügig genug sein, dass es bei täglicher Nutzung
-- nicht vorzeitig bindet. 200.000 deckt 31 Sessions à ~6.450 Tokens -- Puffer über der
-- Schätzung von ~6.000 Tokens/Session bei der aktuellen 3-Minuten-Free-Länge.
--
-- Starter (300.000) und Pro (1.200.000) haben bei denselben Tokens/Session bereits
-- ausreichend Kapazität für 31 tägliche Sessions (~43 bzw. ~174 Sessions Kapazität) -- betrifft
-- also nur Free.

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
    200000
  );
  return new;
end;
$$;

comment on function public.grant_free_entitlement() is 'Vergibt jedem neuen Profil automatisch ein aktives Free-Entitlement (1 Session/Tag, 3 Minuten, 200.000 Tokens/Monat) -- Teil der Drei-Pakete-Preisstruktur (Free/Starter/Pro), löst die frühere "kein dauerhaftes Free-Tier"-Entscheidung ab. Das Token-Limit ist bewusst großzügig bemessen, damit der tägliche Sessions-Guard (nicht dieses Limit) die praktische Grenze bleibt.';

update public.user_entitlements
set monthly_token_limit = 200000
where plan_key = 'free' and monthly_token_limit = 100000;

commit;
