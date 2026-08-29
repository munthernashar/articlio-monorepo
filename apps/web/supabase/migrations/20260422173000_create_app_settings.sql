begin;

create table public.app_settings (
  id text primary key default 'global',
  min_sessions_for_diagnosis integer not null default 2,
  category_weights jsonb not null default jsonb_build_object(
    'grammatical_accuracy', 1,
    'lexical_appropriateness', 1,
    'fluency', 1,
    'intelligibility', 1,
    'coherence_and_sentence_structure', 1,
    'register_and_naturalness', 1,
    'interactional_competence', 1
  ),
  focus_topic_threshold numeric(5,2) not null default 70,
  max_sessions_per_day integer not null default 3,
  primary_score_session_index integer not null default 1,
  feedback_hardness text not null default 'balanced',
  tutor_explanation_language text not null default 'de',
  feature_flags jsonb not null default jsonb_build_object(
    'session_analysis', true,
    'multi_session_patterns', true,
    'focus_topic_selection', true,
    'tutor', true,
    'improvement_checks', true
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_settings_singleton check (id = 'global'),
  constraint app_settings_min_sessions_positive check (min_sessions_for_diagnosis >= 1 and min_sessions_for_diagnosis <= 30),
  constraint app_settings_focus_threshold_range check (focus_topic_threshold >= 0 and focus_topic_threshold <= 100),
  constraint app_settings_max_sessions_per_day_range check (max_sessions_per_day >= 1 and max_sessions_per_day <= 20),
  constraint app_settings_primary_session_index_range check (primary_score_session_index >= 1 and primary_score_session_index <= 20),
  constraint app_settings_feedback_hardness_allowed check (feedback_hardness in ('soft', 'balanced', 'direct')),
  constraint app_settings_tutor_language_length check (char_length(tutor_explanation_language) between 2 and 16)
);

create trigger trg_app_settings_set_updated_at
before update on public.app_settings
for each row
execute function public.set_updated_at();

alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;

create policy "app_settings_auth_select"
on public.app_settings
for select
to authenticated
using (true);

create policy "app_settings_admin_insert"
on public.app_settings
for insert
with check (public.is_admin());

create policy "app_settings_admin_update"
on public.app_settings
for update
using (public.is_admin())
with check (public.is_admin());

insert into public.app_settings (id)
values ('global')
on conflict (id) do nothing;

commit;
