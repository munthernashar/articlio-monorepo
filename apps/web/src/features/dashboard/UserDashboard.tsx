import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mic, Target } from 'lucide-react';

import { paths } from '@/app/routes/paths';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { getFocusStatusDisplay } from '@/features/focus-topic/status-display';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { ICON_SIZE_MD } from '@/lib/icon-sizes';
import { useDashboardAiSummary, useDashboardData } from '@/features/dashboard/useDashboardData';
import type { DashboardData } from '@/services/supabase/dashboard-data.service';
import {
  SESSION_ANALYSIS_CATEGORIES,
  type CefrBand,
} from '@/services/supabase/session-analysis.service';
import { buildSkillMapMatrix, isCefrBandAtOrAboveTarget } from '@/features/progress/SkillMapOverview';
import { profileService } from '@/services/supabase/profile.service';
import { learningGoalCatalogService, type LearningGoalContract } from '@/services/supabase/learning-goal-catalog.service';
import { civicsExamQuestionsService, type CivicsTopicCoverage } from '@/services/supabase/civics-exam-questions.service';
import { goalAchievementsService } from '@/services/supabase/goal-achievements.service';
import type { Json } from '@/types/database';

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const AI_TECHNICAL_IMPROVEMENT_FALLBACK = 'Dein wichtigster Verbesserungsbereich wird nach deiner ersten Session sichtbar.';
const AI_TECHNICAL_RECOMMENDATION_FALLBACK = 'Starte mit einer kurzen Session, dann bekommst du hier deinen nächsten Schritt.';

export function deriveDashboardInterpretation(data: DashboardData | null | undefined) {
  const primaryImprovementArea = data?.aiSummary?.primaryImprovementArea ?? null;
  const aiNextAction = data?.aiSummary?.nextActionDetail;
  const fallbackRecommendation = asRecord(data?.latestImprovement?.result_payload ?? null).recommendation;
  const nextRecommendation =
    aiNextAction?.title ??
    (typeof fallbackRecommendation === 'string' && fallbackRecommendation.trim().length > 0
      ? fallbackRecommendation
      : data?.aiSummary?.next_action ?? null);
  const focusTopicInterpretation = data?.aiSummary?.focusTopic ?? null;

  return { primaryImprovementArea, aiNextAction, nextRecommendation, focusTopicInterpretation };
}

export function UserDashboard() {
  const { user } = useCurrentUser();
  const { data, isLoading, error } = useDashboardData(user?.id);
  // Bug-Fix (27.08.2026): dashboard_summary lief zuvor synchron mit 1200ms-Timeout innerhalb
  // von loadDashboardData -- die KI-Antwort dauert real 4-10s und kam dadurch praktisch nie
  // rechtzeitig an. Läuft jetzt als eigene, spätere Query.
  const { data: aiSummaryResult, isLoading: isAiSummaryLoading } = useDashboardAiSummary(data?.aiSummaryInput);
  const effectiveData = useMemo(() => {
    if (!data || !aiSummaryResult) return data;
    return { ...data, ...aiSummaryResult };
  }, [data, aiSummaryResult]);
  const errorMessage = error ? (error instanceof Error ? error.message : 'Dashboard konnte nicht geladen werden.') : null;
  const [goal, setGoal] = useState<LearningGoalContract | null>(null);
  const [civicsCoverage, setCivicsCoverage] = useState<CivicsTopicCoverage | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setGoal(null);
      setCivicsCoverage(null);
      return;
    }
    let isMounted = true;

    const loadGoal = async () => {
      const [profile, goals] = await Promise.all([
        profileService.getOnboardingProfile(user.id).catch(() => null),
        learningGoalCatalogService.listActiveGoals().catch(() => []),
      ]);
      if (!isMounted) return;
      const selectedGoal = goals.find((entry) => entry.goalKey === profile?.learning_goal_key) ?? null;
      setGoal(selectedGoal);

      if (selectedGoal?.goalKey === 'leben_in_deutschland') {
        const coverage = await civicsExamQuestionsService.getTopicCoverage(user.id).catch(() => null);
        if (isMounted) setCivicsCoverage(coverage);
      } else {
        setCivicsCoverage(null);
      }
    };

    void loadGoal();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // "Allgemeines Zertifikat" hat kein festes Ziel-Band und "Leben in
  // Deutschland" hat kein CEFR-Ziel überhaupt (siehe Plan-Dokument Phase D) --
  // die Ziel-Karte erscheint nur für Ziele mit konkretem Ziel-Band.
  const goalTargetBand: CefrBand | null =
    goal && goal.goalType === 'language_level' && goal.targetCefrBand ? goal.targetCefrBand : null;

  const goalReadiness = useMemo(() => {
    if (!goalTargetBand || !data) return null;
    const matrix = buildSkillMapMatrix(data.analyses);
    const categoriesOnTarget = matrix.filter((entry) => isCefrBandAtOrAboveTarget(entry.cefrBand, goalTargetBand)).length;
    return { categoriesOnTarget, totalCategories: SESSION_ANALYSIS_CATEGORIES.length };
  }, [goalTargetBand, data]);

  const isGoalFullyReached =
    (goalTargetBand !== null && goalReadiness !== null && goalReadiness.categoriesOnTarget === goalReadiness.totalCategories) ||
    (goal?.goalKey === 'leben_in_deutschland' &&
      civicsCoverage !== null &&
      civicsCoverage.totalTopics > 0 &&
      civicsCoverage.coveredTopics === civicsCoverage.totalTopics);

  // Lernpfade Phase F: sobald ein gesetztes Ziel vollständig erreicht ist, wird das als
  // dauerhafter Erfolg festgehalten (Badge im Profil) -- das Ziel selbst bleibt aktiv, der
  // Nutzer entscheidet im Profil selbst, ob/wann er ein neues Ziel wählt. Idempotent, daher
  // ohne Bedenken bei jedem Dashboard-Laden erneut prüfbar.
  useEffect(() => {
    if (!user?.id || !goal || !isGoalFullyReached) return;
    void goalAchievementsService.recordAchievementIfNew(user.id, goal.goalKey);
  }, [user?.id, goal, isGoalFullyReached]);

  const recentSessions = useMemo(() => (data?.sessions ?? []).slice(0, 5), [data?.sessions]);
  const latestSession = recentSessions[0] ?? null;
  const latestAnalysis = data?.analyses[0] ?? null;
  const hasAnyActivity = (data?.sessions.length ?? 0) > 0;

  const { primaryImprovementArea, aiNextAction, nextRecommendation, focusTopicInterpretation } = deriveDashboardInterpretation(effectiveData);
  const hasRecommendation = Boolean(nextRecommendation);
  const isAiSummaryPending = isAiSummaryLoading && hasAnyActivity && !hasRecommendation;

  const startSessionLabel = hasAnyActivity ? 'Session starten' : 'Erste Session starten';

  if (isLoading) {
    return (
      <div className="dashboard-grid" aria-busy="true" aria-label="Dashboard wird geladen">
        <article className="card dashboard-wide skeleton-card">
          <Skeleton width="40%" height="1.1rem" />
          <Skeleton width="70%" height="1.5rem" />
          <Skeleton width="90%" height="0.9rem" />
          <Skeleton width="140px" height="2.4rem" />
        </article>
        <article className="card dashboard-wide skeleton-card">
          <Skeleton width="35%" height="1.1rem" />
          <Skeleton width="60%" height="1.3rem" />
          <Skeleton width="80%" height="0.9rem" />
        </article>
        <article className="card dashboard-wide skeleton-card">
          <Skeleton width="45%" height="1.1rem" />
          <Skeleton width="100%" height="0.9rem" />
          <Skeleton width="100%" height="0.9rem" />
        </article>
      </div>
    );
  }
  if (errorMessage) return <article className="card auth-error">{errorMessage}</article>;

  const nextActionReason = hasRecommendation
    ? aiNextAction?.description ?? primaryImprovementArea?.reason ?? 'Diese Empfehlung basiert auf deiner bisherigen Lernaktivität.'
    : hasAnyActivity
      ? AI_TECHNICAL_IMPROVEMENT_FALLBACK
      : 'In weniger als 5 Minuten hast du deine erste Analyse mit persönlicher Empfehlung.';

  const focusTopicLine = focusTopicInterpretation ? (
    <>
      {focusTopicInterpretation.title} · {focusTopicInterpretation.reason}
    </>
  ) : data?.focusTitle ? (
    <>
      {data.focusTitle} · {data.focusStatus ? getFocusStatusDisplay(data.focusStatus).short : 'Status offen'}
    </>
  ) : null;

  return (
    <div className="dashboard-grid">
      <article className="card dashboard-wide dashboard-hero">
        <h3>{hasAnyActivity ? 'Dein nächster Schritt' : 'Willkommen – wir starten gemeinsam'}</h3>
        {isAiSummaryPending ? (
          <>
            <Skeleton width="80%" height="1.5rem" />
            <Skeleton width="60%" height="0.9rem" />
          </>
        ) : (
          <>
            <p className="dashboard-big">{nextRecommendation ?? AI_TECHNICAL_RECOMMENDATION_FALLBACK}</p>
            <p>{nextActionReason}</p>
          </>
        )}
        {focusTopicLine ? <p className="dashboard-meta">Fokus-Thema: {focusTopicLine}</p> : null}
        <div className="button-row" style={{ justifyContent: 'flex-start' }}>
          <Link to={paths.sessions.new} className="button">
            {startSessionLabel}
          </Link>
          {data?.latestTutorInteraction ? (
            <Link to={paths.tutor} className="button button-secondary">
              Coaching öffnen
            </Link>
          ) : null}
        </div>
      </article>

      {goalTargetBand && goalReadiness ? (
        <article className="card dashboard-wide">
          <h3 className="card-heading-with-icon">
            <Target aria-hidden="true" size={ICON_SIZE_MD} className="item-icon" />
            Dein Ziel: {goal?.displayName}
          </h3>
          <p>
            Ziel-Niveau {goalTargetBand} ·{' '}
            <Badge tone={goalReadiness.categoriesOnTarget === goalReadiness.totalCategories ? 'success' : 'info'}>
              {goalReadiness.categoriesOnTarget} von {goalReadiness.totalCategories} Bereichen auf Zielniveau
            </Badge>
          </p>
          <p>Details je Kompetenzbereich siehst du in deiner Skill Map.</p>
        </article>
      ) : null}

      {goal?.goalKey === 'leben_in_deutschland' && civicsCoverage && civicsCoverage.totalTopics > 0 ? (
        <article className="card dashboard-wide">
          <h3 className="card-heading-with-icon">
            <Target aria-hidden="true" size={ICON_SIZE_MD} className="item-icon" />
            Dein Ziel: {goal.displayName}
          </h3>
          <p>
            <Badge tone={civicsCoverage.coveredTopics === civicsCoverage.totalTopics ? 'success' : 'info'}>
              {civicsCoverage.coveredTopics} von {civicsCoverage.totalTopics} Themenbereichen sicher erklärt
            </Badge>
          </p>
          <p>Zählt, sobald du eine Frage aus diesem Bereich richtig erklärt hast.</p>
        </article>
      ) : null}

      <article className="card dashboard-wide">
        <h3>Letzte Session</h3>
        {latestSession ? (
          <>
            <p className="dashboard-big">{latestSession.title}</p>
            <p>
              {formatDate(latestSession.createdAt)} · {latestSession.source === 'tutor' ? 'Coach-Session' : 'Freies Sprechen'}
            </p>
            {latestAnalysis?.session_summary ? <p>{latestAnalysis.session_summary}</p> : <p>Analyse wird noch vorbereitet.</p>}
            <Link to={paths.sessions.detail.replace(':sessionId', latestSession.id)} className="button button-secondary">
              Session ansehen
            </Link>
          </>
        ) : (
          <div className="empty-state">
            <Mic aria-hidden="true" size={28} className="empty-state-icon" />
            <p className="dashboard-big">Noch keine Session vorhanden</p>
            <p>Deine erste Session dauert nur wenige Minuten. Direkt danach siehst du hier deine Analyse.</p>
            <Link to={paths.sessions.new} className="button">
              Erste Session starten
            </Link>
          </div>
        )}
      </article>

      <article className="card dashboard-wide">
        <h3>Sessions-Verlauf</h3>
        {recentSessions.length ? (
          <div className="session-list">
            {recentSessions.map((session) => (
              <Link key={session.id} to={paths.sessions.detail.replace(':sessionId', session.id)} className="session-list-item">
                <p>
                  <strong>{formatDate(session.createdAt)}</strong> · {session.source === 'tutor' ? 'Coach' : 'Freies Sprechen'}
                </p>
                <p>{session.title}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Mic aria-hidden="true" size={28} className="empty-state-icon" />
            <p>Noch keine Sessions vorhanden.</p>
            <p>Mit deiner ersten Session startet hier dein persönlicher Verlauf.</p>
            <Link to={paths.sessions.new} className="button">
              Erste Session starten
            </Link>
          </div>
        )}
      </article>
    </div>
  );
}
