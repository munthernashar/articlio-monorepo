import { env } from '@/lib/env';

// Architekturentscheidung: zentrale Konfiguration hält externe Abhängigkeiten
// (Supabase/OpenAI) und Feature-Flags an einer Stelle und vereinfacht Tests.
export const appConfig = {
  appName: 'Articlio',
  env: env.appEnv,
  supabase: {
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
    sessionAudioBucket: env.supabaseSessionAudioBucket,
  },
  openai: {
    proxyPath: env.openAiProxyPath,
  },
  auth: {
    roleLookupTimeoutMs: env.roleLookupTimeoutMs,
  },
  sentry: {
    dsn: env.sentryDsn,
  },
  features: {
    adminEnabled: true,
    aiOrchestrationEnabled: true,
    enableAiCoachSessionPlan: env.enableAiCoachSessionPlan,
    enableAiCoachNextStep: env.enableAiCoachNextStep,
    enableAiCoachDynamicNextStep: env.enableAiCoachDynamicNextStep,
    enableAiCoachRecommendations: env.enableAiCoachRecommendations,
    enableAiCoachCompletion: env.enableAiCoachCompletion,
    enableAiCoachReflection: env.enableAiCoachReflection,
  },
} as const;

export const SESSION_PROCESSING_LIMITS = {
  minAudioSeconds: 10,
  // Empfohlene Mindestdauer für ein verlässliches Feedback (nicht technisch erzwungen wie
  // minAudioSeconds) -- Absolutwert statt Plan-Prozentsatz: bei Free (180s) sinnvoll
  // erreichbar, bei Starter/Pro (900s) verschwindet der Hinweis nach der ersten Minute von
  // selbst. Siehe AudioRecorder.tsx (Live-Hinweis während der Aufnahme) und
  // process-session/index.ts (INSUFFICIENT_DATA_MIN_WORD_COUNT -- derselbe Gedanke
  // serverseitig).
  recommendedMinAudioSeconds: 60,
  // Fallback-Werte, bevor das Entitlement des Nutzers geladen ist (Starter-Niveau) --
  // siehe NewSessionPage.tsx, das nach dem Laden die tatsächliche
  // entitlement.maxSessionLengthSeconds an AudioRecorder/SessionRecordingPanel durchreicht.
  softMaxAudioSeconds: 12 * 60,
  hardMaxAudioSeconds: 15 * 60,
  // Launch-Readiness-Audit, Befund C: technische Sicherheitsgrenze unabhängig vom
  // Plan (z. B. gegen eine hängengebliebene Aufnahme) -- kein Plan darf darüber liegen.
  absoluteMaxAudioSeconds: 90 * 60,
  minTranscriptWords: 3,
  minTranscriptCharacters: 12,
  maxTranscriptWords: 3_500,
  maxTranscriptCharacters: 24_000,
  maxFileSizeBytes: 50 * 1024 * 1024,
} as const;
