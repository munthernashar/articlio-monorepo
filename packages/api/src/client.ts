import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@articlio/types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

let supabaseInstance: SupabaseClient<Database> | null = null

export function createSupabaseClient(): SupabaseClient<Database> {
  if (supabaseInstance) return supabaseInstance
  supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  })
  return supabaseInstance
}

export const supabase = createSupabaseClient()