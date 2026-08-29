import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type DashboardSubscriptionUsageResponse = {
  hasBillingSubscription: boolean;
  planKey: string | null;
  planName: string | null;
  entitlementStatus: string | null;
  nextBillingDate: string | null;
  sessionsPerDayLimit: number | null;
  sessionsToday: number;
  remainingSessionsToday: number | null;
  tokenLimitInPeriod: number | null;
  tokensUsedInPeriod: number;
  remainingTokensInPeriod: number | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
};

type EntitlementRow = {
  plan_key: string;
  sessions_per_day_limit: number;
  monthly_token_limit: number | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  status: string;
};

type AppSettingsRow = {
  max_sessions_per_day: number;
};

type TokenUsageRow = {
  total_tokens: number | null;
};

type ProfileTimezoneRow = {
  timezone: string | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const DEFAULT_USER_TIMEZONE = 'UTC';

function normalizeUserTimezone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_USER_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_USER_TIMEZONE;
  }
}

function parseDateParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: partValue('year'),
    month: partValue('month'),
    day: partValue('day'),
    hour: partValue('hour'),
    minute: partValue('minute'),
    second: partValue('second'),
  };
}

function getTimeZoneOffsetMs(utcDate: Date, timeZone: string): number {
  const parts = parseDateParts(utcDate, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcDate.getTime();
}

function zonedDateTimeToUtc(params: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  const { timeZone, year, month, day, hour = 0, minute = 0, second = 0 } = params;
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guessMs = targetUtcMs;

  for (let i = 0; i < 2; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(guessMs), timeZone);
    guessMs = targetUtcMs - offsetMs;
  }

  return new Date(guessMs);
}

function addDays(parts: Pick<DateParts, 'year' | 'month' | 'day'>, days: number) {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + days);

  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function getCurrentDayBoundsUtcForTimezone(timeZone: string, nowInput = new Date()) {
  const normalizedTimeZone = normalizeUserTimezone(timeZone);
  const now = new Date(nowInput);
  const localToday = parseDateParts(now, normalizedTimeZone);
  const nextDay = addDays(localToday, 1);

  const dayStartUtc = zonedDateTimeToUtc({
    timeZone: normalizedTimeZone,
    year: localToday.year,
    month: localToday.month,
    day: localToday.day,
  });

  const nextDayStartUtc = zonedDateTimeToUtc({
    timeZone: normalizedTimeZone,
    year: nextDay.year,
    month: nextDay.month,
    day: nextDay.day,
  });

  return {
    dayStartUtc,
    nextDayStartUtc,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getPlanName(planKey: string): string {
  if (planKey === 'pro') return 'Pro';
  if (planKey === 'starter') return 'Starter';
  if (planKey === 'global-default') return 'Standard';
  return planKey;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed. Use GET.' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing authorization header.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase environment variables.' }, 500);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized.' }, 401);

  const userId = authData.user.id;

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle<ProfileTimezoneRow>();

  const userTimezone = normalizeUserTimezone(profile?.timezone);
  // Reporting und Enforcement müssen dieselbe Zeitbasis nutzen, damit sessionsToday im Dashboard
  // exakt dem Session-Guard für denselben User und Tag entspricht.
  const { dayStartUtc, nextDayStartUtc } = getCurrentDayBoundsUtcForTimezone(userTimezone);

  const { data: entitlement } = await serviceClient
    .from('user_entitlements')
    .select('plan_key, sessions_per_day_limit, monthly_token_limit, billing_period_start, billing_period_end, status')
    .eq('user_id', userId)
    .maybeSingle<EntitlementRow>();

  const { data: appSettings } = await serviceClient
    .from('app_settings')
    .select('max_sessions_per_day')
    .eq('id', 'global')
    .maybeSingle<AppSettingsRow>();

  const periodStart = entitlement?.billing_period_start ?? new Date(Date.UTC(dayStartUtc.getUTCFullYear(), dayStartUtc.getUTCMonth(), 1)).toISOString();
  const periodEnd = entitlement?.billing_period_end ?? nextDayStartUtc.toISOString();

  const [sessionsTodayRes, tokensUsedRes] = await Promise.all([
    serviceClient
      .from('conversation_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', dayStartUtc.toISOString())
      .lt('created_at', nextDayStartUtc.toISOString()),
    serviceClient
      .from('prompt_execution_logs')
      .select('total_tokens')
      .eq('user_id', userId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .returns<TokenUsageRow[]>(),
  ]);

  if (sessionsTodayRes.error) return jsonResponse({ error: sessionsTodayRes.error.message }, 500);
  if (tokensUsedRes.error) return jsonResponse({ error: tokensUsedRes.error.message }, 500);

  const sessionsPerDayLimit = entitlement?.sessions_per_day_limit ?? appSettings?.max_sessions_per_day ?? null;
  // Querprüfung: derselbe Tages-Window wie im Session-Guard muss denselben sessionsToday-Wert liefern.
  const sessionsToday = sessionsTodayRes.count ?? 0;
  const tokenLimitInPeriod = entitlement?.monthly_token_limit ?? null;
  const tokensUsedInPeriod = (tokensUsedRes.data ?? []).reduce((sum, row) => sum + (row.total_tokens ?? 0), 0);

    const { data: billingSubscription } = await serviceClient
    .from('billing_subscriptions')
    .select('plan_key, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle<{ plan_key: string; status: string; current_period_end: string | null }>();

  const hasBillingSubscription = Boolean(billingSubscription?.plan_key);

  const payload: DashboardSubscriptionUsageResponse = {
    hasBillingSubscription,
    planKey: hasBillingSubscription ? billingSubscription?.plan_key ?? null : null,
    planName: hasBillingSubscription ? getPlanName(billingSubscription?.plan_key ?? '') : null,
    entitlementStatus: hasBillingSubscription ? billingSubscription?.status ?? null : null,
    nextBillingDate: hasBillingSubscription ? billingSubscription?.current_period_end ?? null : null,
    sessionsPerDayLimit,
    sessionsToday,
    remainingSessionsToday: typeof sessionsPerDayLimit === 'number' ? Math.max(0, sessionsPerDayLimit - sessionsToday) : null,
    tokenLimitInPeriod,
    tokensUsedInPeriod,
    remainingTokensInPeriod: typeof tokenLimitInPeriod === 'number' ? Math.max(0, tokenLimitInPeriod - tokensUsedInPeriod) : null,
    billingPeriodStart: entitlement?.billing_period_start ?? null,
    billingPeriodEnd: entitlement?.billing_period_end ?? null,
  };

  return jsonResponse(payload);
});
