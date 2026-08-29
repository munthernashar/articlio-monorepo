import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const { getUserRoleMock } = vi.hoisted(() => ({
  getUserRoleMock: vi.fn(),
}));

vi.mock('@/services/supabase/profile.service', () => ({
  profileService: {
    getUserRole: getUserRoleMock,
  },
}));

vi.mock('@/services/supabase/auth.service', () => ({
  authService: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updatePassword: vi.fn(),
  },
}));

import { resolveRole } from '@/features/auth/AuthContext';

function createSession(metadataRole?: string): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: 0,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      app_metadata: {},
      user_metadata: metadataRole ? { role: metadataRole } : {},
      aud: 'authenticated',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  } as Session;
}

describe('resolveRole (profile-first)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nimmt profiles.role='admin' und ignoriert metadata='user'", async () => {
    const session = createSession('user');
    getUserRoleMock.mockResolvedValue('admin');

    await expect(resolveRole(session)).resolves.toBe('admin');
    expect(getUserRoleMock).toHaveBeenCalledWith('user-1');
  });

  it('liefert user wenn profiles.role=null ist und kein Admin-Status vorliegt', async () => {
    const session = createSession();
    getUserRoleMock.mockResolvedValue(null);

    await expect(resolveRole(session)).resolves.toBe('user');
    expect(getUserRoleMock).toHaveBeenCalledWith('user-1');
  });

  it('behält admin wenn profiles.role temporär nicht geladen werden kann', async () => {
    const session = createSession();
    getUserRoleMock.mockResolvedValue(null);

    await expect(resolveRole(session, 'admin')).resolves.toBe('admin');
  });

  it('liefert user bei Profilfehler wenn zuvor kein admin aktiv war', async () => {
    const session = createSession();
    getUserRoleMock.mockRejectedValue(new Error('timeout'));

    await expect(resolveRole(session, 'user')).resolves.toBe('user');
  });

  it('behält admin bei langsamem profiles.role Lookup nach Timeout', async () => {
    vi.useFakeTimers();

    try {
      const session = createSession();
      getUserRoleMock.mockImplementation(() => new Promise(() => undefined));

      const rolePromise = resolveRole(session, 'admin');
      await vi.advanceTimersByTimeAsync(40000);
      await vi.runAllTimersAsync();

      await expect(rolePromise).resolves.toBe('admin');
    } finally {
      vi.useRealTimers();
    }
  }, 10000);
});
