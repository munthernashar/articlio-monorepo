export const paths = {
  landing: '/',
  public: {
    features: '/features',
    pricing: '/preise',
  },
  legal: {
    imprint: '/impressum',
    privacy: '/datenschutz',
    terms: '/agb',
    withdrawal: '/widerruf',
  },
  auth: {
    login: '/login',
    register: '/register',
    reset: '/reset-password',
  },
  onboarding: '/onboarding',
  dashboard: '/dashboard',
  profile: '/profil',
  demo: '/demo',
  billing: {
    pricing: '/billing/pricing',
    success: '/billing/success',
    cancel: '/billing/cancel',
  },
  sessions: {
    list: '/sessions',
    new: '/sessions/new',
    detail: '/sessions/:sessionId',
  },
  tutor: '/tutor',
  // DEPRECATED: temporary legacy route for backward compatibility; remove in cleanup after clients migrate.
  progress: '/progress',
  skillMap: '/skill-map',
  admin: {
    dashboard: '/admin',
    prompts: '/admin/prompts',
    promptDetail: (promptKey: string) => `/admin/prompts/${promptKey}`,
    settings: '/admin/settings',
    entitlements: '/admin/entitlements',
    billingEvents: '/admin/billing-events',
  },
} as const;
