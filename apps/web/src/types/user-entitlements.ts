export type UserEntitlementStatus = 'active' | 'grace' | 'suspended' | 'expired';

export type UserEntitlement = {
  userId: string;
  planKey: string;
  sessionsPerDayLimit: number;
  maxSessionLengthSeconds: number;
  dailyConversationSecondsLimit: number | null;
  monthlyTokenLimit: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  status: UserEntitlementStatus;
  createdAt: string;
  updatedAt: string;
};

export type EffectiveUserEntitlement = {
  userId: string;
  planKey: string;
  sessionsPerDayLimit: number;
  maxSessionLengthSeconds: number;
  dailyConversationSecondsLimit: number | null;
  monthlyTokenLimit: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  status: UserEntitlementStatus;
  source: 'entitlement' | 'app_settings_fallback';
};
