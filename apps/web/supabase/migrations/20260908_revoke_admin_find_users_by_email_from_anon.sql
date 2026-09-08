-- Nachschärfung (08.09.2026): die vorherige Migration (20260907152153) hat EXECUTE von PUBLIC
-- entzogen, aber die anon-Rolle behielt EXECUTE -- Supabase vergibt für neue Functions im
-- public-Schema per Default Privileges automatisch EXECUTE an anon/authenticated/service_role,
-- unabhängig vom expliziten GRANT in der Funktionsdefinition. Funktional unkritisch (der interne
-- is_admin()-Check weist anonyme Aufrufe ohnehin mit einer Exception ab, siehe
-- admin_find_users_by_email), aber inkonsistent mit dem in der Ursprungsmigration dokumentierten
-- Least-Privilege-Ziel ("nur authenticated + service_role"). Entzieht anon jetzt explizit.
revoke execute on function public.admin_find_users_by_email(text) from anon;
