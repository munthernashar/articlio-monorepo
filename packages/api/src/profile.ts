import { getSupabaseClient } from './client'
import type { Profile } from '@articlio/types'

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient().from('profiles').select('*').eq('id', userId).single()
  if (error || !data) return null
  return data
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'full_name' | 'avatar_url'>>
): Promise<{ error: Error | null }> {
  const { error } = await getSupabaseClient().from('profiles').update(updates).eq('id', userId)
  return { error }
}
