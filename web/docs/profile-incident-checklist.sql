-- Incident checklist: slow/failing public.profiles reads + missing profile backfill
-- Run in Supabase SQL Editor with a privileged role.

-- 1) Verify profile rows exist for affected user IDs.
-- Replace array values with affected auth.users IDs.
with affected_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
)
select
  au.user_id,
  p.id is not null as profile_exists,
  p.role,
  p.created_at,
  p.updated_at
from affected_users au
left join public.profiles p on p.id = au.user_id
order by au.user_id;

-- 2) Validate missing profiles globally (auth.users without public.profiles row).
select count(*) as missing_profile_count
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 3) Backfill missing profiles for affected IDs only.
with affected_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
)
insert into public.profiles (id)
select au.user_id
from affected_users au
join auth.users u on u.id = au.user_id
left join public.profiles p on p.id = au.user_id
where p.id is null
on conflict (id) do nothing;

-- 4) Optional global backfill (safe due to ON CONFLICT DO NOTHING).
insert into public.profiles (id)
select u.id
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 5) Validate trigger + function wiring.
select
  t.tgname as trigger_name,
  n.nspname as trigger_schema,
  c.relname as table_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgname = 'trg_on_auth_user_created';

-- 6) Validate RLS select policies on public.profiles.
select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
  and cmd = 'SELECT';

-- 7) Quick performance signal for profile reads (index usage and plan shape).
explain (analyze, buffers)
select *
from public.profiles
where id = '00000000-0000-0000-0000-000000000000'::uuid;
