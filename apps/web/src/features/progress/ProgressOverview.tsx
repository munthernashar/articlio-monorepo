import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { getFocusStatusDisplay } from '@/features/focus-topic/status-display';
import { withTimeout } from '@/lib/with-timeout';
import { PRIMARY_FOCUS_STATUSES } from '@/services/domain/focus-topic-state';
import {
  FOCUS_MASTERY_LEVEL_MAX,
  FOCUS_MASTERY_LEVEL_MIN,
  getFocusTopicPolicy,
} from '@/services/domain/focus-topic-policy';
import {
  SESSION_ANALYSIS_CATEGORIES,
  type SessionAnalysisCategory,
} from '@/services/supabase/session-analysis.service';
import { normalizeSessionAnalysisRows } from '@/services/supabase/session-analysis-compat';
import { supabaseClient } from '@/services/supabase/client';
import type { FocusTopicRow, ImprovementCheckRow, Json, SessionAnalysisRow } from '@/types/database';
import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';
import { mapImprovementTimeline } from './progressMetrics';

const CATEGORY_LABELS: Record<SessionAnalysisCategory, string> = {
  grammatical_accuracy: 'Grammatik',
  lexical_appropriateness: 'Wortschatz',
  fluency: 'Flüssigkeit',
  intelligibility: 'Verständlichkeit',
  coherence_and_sentence_structure: 'Struktur',
  register_and_naturalness: 'Natürlichkeit',
  interactional_competence: 'Interaktion',
};

function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export function ProgressOverview() {
  const { user } = useCurrentUser();
  const [analyses, setAnalyses] = useState<SessionAnalysisRow[]>([]);
  const [improvements, setImprovements] = useState<ImprovementCheckRow[]>([]);
  const [focusTopic, setFocusTopic] = useState<FocusTopicRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAnalyses = useCallback(async (isMounted: () => boolean = () => true) => {
    const runIfMounted = (callback: () => void) => {
      if (!isMounted()) return;
      callback();
    };

    runIfMounted(() => {
      setIsLoading(true);
      setErrorMessage(null);
    });

    try {
      if (!user?.id) {
        runIfMounted(() => {
          setAnalyses([]);
          setImprovements([]);
          setFocusTopic(null);
        });
        return;
      }

      const [analysisRes, focusTopicRes, improvementRes] = await withTimeout(
        Promise.all([
          supabaseClient
            .from('session_analyses')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: true })
            .limit(40)
            .returns<SessionAnalysisRow[]>(),
          supabaseClient
            .from('focus_topics')
            .select('*')
            .eq('user_id', user.id)
            .in('status', PRIMARY_FOCUS_STATUSES)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle<FocusTopicRow>(),
          supabaseClient
            .from('improvement_checks')
            .select('*')
            .eq('user_id', user.id)
            .eq('check_type', 'focus_topic_improvement_v1')
            .order('created_at', { ascending: true })
            .limit(20)
            .returns<ImprovementCheckRow[]>(),
        ]),
        10_000,
        'Zeitüberschreitung beim Laden, bitte neu laden.',
      );

      if (analysisRes.error || focusTopicRes.error || improvementRes.error) {
        const message = analysisRes.error?.message ?? focusTopicRes.error?.message ?? improvementRes.error?.message ?? 'Laden fehlgeschlagen.';
        runIfMounted(() => setErrorMessage(message));
      } else {
        runIfMounted(() => {
          setAnalyses(normalizeSessionAnalysisRows(analysisRes.data ?? []));
          setImprovements(improvementRes.data ?? []);
          setFocusTopic(focusTopicRes.data ?? null);
        });
      }
    } catch (error) {
      runIfMounted(() =>
        setErrorMessage(error instanceof Error ? error.message : 'Zeitüberschreitung beim Laden, bitte neu laden.'),
      );
    } finally {
      runIfMounted(() => setIsLoading(false));
    }
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    void loadAnalyses(() => mounted);

    return () => {
      mounted = false;
    };
  }, [loadAnalyses]);

  const overallTrend = useMemo(() => {
    if (analyses.length < 2) return null;
    const first = analyses[0]?.score_overall;
    const latest = analyses[analyses.length - 1]?.score_overall;
    if (typeof first !== 'number' || typeof latest !== 'number') return null;
    return Math.round(latest - first);
  }, [analyses]);

  const improvementTimeline = useMemo(() => mapImprovementTimeline(improvements), [improvements]);

  const focusPolicy = useMemo(
    () => getFocusTopicPolicy({ status: focusTopic?.status, masteryLevel: focusTopic?.mastery_level }),
    [focusTopic?.mastery_level, focusTopic?.status],
  );

  if (isLoading) {
    return <article className="card">Progress wird geladen …</article>;
  }

  if (errorMessage) {
    return (
      <article className="card auth-error">
        <p>{errorMessage}</p>
        <button className="button button-secondary" type="button" onClick={() => void loadAnalyses()}>
          Erneut versuchen
        </button>
      </article>
    );
  }

  return (
    <div className="progress-grid">
      <article className="card">
        <h3>Verlauf & Fortschritt</h3>
        {overallTrend !== null ? (
          <p className="dashboard-big">
            Session-Score-Trend: {overallTrend > 0 ? `+${overallTrend}` : overallTrend} Punkte
          </p>
        ) : (
          <p>Für einen Trend brauchen wir mindestens zwei fertig analysierte Sessions.</p>
        )}
      </article>

      <article className="card">
        <h3>Dein Fortschritt</h3>
        <p className="dashboard-big">
          Stufe {focusPolicy?.masteryLevel ?? FOCUS_MASTERY_LEVEL_MIN} von {FOCUS_MASTERY_LEVEL_MAX}
        </p>
        <p>{focusTopic ? focusTopic.title : 'Erscheint, sobald du ein Trainingsthema hast.'}</p>
        {focusTopic ? <p>Status: {getFocusStatusDisplay(focusTopic.status).short}</p> : null}
        {focusTopic ? <p>Einordnung: {getFocusStatusDisplay(focusTopic.status).long}</p> : null}
      </article>

      <article className="card">
        <h3>Nächster Fokus-Schritt</h3>
        {focusPolicy ? (
          <>
            <p>{focusPolicy.progress.narrative}</p>
            <p>{focusPolicy.progress.cta}</p>
          </>
        ) : (
          <p>Sobald wir ein Trainingsthema für dich gefunden haben, zeigen wir hier deinen nächsten Schritt.</p>
        )}
      </article>

      <article className="card progress-wide">
        <h3>Vorher/Nachher (letzter Stand)</h3>
        {improvementTimeline.length ? (
          <div className="timeline-list">
            {(() => {
              const latestEntry = improvementTimeline[improvementTimeline.length - 1];
              if (!latestEntry) return <p>Noch keine Vorher/Nachher-Checks vorhanden.</p>;
              return (
                <div key={latestEntry.id} className="timeline-item">
                  <p>
                    <strong>{formatDate(latestEntry.createdAt)}</strong>
                  </p>
                  {latestEntry.insufficient ? (
                    <p>Nicht genug Daten für einen belastbaren Vorher/Nachher-Vergleich.</p>
                  ) : (
                    <p>
                      Vorher {latestEntry.baseline ?? '—'}/5 · Durchschnitt {latestEntry.average ?? '—'}/5 · Delta{' '}
                      {latestEntry.delta === null ? '—' : latestEntry.delta > 0 ? `+${latestEntry.delta}` : latestEntry.delta}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <p>Noch keine Vorher/Nachher-Checks vorhanden.</p>
        )}
        <p>
          Den vollständigen Verlauf findest du im <Link to={paths.sessions.list}>Sessionverlauf</Link>.
        </p>
      </article>

      <article className="card progress-wide">
        <h3>Mehr Details</h3>
        <p>Deinen vollständigen Verlauf, Kategorien und Trends findest du in deinem Dashboard.</p>
      </article>
    </div>
  );
}
