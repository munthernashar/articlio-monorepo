import { useEffect, useState } from 'react';
import { gamification, type UserStreak, type UserXP, type Achievement } from '@articlio/api';
import { useAuth } from '../features/auth/useAuth';

// XP Bar Component
export function XPBar({ xp }: { xp: UserXP }) {
  const progress = (xp.total_xp % 1000) / 1000 * 100;
  
  return (
    <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-4 text-white">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Level {xp.xp_level}</span>
        <span className="text-xs opacity-80">{xp.total_xp} XP</span>
      </div>
      <div className="w-full bg-white/20 rounded-full h-2">
        <div 
          className="bg-white rounded-full h-2 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 text-xs opacity-80">
        {1000 - (xp.total_xp % 1000)} XP bis Level {xp.xp_level + 1}
      </div>
    </div>
  );
}

// Streak Display Component
export function StreakDisplay({ streak }: { streak: UserStreak }) {
  return (
    <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg p-4 text-white">
      <div className="flex items-center gap-3">
        <div className="text-3xl">🔥</div>
        <div>
          <div className="text-2xl font-bold">{streak.current_streak} Tage</div>
          <div className="text-sm opacity-80">Aktuelle Serie</div>
        </div>
      </div>
      {streak.longest_streak > streak.current_streak && (
        <div className="mt-2 text-xs opacity-80">
          Persönlicher Rekord: {streak.longest_streak} Tage
        </div>
      )}
    </div>
  );
}

// Achievement Badge Component
export function AchievementBadge({ achievement, unlocked = false }: { achievement: Achievement; unlocked?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border-2 ${
      unlocked 
        ? 'border-yellow-400 bg-yellow-50' 
        : 'border-gray-200 bg-gray-50 opacity-50'
    }`}>
      <div className="text-2xl text-center mb-2">{achievement.icon}</div>
      <div className="text-sm font-medium text-center">{achievement.name}</div>
      <div className="text-xs text-gray-500 text-center mt-1">{achievement.xp_reward} XP</div>
    </div>
  );
}

// Leaderboard Component
export function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gamification.getLeaderboard(10).then(data => {
      setLeaderboard(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-center py-4">Lade Leaderboard...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 className="text-lg font-bold mb-4">🏆 Wö¤¤¤chentliches Leaderboard</h3>
      <div className="space-y-2">
        {leaderboard.map((entry, index) => (
          <div 
            key={entry.user_id}
            className={`flex items-center justify-between p-3 rounded-lg ${
              index === 0 ? 'bg-yellow-50 border border-yellow-200' :
              index === 1 ? 'bg-gray-50 border border-gray-200' :
              index === 2 ? 'bg-orange-50 border border-orange-200' :
              'bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                index === 0 ? 'bg-yellow-400 text-white' :
                index === 1 ? 'bg-gray-300 text-white' :
                index === 2 ? 'bg-orange-400 text-white' :
                'bg-gray-100 text-gray-600'
              }`}>
                {entry.rank}
              </div>
              <div>
                <div className="font-medium">{entry.email?.split('@')[0]}</div>
                <div className="text-xs text-gray-500">Level {entry.xp_level}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-purple-600">{entry.weekly_xp} XP</div>
              <div className="text-xs text-gray-500">diese Woche</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Gamification Dashboard
export function GamificationDashboard() {
  const { user } = useAuth();
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [xp, setXP] = useState<UserXP | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      // Streak aktualisieren
      const streakData = await gamification.updateStreak(user.id);
      setStreak(streakData);

      // XP laden
      const xpData = await gamification.getXP(user.id);
      if (xpData) setXP(xpData);

      // Achievements laden
      const allAchievements = await gamification.getAllAchievements();
      setAchievements(allAchievements);

      const userAchievements = await gamification.getUserAchievements(user.id);
      setUnlockedAchievements(userAchievements.map(a => a.achievement_id));

      setLoading(false);
    };

    loadData();
  }, [user]);

  if (loading || !user) {
    return <div className="text-center py-4">Lade Gamification-Daten...</div>;
  }

  return (
    <div className="space-y-6">
      {/* XP & Streak */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {xp && <XPBar xp={xp} />}
        {streak && <StreakDisplay streak={streak} />}
      </div>

      {/* Achievements */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-lg font-bold mb-4">🎯 Achievements</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {achievements.map(achievement => (
            <AchievementBadge
              key={achievement.id}
              achievement={achievement}
              unlocked={unlockedAchievements.includes(achievement.id)}
            />
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <Leaderboard />
    </div>
  );
}
