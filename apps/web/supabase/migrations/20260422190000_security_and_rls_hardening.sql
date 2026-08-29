begin;

-- 1) Harden helper functions (fixed search_path)
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

create or replace function public.is_owner_or_admin(target_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select auth.uid() = target_user_id or public.is_admin();
$$;

-- 2) Block privilege escalation on profiles for non-admin users.
create or replace function public.enforce_profile_security()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Primary key of profile must never be changed.
  if new.id is distinct from old.id then
    raise exception 'profile id is immutable';
  end if;

  -- Only admins may change role.
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_enforce_security on public.profiles;
create trigger trg_profiles_enforce_security
before update on public.profiles
for each row
execute function public.enforce_profile_security();

-- 3) Normalize profile policies (clear user/admin separation)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;
drop policy if exists "profiles_user_select_own" on public.profiles;
drop policy if exists "profiles_admin_select_all" on public.profiles;
drop policy if exists "profiles_user_insert_own" on public.profiles;
drop policy if exists "profiles_user_update_own" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;
drop policy if exists "profiles_admin_delete_all" on public.profiles;

create policy "profiles_user_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles_admin_select_all"
on public.profiles
for select
to authenticated
using (public.is_admin());

create policy "profiles_user_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles_user_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

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

-- 4) Ensure prompt/admin governance is complete and explicit.
drop policy if exists "prompt_definitions_admin_select" on public.prompt_definitions;
drop policy if exists "prompt_definitions_admin_insert" on public.prompt_definitions;
drop policy if exists "prompt_definitions_admin_update" on public.prompt_definitions;
drop policy if exists "prompt_definitions_admin_delete" on public.prompt_definitions;
drop policy if exists "prompt_execution_logs_admin_select" on public.prompt_execution_logs;
drop policy if exists "prompt_execution_logs_admin_insert" on public.prompt_execution_logs;
drop policy if exists "prompt_execution_logs_admin_delete" on public.prompt_execution_logs;

create policy "prompt_definitions_admin_select"
on public.prompt_definitions
for select
to authenticated
using (public.is_admin());

create policy "prompt_definitions_admin_insert"
on public.prompt_definitions
for insert
to authenticated
with check (public.is_admin());

create policy "prompt_definitions_admin_update"
on public.prompt_definitions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "prompt_definitions_admin_delete"
on public.prompt_definitions
for delete
to authenticated
using (public.is_admin());

create policy "prompt_execution_logs_admin_select"
on public.prompt_execution_logs
for select
to authenticated
using (public.is_admin());

create policy "prompt_execution_logs_admin_insert"
on public.prompt_execution_logs
for insert
to authenticated
with check (public.is_admin());

create policy "prompt_execution_logs_admin_delete"
on public.prompt_execution_logs
for delete
to authenticated
using (public.is_admin());

-- 5) Secure storage bucket for session audio (private + user folder isolation)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-audio',
  'session-audio',
  false,
  52428800,
  array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "session_audio_user_read_own" on storage.objects;
drop policy if exists "session_audio_user_insert_own" on storage.objects;
drop policy if exists "session_audio_user_update_own" on storage.objects;
drop policy if exists "session_audio_user_delete_own" on storage.objects;
drop policy if exists "session_audio_admin_all" on storage.objects;

create policy "session_audio_user_read_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'session-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "session_audio_user_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'session-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "session_audio_user_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'session-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'session-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "session_audio_user_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'session-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "session_audio_admin_all"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'session-audio'
  and public.is_admin()
)
with check (
  bucket_id = 'session-audio'
  and public.is_admin()
);

commit;
