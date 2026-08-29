begin;

-- 1) Legacy-Schlüssel mit Versionssuffix auf kanonische prompt_keys ohne Suffix harmonisieren.
--    Kollisionen werden deterministisch behandelt:
--    - Wenn für (kanonischer_key, version) bereits ein Datensatz existiert, wird der Legacy-Datensatz deaktiviert.
--    - Wenn für den kanonischen Key bereits ein anderer aktiver Datensatz existiert, wird der Legacy-Datensatz vorab deaktiviert,
--      damit der Unique-Index auf aktiven Keys nicht verletzt wird.

with legacy_rows as (
  select
    pd.id,
    pd.prompt_key,
    regexp_replace(pd.prompt_key, '_v[0-9]+$', '') as canonical_prompt_key,
    pd.version
  from public.prompt_definitions pd
  where pd.prompt_key ~ '_v[0-9]+$'
),
rows_to_deactivate as (
  select l.id
  from legacy_rows l
  where exists (
    select 1
    from public.prompt_definitions c
    where c.prompt_key = l.canonical_prompt_key
      and c.version = l.version
      and c.id <> l.id
  )
  or exists (
    select 1
    from public.prompt_definitions a
    where a.prompt_key = l.canonical_prompt_key
      and a.is_active = true
      and a.id <> l.id
  )
)
update public.prompt_definitions pd
set
  is_active = false,
  metadata = coalesce(pd.metadata, '{}'::jsonb) || jsonb_build_object(
    'legacy_key_deactivated_at_migration', '20260424170000_migrate_prompt_keys_to_canonical'
  )
where pd.id in (select id from rows_to_deactivate)
  and pd.is_active = true;

with legacy_rows as (
  select
    pd.id,
    pd.prompt_key,
    regexp_replace(pd.prompt_key, '_v[0-9]+$', '') as canonical_prompt_key,
    pd.version
  from public.prompt_definitions pd
  where pd.prompt_key ~ '_v[0-9]+$'
)
update public.prompt_definitions pd
set
  prompt_key = l.canonical_prompt_key,
  metadata = coalesce(pd.metadata, '{}'::jsonb) || jsonb_build_object(
    'legacy_prompt_key', l.prompt_key,
    'canonicalized_at_migration', '20260424170000_migrate_prompt_keys_to_canonical'
  )
from legacy_rows l
where pd.id = l.id
  and not exists (
    select 1
    from public.prompt_definitions c
    where c.prompt_key = l.canonical_prompt_key
      and c.version = l.version
      and c.id <> l.id
  );

-- 2) prompt_execution_logs.prompt_key auf kanonische Keys backfillen,
--    damit Runtime-/Admin-Filter auf prompt_key konsistent bleiben.
update public.prompt_execution_logs pel
set prompt_key = regexp_replace(pel.prompt_key, '_v[0-9]+$', '')
where pel.prompt_key ~ '_v[0-9]+$';

-- 3) Dokumentierter Check nach der Migration:
--    Erwartung: 0 aktive prompt_definitions mit Legacy-Suffix.
--    select count(*) as active_legacy_prompt_keys
--    from public.prompt_definitions
--    where is_active = true
--      and prompt_key like '%\\_v%';

commit;
