-- ensure only one active main focus topic per user
-- Historischer Legacy-Statuswert "active"; wird in
-- 20260423173000_migrate_focus_topic_status_to_domain_states.sql zu "in_training" gemappt.
create unique index if not exists idx_focus_topics_single_active_per_user
  on public.focus_topics (user_id)
  where status = 'active';
