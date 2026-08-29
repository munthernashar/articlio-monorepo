alter table public.focus_topics
add column if not exists mastery_level smallint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'focus_topics_mastery_level_range'
  ) then
    alter table public.focus_topics
      add constraint focus_topics_mastery_level_range
      check (mastery_level >= 0 and mastery_level <= 5);
  end if;
end
$$;

update public.learner_progress_snapshots
set dimensions = jsonb_set(dimensions, '{global_mastery_level}', to_jsonb(0), true)
where not (dimensions ? 'global_mastery_level');
