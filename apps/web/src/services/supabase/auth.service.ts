import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabaseClient } from '@/services/supabase/client';

function extractRoleFromUserMetadata(session: Session | null): string | null {
  const role = session?.user.user_metadata?.role;
  return typeof role === 'string' ? role : null;
}

export const authService = {
  signInWithPassword: (email: string, password: string) =>
    supabaseClient.auth.signInWithPassword({ email, password }),
  signUp: (email: string, password: string) =>
    supabaseClient.auth.signUp({
      email,
      password,
    }),
  resendSignUpConfirmation: (email: string) =>
    supabaseClient.auth.resend({
      type: 'signup',
      email,
    }),
  signOut: () => supabaseClient.auth.signOut(),
  resetPasswordForEmail: (email: string, redirectTo: string) =>
    supabaseClient.auth.resetPasswordForEmail(email, { redirectTo }),
  updatePassword: (password: string) => supabaseClient.auth.updateUser({ password }),
  updateEmail: (email: string) => supabaseClient.auth.updateUser({ email }),
  updateDisplayName: (displayName: string) => supabaseClient.auth.updateUser({ data: { display_name: displayName } }),
  getSession: () => supabaseClient.auth.getSession(),
  onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) =>
    supabaseClient.auth.onAuthStateChange(callback),
  extractRoleFromUserMetadata,
};
