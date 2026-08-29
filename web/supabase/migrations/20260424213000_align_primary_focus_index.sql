-- Align primary-focus uniqueness index with domain statuses.
-- Service code expects idx_single_active_focus to enforce one active primary focus per user.
drop index if exists public.idx_focus_topics_single_active_per_user;

create unique index if not exists idx_single_active_focus
  on public.focus_topics(user_id)
  where status in ('in_training', 'teilweise_stabilisiert');
