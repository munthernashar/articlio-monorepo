import { useEffect, useState } from 'react';
import { useAuth } from '../features/auth/useAuth';
import { useNavigate } from 'react-router-dom';
import { paths } from '../app/routes/paths';
import { GamificationDashboard } from '../components/Gamification';

export function DashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      navigate(paths.auth.login, { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Lernender';
      setUserName(name);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Lade Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">ArtiCleo</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Hallo, {userName}</span>
              <button
                onClick={() => navigate(paths.profile)}
                className="text-sm text-purple-600 hover:text-purple-700"
              >
                Profil
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Gamification Widget - Oben */}
        <section className="mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h2 className="text-lg font-bold text-gray-900 mb-3">🎮 Deine Fortschritte</h2>
            <GamificationDashboard />
          </div>
        </section>

        {/* Quick Actions */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Start Session */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
               onClick={() => navigate(paths.tutor)}>
            <div className="text-3xl mb-3">🎯</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Session starten</h3>
            <p className="text-sm text-gray-600">Starte ein AI-GesprÃ¤ch und sammle XP</p>
          </div>

          {/* Focus Topics */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
               onClick={() => navigate(paths.focusTopic)}>
            <div className="text-3xl mb-3">📚</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Fokus-Themen</h3>
            <p className="text-sm text-gray-600">WÃ¤hle ein Thema zum vertieften Lernen</p>
          </div>

          {/* Progress */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
               onClick={() => navigate(paths.progress)}>
            <div className="text-3xl mb-3">📊</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Dein Fortschritt</h3>
            <p className="text-sm text-gray-600">Siehe deine Lernstatistiken</p>
          </div>
        </section>

        {/* Recent Sessions */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Letzte Sessions</h2>
          <div className="text-gray-500 text-sm">
            Hier werden deine letzten Sessions angezeigt...
          </div>
        </section>
      </main>
    </div>
  );
}
