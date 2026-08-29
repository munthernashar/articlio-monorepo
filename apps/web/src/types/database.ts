import type { UserRole } from '@/types/auth';

export type GermanLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
// 'processing' fehlte hier, obwohl process-session/index.ts diesen Wert seit Migration
// 20260422130000_add_session_processing_pipeline.sql tatsächlich schreibt (Enum-Wert existiert
// live in der DB) -- verursachte in SessionProcessingStatus.tsx eine falsche Fallback-Anzeige
// während der Transkriptionsphase.
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
export type FocusTopicStatus =
  | 'unentdeckt'
  | 'beobachtet'
  | 'wiederkehrend'
  | 'in_training'
  | 'teilweise_stabilisiert'
  | 'stabil'
  | 'rueckfall_erkannt';
export type TutorInteractionStatus = 'queued' | 'sent' | 'responded' | 'failed';
export type ImprovementCheckStatus = 'pending' | 'passed' | 'failed' | 'skipped';
export type PromptResponseFormat = 'json_object' | 'text';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          display_name: string | null;
          timezone: string;
          native_language: string | null;
          german_level: GermanLevel | null;
          onboarding_completed: boolean;
          learning_goal_key: string | null;
          bundesland: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          display_name?: string | null;
          timezone?: string;
          native_language?: string | null;
          german_level?: GermanLevel | null;
          onboarding_completed?: boolean;
          learning_goal_key?: string | null;
          bundesland?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          display_name?: string | null;
          timezone?: string;
          native_language?: string | null;
          german_level?: GermanLevel | null;
          onboarding_completed?: boolean;
          learning_goal_key?: string | null;
          bundesland?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      prompt_definitions: {
        Row: {
          id: string;
          prompt_key: string;
          name: string;
          description: string;
          category: string;
          version: number;
          system_prompt: string;
          developer_prompt: string;
          user_prompt_template: string;
          expected_output_schema_json: Json;
          prompt_variables_definition_json: Json;
          model: string;
          max_output_tokens: number;
          response_format: PromptResponseFormat;
          is_active: boolean;
          metadata: Json;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          prompt_key: string;
          name?: string;
          description?: string;
          category?: string;
          version: number;
          system_prompt: string;
          developer_prompt: string;
          user_prompt_template: string;
          expected_output_schema_json?: Json;
          prompt_variables_definition_json?: Json;
          model: string;
          max_output_tokens?: number;
          response_format?: PromptResponseFormat;
          is_active?: boolean;
          metadata?: Json;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          prompt_key?: string;
          name?: string;
          description?: string;
          category?: string;
          version?: number;
          system_prompt?: string;
          developer_prompt?: string;
          user_prompt_template?: string;
          expected_output_schema_json?: Json;
          prompt_variables_definition_json?: Json;
          model?: string;
          max_output_tokens?: number;
          response_format?: PromptResponseFormat;
          is_active?: boolean;
          metadata?: Json;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      prompt_execution_logs: {
        Row: {
          id: string;
          prompt_definition_id: string;
          prompt_key: string;
          prompt_version: number;
          model: string;
          max_output_tokens: number;
          user_id: string | null;
          session_id: string | null;
          feature_name: string;
          input_payload_json: Json;
          rendered_prompt_json: Json;
          raw_model_output: string | null;
          success: boolean;
          test_input: Json;
          rendered_user_prompt: string;
          request_payload: Json;
          raw_response: string | null;
          parsed_output: Json;
          safety_flags: Json;
          validation_errors: Json;
          status: 'success' | 'failed';
          latency_ms: number | null;
          error_message: string | null;
          trace_id: string | null;
          workflow_id: string | null;
          pipeline_step: string | null;
          attempt_number: number;
          validation_repair_status: 'not_needed' | 'repaired' | 'failed' | null;
          error_class: string | null;
          fallback_used: boolean;
          fallback_reason: string | null;
          prompt_source: 'db' | 'seed_fallback';
          input_tokens: number | null;
          output_tokens: number | null;
          total_tokens: number | null;
          estimated_cost_usd: number | null;
          pricing_version: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          prompt_definition_id: string;
          prompt_key: string;
          prompt_version: number;
          model: string;
          max_output_tokens: number;
          user_id?: string | null;
          session_id?: string | null;
          feature_name?: string;
          input_payload_json?: Json;
          rendered_prompt_json?: Json;
          raw_model_output?: string | null;
          success?: boolean;
          test_input?: Json;
          rendered_user_prompt: string;
          request_payload?: Json;
          raw_response?: string | null;
          parsed_output?: Json;
          safety_flags?: Json;
          validation_errors?: Json;
          status: 'success' | 'failed';
          latency_ms?: number | null;
          error_message?: string | null;
          trace_id?: string | null;
          workflow_id?: string | null;
          pipeline_step?: string | null;
          attempt_number?: number;
          validation_repair_status?: 'not_needed' | 'repaired' | 'failed' | null;
          error_class?: string | null;
          fallback_used?: boolean;
          fallback_reason?: string | null;
          prompt_source?: 'db' | 'seed_fallback';
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          estimated_cost_usd?: number | null;
          pricing_version?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          prompt_definition_id?: string;
          prompt_key?: string;
          prompt_version?: number;
          model?: string;
          max_output_tokens?: number;
          user_id?: string | null;
          session_id?: string | null;
          feature_name?: string;
          input_payload_json?: Json;
          rendered_prompt_json?: Json;
          raw_model_output?: string | null;
          success?: boolean;
          test_input?: Json;
          rendered_user_prompt?: string;
          request_payload?: Json;
          raw_response?: string | null;
          parsed_output?: Json;
          safety_flags?: Json;
          validation_errors?: Json;
          status?: 'success' | 'failed';
          latency_ms?: number | null;
          error_message?: string | null;
          trace_id?: string | null;
          workflow_id?: string | null;
          pipeline_step?: string | null;
          attempt_number?: number;
          validation_repair_status?: 'not_needed' | 'repaired' | 'failed' | null;
          error_class?: string | null;
          fallback_used?: boolean;
          fallback_reason?: string | null;
          prompt_source?: 'db' | 'seed_fallback';
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          estimated_cost_usd?: number | null;
          pricing_version?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      conversation_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          source: string | null;
          status: ConversationSessionStatus;
          started_at: string | null;
          ended_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          source?: string | null;
          status?: ConversationSessionStatus;
          started_at?: string | null;
          ended_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          source?: string | null;
          status?: ConversationSessionStatus;
          started_at?: string | null;
          ended_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_transcripts: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          status: ProcessingStatus;
          transcript_text: string | null;
          language_code: string | null;
          word_count: number | null;
          raw_payload: Json;
          raw_transcript: string | null;
          cleaned_transcript: string | null;
          utterances_json: Json;
          notes_json: Json;
          attempt_count: number;
          last_error: string | null;
          last_processed_at: string | null;
          next_retry_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          status?: ProcessingStatus;
          transcript_text?: string | null;
          language_code?: string | null;
          word_count?: number | null;
          raw_payload?: Json;
          raw_transcript?: string | null;
          cleaned_transcript?: string | null;
          utterances_json?: Json;
          notes_json?: Json;
          attempt_count?: number;
          last_error?: string | null;
          last_processed_at?: string | null;
          next_retry_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          status?: ProcessingStatus;
          transcript_text?: string | null;
          language_code?: string | null;
          word_count?: number | null;
          raw_payload?: Json;
          raw_transcript?: string | null;
          cleaned_transcript?: string | null;
          utterances_json?: Json;
          notes_json?: Json;
          attempt_count?: number;
          last_error?: string | null;
          last_processed_at?: string | null;
          next_retry_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      session_analyses: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          transcript_id: string | null;
          status: ProcessingStatus;
          analysis_version: string | null;
          score_overall: number | null;
          summary: Json;
          metrics: Json;
          recommendations: Json;
          category_scores_json: Json;
          detected_patterns_json: Json;
          priority_intervention_json: Json;
          session_summary: string | null;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          transcript_id?: string | null;
          status?: ProcessingStatus;
          analysis_version?: string | null;
          score_overall?: number | null;
          summary?: Json;
          metrics?: Json;
          recommendations?: Json;
          category_scores_json?: Json;
          detected_patterns_json?: Json;
          priority_intervention_json?: Json;
          session_summary?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          transcript_id?: string | null;
          status?: ProcessingStatus;
          analysis_version?: string | null;
          score_overall?: number | null;
          summary?: Json;
          metrics?: Json;
          recommendations?: Json;
          category_scores_json?: Json;
          detected_patterns_json?: Json;
          priority_intervention_json?: Json;
          session_summary?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      detected_patterns: {
        Row: {
          id: string;
          user_id: string;
          analysis_id: string | null;
          status: PatternStatus;
          pattern_type: string;
          severity: number | null;
          occurrence_count: number;
          occurrence_window_start: string | null;
          occurrence_window_end: string | null;
          evidence: Json;
          suggested_actions: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          analysis_id?: string | null;
          status?: PatternStatus;
          pattern_type: string;
          severity?: number | null;
          occurrence_count?: number;
          occurrence_window_start?: string | null;
          occurrence_window_end?: string | null;
          evidence?: Json;
          suggested_actions?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          analysis_id?: string | null;
          status?: PatternStatus;
          pattern_type?: string;
          severity?: number | null;
          occurrence_count?: number;
          occurrence_window_start?: string | null;
          occurrence_window_end?: string | null;
          evidence?: Json;
          suggested_actions?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      focus_topics: {
        Row: {
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
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: FocusTopicStatus;
          topic_key: string;
          title: string;
          description?: string | null;
          priority?: number | null;
          confidence?: number | null;
          mastery_level?: number;
          source_pattern_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: FocusTopicStatus;
          topic_key?: string;
          title?: string;
          description?: string | null;
          priority?: number | null;
          confidence?: number | null;
          mastery_level?: number;
          source_pattern_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tutor_interactions: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          transcript_id: string | null;
          status: TutorInteractionStatus;
          prompt_text: string | null;
          response_text: string | null;
          model_name: string | null;
          token_usage: Json;
          interaction_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          transcript_id?: string | null;
          status?: TutorInteractionStatus;
          prompt_text?: string | null;
          response_text?: string | null;
          model_name?: string | null;
          token_usage?: Json;
          interaction_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string;
          transcript_id?: string | null;
          status?: TutorInteractionStatus;
          prompt_text?: string | null;
          response_text?: string | null;
          model_name?: string | null;
          token_usage?: Json;
          interaction_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      improvement_checks: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          focus_topic_id: string | null;
          status: ImprovementCheckStatus;
          check_type: string;
          score: number | null;
          result_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          focus_topic_id?: string | null;
          status?: ImprovementCheckStatus;
          check_type: string;
          score?: number | null;
          result_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string | null;
          focus_topic_id?: string | null;
          status?: ImprovementCheckStatus;
          check_type?: string;
          score?: number | null;
          result_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
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
          diagnosis_max_sessions: number;
          session_lookback_limit: number;
          non_primary_session_score_multiplier: number;
          focus_recurrence_threshold: number;
          worsened_delta_threshold: number;
          feedback_hardness: string;
          tutor_explanation_language: string;
          feature_flags: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          min_sessions_for_diagnosis?: number;
          category_weights?: Json;
          focus_topic_threshold?: number;
          improvement_min_recent_sessions?: number | null;
          improvement_min_confidence?: number | null;
          improvement_required_streak?: number | null;
          max_sessions_per_day?: number;
          max_session_length_seconds?: number;
          primary_score_session_index?: number;
          diagnosis_max_sessions?: number;
          session_lookback_limit?: number;
          non_primary_session_score_multiplier?: number;
          focus_recurrence_threshold?: number;
          worsened_delta_threshold?: number;
          feedback_hardness?: string;
          tutor_explanation_language?: string;
          feature_flags?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          min_sessions_for_diagnosis?: number;
          category_weights?: Json;
          focus_topic_threshold?: number;
          improvement_min_recent_sessions?: number | null;
          improvement_min_confidence?: number | null;
          improvement_required_streak?: number | null;
          max_sessions_per_day?: number;
          max_session_length_seconds?: number;
          primary_score_session_index?: number;
          diagnosis_max_sessions?: number;
          session_lookback_limit?: number;
          non_primary_session_score_multiplier?: number;
          focus_recurrence_threshold?: number;
          worsened_delta_threshold?: number;
          feedback_hardness?: string;
          tutor_explanation_language?: string;
          feature_flags?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_usage_ledger: {
        Row: {
          user_id: string;
          period_start: string;
          period_end: string;
          tokens_used: number;
          tokens_reserved: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          period_start: string;
          period_end: string;
          tokens_used?: number;
          tokens_reserved?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          period_start?: string;
          period_end?: string;
          tokens_used?: number;
          tokens_reserved?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_usage_ledger_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_entitlements: {
        Row: {
          user_id: string;
          plan_key: string;
          sessions_per_day_limit: number;
          max_session_length_seconds: number;
          daily_conversation_seconds_limit: number | null;
          monthly_token_limit: number | null;
          billing_period_start: string | null;
          billing_period_end: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          plan_key?: string;
          sessions_per_day_limit?: number;
          max_session_length_seconds?: number;
          daily_conversation_seconds_limit?: number | null;
          monthly_token_limit?: number | null;
          billing_period_start?: string | null;
          billing_period_end?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          plan_key?: string;
          sessions_per_day_limit?: number;
          max_session_length_seconds?: number;
          daily_conversation_seconds_limit?: number | null;
          monthly_token_limit?: number | null;
          billing_period_start?: string | null;
          billing_period_end?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      billing_customers: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string;
          email: string | null;
          trial_started_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id: string;
          email?: string | null;
          trial_started_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_customer_id?: string;
          email?: string | null;
          trial_started_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'billing_customers_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      billing_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          stripe_price_id: string | null;
          plan_key: string;
          status: string;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id: string;
          stripe_subscription_id: string;
          stripe_price_id?: string | null;
          plan_key: string;
          status: string;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string;
          stripe_price_id?: string | null;
          plan_key?: string;
          status?: string;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'billing_subscriptions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      billing_events: {
        Row: {
          id: string;
          stripe_event_id: string;
          event_type: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          user_id: string | null;
          payload: Json;
          processing_status: ProcessingStatus;
          processing_error: string | null;
          processed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          stripe_event_id: string;
          event_type: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          user_id?: string | null;
          payload: Json;
          processing_status?: ProcessingStatus;
          processing_error?: string | null;
          processed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          stripe_event_id?: string;
          event_type?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          user_id?: string | null;
          payload?: Json;
          processing_status?: ProcessingStatus;
          processing_error?: string | null;
          processed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'billing_events_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_user_id: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before_json: Json | null;
          after_json: Json | null;
          trace_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          before_json?: Json | null;
          after_json?: Json | null;
          trace_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_user_id?: string | null;
          action?: string;
          entity?: string;
          entity_id?: string | null;
          before_json?: Json | null;
          after_json?: Json | null;
          trace_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      admin_audit_log_entries: {
        Row: {
          id: string;
          created_at: string;
          trace_id: string | null;
          actor_user_id: string | null;
          actor_display_name: string | null;
          actor_role: UserRole | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before_json: Json | null;
          after_json: Json | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      reserve_user_tokens: {
        Args: Record<string, unknown>;
        Returns: Json;
      };
      resolve_billing_cycle_period: {
        Args: { p_user_id: string; p_now?: string };
        Returns: { period_start: string; period_end: string; monthly_token_limit: number | null }[];
      };
      finalize_user_token_usage: {
        Args: Record<string, unknown>;
        Returns: Json;
      };
      release_reserved_user_tokens: {
        Args: Record<string, unknown>;
        Returns: Json;
      };
      sync_user_entitlements_from_billing: {
        Args: {
          p_user_id: string;
          p_plan_key: string;
          p_status: string;
          p_current_period_end: string | null;
          p_sessions_per_day_limit: number;
          p_max_session_length_seconds: number;
          p_daily_conversation_seconds_limit: number | null;
          p_monthly_token_limit: number | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      conversation_session_status: ConversationSessionStatus;
      processing_status: ProcessingStatus;
      pattern_status: PatternStatus;
      focus_topic_status: FocusTopicStatus;
      tutor_interaction_status: TutorInteractionStatus;
      improvement_check_status: ImprovementCheckStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ConversationSessionRow = Database['public']['Tables']['conversation_sessions']['Row'];
export type SessionTranscriptRow = Database['public']['Tables']['session_transcripts']['Row'];
export type SessionAnalysisRow = Database['public']['Tables']['session_analyses']['Row'];
export type DetectedPatternRow = Database['public']['Tables']['detected_patterns']['Row'];
export type FocusTopicRow = Database['public']['Tables']['focus_topics']['Row'];
export type TutorInteractionRow = Database['public']['Tables']['tutor_interactions']['Row'];
export type ImprovementCheckRow = Database['public']['Tables']['improvement_checks']['Row'];

export type PromptDefinitionDbRow = Database['public']['Tables']['prompt_definitions']['Row'];
export type PromptExecutionLogDbRow = Database['public']['Tables']['prompt_execution_logs']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
export type UserEntitlementRow = Database['public']['Tables']['user_entitlements']['Row'];
export type UserEntitlementInsert = Database['public']['Tables']['user_entitlements']['Insert'];
export type UserEntitlementUpdate = Database['public']['Tables']['user_entitlements']['Update'];
export type BillingCustomerRow = Database['public']['Tables']['billing_customers']['Row'];
export type BillingCustomerInsert = Database['public']['Tables']['billing_customers']['Insert'];
export type BillingCustomerUpdate = Database['public']['Tables']['billing_customers']['Update'];
export type BillingSubscriptionRow = Database['public']['Tables']['billing_subscriptions']['Row'];
export type BillingSubscriptionInsert = Database['public']['Tables']['billing_subscriptions']['Insert'];
export type BillingSubscriptionUpdate = Database['public']['Tables']['billing_subscriptions']['Update'];
export type BillingEventRow = Database['public']['Tables']['billing_events']['Row'];
export type BillingEventInsert = Database['public']['Tables']['billing_events']['Insert'];
export type BillingEventUpdate = Database['public']['Tables']['billing_events']['Update'];
export type AdminAuditLogEntryRow = Database['public']['Views']['admin_audit_log_entries']['Row'];
