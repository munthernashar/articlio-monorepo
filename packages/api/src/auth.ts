import { supabase } from './client'
import type { User, Session, AuthError } from '@supabase/supabase-js'

export interface AuthResult {
  user: User | null
  session: Session | null
  error: AuthError | null
}

export async function signInWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { user: data.user, session: data.session, error }
}

export async function signUpWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { user: data.user, session: data.session, error }
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}