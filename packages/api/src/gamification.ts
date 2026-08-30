import { getSupabaseClient } from './client'

export interface UserStreak { id: string; user_id: string; current_streak: number; longest_streak: number; last_activity_date: string }
export interface UserXP { id: string; user_id: string; total_xp: number; weekly_xp: number; xp_level: number }
export interface Achievement { id: string; name: string; description: string; icon: string; xp_reward: number; category: string }
export interface UserAchievement { id: string; user_id: string; achievement_id: string; unlocked_at: string; achievement: Achievement }
export interface LeaderboardEntry { user_id: string; email: string; weekly_xp: number; xp_level: number; rank: number }

export class GamificationService {
  private supabase = getSupabaseClient()
  async updateStreak(userId: string): Promise<UserStreak> {
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await this.supabase.from('user_streaks').select('*').eq('user_id', userId).single()
    if (!existing) {
      const { data } = await this.supabase.from('user_streaks').insert({ user_id: userId, current_streak: 1, longest_streak: 1, last_activity_date: today }).select().single()
      return data as UserStreak
    }
    const diffDays = Math.floor((new Date(today).getTime() - new Date(existing.last_activity_date).getTime()) / 86400000)
    if (diffDays === 0) return existing as UserStreak
    const current = diffDays === 1 ? existing.current_streak + 1 : 1
    const longest = Math.max(existing.longest_streak, current)
    const { data } = await this.supabase.from('user_streaks').update({ current_streak: current, longest_streak: longest, last_activity_date: today, updated_at: new Date().toISOString() }).eq('user_id', userId).select().single()
    return data as UserStreak
  }
  async addXP(userId: string, amount: number): Promise<UserXP> {
    const { data: existing } = await this.supabase.from('user_xp').select('*').eq('user_id', userId).single()
    if (!existing) {
      const { data } = await this.supabase.from('user_xp').insert({ user_id: userId, total_xp: amount, weekly_xp: amount, xp_level: Math.floor(amount / 1000) + 1 }).select().single()
      return data as UserXP
    }
    const total = existing.total_xp + amount
    const { data } = await this.supabase.from('user_xp').update({ total_xp: total, weekly_xp: existing.weekly_xp + amount, xp_level: Math.floor(total / 1000) + 1, updated_at: new Date().toISOString() }).eq('user_id', userId).select().single()
    return data as UserXP
  }
  async unlockAchievement(userId: string, achievementId: string): Promise<boolean> {
    const { data: existing } = await this.supabase.from('user_achievements').select('*').eq('user_id', userId).eq('achievement_id', achievementId).single()
    if (existing) return false
    await this.supabase.from('user_achievements').insert({ user_id: userId, achievement_id: achievementId })
    const { data: achievement } = await this.supabase.from('achievements').select('xp_reward').eq('id', achievementId).single()
    if (achievement?.xp_reward) await this.addXP(userId, achievement.xp_reward)
    return true
  }
  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    const { data } = await this.supabase.from('user_achievements').select('*, achievement:achievements (*)').eq('user_id', userId).order('unlocked_at', { ascending: false })
    return (data as UserAchievement[]) || []
  }
  async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const { data } = await this.supabase.from('weekly_leaderboard').select('*').limit(limit)
    return (data as LeaderboardEntry[]) || []
  }
  async getStreak(userId: string): Promise<UserStreak | null> {
    const { data } = await this.supabase.from('user_streaks').select('*').eq('user_id', userId).single()
    return (data as UserStreak) || null
  }
  async getXP(userId: string): Promise<UserXP | null> {
    const { data } = await this.supabase.from('user_xp').select('*').eq('user_id', userId).single()
    return (data as UserXP) || null
  }
  async getAllAchievements(): Promise<Achievement[]> {
    const { data } = await this.supabase.from('achievements').select('*').order('category').order('xp_reward')
    return (data as Achievement[]) || []
  }
}

export const gamification = new GamificationService()

export async function checkAndUnlockAchievements(userId: string, context: { streak?: number; totalXP?: number; sessionsCompleted?: number; friendsInvited?: number }) {
  const achievements = await gamification.getAllAchievements()
  if (context.streak && context.streak >= 7) { const a = achievements.find(x => x.category === 'streak' && x.xp_reward === 100); if (a) await gamification.unlockAchievement(userId, a.id) }
  if (context.streak && context.streak >= 30) { const a = achievements.find(x => x.category === 'streak' && x.xp_reward === 500); if (a) await gamification.unlockAchievement(userId, a.id) }
  if (context.totalXP && context.totalXP >= 1000) { const a = achievements.find(x => x.category === 'xp' && x.xp_reward === 200); if (a) await gamification.unlockAchievement(userId, a.id) }
  if (context.sessionsCompleted && context.sessionsCompleted >= 10) { const a = achievements.find(x => x.category === 'sessions' && x.xp_reward === 150); if (a) await gamification.unlockAchievement(userId, a.id) }
}
