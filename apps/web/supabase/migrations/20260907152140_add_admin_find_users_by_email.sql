-- Admin-Backoffice (07.09.2026): AdminEntitlementsPage verlangte bislang die rohe
-- user_entitlements.user_id (UUID) -- Admins mussten die ID vorher separat per SQL
-- nachschlagen. Diese Funktion erlaubt eine Suche nach (Teil-)E-Mail direkt aus der
-- Admin-UI. security definer + interner is_admin()-Check ist nötig, weil auth.users
-- clientseitig sonst gar nicht abfragbar ist (keine PostgREST-Exposition, kein Admin-API-
-- Zugriff im Browser) -- die Funktion ist der einzige, eng begrenzte Zugriffspfad.
--
-- Wichtig, per Codeprüfung entdeckt: get_funnel_daily_summary() ist security definer OHNE
-- eigenen is_admin()-Check und EXECUTE ist an "authenticated" (nicht nur Admins) vergeben --
-- das ist eine bestehende, unabhängige Lücke (jeder eingeloggte Nutzer kann aktuell
-- Funnel-Aggregate abrufen), aber aus dem Scope dieser Änderung. Hier bewusst anders gebaut:
-- is_admin() wird explizit geprüft und wirft bei fehlender Admin-Rolle eine Exception, bevor
-- irgendetwas aus auth.users gelesen wird.

create or replace function public.admin_find_users_by_email(p_query text)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  current_plan_key text,
  current_status text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Nur Admins duerfen Nutzer suchen.';
  end if;

  if p_query is null or length(trim(p_query)) < 2 then
    raise exception using errcode = '22023', message = 'Suchbegriff muss mindestens 2 Zeichen lang sein.';
  end if;

  return query
    select
      u.id as user_id,
      u.email::text as email,
      p.display_name,
      p.role::text as role,
      ue.plan_key as current_plan_key,
      ue.status as current_status
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.user_entitlements ue on ue.user_id = u.id
    where u.email ilike '%' || trim(p_query) || '%'
    order by u.email
    limit 20;
end;
$$;

grant execute on function public.admin_find_users_by_email(text) to authenticated;

comment on function public.admin_find_users_by_email(text) is
  'Admin-only: sucht Nutzer per (Teil-)E-Mail für die manuelle Entitlement-Zuweisung (AdminEntitlementsPage). Wirft eine Exception, wenn is_admin() false ist.';
