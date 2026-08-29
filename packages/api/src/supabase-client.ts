import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Shared Supabase client configuration
// This client can be used by both web and mobile apps

const SUPABASE_URL = 'https://pkmwdhjohidkkjkrlcnt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbXdkampvaGlka2tqa3JsY250Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0MjQ3MzMsImV4cCI6MjA2MTAwMDczM30.J6z3BG9sTqQ6Y8qKz5xKqJz3BG9sTqQ6Y8qKz5xKqJw'; // Replace with actual key

let supabaseClient: SupabaseClient | null = null;

export function createSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseClient;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    return createSupabaseClient();
  }
  return supabaseClient;
}

// Re-export types for convenience
export type { SupabaseClient, Session, User } from '@supabase/supabase-js';
