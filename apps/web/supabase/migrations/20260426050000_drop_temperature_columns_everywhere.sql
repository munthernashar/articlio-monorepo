begin;

-- Removes any column named "temperature" from all base tables in the public schema.
-- Uses IF EXISTS semantics via catalog lookup so it is safe to run repeatedly.
do $$
declare
  rec record;
begin
  for rec in
    select c.table_schema, c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'temperature'
      and t.table_type = 'BASE TABLE'
  loop
    execute format(
      'alter table %I.%I drop column if exists temperature cascade',
      rec.table_schema,
      rec.table_name
    );
  end loop;
end $$;

commit;
