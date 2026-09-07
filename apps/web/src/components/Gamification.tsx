import { useEffect, useState } from 'react';
import { Flame, Trophy, Zap } from 'lucide-react';
import { gamification, type UserStreak, type UserXP, type Achievement, type LeaderboardEntry } from '@articlio/api';
import { useAuth } from '@/features/auth/useAuth';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ICON_SIZE_SM } from '@/lib/icon-sizes';

// Redesign (07.09.2026): war zuvor mit reinen Tailwind-Utility-Klassen gebaut, obwohl Tailwind
// in apps/web gar nicht installiert/konfiguriert ist (kein tailwind.config, keine
// @tailwind-Direktiven in global.css) -- die Klassen griffen nie, das Widget rendere faktisch
// ungestylt. Jetzt auf das echte Card-/Token-System des Dashboards umgestellt (siehe
// global.css: --surface-*, --text-*, .card, .progress-meter, Badge-Komponente), damit es zum
// Rest der App passt, in beiden Themes funktioniert und sich bewusst dem Dashboard unterordnet
// (kleinere Überschrift, unten platziert -- siehe DashboardPage.tsx) statt es zu dominieren.

export function XPBar({ xp }: { xp: UserXP }) {
  const xpIntoLevel = xp.total_xp % 1000;
  const progressPercent = (xpIntoLevel / 1000) * 100;
  const xpToNextLevel = 1000 - xpIntoLevel;

  return (
    <div className="gamification-stat">
      <div className="gamification-stat-label">
        <Zap aria-hidden="true" size={ICON_SIZE_SM} />
        Level {xp.xp_level}
      </div>
      <div className="gamification-stat-value">{xp.total_xp} XP</div>
      <div
        className="progress-meter"
        role="progressbar"
        aria-valuenow={xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={1000}
        aria-label={`${xpToNextLevel} XP bis Level ${xp.xp_level + 1}`}
      >
        <div className="progress-meter-fill" style={{ width: `${progressPercent}%`, background: 'var(--accent)' }} />
      </div>
      <p className="dashboard-meta">{xpToNextLevel} XP bis Level {xp.xp_level + 1}</p>
    </div>
  );
}

export function StreakDisplay({ streak }: { streak: UserStreak }) {
  return (
    <div className="gamification-stat">
      <div className="gamification-stat-label">
        <Flame aria-hidden="true" size={ICON_SIZE_SM} />
        Aktuelle Serie
      </div>
      <div className="gamification-stat-value">
        {streak.current_streak} {streak.current_streak === 1 ? 'Tag' : 'Tage'}
      </div>
      {streak.longest_streak > streak.current_streak ? (
        <p className="dashboard-meta">Persönlicher Rekord: {streak.longest_streak} Tage</p>
      ) : null}
    </div>
  );
}

export function AchievementBadge({ achievement, unlocked = false }: { achievement: Achievement; unlocked?: boolean }) {
  return (
    <div
      className={`gamification-achievement ${unlocked ? 'gamification-achievement--unlocked' : 'gamification-achievement--locked'}`}
      title={achievement.description}
    >
      <span className="gamification-achievement-icon" aria-hidden="true">{achievement.icon}</span>
      <span className="gamification-achievement-name">{achievement.name}</span>
      <span className="gamification-achievement-xp">{achievement.xp_reward} XP</span>
    </div>
  );
}

export function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    gamification.getLeaderboard(5).then((data) => {
      if (!isMounted) return;
      setLeaderboard(data);
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return <Skeleton width="100%" height="4.5rem" />;
  }

  if (leaderboard.length === 0) {
    return <p className="dashboard-meta">Diese Woche noch keine Einträge.</p>;
  }

  return (
    <div className="gamification-leaderboard">
      {leaderboard.map((entry, index) => (
        <div
          key={entry.user_id}
          className={`gamification-leaderboard-row${index === 0 ? ' gamification-leaderboard-row--top1' : ''}`}
        >
          <span className="gamification-leaderboard-name">
            <span className="gamification-leaderboard-rank">{entry.rank}</span>
            {entry.email?.split('@')[0] ?? 'Lernender'}
            <span className="dashboard-meta">Level {entry.xp_level}</span>
          </span>
          <Badge tone="info">{entry.weekly_xp} XP</Badge>
        </div>
      ))}
    </div>
  );
}

export function GamificationDashboard() {
  const { user } = useAuth();
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [xp, setXP] = useState<UserXP | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const loadData = async () => {
      const [streakData, xpData, allAchievements, userAchievements] = await Promise.all([
        gamification.updateStreak(user.id),
        gamification.getXP(user.id),
        gamification.getAllAchievements(),
        gamification.getUserAchievements(user.id),
      ]);

      if (!isMounted) return;
      setStreak(streakData);
      setXP(xpData);
      setAchievements(allAchievements);
      setUnlockedAchievements(userAchievements.map((entry) => entry.achievement_id));
      setLoading(false);
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  if (!user) return null;

  return (
    <section className="card gamification-summary">
      <div className="gamification-summary-header">
        <Trophy aria-hidden="true" size={ICON_SIZE_SM} />
        <h3>Level &amp; Erfolge</h3>
      </div>

      {loading ? (
        <Skeleton width="100%" height="8rem" />
      ) : (
        <>
          <div className="gamification-row">
            {xp ? <XPBar xp={xp} /> : null}
            {streak ? <StreakDisplay streak={streak} /> : null}
          </div>

          {achievements.length > 0 ? (
            <div className="gamification-achievements">
              {achievements.map((achievement) => (
                <AchievementBadge
                  key={achievement.id}
                  achievement={achievement}
                  unlocked={unlockedAchievements.includes(achievement.id)}
                />
              ))}
            </div>
          ) : null}

          <h4 className="gamification-subheading">Wöchentliches Leaderboard</h4>
          <Leaderboard />
        </>
      )}
    </section>
  );
}
