import { supabaseClient } from '@/services/supabase/client';
import { withTimeout } from '@/lib/with-timeout';
import type { Json } from '@/types/database';
import {
  ANALYSIS_CATEGORY_KEYS,
  FEEDBACK_HARDNESS_LEVELS,
  type AppFeatureFlags,
  type AppSettings,
  type AppSettingsRow,
  type CategoryWeights,
} from '@/types/app-settings';

const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
  grammatical_accuracy: 1,
  lexical_appropriateness: 1,
  fluency: 1,
  intelligibility: 1,
  coherence_and_sentence_structure: 1,
  register_and_naturalness: 1,
  interactional_competence: 1,
};

const DEFAULT_FEATURE_FLAGS: AppFeatureFlags = {
  session_analysis: true,
  multi_session_patterns: true,
  focus_topic_selection: true,
  tutor: true,
  improvement_checks: true,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'global',
  minSessionsForDiagnosis: 3,
  categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
  improvementMinRecentSessions: 2,
  improvementMinConfidence: 60,
  improvementRequiredStreak: null,
  maxSessionsPerDay: 3,
  maxSessionLengthSeconds: 900,
  primaryScoreSessionIndex: 1,
  diagnosisMaxSessions: 5,
  sessionLookbackLimit: 8,
  nonPrimarySessionScoreMultiplier: 0.5,
  focusRecurrenceThreshold: 0.5,
  worsenedDeltaThreshold: -0.5,
  feedbackHardness: 'balanced',
  tutorExplanationLanguage: 'de',
  featureFlags: DEFAULT_FEATURE_FLAGS,
};

let cachedSettings: AppSettings | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function asObject(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseCategoryWeights(value: Json): CategoryWeights {
  const raw = asObject(value);
  return ANALYSIS_CATEGORY_KEYS.reduce((acc, category) => {
    const candidate = raw[category];
    acc[category] = typeof candidate === 'number' ? Math.max(0, Math.min(5, candidate)) : DEFAULT_CATEGORY_WEIGHTS[category];
    return acc;
  }, {} as CategoryWeights);
}

function parseFeatureFlags(value: Json): AppFeatureFlags {
  const raw = asObject(value);
  return {
    session_analysis: raw.session_analysis === false ? false : true,
    multi_session_patterns: raw.multi_session_patterns === false ? false : true,
    focus_topic_selection: raw.focus_topic_selection === false ? false : true,
    tutor: raw.tutor === false ? false : true,
    improvement_checks: raw.improvement_checks === false ? false : true,
  };
}

function mapRow(row: AppSettingsRow): AppSettings {
  const feedback = FEEDBACK_HARDNESS_LEVELS.includes(row.feedback_hardness as AppSettings['feedbackHardness'])
    ? (row.feedback_hardness as AppSettings['feedbackHardness'])
    : DEFAULT_APP_SETTINGS.feedbackHardness;

  return {
    id: 'global',
    minSessionsForDiagnosis: clamp(row.min_sessions_for_diagnosis, 3, 5),
    categoryWeights: parseCategoryWeights(row.category_weights),
    improvementMinRecentSessions: clamp(
      row.improvement_min_recent_sessions ?? DEFAULT_APP_SETTINGS.improvementMinRecentSessions,
      1,
      20,
    ),
    improvementMinConfidence: Math.max(
      0,
      Math.min(100, Math.round(
      row.improvement_min_confidence ?? DEFAULT_APP_SETTINGS.improvementMinConfidence,
    ))),
    improvementRequiredStreak:
      row.improvement_required_streak === null
        ? null
        : clamp(row.improvement_required_streak, 1, 10),
    maxSessionsPerDay: clamp(row.max_sessions_per_day, 1, 20),
    maxSessionLengthSeconds: clamp(row.max_session_length_seconds, 60, 7200),
    primaryScoreSessionIndex: clamp(row.primary_score_session_index, 1, 20),
    diagnosisMaxSessions: clamp(row.diagnosis_max_sessions ?? DEFAULT_APP_SETTINGS.diagnosisMaxSessions, 3, 12),
    sessionLookbackLimit: clamp(row.session_lookback_limit ?? DEFAULT_APP_SETTINGS.sessionLookbackLimit, 3, 20),
    nonPrimarySessionScoreMultiplier: Math.max(
      0.1,
      Math.min(1, row.non_primary_session_score_multiplier ?? DEFAULT_APP_SETTINGS.nonPrimarySessionScoreMultiplier),
    ),
    focusRecurrenceThreshold: Math.max(
      0.1,
      Math.min(1, row.focus_recurrence_threshold ?? DEFAULT_APP_SETTINGS.focusRecurrenceThreshold),
    ),
    worsenedDeltaThreshold: Math.max(
      -3,
      Math.min(0, row.worsened_delta_threshold ?? DEFAULT_APP_SETTINGS.worsenedDeltaThreshold),
    ),
    feedbackHardness: feedback,
    tutorExplanationLanguage: row.tutor_explanation_language?.trim() || DEFAULT_APP_SETTINGS.tutorExplanationLanguage,
    featureFlags: parseFeatureFlags(row.feature_flags),
  };
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export const appSettingsService = {
  async getSettings(forceRefresh = false): Promise<AppSettings> {
    if (!forceRefresh && cachedSettings) {
      return cachedSettings;
    }

    const { data, error } = await withTimeout(
      supabaseClient.from('app_settings').select('*').eq('id', 'global').maybeSingle<AppSettingsRow>(),
      10_000,
      'Zeitüberschreitung beim Laden, bitte neu laden.',
    );

    if (error) {
      throw new Error(`App-Settings konnten nicht geladen werden: ${error.message}`);
    }

    if (!data) {
      cachedSettings = DEFAULT_APP_SETTINGS;
      return cachedSettings;
    }

    cachedSettings = mapRow(data);
    return cachedSettings;
  },

  async updateSettings(next: AppSettings): Promise<AppSettings> {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .upsert(
        {
          id: 'global',
          min_sessions_for_diagnosis: clamp(next.minSessionsForDiagnosis, 3, 5),
          category_weights: toJson(next.categoryWeights),
          improvement_min_recent_sessions: clamp(next.improvementMinRecentSessions, 1, 20),
          improvement_min_confidence: Math.max(0, Math.min(100, Math.round(next.improvementMinConfidence))),
          improvement_required_streak:
            typeof next.improvementRequiredStreak === 'number'
              ? clamp(next.improvementRequiredStreak, 1, 10)
              : null,
          max_sessions_per_day: clamp(next.maxSessionsPerDay, 1, 20),
          max_session_length_seconds: clamp(next.maxSessionLengthSeconds, 60, 7200),
          primary_score_session_index: clamp(next.primaryScoreSessionIndex, 1, 20),
          diagnosis_max_sessions: clamp(next.diagnosisMaxSessions, 3, 12),
          session_lookback_limit: clamp(next.sessionLookbackLimit, 3, 20),
          non_primary_session_score_multiplier: Math.max(0.1, Math.min(1, next.nonPrimarySessionScoreMultiplier)),
          focus_recurrence_threshold: Math.max(0.1, Math.min(1, next.focusRecurrenceThreshold)),
          worsened_delta_threshold: Math.max(-3, Math.min(0, next.worsenedDeltaThreshold)),
          feedback_hardness: next.feedbackHardness,
          tutor_explanation_language: next.tutorExplanationLanguage.trim() || 'de',
          feature_flags: toJson(next.featureFlags),
        },
        { onConflict: 'id', ignoreDuplicates: false },
      )
      .select('*')
      .single<AppSettingsRow>();

    if (error || !data) {
      throw new Error(`App-Settings konnten nicht gespeichert werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    cachedSettings = mapRow(data);
    return cachedSettings;
  },

  isFeatureEnabled(settings: AppSettings, feature: keyof AppFeatureFlags): boolean {
    return settings.featureFlags[feature] === true;
  },
};
