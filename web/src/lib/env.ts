type EnvKey =
  | 'VITE_APP_ENV'
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_ANON_KEY'
  | 'VITE_SUPABASE_SESSION_AUDIO_BUCKET'
  | 'VITE_OPENAI_PROXY_PATH'
  | 'VITE_ROLE_LOOKUP_TIMEOUT_MS'
  | 'VITE_ENABLE_AI_COACH_SESSION_PLAN'
  | 'VITE_ENABLE_AI_COACH_NEXT_STEP'
  | 'VITE_ENABLE_AI_COACH_DYNAMIC_NEXT_STEP'
  | 'VITE_ENABLE_AI_COACH_RECOMMENDATIONS'
  | 'VITE_ENABLE_AI_COACH_COMPLETION'
  | 'VITE_ENABLE_AI_COACH_REFLECTION'
  | 'VITE_SENTRY_DSN';

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function getEnv(key: EnvKey, fallback?: string): string {
  const value = import.meta.env[key];
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Fehlende Umgebungsvariable: ${key}`);
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const env = {
  appEnv: getEnv('VITE_APP_ENV', 'development'),
  supabaseUrl: getEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: getEnv('VITE_SUPABASE_ANON_KEY'),
  supabaseSessionAudioBucket: getEnv('VITE_SUPABASE_SESSION_AUDIO_BUCKET', 'session-audio'),
  openAiProxyPath: getEnv('VITE_OPENAI_PROXY_PATH', '/functions/v1/openai-chat-proxy'),
  roleLookupTimeoutMs: parseNumberEnv(import.meta.env.VITE_ROLE_LOOKUP_TIMEOUT_MS, 12000),
  enableAiCoachSessionPlan: parseBooleanEnv(import.meta.env.VITE_ENABLE_AI_COACH_SESSION_PLAN, true),
  enableAiCoachNextStep: parseBooleanEnv(import.meta.env.VITE_ENABLE_AI_COACH_NEXT_STEP, true),
  enableAiCoachDynamicNextStep: parseBooleanEnv(import.meta.env.VITE_ENABLE_AI_COACH_DYNAMIC_NEXT_STEP, true),
  enableAiCoachRecommendations: parseBooleanEnv(import.meta.env.VITE_ENABLE_AI_COACH_RECOMMENDATIONS, true),
  enableAiCoachCompletion: parseBooleanEnv(import.meta.env.VITE_ENABLE_AI_COACH_COMPLETION, true),
  enableAiCoachReflection: parseBooleanEnv(import.meta.env.VITE_ENABLE_AI_COACH_REFLECTION, true),
  // Optional -- ohne DSN bleibt Sentry inaktiv (kein Fehler, keine Netzwerk-Aufrufe).
  sentryDsn: getEnv('VITE_SENTRY_DSN', ''),
} as const;
