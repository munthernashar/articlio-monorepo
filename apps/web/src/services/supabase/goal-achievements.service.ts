import { supabaseClient } from '@/services/supabase/client';

export type GoalAchievement = {
  goalKey: string;
  displayName: string;
  achievedAt: string;
};

type GoalAchievementRow = {
  goal_key: string;
  achieved_at: string;
  learning_goal_catalog: { display_name: string } | null;
};

type GoalAchievementsClient = {
  from: (table: 'user_goal_achievements') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean }) => Promise<{
          data: GoalAchievementRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
    upsert: (
      row: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

export const goalAchievementsService = {
  /**
   * Lernpfade Phase F: dauerhafte Erfolgs-Historie fürs Profil -- welche Lernziele der
   * Nutzer schon erreicht hat. Das aktuell gewählte Ziel (profiles.learning_goal_key)
   * bleibt davon unberührt, ein Erfolg ist rein additiv.
   */
  async getAchievements(userId: string): Promise<GoalAchievement[]> {
    const client = supabaseClient as unknown as GoalAchievementsClient;
    const { data, error } = await client
      .from('user_goal_achievements')
      .select('goal_key, achieved_at, learning_goal_catalog(display_name)')
      .eq('user_id', userId)
      .order('achieved_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data
      .filter((row): row is GoalAchievementRow & { learning_goal_catalog: { display_name: string } } => Boolean(row.learning_goal_catalog))
      .map((row) => ({
        goalKey: row.goal_key,
        displayName: row.learning_goal_catalog.display_name,
        achievedAt: row.achieved_at,
      }));
  },

  /**
   * Idempotent: wird jedes Mal aufgerufen, wenn Dashboard/Skill Map ein erreichtes Ziel
   * berechnen (kein separater "Ziel erreicht"-Event nötig) -- der unique(user_id, goal_key)
   * Constraint sorgt dafür, dass ein bereits erreichtes Ziel nicht doppelt eingetragen wird.
   */
  async recordAchievementIfNew(userId: string, goalKey: string): Promise<void> {
    const client = supabaseClient as unknown as GoalAchievementsClient;
    await client.from('user_goal_achievements').upsert(
      { user_id: userId, goal_key: goalKey },
      { onConflict: 'user_id,goal_key', ignoreDuplicates: true },
    );
  },
};
