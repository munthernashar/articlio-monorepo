import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { paths } from '@/app/routes/paths';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDashboardAiSummary, useDashboardData } from '@/features/dashboard/useDashboardData';
import type { DashboardData } from '@/services/supabase/dashboard-data.service';
import { useEntitlement } from '@/services/supabase/useEntitlement';
import { TutorWorkspace } from '@/features/tutor/TutorWorkspace';

type CoachingIntroState = {
  coachingIntro?: {
    sessionId: string;
    topic?: string | null;
    highlights?: string | null;
    mistakeHotspots?: string[];
    priorityFocus?: string | null;
  };
};
type TutorDataState = 'empty' | 'ready';

type TutorDataSignals = {
  analysisCount: number;
};

type RecommendedTraining = {
  title: string;
  reason: string;
  description: string;
  targetSkill: string;
};

type TutorPageViewModel = {
  tutorDataState: TutorDataState;
  recommendedTraining: RecommendedTraining | null;
  hasAiSummaryPayload: boolean;
  isAiTechnicalUnavailable: boolean;
  shouldRenderRecommendedCard: boolean;
};

export function deriveTutorDataState(signals: TutorDataSignals): TutorDataState {
  if (signals.analysisCount < 1) return 'empty';
  return 'ready';
}

const AI_TECHNICAL_ERROR_MESSAGE = 'Der KI-Coach konnte gerade keine Antwort erzeugen. Bitte versuche es erneut.';

// Bug-Fix (27.08.2026): "Für dich empfohlen" kam nie zustande, weil recommendedPath bislang
// per pathsState.find(...) gegen einen lokalen Trainingspfad-Katalog gematcht wurde -- der
// Katalog wurde aber schon im Mai 2026 bewusst geleert (Commit 45fc100, "Entkopple lokale
// Standard-Trainingspfade von Tutor-UI"), createInitialTrainingPaths() gibt seither immer []
// zurück. Der Treffer konnte also nie gelingen, weder für die Karte noch für den anschließenden
// "Training starten"-Klick (activePath war ebenfalls immer null). Sichtbar wurde das erst jetzt:
// solange der KI-Aufruf am 1200ms-Timeout scheiterte (siehe dashboard-data.service.ts), blieb
// hasAiSummaryPayload ohnehin immer false und die "Coaching wird vorbereitet"-Karte griff. Fix:
// die Empfehlung kommt jetzt direkt aus nextActionDetail (liefert bereits title/reason/description/
// targetSkill) statt aus dem toten lokalen Katalog. Das aktive expected_output_schema_json von
// dashboard_summary (v9) kennt ohnehin nur noch diese eine Empfehlung, kein Array mehr -- die
// vormalige "Weitere Trainings"-Sektion (additionalTrainingIds) war dadurch strukturell bereits
// unerreichbar und wurde mit entfernt.
export function deriveTutorPageViewModel(dashboardData: DashboardData | null | undefined): TutorPageViewModel {
  const nextActionDetail = dashboardData?.aiSummary?.nextActionDetail ?? null;
  const recommendedTraining: RecommendedTraining | null = nextActionDetail
    ? {
        title: nextActionDetail.title,
        reason: nextActionDetail.reason,
        description: nextActionDetail.description,
        targetSkill: nextActionDetail.targetSkill,
      }
    : null;

  const hasAiSummaryPayload = Boolean(nextActionDetail || dashboardData?.aiSummary?.primaryImprovementArea);
  const signals: TutorDataSignals = {
    analysisCount: dashboardData?.analyses.length ?? 0,
  };
  const tutorDataState = deriveTutorDataState(signals);
  const isAiTechnicalUnavailable = tutorDataState === 'ready' && hasAiSummaryPayload && !recommendedTraining;
  const shouldRenderRecommendedCard = Boolean(recommendedTraining);

  return {
    tutorDataState,
    recommendedTraining,
    hasAiSummaryPayload,
    isAiTechnicalUnavailable,
    shouldRenderRecommendedCard,
  };
}

export function TutorPage() {
  const { user } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const intro = (location.state as CoachingIntroState | null)?.coachingIntro;
  const [isIntroDismissed, setIsIntroDismissed] = useState(false);
  const [isTrainingActive, setIsTrainingActive] = useState(false);
  const { data: dashboardData, isLoading: isDashboardLoading } = useDashboardData(user?.id);
  // Bug-Fix (27.08.2026): lief zuvor synchron innerhalb von loadDashboardData mit 1200ms-Timeout
  // -- die KI-Antwort dauert real 4-10s und kam dadurch praktisch nie rechtzeitig an. Läuft jetzt
  // als eigene, spätere Query, während der Rest der Seite längst sichtbar ist.
  const { data: aiSummaryResult, isLoading: isAiSummaryLoading } = useDashboardAiSummary(dashboardData?.aiSummaryInput);
  const effectiveDashboardData = useMemo(() => {
    if (!dashboardData || !aiSummaryResult) return dashboardData;
    return { ...dashboardData, ...aiSummaryResult };
  }, [dashboardData, aiSummaryResult]);
  const { data: entitlement, isLoading: isEntitlementLoading } = useEntitlement(user?.id);

  const viewModel = useMemo(() => deriveTutorPageViewModel(effectiveDashboardData), [effectiveDashboardData]);
  const { recommendedTraining, hasAiSummaryPayload, tutorDataState, isAiTechnicalUnavailable, shouldRenderRecommendedCard } = viewModel;

  // Der strukturierte Coach ist seit der Preisumstellung 21.08.2026 das
  // Pro-exklusive Merkmal (Starter und Pro haben seither dieselbe Sprechzeit).
  // TutorWorkspace wird für Nicht-Pro-Nutzer erst gar nicht gemountet, damit
  // auch keiner der coach_*-Prompt-Aufrufe darin ausgelöst werden kann.
  if (isEntitlementLoading) {
    return <section className="page">Dein Coach wird geladen …</section>;
  }

  if (entitlement?.planKey !== 'pro') {
    return (
      <section className="page">
        <PageHeader title="Dein Coach" subtitle="Ein ruhiger Trainingsraum für kontinuierliche Sprachpraxis." />
        <article className="card tutor-hero-card">
          <p><strong>Der strukturierte Coach ist Teil von Pro</strong></p>
          <h3>Persönliche Trainingspfade, aufbauend auf deinen letzten Sessions.</h3>
          <p>Mit Pro trainierst du gezielt an deinen Schwachstellen statt frei zu sprechen.</p>
          <Link to={paths.billing.pricing} className="button">
            Auf Pro upgraden
          </Link>
        </article>
      </section>
    );
  }

  if (intro && !isIntroDismissed) {
    return (
      <section className="page">
        <PageHeader title="Coaching-Einstieg" subtitle="Deine Analyse ist fertig – wähle deinen nächsten Schritt." />
        <article className="card flow-card">
          <p>
            Thema: <strong>{intro.topic?.trim() || 'Dein aktuelles Fokus-Thema'}</strong>
          </p>
          {intro.highlights ? <p><strong>Highlights:</strong> {intro.highlights}</p> : null}
          {intro.priorityFocus ? <p><strong>Priorität:</strong> {intro.priorityFocus}</p> : null}
          {Array.isArray(intro.mistakeHotspots) && intro.mistakeHotspots.length > 0 ? (
            <p><strong>Fehlerpunkte:</strong> {intro.mistakeHotspots.join(', ')}</p>
          ) : null}

          <div className="button-row button-row--stack-mobile">
            <button type="button" className="button" onClick={() => setIsIntroDismissed(true)}>
              Jetzt trainieren
            </button>
            <Link className="button button-secondary" to={paths.sessions.detail.replace(':sessionId', intro.sessionId)}>
              Vollständige Analyse ansehen
            </Link>
          </div>
          <div className="auth-links">
            <button type="button" className="link-plain" onClick={() => navigate(paths.sessions.list)}>
              Später fortsetzen
            </button>
          </div>
        </article>
      </section>
    );
  }

  if (isTrainingActive) {
    return (
      <section className="page">
        <PageHeader title="Dein Coach" subtitle="Ein ruhiger Trainingsraum für kontinuierliche Sprachpraxis." />
        <div className="button-row" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="button button-secondary" onClick={() => setIsTrainingActive(false)}>
            Zur Übersicht
          </button>
        </div>
        <TutorWorkspace
          selectedTrainingTitle={recommendedTraining?.title}
          selectedTrainingReason={recommendedTraining?.reason}
          sessionIntro={recommendedTraining?.description}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <PageHeader title="Dein Coach" subtitle="Ein ruhiger Trainingsraum für kontinuierliche Sprachpraxis." />

      {/* Bug-Fix (27.08.2026): solange dashboardData noch lädt, war effectiveDashboardData
          undefined -- deriveTutorPageViewModel las daraus analysisCount 0 und damit
          tutorDataState 'empty', bevor die echten Daten überhaupt angekommen waren. Dadurch
          blitzte kurz "Willkommen im Coaching" auf, bevor die echte Empfehlung nachschob. */}
      {isDashboardLoading ? (
        <article className="card tutor-hero-card skeleton-card" aria-busy="true" aria-label="Dein Coach wird geladen">
          <Skeleton width="50%" height="1.1rem" />
          <Skeleton width="80%" height="1.5rem" />
          <Skeleton width="60%" height="1rem" />
        </article>
      ) : (() => {
        switch (tutorDataState) {
          case 'empty':
            return (
              <article className="card tutor-hero-card">
                <p><strong>Willkommen im Coaching</strong></p>
                <h3>Starte deine erste Analyse für personalisierte Empfehlungen.</h3>
                <p>Nach deiner ersten Session zeigt dir der Coach automatisch passende Trainingspfade.</p>
                <Link to={paths.sessions.new} className="button">
                  Erste Session starten
                </Link>
              </article>
            );
          case 'ready':
            return shouldRenderRecommendedCard ? (
              <article className="card tutor-training-list">
                <h3>Für dich empfohlen</h3>
                <div className="tutor-training-item">
                  <h4>{recommendedTraining?.title}</h4>
                  <p>{recommendedTraining?.reason}</p>
                  {recommendedTraining?.description ? <p className="tutor-training-meta">{recommendedTraining.description}</p> : null}
                  <button type="button" className="button" onClick={() => setIsTrainingActive(true)}>
                    Training starten
                  </button>
                </div>
              </article>
            ) : isAiSummaryLoading ? (
              <article className="card tutor-hero-card skeleton-card" aria-busy="true" aria-label="Empfehlung wird geladen">
                <Skeleton width="45%" height="1.1rem" />
                <Skeleton width="70%" height="1.5rem" />
                <Skeleton width="140px" height="2.4rem" />
              </article>
            ) : !hasAiSummaryPayload ? (
              <article className="card tutor-hero-card">
                <p><strong>Coaching wird vorbereitet</strong></p>
                <p>Wir bereiten dein nächstes Training vor.</p>
                <Link to={paths.sessions.list} className="button button-secondary">
                  Letzte Analyse ansehen
                </Link>
              </article>
            ) : null;
          default:
            return null;
        }
      })()}
      {isAiTechnicalUnavailable ? (
        <article className="card tutor-hero-card">
          <p>{AI_TECHNICAL_ERROR_MESSAGE}</p>
          <Link to={paths.sessions.list} className="button button-secondary">
            Letzte Analyse ansehen
          </Link>
        </article>
      ) : null}
    </section>
  );
}
