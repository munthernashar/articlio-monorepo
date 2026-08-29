import { createClient } from '@supabase/supabase-js';
import { appConfig } from '@/lib/config';
import type { Database } from '@/types/database';

export const supabaseClient = createClient<Database>(appConfig.supabase.url, appConfig.supabase.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
