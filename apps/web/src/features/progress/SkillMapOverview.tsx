import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Ear, Layers, MessageCircle, Sparkles, Users, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { paths } from '@/app/routes/paths';

import { useCurrentUser } from '@/features/auth/useCurrentUser';
import {
  CEFR_BANDS,
  SESSION_ANALYSIS_CATEGORIES,
  extractCategoryScore,
  extractCefrBand,
  extractLimitingFactor,
  type CefrBand,
  type SessionAnalysisCategory,
} from '@/services/supabase/session-analysis.service';
import { normalizeSessionAnalysisRows } from '@/services/supabase/session-analysis-compat';
import { isAiEligibleSession } from '@/services/supabase/session-ai-eligibility';
import { supabaseClient } from '@/services/supabase/client';
import { profileService } from '@/services/supabase/profile.service';
import { learningGoalCatalogService, type LearningGoalContract } from '@/services/supabase/learning-goal-catalog.service';
import { civicsExamQuestionsService, type CivicsTopicCoverage } from '@/services/supabase/civics-exam-questions.service';
import type { ConversationSessionRow, Json, SessionAnalysisRow } from '@/types/database';
import { Badge } from '@/components/ui/Badge';
import { ICON_SIZE_SM } from '@/lib/icon-sizes';

const CATEGORY_LABELS: Record<SessionAnalysisCategory, string> = {
  grammatical_accuracy: 'Grammatik',
  lexical_appropriateness: 'Wortschatz',
  fluency: 'Flüssigkeit',
  intelligibility: 'Verständlichkeit',
  coherence_and_sentence_structure: 'Struktur',
  register_and_naturalness: 'Natürlichkeit',
  interactional_competence: 'Interaktion',
};

const CATEGORY_ICONS: Record<SessionAnalysisCategory, LucideIcon> = {
  grammatical_accuracy: BookOpen,
  lexical_appropriateness: MessageCircle,
  fluency: Waves,
  intelligibility: Ear,
  coherence_and_sentence_structure: Layers,
  register_and_naturalness: Sparkles,
  interactional_competence: Users,
};

// Score 0-5 auf eine color-mix-Intensität für --accent gemappt (20%-90%),
// statt jeden Wert im selben Blauton darzustellen - so ist auf einen Blick
// erkennbar, welche Kompetenz stark und welche noch im Aufbau ist, ohne auf
// Ampelfarben zurückzugreifen (die bei niedrigen Werten in einer Lern-App
// eher entmutigend wirken als motivierend).
export function scoreToAccentMixPercent(score: number): number {
  return Math.round(20 + (score / 5) * 70);
}

// Die 11 CEFR-Sub-Bänder sind die feinste vorhandene Gradierung derselben
// Kompetenz-Dimension wie der 0-5-Score (siehe CEFR-Can-Do-Layer-Audit:
// "cefr_band_estimate muss zum score konsistent sein") -- für die visuelle
// Zielmarkierung auf dem 0-5-Balken werden die Bänder linear auf die 0-5-Skala
// abgebildet. Reine Positionierungs-Approximation, nicht Teil der KI-Bewertung.
export function cefrBandToApproxScore(band: CefrBand): number {
  const index = CEFR_BANDS.indexOf(band);
  return (index / (CEFR_BANDS.length - 1)) * 5;
}

export function isCefrBandAtOrAboveTarget(currentBand: string | null, targetBand: CefrBand): boolean {
  if (!currentBand) return false;
  const currentIndex = (CEFR_BANDS as readonly string[]).indexOf(currentBand);
  const targetIndex = CEFR_BANDS.indexOf(targetBand);
  return currentIndex >= 0 && currentIndex >= targetIndex;
}

export function scoreForCategory(data: Json, category: SessionAnalysisCategory): number | null {
  return extractCategoryScore(data, category);
}

export type SkillMapDataState = 'empty' | 'preliminary' | 'ready';

export type SkillMapEntry = {
  category: SessionAnalysisCategory;
  latest: number | null;
  average: number | null;
  delta: number | null;
  first: number | null;
  pointCount: number;
  cefrBand: string | null;
  limitingFactor: string | null;
};

function isValidScore(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hasLatestScore(entry: SkillMapEntry): boolean {
  return isValidScore(entry.latest);
}

export function hasAverage(entry: SkillMapEntry): boolean {
  return isValidScore(entry.average);
}

export function hasTrend(entry: SkillMapEntry): boolean {
  return entry.pointCount >= 2 && entry.first !== null && entry.latest !== null && entry.delta !== null;
}

export function buildSkillMapMatrix(analyses: SessionAnalysisRow[]): SkillMapEntry[] {
  return SESSION_ANALYSIS_CATEGORIES.map((category) => {
    const points = analyses
      .map((entry) => scoreForCategory(entry.category_scores_json, category))
      .filter((score): score is number => typeof score === 'number');
    const latest = points[0] ?? null;
    const average = points.length > 0 ? Math.round(points.reduce((sum, score) => sum + score, 0) / points.length) : null;
    const first = points[points.length - 1] ?? null;
    const delta = latest !== null && first !== null ? Math.round(latest - first) : null;

    // Launch-Readiness-Audit, Befund K (P0 #1): CEFR-Band/Limiting-Factor der
    // jüngsten Analyse mit einem Score für diese Kategorie (analyses ist nach
    // created_at absteigend sortiert).
    const latestAnalysisWithScore = analyses.find(
      (entry) => scoreForCategory(entry.category_scores_json, category) !== null,
    );
    const cefrBand = latestAnalysisWithScore ? extractCefrBand(latestAnalysisWithScore.category_scores_json, category) : null;
    const limitingFactor = latestAnalysisWithScore
      ? extractLimitingFactor(latestAnalysisWithScore.category_scores_json, category)
      : null;

    return {
      category,
      latest,
      average,
      delta,
      first,
      pointCount: points.length,
      cefrBand,
      limitingFactor,
    };
  });
}


export function deriveSkillMapDataState(analyses: SessionAnalysisRow[], matrix: SkillMapEntry[]): SkillMapDataState {
  const analyzedSessionsWithScores = analyses.filter((analysis) =>
    SESSION_ANALYSIS_CATEGORIES.some((category) => scoreForCategory(analysis.category_scores_json, category) !== null),
  ).length;
  const totalDataPoints = matrix.reduce((sum, entry) => sum + entry.pointCount, 0);

  if (totalDataPoints === 0) return 'empty';

  const hasStablePerSkillPoints = matrix.some((entry) => entry.pointCount >= 2);
  if (analyzedSessionsWithScores < 2 || !hasStablePerSkillPoints) return 'preliminary';

  return 'ready';
}

export function toFivePointMeterWidth(score: number): string {
  return `${(score / 5) * 100}%`;
}

export function SkillMapOverview() {
  const { user } = useCurrentUser();
  const [analyses, setAnalyses] = useState<SessionAnalysisRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

      // Lernpfade Phase G: die Skill Map zeigte bislang nur die CEFR-Ziel-Anzeige für
      // Sprachniveau-Ziele -- bei "Leben in Deutschland" fehlte hier jede Fortschrittsanzeige,
      // obwohl das Dashboard sie schon hatte ("kein Insellösung", Munther).
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

  // "Allgemeines Zertifikat" hat kein festes Ziel-Band (Nutzer wählt sein
  // eigenes Niveau) -- für dieses eine Ziel gibt es bewusst keinen Ziel-Tick,
  // siehe Plan-Dokument Phase D.
  const goalTargetBand: CefrBand | null =
    goal && goal.goalType === 'language_level' && goal.targetCefrBand ? goal.targetCefrBand : null;

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setAnalyses([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      const response = await supabaseClient
        .from('session_analyses')
        .select('*, conversation_sessions!inner(status, metadata)')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(60)
        .returns<Array<SessionAnalysisRow & { conversation_sessions: Pick<ConversationSessionRow, 'status' | 'metadata'> }>>();

      if (response.error) {
        setErrorMessage(response.error.message);
      } else {
        setAnalyses(normalizeSessionAnalysisRows((response.data ?? []).filter((entry) => isAiEligibleSession(entry.conversation_sessions))));
      }

      setIsLoading(false);
    };

    void load();
  }, [user?.id]);

  const matrix = useMemo(() => buildSkillMapMatrix(analyses), [analyses]);
  const dataState = useMemo(() => deriveSkillMapDataState(analyses, matrix), [analyses, matrix]);

  if (isLoading) return <article className="card">Skill Map wird geladen …</article>;
  if (errorMessage) return <article className="card auth-error">{errorMessage}</article>;

  return (
    <div className="progress-grid">
      {dataState === 'preliminary' ? (
        <article className="card">
          <h3>Vorläufige Ersteinschätzung</h3>
          <p>
            Es liegen erste analysierte Sessions vor. Die Skill Map zeigt bereits aktuelle Kompetenzwerte, aber stabile Trends
            entstehen erst nach mehreren Messpunkten.
          </p>
          <p>Trend nach weiteren Sessions sichtbar.</p>
        </article>
      ) : null}

      {goal?.goalKey === 'leben_in_deutschland' && civicsCoverage && civicsCoverage.totalTopics > 0 ? (
        <article className="card">
          <h3>Dein Ziel: {goal.displayName}</h3>
          <p>
            <Badge tone={civicsCoverage.coveredTopics === civicsCoverage.totalTopics ? 'success' : 'info'}>
              {civicsCoverage.coveredTopics} von {civicsCoverage.totalTopics} Themenbereichen sicher erklärt
            </Badge>
          </p>
          <p>Hier zählt nicht dein Sprachniveau, sondern wie viele Themen du schon sicher erklären kannst.</p>
        </article>
      ) : null}

      <article className="card progress-wide">
        {dataState === 'empty' ? (
          <>
            <h3>Noch keine Daten – starte deine erste Session</h3>
            <p>Nach den ersten Sessions siehst du aktuelle Werte, Durchschnitt und Trend je Kompetenzbereich.</p>
            <p>Mit jeder weiteren Session wird deine Skill Map präziser und zeigt belastbarere Trends.</p>
            <div className="button-row" style={{ justifyContent: 'flex-start' }}>
              <Link to={paths.sessions.new} className="button">
                Erste Session starten
              </Link>
            </div>
          </>
        ) : (
          <>
            <h3>Kompetenz-Matrix</h3>
            <p>Datenstatus: {dataState === 'preliminary' ? 'Vorläufig' : 'Bereit'}</p>
            {goalTargetBand ? (
              <p>
                Ziel: {goal?.displayName} · Ziel-Niveau {goalTargetBand} (markiert in jedem Balken)
              </p>
            ) : null}
            <div className="skill-map-grid">
              {matrix.map((entry) => {
                const latestValue = hasLatestScore(entry) ? entry.latest : null;
                const averageValue = hasAverage(entry) ? entry.average : null;
                const latestWidth = latestValue !== null ? toFivePointMeterWidth(latestValue) : null;
                const avgWidth = averageValue !== null ? toFivePointMeterWidth(averageValue) : null;
                const deltaLabel =
                  hasTrend(entry) && entry.delta !== null
                    ? `Delta ${entry.delta > 0 ? `+${entry.delta}` : entry.delta < 0 ? `${entry.delta}` : '0'}`
                    : 'Trend noch nicht verfügbar';
                const CategoryIcon = CATEGORY_ICONS[entry.category];
                const goalWidth = goalTargetBand !== null ? toFivePointMeterWidth(cefrBandToApproxScore(goalTargetBand)) : null;
                const goalReached = goalTargetBand !== null && isCefrBandAtOrAboveTarget(entry.cefrBand, goalTargetBand);
                return (
                  <div key={entry.category} className="card skill-map-item">
                    <div className="skill-map-header">
                      <p>
                        <CategoryIcon aria-hidden="true" size={ICON_SIZE_SM} className="skill-map-item-icon" />
                        {CATEGORY_LABELS[entry.category]}
                      </p>
                      <strong>{latestValue !== null ? `${latestValue}/5` : '—'}</strong>
                    </div>
                    {entry.cefrBand ? (
                      <Badge
                        tone={goalReached ? 'success' : 'info'}
                        title={entry.limitingFactor ? `Nächste Stufe: ${entry.limitingFactor}` : undefined}
                      >
                        CEFR {entry.cefrBand}
                      </Badge>
                    ) : null}
                    {latestWidth !== null && latestValue !== null ? (
                      <div className="progress-meter" aria-label={`${CATEGORY_LABELS[entry.category]} aktueller Wert, Durchschnitt markiert`}>
                        <div
                          className="progress-meter-fill"
                          style={{
                            width: latestWidth,
                            background: `color-mix(in srgb, var(--accent) ${scoreToAccentMixPercent(latestValue)}%, var(--surface-2))`,
                          }}
                        />
                        {avgWidth !== null ? <div className="progress-meter-average-tick" style={{ left: avgWidth }} /> : null}
                        {goalWidth !== null ? (
                          <div
                            className="progress-meter-goal-tick"
                            style={{ left: goalWidth }}
                            title={`Ziel-Niveau ${goalTargetBand}`}
                          />
                        ) : null}
                      </div>
                    ) : null}
                    <p>
                      Durchschnitt {averageValue !== null ? averageValue : '—'} · {deltaLabel}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </article>
    </div>
  );
}
