// Shared, platform-agnostic Supabase API for Articlio
export { configureSupabaseClient, getSupabaseClient } from './client'
export type { SupabaseClient } from './client'
export * from './auth'
export * from './profile'
export * from './gamification'
