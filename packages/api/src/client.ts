import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@articlio/types'

let supabaseInstance: SupabaseClient<Database> | null = null

export function configureSupabaseClient(url: string, anonKey: string): SupabaseClient<Database> {
  if (!url || !anonKey) {
    throw new Error('Missing Supabase URL or anon key')
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  }

  return supabaseInstance
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseInstance) {
    throw new Error('Supabase client is not configured. Call configureSupabaseClient() at app startup.')
  }

  return supabaseInstance
}

export type { SupabaseClient }
