import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/ui/PageHeader';
import { paths } from '@/app/routes/paths';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { mapDialogueStatusToProductStatus } from '@/lib/src/lib/productLanguage';
import { PRIMARY_FOCUS_STATUSES } from '@/services/domain/focus-topic-state';
import {
  extractCategoryScore,
  SESSION_ANALYSIS_CATEGORIES,
  sessionAnalysisService,
} from '@/services/supabase/session-analysis.service';
import { sessionService } from '@/services/supabase/session.service';
import { sessionPromptLogService } from '@/services/supabase/session-prompt-log.service';
import { sessionTranscriptService } from '@/services/supabase/session-transcript.service';
import { civicsExamQuestionsService, type CivicsPracticeAttemptResult } from '@/services/supabase/civics-exam-questions.service';
import { supabaseClient } from '@/services/supabase/client';
import type { ImprovementCheckRow, Json, TutorInteractionRow } from '@/types/database';
import type { ConversationSession } from '@/types/domain';

const COMPLETED_SESSION_STATUSES: ReadonlySet<string> = new Set(['completed', 'completed_capped']);

function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const SESSION_CATEGORY_LABELS: Record<string, string> = {
  grammatical_accuracy: 'Grammatik (richtig sprechen)',
  lexical_appropriateness: 'Wortschatz (passende Wörter)',
  fluency: 'Sprechfluss (flüssig sprechen)',
  intelligibility: 'Aussprache (gut verständlich)',
  coherence_and_sentence_structure: 'Satzbau (klare Sätze)',
  register_and_naturalness: 'Natürliche Sprache (passender Ton)',
  interactional_competence: 'Gespräch führen (gut reagieren)',
};

function labelForCategory(category: string): string {
  return SESSION_CATEGORY_LABELS[category] ?? category.replaceAll('_', ' ');
}

type DetectedPatternViewModel = {
  patternKey: string;
  label: string;
  frequencyEstimate: string;
  communicativeImpact: string;
  reason: string;
};

type TimelineEvent = {
  id: string;
  timestamp: string;
  title: string;
  detail?: string;
  status: 'done' | 'info' | 'error';
};

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseDetectedPatterns(value: Json): DetectedPatternViewModel[] {
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return [];
          }
        })()
      : value;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }

    const pattern = item as Record<string, unknown>;
    if (!hasNonEmptyString(pattern.pattern_key) || !hasNonEmptyString(pattern.label) || !hasNonEmptyString(pattern.reason)) {
      return [];
    }

    return [
      {
        patternKey: pattern.pattern_key,
        label: pattern.label,
        frequencyEstimate: hasNonEmptyString(pattern.frequency_estimate) ? pattern.frequency_estimate : 'unknown',
        communicativeImpact: hasNonEmptyString(pattern.communicative_impact) ? pattern.communicative_impact : 'unknown',
        reason: pattern.reason,
      },
    ];
  });
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('de-DE');
}


function formatLanguageLabel(code: string | null | undefined): string {
  if (!code || !code.trim()) return '—';
  const normalized = code.trim().toLowerCase();

  if (normalized === 'de' || normalized.startsWith('de-')) return 'Deutsch';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'Englisch';

  return normalized;
}

function formatSessionSource(source: ConversationSession['source']): string {
  switch (source) {
    case 'web-microphone':
      return 'Daily Recording';
    case 'tutor':
      return 'Coach';
    default:
      return source;
  }
}

export function SessionDetailPage() {
  const { sessionId } = useParams();
  const { user } = useCurrentUser();
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof sessionAnalysisService.getBySessionId>>>(null);
  const [transcript, setTranscript] = useState<Awaited<ReturnType<typeof sessionTranscriptService.getBySessionId>>>(null);
  const [civicsAttempt, setCivicsAttempt] = useState<CivicsPracticeAttemptResult | null>(null);
  const [improvementCheck, setImprovementCheck] = useState<ImprovementCheckRow | null>(null);
  const [improvementContextHint, setImprovementContextHint] = useState<'direct' | 'fallback' | 'none'>('none');
  const [tutorInteractions, setTutorInteractions] = useState<TutorInteractionRow[]>([]);
  const [promptExecutionLogs, setPromptExecutionLogs] = useState<Awaited<ReturnType<typeof sessionPromptLogService.getBySessionId>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcriptErrorMessage, setTranscriptErrorMessage] = useState<string | null>(null);
  const [isMutatingSession, setIsMutatingSession] = useState(false);
  const [activeTab, setActiveTab] = useState<'metadata' | 'transcript' | 'analysis' | 'timeline'>('metadata');

  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId || !user?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      setTranscriptErrorMessage(null);
      setTranscript(null);
      setCivicsAttempt(null);

      try {
        const [data, analysisData, promptExecutionLogsData, improvementRes, tutorRes] = await Promise.all([
          sessionService.getConversationSessionById(user.id, sessionId),
          sessionAnalysisService.getBySessionId({ sessionId, userId: user.id }),
          sessionPromptLogService.getBySessionId({ sessionId, userId: user.id }),
          supabaseClient
            .from('improvement_checks')
            .select('*')
            .eq('user_id', user.id)
            .eq('session_id', sessionId)
            .eq('check_type', 'focus_topic_improvement_v1')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle<ImprovementCheckRow>(),
          supabaseClient
            .from('tutor_interactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false })
            .limit(5)
            .returns<TutorInteractionRow[]>(),
        ]);

        if (improvementRes.error) throw new Error(improvementRes.error.message);
        if (tutorRes.error) throw new Error(tutorRes.error.message);

        setSession(data);
        setAnalysis(analysisData);
        setPromptExecutionLogs(promptExecutionLogsData);
        if (improvementRes.data) {
          setImprovementCheck(improvementRes.data);
          setImprovementContextHint('direct');
        } else {
          const { data: activeFocusTopic, error: activeFocusTopicError } = await supabaseClient
            .from('focus_topics')
            .select('id')
            .eq('user_id', user.id)
            .in('status', PRIMARY_FOCUS_STATUSES)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle<{ id: string }>();

          if (activeFocusTopicError) throw new Error(activeFocusTopicError.message);

          if (!activeFocusTopic?.id) {
            setImprovementCheck(null);
            setImprovementContextHint('none');
          } else {
            const { data: fallbackImprovement, error: fallbackImprovementError } = await supabaseClient
              .from('improvement_checks')
              .select('*')
              .eq('user_id', user.id)
              .eq('focus_topic_id', activeFocusTopic.id)
              .eq('check_type', 'focus_topic_improvement_v1')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle<ImprovementCheckRow>();

            if (fallbackImprovementError) throw new Error(fallbackImprovementError.message);

            setImprovementCheck(fallbackImprovement ?? null);
            setImprovementContextHint(fallbackImprovement ? 'fallback' : 'none');
          }
        }
        setTutorInteractions(tutorRes.data ?? []);

        try {
          const transcriptData = await sessionTranscriptService.getBySessionId({ sessionId, userId: user.id });
          setTranscript(transcriptData);
        } catch (transcriptError) {
          setTranscriptErrorMessage(
            transcriptError instanceof Error ? transcriptError.message : 'Transkript konnte nicht geladen werden.',
          );
        }

        try {
          const civicsAttemptData = await civicsExamQuestionsService.getLatestAttemptForSession(sessionId, user.id);
          setCivicsAttempt(civicsAttemptData);
        } catch {
          // Lernpfade Phase E2b: reines Zusatzergebnis für das Ziel "Leben in Deutschland" --
          // fehlt es (z. B. kein Versuch zu dieser Session), bleibt die restliche Detailseite
          // unverändert nutzbar.
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Session konnte nicht geladen werden.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadSession();
  }, [sessionId, user?.id]);

  const improvementLabel = useMemo(() => {
    if (!improvementCheck) return null;
    const label = asRecord(improvementCheck.result_payload).label;
    return typeof label === 'string' ? label : null;
  }, [improvementCheck]);

  const detectedPatterns = useMemo(() => {
    if (!analysis) return [];
    return parseDetectedPatterns(analysis.detectedPatterns);
  }, [analysis]);

  const canResolveStuckRecording = Boolean(session && session.status === 'recording' && !session.audioFilePath);

  const markSessionAsDraft = async () => {
    if (!user?.id || !session?.id) return;

    setIsMutatingSession(true);
    setErrorMessage(null);
    try {
      const updated = await sessionService.updateConversationSessionStatus({
        sessionId: session.id,
        userId: user.id,
        status: 'draft',
        processing: {
          transcriptStatus: 'pending',
          analysisStatus: 'pending',
        },
      });
      setSession(updated);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Session konnte nicht zurückgesetzt werden.');
    } finally {
      setIsMutatingSession(false);
    }
  };

  const deleteSession = async (confirmationText: string) => {
    if (!user?.id || !session?.id) return;
    const confirmed = window.confirm(confirmationText);
    if (!confirmed) return;

    setIsMutatingSession(true);
    setErrorMessage(null);
    try {
      await sessionService.deleteConversationSession(user.id, session.id);
      setSession(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Session konnte nicht gelöscht werden.');
    } finally {
      setIsMutatingSession(false);
    }
  };

  const deleteStuckSession = async () => {
    await deleteSession('Diese nicht hochgeladene Session wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.');
  };

  const deleteSessionFromDetail = async () => {
    await deleteSession('Diese Session wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.');
  };

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    if (!session) return [];

    const events: TimelineEvent[] = [
      {
        id: `session-start-${session.id}`,
        timestamp: session.startedAt ?? session.createdAt,
        title: 'Session gestartet',
        detail: session.topic ? `Thema: ${session.topic}` : undefined,
        status: 'done',
      },
    ];

    if (session.endedAt) {
      events.push({
        id: `session-ended-${session.id}`,
        timestamp: session.endedAt,
        title: 'Aufnahme beendet / Upload gespeichert',
        detail: `${session.durationSeconds ?? 0}s`,
        status: 'done',
      });
    }

    for (const log of promptExecutionLogs) {
      events.push({
        id: `prompt-${log.id}`,
        timestamp: log.createdAt,
        title: `Prompt ${log.promptKey} gelaufen`,
        detail: log.status === 'failed' ? log.errorMessage ?? 'Fehlgeschlagen' : 'Erfolgreich',
        status: log.status === 'failed' ? 'error' : 'done',
      });
    }

    if (transcript?.status === 'completed') {
      events.push({
        id: `transcript-ready-${transcript.id}`,
        timestamp: transcript.updatedAt,
        title: 'Transkript fertig',
        status: 'done',
      });
    } else if (transcript?.status === 'failed') {
      events.push({
        id: `transcript-failed-${transcript.id}`,
        timestamp: transcript.updatedAt,
        title: 'Transkript fehlgeschlagen',
        detail: transcript.lastError ?? undefined,
        status: 'error',
      });
    }

    if (analysis?.status === 'completed') {
      events.push({
        id: `analysis-ready-${analysis.id}`,
        timestamp: analysis.updatedAt,
        title: 'Analyse fertig',
        status: 'done',
      });
    } else if (analysis?.status === 'failed') {
      events.push({
        id: `analysis-failed-${analysis.id}`,
        timestamp: analysis.updatedAt,
        title: 'Analyse fehlgeschlagen',
        detail: analysis.lastError ?? undefined,
        status: 'error',
      });
    }

    if (COMPLETED_SESSION_STATUSES.has(session.status)) {
      events.push({
        id: `session-completed-${session.id}`,
        timestamp: analysis?.updatedAt ?? transcript?.updatedAt ?? session.endedAt ?? session.createdAt,
        title: 'Session abgeschlossen',
        status: 'done',
      });
    }

    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [analysis, promptExecutionLogs, session, transcript]);

  const canResumeSession =
    session?.status === 'draft' && !session.endedAt && (session.durationSeconds ?? 0) === 0 && session.source === 'web-microphone';

  const quickStats = session
    ? [
        { label: 'Status', value: mapDialogueStatusToProductStatus(session.status).label },
        { label: 'Dauer', value: `${session.durationSeconds ?? 0}s` },
        { label: 'Sprache', value: formatLanguageLabel(session.language ?? transcript?.languageCode ?? null) },
      ]
    : [];

  return (
    <section className="page">
      <PageHeader
        title="Sessiondetails"
        subtitle={
          session
            ? `Detailansicht für ${formatSessionSource(session.source)} · ${session.title}`
            : `Detailansicht für Session ${sessionId ?? 'unbekannt'}.`
        }
        actions={
          <Link to={paths.sessions.list} className="button button-secondary">
            Zur History
          </Link>
        }
      />

      {isLoading ? <article className="card">Session wird vorbereitet…</article> : null}
      {errorMessage ? <article className="card auth-error">{errorMessage}</article> : null}

      {!isLoading && !errorMessage && !session ? <article className="card">Diese Session ist nicht verfügbar.</article> : null}

      {session ? (
        <div className="session-detail-layout">
          <article className="card session-detail-hero">
            <h3>Sessiondetails</h3>
            <div className="session-detail-stats">
              {quickStats.map((stat) => (
                <div key={stat.label} className="session-detail-stat-pill">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              ))}
            </div>
            <p>
              <strong>Thema:</strong> {session.topic ?? '—'}
            </p>
            {analysis?.sessionSummary ? <p>{analysis.sessionSummary}</p> : null}
          </article>

          {civicsAttempt ? (
            <article className="card">
              <h3>Leben in Deutschland – Übungsergebnis</h3>
              <p>
                <strong>Frage {civicsAttempt.question.externalNumber}:</strong> {civicsAttempt.question.questionText}
              </p>
              <p className={civicsAttempt.isFactuallyCorrect ? undefined : 'auth-error'}>
                <strong>Fachlich:</strong> {civicsAttempt.isFactuallyCorrect ? 'Richtig erklärt' : 'Noch nicht ganz richtig'} —{' '}
                {civicsAttempt.factualFeedback}
              </p>
              <p>
                <strong>Sprachniveau dieser Erklärung:</strong> {civicsAttempt.languageCefrBand} (
                {civicsAttempt.languageQualityScore}/5)
              </p>
              <p>{civicsAttempt.languageJustification}</p>
            </article>
          ) : null}

          <div className="session-detail-main">
            <nav className="session-detail-tabs" aria-label="Sessiondetails Sections">
              <button type="button" className={activeTab === 'metadata' ? 'is-active' : ''} onClick={() => setActiveTab('metadata')}>
                Metadaten & Coach
              </button>
              <button type="button" className={activeTab === 'transcript' ? 'is-active' : ''} onClick={() => setActiveTab('transcript')}>
                Transkript
              </button>
              <button type="button" className={activeTab === 'analysis' ? 'is-active' : ''} onClick={() => setActiveTab('analysis')}>
                Analyse
              </button>
              <button type="button" className={activeTab === 'timeline' ? 'is-active' : ''} onClick={() => setActiveTab('timeline')}>
                Timeline & Prompts
              </button>
            </nav>
            {activeTab === 'metadata' ? (
              <>
                <article className="card">
            <h3>Session-Metadaten</h3>
            <p>
              <strong>Status:</strong> {mapDialogueStatusToProductStatus(session.status).label}
            </p>
            <p>
              <strong>Dauer:</strong> {session.durationSeconds ?? 0}s
            </p>
            <p>
              <strong>Thema:</strong> {session.topic ?? '—'}
            </p>
            <p>
              <strong>Sprache:</strong> {formatLanguageLabel(session.language ?? transcript?.languageCode ?? null)}
            </p>
            {session.audioQuality?.backgroundNoiseLevel ? (
              <p>
                <strong>Hintergrundrauschen:</strong> {session.audioQuality.backgroundNoiseLevel}
              </p>
            ) : null}
            <p>
              <strong>Gestartet:</strong> {session.startedAt ? formatDate(session.startedAt) : '—'}
            </p>
            <p>
              <strong>Beendet:</strong> {session.endedAt ? formatDate(session.endedAt) : '—'}
            </p>
            {session.processingLastError ? (
              <p className="auth-error">
                <strong>Fehlergrund:</strong> {session.processingLastError}
              </p>
            ) : null}

            {canResolveStuckRecording ? (
              <div className="button-row" style={{ marginTop: 12 }}>
                <button type="button" className="button" onClick={markSessionAsDraft} disabled={isMutatingSession}>
                  {isMutatingSession ? 'Speichere ...' : 'Als Entwurf speichern'}
                </button>
                <button type="button" className="button button-danger" onClick={deleteStuckSession} disabled={isMutatingSession}>
                  {isMutatingSession ? 'Lösche ...' : 'Nicht hochgeladene Session löschen'}
                </button>
              </div>
            ) : null}

            {canResumeSession ? (
              <div className="button-row" style={{ marginTop: 12 }}>
                <button type="button" className="button button-danger" onClick={deleteSessionFromDetail} disabled={isMutatingSession}>
                  {isMutatingSession ? 'Lösche ...' : 'Session löschen'}
                </button>
              </div>
            ) : null}
                </article>
                <article className="card">
                  <h3>Coaching-Status</h3>
                  {session.source === 'tutor' ? (
                    <>
                      <p>Diese Session ist ein Coaching.</p>
                      <p>
                        Interaktionen: <strong>{tutorInteractions.length}</strong>
                      </p>
                    </>
                  ) : (
                    <p>Freie Session – nutze den Coach danach für gezielte Rückfragen zum Fokus-Thema.</p>
                  )}
                </article>
              </>
            ) : null}

            {activeTab === 'transcript' ? (
              <article className="card">
            <h3>Transkript</h3>
            {transcriptErrorMessage ? <p className="auth-error">{transcriptErrorMessage}</p> : null}
            {transcript ? (
              <>
                <p>
                  <strong>Status:</strong> {transcript.status === 'completed' ? 'abgeschlossen' : transcript.status}
                </p>
                <p>
                  <strong>Letzte Aktualisierung:</strong> {formatDate(transcript.updatedAt)}
                </p>
                <div style={{ marginTop: 12 }}>
                  <h4>Bereinigtes Transkript</h4>
                  {transcript.cleanedTranscript ? (
                    <p style={{ whiteSpace: 'pre-wrap' }}>{transcript.cleanedTranscript}</p>
                  ) : (
                    <p>Transkript wird noch erstellt</p>
                  )}
                </div>
              </>
            ) : (
              <p>Transkript wird noch erstellt</p>
            )}
              </article>
            ) : null}

            {activeTab === 'timeline' ? (
              <>
                <article className="card">
                  <h3>Timeline</h3>
            {timelineEvents.length > 0 ? (
              <ol style={{ display: 'grid', gap: 10, paddingLeft: 20 }}>
                {timelineEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.title}</strong> · {formatDate(event.timestamp)}
                    {event.detail ? (
                      <p className={event.status === 'error' ? 'auth-error' : undefined} style={{ marginTop: 4 }}>
                        {event.detail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p>Keine Timeline-Ereignisse vorhanden.</p>
            )}
                </article>
              </>
            ) : null}

            <article className="card">
            <h3>Trainingswirkung (über mehrere Sessions)</h3>
            {improvementCheck ? (
              <>
                <p>
                  Letzte Bewertung: <strong>{improvementLabel ?? 'zu wenig Daten'}</strong>
                </p>
                <p>Erstellt am {formatDate(improvementCheck.created_at)}.</p>
                {improvementContextHint === 'fallback' ? (
                  <p style={{ opacity: 0.8 }}>Hinweis: Diese Einschätzung stammt aus einer späteren Auswertung.</p>
                ) : null}
              </>
            ) : (
              <p>Noch nicht genug Daten für belastbare Trainingswirkung.</p>
            )}
          </article>

            {activeTab === 'analysis' ? (
            <article className="card">
            <h3>Analyse</h3>
            <p>Status: {analysis?.status ?? session.analysisStatus}</p>
            <p>
              Session Score:{' '}
              <strong>{typeof analysis?.scoreOverall === 'number' ? `${analysis.scoreOverall}/5` : 'noch nicht verfügbar'}</strong>
            </p>
            <p>
              Gesamt-Confidence:{' '}
              <strong>{typeof analysis?.overallConfidence === 'number' ? analysis.overallConfidence.toFixed(2) : '—'}</strong>
            </p>
            {analysis?.sessionSummary ? <p>{analysis.sessionSummary}</p> : <p>Analyse wird gerade vorbereitet.</p>}

            {analysis?.categoryScores && typeof analysis.categoryScores === 'object' && !Array.isArray(analysis.categoryScores) ? (
              <div className="skill-grid" style={{ marginTop: 16 }}>
                {SESSION_ANALYSIS_CATEGORIES.map((category) => {
                  const score = extractCategoryScore(analysis.categoryScores, category);
                  return (
                    <div key={category} className="skill-card">
                      <p>{labelForCategory(category)}</p>
                      <strong>{score ?? '—'}/5</strong>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {analysis?.priorityIntervention &&
            typeof analysis.priorityIntervention === 'object' &&
            !Array.isArray(analysis.priorityIntervention) ? (
              <div style={{ marginTop: 16 }}>
                <h4>Nächster sinnvoller Schritt</h4>
                <p>
                  <strong>Pattern Key:</strong> {(analysis.priorityIntervention as { pattern_key?: string }).pattern_key ?? '—'}
                </p>
                <p>
                  <strong>Label:</strong> {(analysis.priorityIntervention as { label?: string }).label ?? '—'}
                </p>
              </div>
            ) : null}

            <div style={{ marginTop: 16 }}>
              <h4>Erkannte Muster</h4>
              {detectedPatterns.length > 0 ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {detectedPatterns.map((pattern, index) => (
                    <div key={`${pattern.patternKey}-${index}`} className="skill-card">
                      <p>
                        <strong>Muster:</strong> {pattern.label}
                      </p>
                      <p>
                        <strong>Pattern Key:</strong> {pattern.patternKey}
                      </p>
                      <p>
                        <strong>Häufigkeit:</strong> {pattern.frequencyEstimate}
                      </p>
                      <p>
                        <strong>Kommunikativer Impact:</strong> {pattern.communicativeImpact}
                      </p>
                      <p>
                        <strong>Begründung:</strong> {pattern.reason}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Keine Muster erkannt oder Belege sind noch nicht verfügbar.</p>
              )}
            </div>
          </article>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
