begin;

-- IMMUTABLE-HISTORIE:
-- Diese Migration bildet bestehende Legacy-Fokusstatus explizit auf Domainstatus ab:
-- active -> in_training, mastered -> stabil, paused -> beobachtet, archived -> unentdeckt.
create type public.focus_topic_status_v2 as enum (
  'unentdeckt',
  'beobachtet',
  'wiederkehrend',
  'in_training',
  'teilweise_stabilisiert',
  'stabil',
  'rueckfall_erkannt'
);

alter table public.focus_topics
  alter column status drop default;

drop index if exists public.idx_focus_topics_single_active_per_user;

alter table public.focus_topics
  alter column status type public.focus_topic_status_v2
  using (
    case status::text
      when 'active' then 'in_training'
      when 'mastered' then 'stabil'
      when 'paused' then 'beobachtet'
      when 'archived' then 'unentdeckt'
      else 'unentdeckt'
    end
  )::public.focus_topic_status_v2;

alter table public.focus_topics
  alter column status set default 'in_training'::public.focus_topic_status_v2;

create unique index if not exists idx_focus_topics_single_active_per_user
  on public.focus_topics (user_id)
  where status = 'in_training';

alter type public.focus_topic_status rename to focus_topic_status_legacy;
alter type public.focus_topic_status_v2 rename to focus_topic_status;
drop type public.focus_topic_status_legacy;

commit;
