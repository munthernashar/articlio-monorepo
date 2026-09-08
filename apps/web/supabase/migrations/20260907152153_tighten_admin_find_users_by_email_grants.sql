-- Least-privilege-Nachschärfung: CREATE FUNCTION vergibt standardmäßig EXECUTE an PUBLIC
-- (inkl. der anon-Rolle), auch wenn der interne is_admin()-Check unbefugte Aufrufe ohnehin
-- mit einer Exception abweist. Entzieht den Default und lässt nur authenticated + service_role
-- übrig, damit der Zugriffspfad auch auf Rollenebene minimal bleibt, nicht nur zur Laufzeit.
revoke execute on function public.admin_find_users_by_email(text) from public;
grant execute on function public.admin_find_users_by_email(text) to authenticated, service_role;
