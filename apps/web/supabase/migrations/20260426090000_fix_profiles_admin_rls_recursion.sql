begin;

alter table public.profiles no force row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_owner_or_admin(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() = target_user_id or public.is_admin();
$$;

revoke all on function public.is_owner_or_admin(uuid) from public;
grant execute on function public.is_owner_or_admin(uuid) to authenticated;

drop policy if exists "profiles_admin_select_all" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;
drop policy if exists "profiles_admin_delete_all" on public.profiles;

create policy "profiles_admin_select_all"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "profiles_admin_update_all"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_admin_delete_all"
on public.profiles
for delete
to authenticated
using (public.is_admin());

drop policy if exists "prompt_execution_logs_admin_insert" on public.prompt_execution_logs;

create policy "prompt_execution_logs_admin_insert"
on public.prompt_execution_logs
for insert
to authenticated
with check (public.is_admin());

commit;
