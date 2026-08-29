-- Bugfix: "permission denied for table billing_customers" (Postgres 42501) beim Laden
-- des Testphasen-Status auf der Preise-Seite.
--
-- 20260427150000_harden_billing_rls_and_add_self_service_view.sql hat RLS auf
-- billing_customers aktiviert/erzwungen, alle Rechte von anon/authenticated entzogen
-- und ausschließlich service_role vollen Zugriff gewährt -- dabei aber gleichzeitig
-- eine RLS-Policy "billing_customers_user_select_own" für die Rolle authenticated
-- angelegt, die ohne ein zugehöriges GRANT SELECT nie wirksam werden kann (Postgres
-- prüft Tabellen-Grants vor RLS-Policies). checkoutService.checkTrialEligibility()
-- liest seitdem direkt gegen billing_customers (eingeführt mit der 14-Tage-Testphase,
-- 20260816150000_add_trial_tracking_to_billing_customers.sql) und schlägt dadurch mit
-- "permission denied" fehl, statt die eigene Zeile über die bereits vorhandene,
-- korrekt auf auth.uid() = user_id eingeschränkte Policy zu lesen.
--
-- Fix: das fehlende GRANT ergänzen, damit die seit April bestehende Policy greift.
-- Kein RLS-Verhalten ändert sich -- Nutzer sehen weiterhin ausschließlich ihre eigene
-- Zeile (billing_customers_user_select_own bleibt unverändert in Kraft).

grant select on public.billing_customers to authenticated;
