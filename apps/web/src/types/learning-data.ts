import type { FocusTopicStatus } from '@/types/database';

export type ConversationSessionStatus =
  | 'draft'
  | 'recording'
  | 'uploaded'
  | 'processing'
  | 'transcribed'
  | 'analyzed'
  | 'feedback_ready'
  | 'training_in_progress'
  | 'completed'
  | 'completed_capped'
  | 'insufficient_data'
  | 'rejected_too_long'
  | 'failed'
  | 'archived';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type PatternStatus = 'active' | 'resolved' | 'ignored';
export type TutorInteractionStatus = 'queued' | 'sent' | 'responded' | 'failed';
export type ImprovementCheckStatus = 'pending' | 'passed' | 'failed' | 'skipped';
export type SnapshotStatus = 'current' | 'historical' | 'superseded';

export interface ConversationSession {
  id: string;
  user_id: string;
  title: string | null;
  source: string | null;
  status: ConversationSessionStatus;
  started_at: string | null;
  ended_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SessionTranscript {
  id: string;
  user_id: string;
  session_id: string;
  status: ProcessingStatus;
  transcript_text: string | null;
  language_code: string | null;
  word_count: number | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SessionAnalysis {
  id: string;
  user_id: string;
  session_id: string;
  transcript_id: string | null;
  status: ProcessingStatus;
  analysis_version: string | null;
  score_overall: number | null;
  summary: Record<string, unknown>;
  metrics: Record<string, unknown>;
  recommendations: unknown[];
  category_scores_json: Record<string, unknown>;
  detected_patterns_json: unknown[];
  priority_intervention_json: Record<string, unknown>;
  session_summary: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DetectedPattern {
  id: string;
  user_id: string;
  analysis_id: string | null;
  status: PatternStatus;
  pattern_type: string;
  severity: number | null;
  evidence: Record<string, unknown>;
  suggested_actions: unknown[];
  created_at: string;
  updated_at: string;
}

export interface FocusTopic {
  id: string;
  user_id: string;
  status: FocusTopicStatus;
  topic_key: string;
  title: string;
  description: string | null;
  priority: number | null;
  confidence: number | null;
  mastery_level: number;
  source_pattern_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TutorInteraction {
  id: string;
  user_id: string;
  session_id: string;
  transcript_id: string | null;
  status: TutorInteractionStatus;
  prompt_text: string | null;
  response_text: string | null;
  model_name: string | null;
  token_usage: Record<string, unknown>;
  interaction_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ImprovementCheck {
  id: string;
  user_id: string;
  session_id: string | null;
  focus_topic_id: string | null;
  status: ImprovementCheckStatus;
  check_type: string;
  score: number | null;
  result_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LearnerProgressSnapshot {
  id: string;
  user_id: string;
  status: SnapshotStatus;
  snapshot_date: string;
  overall_score: number | null;
  streak_days: number | null;
  totals: Record<string, unknown>;
  dimensions: {
    global_mastery_level?: number;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}
