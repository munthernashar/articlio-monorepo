import { supabaseClient } from '@/services/supabase/client';
import { appSettingsService } from '@/services/supabase/app-settings.service';
import type { UserEntitlementInsert, UserEntitlementRow } from '@/types/database';
import type { EffectiveUserEntitlement, UserEntitlement, UserEntitlementStatus } from '@/types/user-entitlements';

const ENTITLEMENT_STATUSES: UserEntitlementStatus[] = ['active', 'grace', 'suspended', 'expired'];

function asStatus(value: string): UserEntitlementStatus {
  return ENTITLEMENT_STATUSES.includes(value as UserEntitlementStatus) ? (value as UserEntitlementStatus) : 'active';
}

function mapEntitlement(row: UserEntitlementRow): UserEntitlement {
  return {
    userId: row.user_id,
    planKey: row.plan_key,
    sessionsPerDayLimit: row.sessions_per_day_limit,
    maxSessionLengthSeconds: row.max_session_length_seconds,
    dailyConversationSecondsLimit: row.daily_conversation_seconds_limit,
    monthlyTokenLimit: row.monthly_token_limit,
    billingPeriodStart: row.billing_period_start,
    billingPeriodEnd: row.billing_period_end,
    status: asStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const userEntitlementsService = {
  async getByUserId(userId: string): Promise<UserEntitlement | null> {
    const { data, error } = await supabaseClient
      .from('user_entitlements')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle<UserEntitlementRow>();

    if (error) {
      throw new Error(`Entitlements konnten nicht geladen werden: ${error.message}`);
    }

    return data ? mapEntitlement(data) : null;
  },

  async getEffectiveForUser(userId: string): Promise<EffectiveUserEntitlement> {
    const [entitlement, defaults] = await Promise.all([this.getByUserId(userId), appSettingsService.getSettings()]);

    if (entitlement) {
      return {
        ...entitlement,
        source: 'entitlement',
      };
    }

    return {
      userId,
      planKey: 'global-default',
      sessionsPerDayLimit: defaults.maxSessionsPerDay,
      maxSessionLengthSeconds: defaults.maxSessionLengthSeconds,
      dailyConversationSecondsLimit: null,
      monthlyTokenLimit: null,
      billingPeriodStart: null,
      billingPeriodEnd: null,
      status: 'active',
      source: 'app_settings_fallback',
    };
  },

  async upsertEntitlement(input: {
    userId: string;
    planKey: string;
    sessionsPerDayLimit: number;
    maxSessionLengthSeconds: number;
    dailyConversationSecondsLimit: number | null;
    monthlyTokenLimit: number | null;
    billingPeriodStart: string | null;
    billingPeriodEnd: string | null;
    status: UserEntitlementStatus;
  }): Promise<UserEntitlement> {
    const payload: UserEntitlementInsert = {
      user_id: input.userId,
      plan_key: input.planKey.trim(),
      sessions_per_day_limit: Math.max(1, Math.min(100, Math.round(input.sessionsPerDayLimit))),
      max_session_length_seconds: Math.max(60, Math.min(86_400, Math.round(input.maxSessionLengthSeconds))),
      daily_conversation_seconds_limit:
        typeof input.dailyConversationSecondsLimit === 'number'
          ? Math.max(60, Math.round(input.dailyConversationSecondsLimit))
          : null,
      monthly_token_limit:
        typeof input.monthlyTokenLimit === 'number' ? Math.max(1, Math.round(input.monthlyTokenLimit)) : null,
      billing_period_start: input.billingPeriodStart,
      billing_period_end: input.billingPeriodEnd,
      status: input.status,
    };

    const { data, error } = await supabaseClient
      .from('user_entitlements')
      .upsert(payload, { onConflict: 'user_id', ignoreDuplicates: false })
      .select('*')
      .single<UserEntitlementRow>();

    if (error || !data) {
      throw new Error(`Entitlement konnte nicht gespeichert werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapEntitlement(data);
  },
};
