begin;

-- Status-Enums für konsistente, typsichere Zustände
create type public.conversation_session_status as enum (
  'draft',
  'active',
  'completed',
  'archived'
);

create type public.processing_status as enum (
  'pending',
  'processing',
  'completed',
  'failed'
);

create type public.pattern_status as enum (
  'active',
  'resolved',
  'ignored'
);

create type public.focus_topic_status as enum (
  -- Historische Legacy-Werte (immutable Migration-Historie):
  -- Werden in 20260423173000_migrate_focus_topic_status_to_domain_states.sql
  -- auf die neuen Domainstatus gemappt.
  'active',
  'mastered',
  'paused',
  'archived'
);

create type public.tutor_interaction_status as enum (
  'queued',
  'sent',
  'responded',
  'failed'
);

create type public.improvement_check_status as enum (
  'pending',
  'passed',
  'failed',
  'skipped'
);

create type public.snapshot_status as enum (
  'current',
  'historical',
  'superseded'
);

-- 1) Zentrale Session-Tabelle als Wurzel für Verlauf und Dashboard
create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  source text,
  status public.conversation_session_status not null default 'draft',
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint conversation_sessions_title_length check (
    title is null or char_length(title) between 1 and 200
  ),
  constraint conversation_sessions_source_length check (
    source is null or char_length(source) between 1 and 120
  ),
  constraint conversation_sessions_time_order check (
    ended_at is null or started_at is null or ended_at >= started_at
  )
);

create unique index idx_conversation_sessions_id_user
  on public.conversation_sessions (id, user_id);
create index idx_conversation_sessions_user_created
  on public.conversation_sessions (user_id, created_at desc);
create index idx_conversation_sessions_status
  on public.conversation_sessions (status);

-- 2) Volltext/Segmentierte Transkripte pro Session
create table public.session_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  status public.processing_status not null default 'pending',
  transcript_text text,
  language_code text,
  word_count integer,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint session_transcripts_word_count_non_negative check (
    word_count is null or word_count >= 0
  ),
  constraint session_transcripts_language_code_length check (
    language_code is null or char_length(language_code) between 2 and 12
  ),
  constraint session_transcripts_session_fk
    foreign key (session_id, user_id)
    references public.conversation_sessions (id, user_id)
    on delete cascade
);

create unique index idx_session_transcripts_id_user
  on public.session_transcripts (id, user_id);
create index idx_session_transcripts_session
  on public.session_transcripts (session_id, created_at desc);
create index idx_session_transcripts_user_status
  on public.session_transcripts (user_id, status);

-- 3) KI-Analysen zu einer Session / einem Transkript
create table public.session_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  transcript_id uuid,
  status public.processing_status not null default 'pending',
  analysis_version text,
  score_overall numeric(5,2),
  summary jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint session_analyses_score_range check (
    score_overall is null or (score_overall >= 0 and score_overall <= 100)
  ),
  constraint session_analyses_analysis_version_length check (
    analysis_version is null or char_length(analysis_version) between 1 and 60
  ),
  constraint session_analyses_session_fk
    foreign key (session_id, user_id)
    references public.conversation_sessions (id, user_id)
    on delete cascade,
  constraint session_analyses_transcript_fk
    foreign key (transcript_id, user_id)
    references public.session_transcripts (id, user_id)
    on delete set null
);

create unique index idx_session_analyses_id_user
  on public.session_analyses (id, user_id);
create index idx_session_analyses_session
  on public.session_analyses (session_id, created_at desc);
create index idx_session_analyses_user_status
  on public.session_analyses (user_id, status);

-- 4) Erkannte Muster aus Analysen
create table public.detected_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  analysis_id uuid,
  status public.pattern_status not null default 'active',
  pattern_type text not null,
  severity smallint,
  evidence jsonb not null default '{}'::jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint detected_patterns_pattern_type_length check (
    char_length(pattern_type) between 1 and 80
  ),
  constraint detected_patterns_severity_range check (
    severity is null or (severity >= 1 and severity <= 5)
  ),
  constraint detected_patterns_analysis_fk
    foreign key (analysis_id, user_id)
    references public.session_analyses (id, user_id)
    on delete set null
);

create index idx_detected_patterns_user_status
  on public.detected_patterns (user_id, status, created_at desc);
create index idx_detected_patterns_type
  on public.detected_patterns (pattern_type);

-- 5) Lernfokus-Themen je User
create table public.focus_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Historischer Legacy-Default; wird durch die Mapping-Migration ersetzt.
  status public.focus_topic_status not null default 'active',
  topic_key text not null,
  title text not null,
  description text,
  priority smallint,
  confidence numeric(5,2),
  source_pattern_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint focus_topics_topic_key_length check (
    char_length(topic_key) between 1 and 80
  ),
  constraint focus_topics_title_length check (
    char_length(title) between 1 and 200
  ),
  constraint focus_topics_priority_range check (
    priority is null or (priority >= 1 and priority <= 5)
  ),
  constraint focus_topics_confidence_range check (
    confidence is null or (confidence >= 0 and confidence <= 100)
  ),
  constraint focus_topics_source_pattern_fk
    foreign key (source_pattern_id)
    references public.detected_patterns (id)
    on delete set null,
  constraint focus_topics_user_topic_unique unique (user_id, topic_key)
);

create unique index idx_focus_topics_id_user
  on public.focus_topics (id, user_id);
create index idx_focus_topics_user_status
  on public.focus_topics (user_id, status, updated_at desc);

-- 6) Tutor-Interaktionen innerhalb einer Session
create table public.tutor_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  transcript_id uuid,
  status public.tutor_interaction_status not null default 'queued',
  prompt_text text,
  response_text text,
  model_name text,
  token_usage jsonb not null default '{}'::jsonb,
  interaction_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tutor_interactions_model_name_length check (
    model_name is null or char_length(model_name) between 1 and 120
  ),
  constraint tutor_interactions_session_fk
    foreign key (session_id, user_id)
    references public.conversation_sessions (id, user_id)
    on delete cascade,
  constraint tutor_interactions_transcript_fk
    foreign key (transcript_id, user_id)
    references public.session_transcripts (id, user_id)
    on delete set null
);

create index idx_tutor_interactions_user_created
  on public.tutor_interactions (user_id, created_at desc);
create index idx_tutor_interactions_session
  on public.tutor_interactions (session_id, created_at desc);

-- 7) Improvement-Checks (manuell/automatisch)
create table public.improvement_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid,
  focus_topic_id uuid,
  status public.improvement_check_status not null default 'pending',
  check_type text not null,
  score numeric(5,2),
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint improvement_checks_check_type_length check (
    char_length(check_type) between 1 and 80
  ),
  constraint improvement_checks_score_range check (
    score is null or (score >= 0 and score <= 100)
  ),
  constraint improvement_checks_session_fk
    foreign key (session_id, user_id)
    references public.conversation_sessions (id, user_id)
    on delete set null,
  constraint improvement_checks_focus_topic_fk
    foreign key (focus_topic_id, user_id)
    references public.focus_topics (id, user_id)
    on delete set null
);

create index idx_improvement_checks_user_created
  on public.improvement_checks (user_id, created_at desc);
create index idx_improvement_checks_focus_topic
  on public.improvement_checks (focus_topic_id, created_at desc);

-- 8) Snapshot-Tabelle für Dashboard/Trendentwicklung
create table public.learner_progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.snapshot_status not null default 'current',
  snapshot_date date not null default (timezone('utc', now()))::date,
  overall_score numeric(5,2),
  streak_days integer,
  totals jsonb not null default '{}'::jsonb,
  dimensions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint learner_progress_snapshots_overall_score_range check (
    overall_score is null or (overall_score >= 0 and overall_score <= 100)
  ),
  constraint learner_progress_snapshots_streak_non_negative check (
    streak_days is null or streak_days >= 0
  ),
  constraint learner_progress_snapshots_user_date_unique unique (user_id, snapshot_date)
);

create index idx_learner_progress_snapshots_user_date
  on public.learner_progress_snapshots (user_id, snapshot_date desc);
create index idx_learner_progress_snapshots_status
  on public.learner_progress_snapshots (status);

-- Updated-at Trigger an allen neuen Tabellen
create trigger trg_conversation_sessions_set_updated_at
before update on public.conversation_sessions
for each row
execute function public.set_updated_at();

create trigger trg_session_transcripts_set_updated_at
before update on public.session_transcripts
for each row
execute function public.set_updated_at();

create trigger trg_session_analyses_set_updated_at
before update on public.session_analyses
for each row
execute function public.set_updated_at();

create trigger trg_detected_patterns_set_updated_at
before update on public.detected_patterns
for each row
execute function public.set_updated_at();

create trigger trg_focus_topics_set_updated_at
before update on public.focus_topics
for each row
execute function public.set_updated_at();

create trigger trg_tutor_interactions_set_updated_at
before update on public.tutor_interactions
for each row
execute function public.set_updated_at();

create trigger trg_improvement_checks_set_updated_at
before update on public.improvement_checks
for each row
execute function public.set_updated_at();

create trigger trg_learner_progress_snapshots_set_updated_at
before update on public.learner_progress_snapshots
for each row
execute function public.set_updated_at();

-- RLS aktivieren + erzwingen
alter table public.conversation_sessions enable row level security;
alter table public.conversation_sessions force row level security;

alter table public.session_transcripts enable row level security;
alter table public.session_transcripts force row level security;

alter table public.session_analyses enable row level security;
alter table public.session_analyses force row level security;

alter table public.detected_patterns enable row level security;
alter table public.detected_patterns force row level security;

alter table public.focus_topics enable row level security;
alter table public.focus_topics force row level security;

alter table public.tutor_interactions enable row level security;
alter table public.tutor_interactions force row level security;

alter table public.improvement_checks enable row level security;
alter table public.improvement_checks force row level security;

alter table public.learner_progress_snapshots enable row level security;
alter table public.learner_progress_snapshots force row level security;

-- Policy-Pattern: User nur eigene Daten lesen/schreiben, Admins lesen alles
create policy "conversation_sessions_select_own_or_admin"
on public.conversation_sessions
for select
using (auth.uid() = user_id or public.is_admin());

create policy "conversation_sessions_insert_own"
on public.conversation_sessions
for insert
with check (auth.uid() = user_id);

create policy "conversation_sessions_update_own"
on public.conversation_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "conversation_sessions_delete_own"
on public.conversation_sessions
for delete
using (auth.uid() = user_id);

create policy "session_transcripts_select_own_or_admin"
on public.session_transcripts
for select
using (auth.uid() = user_id or public.is_admin());

create policy "session_transcripts_insert_own"
on public.session_transcripts
for insert
with check (auth.uid() = user_id);

create policy "session_transcripts_update_own"
on public.session_transcripts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "session_transcripts_delete_own"
on public.session_transcripts
for delete
using (auth.uid() = user_id);

create policy "session_analyses_select_own_or_admin"
on public.session_analyses
for select
using (auth.uid() = user_id or public.is_admin());

create policy "session_analyses_insert_own"
on public.session_analyses
for insert
with check (auth.uid() = user_id);

create policy "session_analyses_update_own"
on public.session_analyses
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "session_analyses_delete_own"
on public.session_analyses
for delete
using (auth.uid() = user_id);

create policy "detected_patterns_select_own_or_admin"
on public.detected_patterns
for select
using (auth.uid() = user_id or public.is_admin());

create policy "detected_patterns_insert_own"
on public.detected_patterns
for insert
with check (auth.uid() = user_id);

create policy "detected_patterns_update_own"
on public.detected_patterns
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "detected_patterns_delete_own"
on public.detected_patterns
for delete
using (auth.uid() = user_id);

create policy "focus_topics_select_own_or_admin"
on public.focus_topics
for select
using (auth.uid() = user_id or public.is_admin());

create policy "focus_topics_insert_own"
on public.focus_topics
for insert
with check (auth.uid() = user_id);

create policy "focus_topics_update_own"
on public.focus_topics
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "focus_topics_delete_own"
on public.focus_topics
for delete
using (auth.uid() = user_id);

create policy "tutor_interactions_select_own_or_admin"
on public.tutor_interactions
for select
using (auth.uid() = user_id or public.is_admin());

create policy "tutor_interactions_insert_own"
on public.tutor_interactions
for insert
with check (auth.uid() = user_id);

create policy "tutor_interactions_update_own"
on public.tutor_interactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "tutor_interactions_delete_own"
on public.tutor_interactions
for delete
using (auth.uid() = user_id);

create policy "improvement_checks_select_own_or_admin"
on public.improvement_checks
for select
using (auth.uid() = user_id or public.is_admin());

create policy "improvement_checks_insert_own"
on public.improvement_checks
for insert
with check (auth.uid() = user_id);

create policy "improvement_checks_update_own"
on public.improvement_checks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "improvement_checks_delete_own"
on public.improvement_checks
for delete
using (auth.uid() = user_id);

create policy "learner_progress_snapshots_select_own_or_admin"
on public.learner_progress_snapshots
for select
using (auth.uid() = user_id or public.is_admin());

create policy "learner_progress_snapshots_insert_own"
on public.learner_progress_snapshots
for insert
with check (auth.uid() = user_id);

create policy "learner_progress_snapshots_update_own"
on public.learner_progress_snapshots
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "learner_progress_snapshots_delete_own"
on public.learner_progress_snapshots
for delete
using (auth.uid() = user_id);

commit;
