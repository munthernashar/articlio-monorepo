import type { BillingPlanContract } from '@/services/api/contracts';

export const FALLBACK_PLAN_CONTRACTS: BillingPlanContract[] = [
  {
    planKey: 'free',
    displayName: 'Free',
    priceLabel: 'Kostenlos',
    note: 'Kostenlos ausprobieren, ohne Kreditkarte.',
    featureFlags: { progress_overview: true, learning_history: true, priority_analysis: false, coach_access: false, lernpfade_access: false },
    limits: { sessionsPerDay: 1, maxSessionLengthMinutes: 3 },
    sortOrder: 5,
  },
  {
    planKey: 'starter',
    displayName: 'Starter',
    priceLabel: '5 € / Monat',
    note: 'Ideal für konstantes Lernen im Alltag.',
    featureFlags: { progress_overview: true, learning_history: true, priority_analysis: false, coach_access: false, lernpfade_access: true },
    limits: { sessionsPerDay: 1, maxSessionLengthMinutes: 15 },
    sortOrder: 10,
  },
  {
    planKey: 'pro',
    displayName: 'Pro',
    priceLabel: '9 € / Monat',
    note: 'Für strukturiertes Coaching mit persönlichen Trainingspfaden.',
    featureFlags: { progress_overview: true, learning_history: true, priority_analysis: true, coach_access: true, lernpfade_access: true },
    limits: { sessionsPerDay: 1, maxSessionLengthMinutes: 15 },
    sortOrder: 20,
  },
];
