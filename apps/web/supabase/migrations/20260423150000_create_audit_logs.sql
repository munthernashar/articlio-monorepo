begin;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before_json jsonb,
  after_json jsonb,
  trace_id text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint audit_logs_action_length check (char_length(action) between 2 and 120),
  constraint audit_logs_entity_length check (char_length(entity) between 2 and 120)
);

create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs (entity, entity_id);
create index if not exists idx_audit_logs_actor on public.audit_logs (actor_user_id, created_at desc);

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

drop policy if exists "audit_logs_admin_select" on public.audit_logs;
create policy "audit_logs_admin_select"
on public.audit_logs
for select
to authenticated
using (public.is_admin());

create or replace function public.current_trace_id()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.headers.x-trace-id', true), ''),
    nullif((current_setting('request.headers', true)::jsonb ->> 'x-trace-id'), ''),
    nullif(current_setting('request.jwt.claim.jti', true), ''),
    txid_current()::text
  );
$$;

create or replace function public.write_audit_log(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_before_json jsonb,
  p_after_json jsonb,
  p_actor_user_id uuid default auth.uid(),
  p_trace_id text default public.current_trace_id()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (
    actor_user_id,
    action,
    entity,
    entity_id,
    before_json,
    after_json,
    trace_id
  )
  values (
    p_actor_user_id,
    p_action,
    p_entity,
    p_entity_id,
    p_before_json,
    p_after_json,
    p_trace_id
  );
end;
$$;

create or replace function public.audit_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    perform public.write_audit_log(
      'update',
      'profiles',
      new.id::text,
      jsonb_build_object('role', old.role),
      jsonb_build_object('role', new.role)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_profile_role_changes on public.profiles;
create trigger trg_audit_profile_role_changes
after update on public.profiles
for each row
execute function public.audit_profile_role_changes();

create or replace function public.audit_prompt_definition_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'insert',
      'prompt_definitions',
      new.id::text,
      null,
      to_jsonb(new)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.write_audit_log(
      'update',
      'prompt_definitions',
      new.id::text,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_audit_log(
      'delete',
      'prompt_definitions',
      old.id::text,
      to_jsonb(old),
      null
    );
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_audit_prompt_definition_changes on public.prompt_definitions;
create trigger trg_audit_prompt_definition_changes
after insert or update or delete on public.prompt_definitions
for each row
execute function public.audit_prompt_definition_changes();

create or replace function public.audit_app_settings_updates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'update',
    'app_settings',
    new.id::text,
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_app_settings_updates on public.app_settings;
create trigger trg_audit_app_settings_updates
after update on public.app_settings
for each row
execute function public.audit_app_settings_updates();

create or replace view public.admin_audit_log_entries
with (security_invoker = true)
as
select
  l.id,
  l.created_at,
  l.trace_id,
  l.actor_user_id,
  p.display_name as actor_display_name,
  p.role as actor_role,
  l.action,
  l.entity,
  l.entity_id,
  l.before_json,
  l.after_json
from public.audit_logs l
left join public.profiles p on p.id = l.actor_user_id
order by l.created_at desc;

grant select on public.admin_audit_log_entries to authenticated;

commit;
