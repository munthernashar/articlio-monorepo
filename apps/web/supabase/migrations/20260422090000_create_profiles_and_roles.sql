-- Migration: Benutzerprofile + Rollen (user/admin)
-- Auth-Basis: auth.users
-- App-Daten: public.profiles

begin;

-- 1) Rollen-Typ für klare, eingeschränkte Werte
create type public.user_role as enum ('user', 'admin');

-- 2) Erweiterte Profiltabelle mit FK -> auth.users
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'user',
  display_name text,
  native_language text,
  german_level text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 120
  ),
  constraint profiles_native_language_length check (
    native_language is null or char_length(native_language) between 2 and 100
  ),
  constraint profiles_german_level_allowed check (
    german_level is null or german_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')
  )
);

comment on table public.profiles is 'Erweiterte App-Profildaten je Auth-User.';
comment on column public.profiles.id is '1:1 Referenz auf auth.users.id';
comment on column public.profiles.role is 'Anwendungsrolle: user oder admin';

-- 3) Updated-at Trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- 4) Profil beim neuen Auth-User automatisch anlegen
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- 5) RLS + Policies
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Hilfsfunktion: Ist aktueller User Admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

-- Benutzer dürfen nur eigenes Profil lesen
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  auth.uid() = id
  or public.is_admin()
);

-- Benutzer dürfen nur eigenes Profil ändern (Admins dürfen alle)
create policy "profiles_update_own_or_admin"
on public.profiles
for update
using (
  auth.uid() = id
  or public.is_admin()
)
with check (
  auth.uid() = id
  or public.is_admin()
);

-- Optional: Benutzer dürfen ihr eigenes Profil initial selbst anlegen,
-- falls der Trigger ausnahmsweise nicht gegriffen hat.
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

-- Optional: Löschen nur für Admins
create policy "profiles_delete_admin"
on public.profiles
for delete
using (public.is_admin());

-- Für Performance typischer Zugriffe
create index if not exists idx_profiles_role on public.profiles (role);

commit;
