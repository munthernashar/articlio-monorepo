-- Launch-Readiness-Audit, Prio-10: NewSessionPage pollt den Verarbeitungsstatus
-- einer Session bisher alle 4 Sekunden per REST-Request. Damit ein
-- postgres_changes-Realtime-Abo das ersetzen kann, muss die Tabelle Teil der
-- supabase_realtime-Publikation sein. Die bestehende RLS-SELECT-Policy
-- (conversation_sessions_select_own_or_admin) filtert Realtime-Events wie
-- gewohnt auf eigene Zeilen bzw. Admins.
alter publication supabase_realtime add table public.conversation_sessions;
