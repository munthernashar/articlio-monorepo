begin;

alter table public.app_settings
  add column if not exists max_session_length_seconds integer not null default 900;

alter table public.app_settings
  drop constraint if exists app_settings_max_session_length_seconds_range;

alter table public.app_settings
  add constraint app_settings_max_session_length_seconds_range
  check (max_session_length_seconds >= 60 and max_session_length_seconds <= 7200);

commit;
