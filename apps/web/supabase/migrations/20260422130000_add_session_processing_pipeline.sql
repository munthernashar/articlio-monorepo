begin;

alter type public.conversation_session_status add value if not exists 'processing';
alter type public.conversation_session_status add value if not exists 'failed';

alter table public.session_transcripts
  add column if not exists raw_transcript text,
  add column if not exists cleaned_transcript text,
  add column if not exists utterances_json jsonb not null default '[]'::jsonb,
  add column if not exists notes_json jsonb not null default '{}'::jsonb,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists last_processed_at timestamptz,
  add column if not exists next_retry_at timestamptz;

alter table public.session_transcripts
  add constraint session_transcripts_attempt_count_non_negative
  check (attempt_count >= 0);

create unique index if not exists idx_session_transcripts_session_unique
  on public.session_transcripts (session_id);

create index if not exists idx_session_transcripts_retry_queue
  on public.session_transcripts (status, next_retry_at)
  where status = 'failed';

commit;
