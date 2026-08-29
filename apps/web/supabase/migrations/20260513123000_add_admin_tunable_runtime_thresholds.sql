begin;

alter table public.app_settings
  add column if not exists diagnosis_max_sessions integer not null default 5,
  add column if not exists session_lookback_limit integer not null default 8,
  add column if not exists non_primary_session_score_multiplier double precision not null default 0.5,
  add column if not exists focus_recurrence_threshold double precision not null default 0.5,
  add column if not exists worsened_delta_threshold double precision not null default -0.5;

alter table public.app_settings
  drop constraint if exists app_settings_diagnosis_max_sessions_range,
  drop constraint if exists app_settings_session_lookback_limit_range,
  drop constraint if exists app_settings_non_primary_session_score_multiplier_range,
  drop constraint if exists app_settings_focus_recurrence_threshold_range,
  drop constraint if exists app_settings_worsened_delta_threshold_range;

alter table public.app_settings
  add constraint app_settings_diagnosis_max_sessions_range
    check (diagnosis_max_sessions >= 3 and diagnosis_max_sessions <= 12),
  add constraint app_settings_session_lookback_limit_range
    check (session_lookback_limit >= 3 and session_lookback_limit <= 20),
  add constraint app_settings_non_primary_session_score_multiplier_range
    check (non_primary_session_score_multiplier >= 0.1 and non_primary_session_score_multiplier <= 1.0),
  add constraint app_settings_focus_recurrence_threshold_range
    check (focus_recurrence_threshold >= 0.1 and focus_recurrence_threshold <= 1.0),
  add constraint app_settings_worsened_delta_threshold_range
    check (worsened_delta_threshold >= -3.0 and worsened_delta_threshold <= 0.0);

commit;
