import { getSupabaseClient } from './supabase-client';

// Types
export interface UserStreak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string;
}

export interface UserXP {
  id: string;
  user_id: string;
  total_xp: number;
  weekly_xp: number;
  xp_level: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
  category: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  achievement: Achievement;
}

export interface LeaderboardEntry {
  user_id: string;
  email: string;
  weekly_xp: number;
  xp_level: number;
  rank: number;
}

// Gamification Service
export class GamificationService {
  private supabase = getSupabaseClient();

  /**
   * Streak aktualisieren (tÄ¤glicher Login)
   */
  async updateStreak(userId: string): Promise<UserStreak> {
    const today = new Date().toISOString().split('T')[0];

    // Hole aktuellen Streak
    const { data: existingStreak } = await this.supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!existingStreak) {
      // Neuer Streak
      const { data } = await this.supabase
        .from('user_streaks')
        .insert({
          user_id: userId,
          current_streak: 1,
          longest_streak: 1,
          last_activity_date: today,
        })
        .select()
        .single();

      return data as UserStreak;
    }

    const lastDate = new Date(existingStreak.last_activity_date);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    let newStreak = existingStreak.current_streak;
    let newLongest = existingStreak.longest_streak;

    if (diffDays === 0) {
      // Bereits heute aktiv gewesen
      return existingStreak;
    } else if (diffDays === 1) {
      // Gestern aktiv, Streak fortsetzen
      newStreak += 1;
      newLongest = Math.max(newLongest, newStreak);
    } else {
      // Streak unterbrochen
      newStreak = 1;
    }

    const { data } = await this.supabase
      .from('user_streaks')
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_activity_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    return data as UserStreak;
  }

  /**
   * XP hinzufügen
   */
  async addXP(userId: string, amount: number): Promise<UserXP> {
    // Hole aktuellen XP Stand
    const { data: existingXP } = await this.supabase
      .from('user_xp')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!existingXP) {
      // Neuer XP Eintrag
      const xpLevel = Math.floor(amount / 1000) + 1;
      const { data } = await this.supabase
        .from('user_xp')
        .insert({
          user_id: userId,
          total_xp: amount,
          weekly_xp: amount,
          xp_level: xpLevel,
        })
        .select()
        .single();

      return data as UserXP;
    }

    const newTotal = existingXP.total_xp + amount;
    const newWeekly = existingXP.weekly_xp + amount;
    const newLevel = Math.floor(newTotal / 1000) + 1;

    const { data } = await this.supabase
      .from('user_xp')
      .update({
        total_xp: newTotal,
        weekly_xp: newWeekly,
        xp_level: newLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    return data as UserXP;
  }

  /**
   * Achievement freischalten
   */
  async unlockAchievement(userId: string, achievementId: string): Promise<boolean> {
    // Prüfe ob bereits freigeschaltet
    const { data: existing } = await this.supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .eq('achievement_id', achievementId)
      .single();

    if (existing) {
      return false; // Bereits freigeschaltet
    }

    // Achievement freischalten
    await this.supabase.from('user_achievements').insert({
      user_id: userId,
      achievement_id: achievementId,
    });

    // XP Reward hinzufügen
    const { data: achievement } = await this.supabase
      .from('achievements')
      .select('xp_reward')
      .eq('id', achievementId)
      .single();

    if (achievement?.xp_reward) {
      await this.addXP(userId, achievement.xp_reward);
    }

    return true;
  }

  /**
   * Alle Achievements eines Users
   */
  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    const { data } = await this.supabase
      .from('user_achievements')
      .select(`
        *,
        achievement:achievements (*)
      `)
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

    return (data as UserAchievement[]) || [];
  }

  /**
   * Leaderboard (wö¤¤¤chentlich)
   */
  async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    const { data } = await this.supabase
      .from('weekly_leaderboard')
      .select('*')
      .limit(limit);

    return (data as LeaderboardEntry[]) || [];
  }

  /**
   * User Streak abrufen
   */
  async getStreak(userId: string): Promise<UserStreak | null> {
    const { data } = await this.supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .single();

    return (data as UserStreak) || null;
  }

  /**
   * User XP abrufen
   */
  async getXP(userId: string): Promise<UserXP | null> {
    const { data } = await this.supabase
      .from('user_xp')
      .select('*')
      .eq('user_id', userId)
      .single();

    return (data as UserXP) || null;
  }

  /**
   * Alle verfügbaren Achievements
   */
  async getAllAchievements(): Promise<Achievement[]> {
    const { data } = await this.supabase
      .from('achievements')
      .select('*')
      .order('category')
      .order('xp_reward');

    return (data as Achievement[]) || [];
  }
}

// Singleton Instance
export const gamification = new GamificationService();

// Helper Functions
export async function checkAndUnlockAchievements(userId: string, context: {
  streak?: number;
  totalXP?: number;
  sessionsCompleted?: number;
  friendsInvited?: number;
}) {
  const achievements = await gamification.getAllAchievements();

  // Streak Achievements
  if (context.streak && context.streak >= 7) {
    const weekWarrior = achievements.find(a => a.category === 'streak' && a.xp_reward === 100);
    if (weekWarrior) await gamification.unlockAchievement(userId, weekWarrior.id);
  }

  if (context.streak && context.streak >= 30) {
    const monthPro = achievements.find(a => a.category === 'streak' && a.xp_reward === 500);
    if (monthPro) await gamification.unlockAchievement(userId, monthPro.id);
  }

  // XP Achievements
  if (context.totalXP && context.totalXP >= 1000) {
    const speedLearner = achievements.find(a => a.category === 'xp' && a.xp_reward === 200);
    if (speedLearner) await gamification.unlockAchievement(userId, speedLearner.id);
  }

  // Session Achievements
  if (context.sessionsCompleted && context.sessionsCompleted >= 10) {
    const knowledgeSeeker = achievements.find(a => a.category === 'sessions' && a.xp_reward === 150);
    if (knowledgeSeeker) await gamification.unlockAchievement(userId, knowledgeSeeker.id);
  }
}
