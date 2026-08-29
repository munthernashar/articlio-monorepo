# Supabase Incident Runbook: `public.profiles` Reads/Failures

## Scope
This runbook is for incidents where affected users cannot load profile-backed pages, or requests are slow/failing around `public.profiles`.

## 1) API logs (Supabase Dashboard)
1. Go to **Supabase Dashboard → Logs → API**.
2. Filter by timeframe of the incident and endpoint(s) that load profile data.
3. Filter for status `>=400` and search for `profiles` in request metadata.
4. Collect:
   - HTTP status (401/403/500)
   - latency (P95/P99 if available)
   - error payload (RLS permission denied, timeout, etc.)

## 2) Postgres logs (Supabase Dashboard)
1. Go to **Supabase Dashboard → Logs → Postgres**.
2. Filter incident timeframe.
3. Search terms:
   - `public.profiles`
   - `permission denied`
   - `RLS`
   - `statement timeout`
   - `trg_on_auth_user_created`
4. Confirm whether there are errors during signups/inserts into `auth.users` or profile reads.

## 3) SQL checks and remediation
Use: `docs/profile-incident-checklist.sql`

This script covers:
- existence checks for `public.profiles` rows of affected IDs,
- global missing-profile count,
- targeted/global backfill,
- trigger/function validation (`trg_on_auth_user_created` + `public.handle_new_auth_user()`),
- SELECT policy validation for `profiles_select_own_or_admin`,
- a quick `EXPLAIN ANALYZE` sanity check for single-row profile lookups.

## 4) Post-remediation validation
1. Re-test affected users.
2. Confirm API logs no longer show profile read errors.
3. Confirm Postgres logs show no fresh RLS or timeout errors.
4. Keep the SQL result snapshot in incident notes.
