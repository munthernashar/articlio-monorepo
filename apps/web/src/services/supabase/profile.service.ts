import { supabaseClient } from '@/services/supabase/client';
import { normalizeUserTimezone } from '@/lib/timezone';
import type { UserRole } from '@/types/auth';
import type { Profile } from '@/types/database';

type OnboardingProfilePayload = {
  displayName: string;
  nativeLanguage: string;
  germanLevel: NonNullable<Profile['german_level']>;
  timezone: string;
};

type ProfileUpdatePayload = {
  displayName: string;
  nativeLanguage: string;
  germanLevel: NonNullable<Profile['german_level']>;
  timezone: string;
  learningGoalKey: string | null;
  bundesland: string | null;
};

export const profileService = {
  async ensureProfileExists(userId: string): Promise<void> {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle<{ id: Profile['id'] }>();

    if (error) {
      throw error;
    }

    if (data?.id) {
      return;
    }

    const { error: insertError } = await supabaseClient
      .from('profiles')
      .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true });

    if (insertError) {
      throw insertError;
    }
  },

  async getUserRole(userId: string): Promise<UserRole | null> {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle<{ role: Profile['role'] }>();

    if (error) {
      return null;
    }

    if (data?.role === 'admin' || data?.role === 'user') {
      return data.role;
    }

    return null;
  },

  async getUserTimezone(userId: string): Promise<string> {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle<{ timezone: Profile['timezone'] }>();

    if (error) {
      return normalizeUserTimezone(null);
    }

    return normalizeUserTimezone(data?.timezone);
  },

  async getOnboardingStatus(userId: string): Promise<boolean | null> {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle<{ onboarding_completed: Profile['onboarding_completed'] }>();

    if (error) {
      return null;
    }

    return data?.onboarding_completed ?? false;
  },

  async getOnboardingProfile(userId: string): Promise<Pick<Profile, 'display_name' | 'native_language' | 'german_level' | 'timezone' | 'learning_goal_key' | 'bundesland'> | null> {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('display_name, native_language, german_level, timezone, learning_goal_key, bundesland')
      .eq('id', userId)
      .maybeSingle<Pick<Profile, 'display_name' | 'native_language' | 'german_level' | 'timezone' | 'learning_goal_key' | 'bundesland'>>();

    if (error) {
      return null;
    }

    return data;
  },

  async completeOnboarding(userId: string, payload: OnboardingProfilePayload): Promise<void> {
    const { error } = await supabaseClient
      .from('profiles')
      .update({
        display_name: payload.displayName.trim(),
        native_language: payload.nativeLanguage.trim(),
        german_level: payload.germanLevel,
        timezone: normalizeUserTimezone(payload.timezone),
        onboarding_completed: true,
      })
      .eq('id', userId);

    if (error) {
      throw error;
    }
  },

  async updateProfile(userId: string, payload: ProfileUpdatePayload): Promise<void> {
    const { error } = await supabaseClient
      .from('profiles')
      .update({
        display_name: payload.displayName.trim(),
        native_language: payload.nativeLanguage.trim(),
        german_level: payload.germanLevel,
        timezone: normalizeUserTimezone(payload.timezone),
        learning_goal_key: payload.learningGoalKey,
        bundesland: payload.bundesland,
      })
      .eq('id', userId);

    if (error) {
      throw error;
    }
  },
};
