import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authService } from '@/services/supabase/auth.service';
import { profileService } from '@/services/supabase/profile.service';
import { TimeoutError, withTimeout } from '@/lib/with-timeout';
import { appConfig } from '@/lib/config';
import type { AuthStatus, UserRole } from '@/types/auth';

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  role: UserRole;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isOnboardingCompleted: boolean;
  errorMessage: string | null;
  clearError: () => void;
  refreshProfileState: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ session: Session | null; requiresEmailVerification: boolean }>;
  requestSignupVerificationEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

const LOGIN_TIMEOUT_MS = 12000;
const ROLE_LOOKUP_RETRY_BACKOFF_MS = [300, 800] as const;
const FALLBACK_COUNTER_WINDOW_MS = 60 * 60 * 1000;

type RoleLookupErrorType = 'timeout' | 'network' | 'rls' | 'missing_profile';

const roleLookupFallbackTimestamps: number[] = [];
const inFlightRoleLookups = new Map<string, Promise<UserRole>>();

function logAuthMetric(event: string, payload: Record<string, unknown>) {
  console.info('[Auth][metric]', JSON.stringify({ event, ...payload }));
}

function incrementRoleLookupFallbackCounter() {
  const now = Date.now();
  roleLookupFallbackTimestamps.push(now);

  while (
    roleLookupFallbackTimestamps.length > 0
    && (() => {
      const oldestFallbackTimestamp = roleLookupFallbackTimestamps[0];
      return oldestFallbackTimestamp !== undefined
        && now - oldestFallbackTimestamp > FALLBACK_COUNTER_WINDOW_MS;
    })()
  ) {
    roleLookupFallbackTimestamps.shift();
  }

  logAuthMetric('role_lookup_fallback_hourly', {
    fallbackCountLastHour: roleLookupFallbackTimestamps.length,
    windowMs: FALLBACK_COUNTER_WINDOW_MS,
  });
}

function deriveRoleLookupErrorType(error: unknown): RoleLookupErrorType {
  if (error instanceof TimeoutError) {
    return 'timeout';
  }

  if (error instanceof TypeError) {
    return 'network';
  }

  return 'rls';
}

function normalizeRole(role: string | null): UserRole {
  return role === 'admin' ? 'admin' : 'user';
}

function deriveIsAdminFromRole(role: UserRole): boolean {
  return role === 'admin';
}

export async function resolveRole(session: Session | null, currentRole: UserRole = 'user'): Promise<UserRole> {
  if (!session?.user?.id) {
    return 'user';
  }

  const lookupKey = session.user.id;

  const existingLookup = inFlightRoleLookups.get(lookupKey);
  if (existingLookup) {
    return existingLookup;
  }

  const lookupPromise = resolveRoleInternal(session, currentRole).finally(() => {
    inFlightRoleLookups.delete(lookupKey);
  });

  inFlightRoleLookups.set(lookupKey, lookupPromise);
  return lookupPromise;
}
  
async function resolveRoleInternal(session: Session, currentRole: UserRole = 'user'): Promise<UserRole> {
  const sleep = (ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

  const maxAttempts = ROLE_LOOKUP_RETRY_BACKOFF_MS.length + 1;
  const startedAt = performance.now();
  let lastErrorType: RoleLookupErrorType | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const profileRole = await withTimeout(
        profileService.getUserRole(session.user.id),
        appConfig.auth.roleLookupTimeoutMs,
        'Profil konnte nicht geladen werden (Timeout).',
      );

      if (profileRole) {
        logAuthMetric('get_user_role_duration', {
          durationMs: Math.round(performance.now() - startedAt),
          success: true,
          attempt: attempt + 1,
        });
        return normalizeRole(profileRole);
      }

      lastErrorType = 'missing_profile';

      if (attempt < ROLE_LOOKUP_RETRY_BACKOFF_MS.length) {
        const retryDelayMs = ROLE_LOOKUP_RETRY_BACKOFF_MS[attempt];
        if (retryDelayMs === undefined) {
          break;
        }
        console.warn(
          `[Auth][profile_missing] profiles.role ist null (Versuch ${attempt + 1}/${maxAttempts}), retry folgt.`,
        );
        await sleep(retryDelayMs);
        continue;
      }

      console.warn('[Auth][profile_missing] profiles.role ist nach Retries weiterhin null, nutze Fallback.');
      break;
    } catch (error) {
      const errorType = deriveRoleLookupErrorType(error);
      lastErrorType = errorType;
      const isTimeout = errorType === 'timeout';

      if (isTimeout && attempt < ROLE_LOOKUP_RETRY_BACKOFF_MS.length) {
        const retryDelayMs = ROLE_LOOKUP_RETRY_BACKOFF_MS[attempt];
        if (retryDelayMs === undefined) {
          break;
        }
        console.warn(`[Auth][timeout] profiles.role lookup timeout (Versuch ${attempt + 1}/${maxAttempts}), retry folgt.`, error);
        await sleep(retryDelayMs);
        continue;
      }

      if (isTimeout) {
        console.warn('[Auth][timeout] profiles.role lookup timeout nach Retries, nutze Fallback.', error);
      } else {
        console.warn('[Auth][rls/error] profiles.role konnte nicht geladen werden, nutze Fallback.', error);
      }

      break;
    }
  }

  logAuthMetric('get_user_role_duration', {
    durationMs: Math.round(performance.now() - startedAt),
    success: false,
    errorType: lastErrorType ?? 'missing_profile',
    attempts: maxAttempts,
  });
  incrementRoleLookupFallbackCounter();
  logAuthMetric('get_user_role_error', {
    errorType: lastErrorType ?? 'missing_profile',
  });

  if (currentRole === 'admin') {
    console.warn('[Auth] profiles.role nicht verfügbar, behalte bestehende Admin-Rolle bei.');
    return 'admin';
  }

  return 'user';
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(false);

  const roleRef = useRef<UserRole>('user');
  const syncSessionPromiseRef = useRef<Promise<void> | null>(null);
  const lastSyncedSessionKeyRef = useRef<string | null>(null);
  
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const syncSession = useCallback(async (nextSession: Session | null) => {
    const sessionKey = nextSession
      ? `${nextSession.user.id}:${nextSession.access_token}`
      : 'no-session';

    if (syncSessionPromiseRef.current && lastSyncedSessionKeyRef.current === sessionKey) {
      return syncSessionPromiseRef.current;
    }

    lastSyncedSessionKeyRef.current = sessionKey;

    const syncPromise = (async () => {
      setSession(nextSession);

      if (!nextSession) {
        roleRef.current = 'user';
        setRole('user');
        setStatus('unauthenticated');
        setIsOnboardingCompleted(false);
        return;
      }

      const nextRole = await resolveRole(nextSession, roleRef.current);
      roleRef.current = nextRole;
      setRole(nextRole);

      try {
        const onboardingStatus = await withTimeout(
          profileService.getOnboardingStatus(nextSession.user.id),
          appConfig.auth.roleLookupTimeoutMs,
          'Onboarding-Status konnte nicht geladen werden (Timeout).',
        );

        setIsOnboardingCompleted(onboardingStatus ?? false);
      } catch (error) {
        console.warn('[Auth] Onboarding-Status konnte nicht geladen werden, fallback=false.', error);
        setIsOnboardingCompleted(false);
      }

      setStatus('authenticated');
    })()
      .catch((error) => {
        console.warn('[Auth] Session-Synchronisierung fehlgeschlagen, nutze sicheren Fallback.', error);

        if (nextSession) {
          setSession(nextSession);
          roleRef.current = 'user';
          setRole('user');
          setIsOnboardingCompleted(false);
          setStatus('authenticated');
          return;
        }

        setSession(null);
        roleRef.current = 'user';
        setRole('user');
        setIsOnboardingCompleted(false);
        setStatus('unauthenticated');
      })
      .finally(() => {
        if (syncSessionPromiseRef.current === syncPromise) {
          syncSessionPromiseRef.current = null;
        }
      });

    syncSessionPromiseRef.current = syncPromise;
    return syncPromise;
  }, []);
  
  useEffect(() => {
    let mounted = true;

  authService
    .getSession()
    .then(async ({ data, error }) => {
      if (!mounted) return;
  
      if (error) {
        setErrorMessage(error.message);
        setStatus('unauthenticated');
        return;
      }
  
      await syncSession(data.session);
    })
    .catch((error: unknown) => {
      if (!mounted) return;
  
      console.warn('[Auth] Initiale Session konnte nicht geladen werden.', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unbekannter Auth-Fehler');
      setStatus('unauthenticated');
    });

  const {
    data: { subscription },
  } = authService.onAuthStateChange((_event, nextSession) => {
    if (!mounted) return;
  
    void syncSession(nextSession).catch((error: unknown) => {
      if (!mounted) return;
  
      console.warn('[Auth] Auth-State-Change konnte nicht synchronisiert werden.', error);
    });
  });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const login = useCallback(async (email: string, password: string) => {
    setErrorMessage(null);
  
    const { data, error } = await withTimeout(
      authService.signInWithPassword(email, password),
      LOGIN_TIMEOUT_MS,
      'Anmeldung hat zu lange gedauert (Timeout). Bitte erneut versuchen.',
    );
  
    if (error) {
      setErrorMessage(error.message);
      throw error;
    }
  
    await syncSession(data.session);
  }, [syncSession]);

  const register = useCallback(async (email: string, password: string) => {
    setErrorMessage(null);

    const { data, error } = await authService.signUp(email, password);

    if (error) {
      setErrorMessage(error.message);
      throw error;
    }

    if (data.session) {
      await profileService.ensureProfileExists(data.session.user.id);
      await syncSession(data.session);
      return { session: data.session, requiresEmailVerification: false };
    }

    await syncSession(null);
    return { session: null, requiresEmailVerification: true };
  }, [syncSession]);

  const requestSignupVerificationEmail = useCallback(async (email: string) => {
    setErrorMessage(null);

    const resendFn = authService.resendSignUpConfirmation;
    if (!resendFn) {
      const unsupportedError = new Error('Das erneute Senden der Bestätigungs-E-Mail wird in dieser Umgebung nicht unterstützt.');
      setErrorMessage(unsupportedError.message);
      throw unsupportedError;
    }

    const { error } = await resendFn(email);
    if (error) {
      setErrorMessage(error.message);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    setErrorMessage(null);

    const { error } = await authService.signOut();

    if (error) {
      setErrorMessage(error.message);
      throw error;
    }

    await syncSession(null);
  }, [syncSession]);

  const requestPasswordReset = useCallback(async (email: string) => {
    setErrorMessage(null);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await authService.resetPasswordForEmail(email, redirectTo);

    if (error) {
      setErrorMessage(error.message);
      throw error;
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    setErrorMessage(null);

    const { error } = await authService.updatePassword(newPassword);

    if (error) {
      setErrorMessage(error.message);
      throw error;
    }
  }, []);

  const clearError = useCallback(() => setErrorMessage(null), []);
  const refreshProfileState = useCallback(async () => {
    await syncSession(session);
  }, [session, syncSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      role,
      isAdmin: deriveIsAdminFromRole(role),
      isAuthenticated: status === 'authenticated',
      isOnboardingCompleted,
      errorMessage,
      clearError,
      refreshProfileState,
      login,
      register,
      requestSignupVerificationEmail,
      logout,
      requestPasswordReset,
      updatePassword,
    }),
    [
      status,
      session,
      role,
      isOnboardingCompleted,
      errorMessage,
      clearError,
      refreshProfileState,
      login,
      register,
      requestSignupVerificationEmail,
      logout,
      requestPasswordReset,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
