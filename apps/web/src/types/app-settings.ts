import type { Json } from '@/types/database';

export const ANALYSIS_CATEGORY_KEYS = [
  'grammatical_accuracy',
  'lexical_appropriateness',
  'fluency',
  'intelligibility',
  'coherence_and_sentence_structure',
  'register_and_naturalness',
  'interactional_competence',
] as const;

export type AnalysisCategoryKey = (typeof ANALYSIS_CATEGORY_KEYS)[number];

export const FEEDBACK_HARDNESS_LEVELS = ['soft', 'balanced', 'direct'] as const;
export type FeedbackHardness = (typeof FEEDBACK_HARDNESS_LEVELS)[number];

export type AppFeatureKey =
  | 'session_analysis'
  | 'multi_session_patterns'
  | 'focus_topic_selection'
  | 'tutor'
  | 'improvement_checks';

export type AppFeatureFlags = Record<AppFeatureKey, boolean>;

export type CategoryWeights = Record<AnalysisCategoryKey, number>;

export type AppSettings = {
  id: 'global';
  minSessionsForDiagnosis: number;
  categoryWeights: CategoryWeights;
  improvementMinRecentSessions: number;
  improvementMinConfidence: number;
  improvementRequiredStreak: number | null;
  maxSessionsPerDay: number;
  maxSessionLengthSeconds: number;
  primaryScoreSessionIndex: number;
  diagnosisMaxSessions: number;
  sessionLookbackLimit: number;
  nonPrimarySessionScoreMultiplier: number;
  focusRecurrenceThreshold: number;
  worsenedDeltaThreshold: number;
  feedbackHardness: FeedbackHardness;
  tutorExplanationLanguage: string;
  featureFlags: AppFeatureFlags;
};

export type AppSettingsRow = {
  id: string;
  min_sessions_for_diagnosis: number;
  category_weights: Json;
  focus_topic_threshold: number;
  improvement_min_recent_sessions: number | null;
  improvement_min_confidence: number | null;
  improvement_required_streak: number | null;
  max_sessions_per_day: number;
  max_session_length_seconds: number;
  primary_score_session_index: number;
  diagnosis_max_sessions: number | null;
  session_lookback_limit: number | null;
  non_primary_session_score_multiplier: number | null;
  focus_recurrence_threshold: number | null;
  worsened_delta_threshold: number | null;
  feedback_hardness: string;
  tutor_explanation_language: string;
  feature_flags: Json;
  created_at: string;
  updated_at: string;
};
