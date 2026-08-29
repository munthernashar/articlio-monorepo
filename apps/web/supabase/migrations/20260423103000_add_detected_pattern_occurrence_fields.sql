alter table public.detected_patterns
  add column if not exists occurrence_count integer not null default 0,
  add column if not exists occurrence_window_start timestamptz,
  add column if not exists occurrence_window_end timestamptz;

alter table public.detected_patterns
  drop constraint if exists detected_patterns_occurrence_count_non_negative;

alter table public.detected_patterns
  add constraint detected_patterns_occurrence_count_non_negative
  check (occurrence_count >= 0);

update public.detected_patterns
set
  occurrence_count = coalesce(
    nullif(evidence ->> 'occurrence_count', '')::integer,
    nullif(evidence ->> 'session_count', '')::integer,
    occurrence_count,
    0
  ),
  occurrence_window_start = coalesce(
    occurrence_window_start,
    nullif(evidence ->> 'window_start', '')::timestamptz
  ),
  occurrence_window_end = coalesce(
    occurrence_window_end,
    nullif(evidence ->> 'window_end', '')::timestamptz
  );
