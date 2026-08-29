begin;

alter table public.session_analyses
  add column if not exists category_scores_json jsonb not null default '{}'::jsonb,
  add column if not exists detected_patterns_json jsonb not null default '[]'::jsonb,
  add column if not exists priority_intervention_json jsonb not null default '{}'::jsonb,
  add column if not exists session_summary text,
  add column if not exists last_error text;

create unique index if not exists idx_session_analyses_session_unique
  on public.session_analyses (session_id);

create index if not exists idx_session_analyses_user_created
  on public.session_analyses (user_id, created_at desc);

commit;
