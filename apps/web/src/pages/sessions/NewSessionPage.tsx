import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { paths } from '@/app/routes/paths';
import type { ConversationSession } from '@/types/domain';
import { supabaseClient } from '@/services/supabase/client';
import { sessionService } from '@/services/supabase/session.service';
import { sessionStorageService } from '@/services/supabase/session-storage.service';
import { invokeProcessSession } from '@/services/pipeline/process-session.client';
import { sessionAnalysisService } from '@/services/supabase/session-analysis.service';
import { userEntitlementsService } from '@/services/supabase/user-entitlements.service';
import { useEntitlement } from '@/services/supabase/useEntitlement';
import { SESSION_PROCESSING_LIMITS } from '@/lib/config';
import { USAGE_GUARD_ERROR_CODES, getUsageGuardMessage } from '@/services/limits/usage-guards';
import { SessionHistoryAccordion } from '@/pages/sessions/new-session/SessionHistoryAccordion';
import { SessionTopicPicker } from '@/pages/sessions/new-session/SessionTopicPicker';
import { CivicsQuestionPicker } from '@/pages/sessions/new-session/CivicsQuestionPicker';
import { SessionRecordingPanel } from '@/pages/sessions/new-session/SessionRecordingPanel';
import { SessionReviewPanel } from '@/pages/sessions/new-session/SessionReviewPanel';
import { TOPIC_TEMPLATES, pickRandomTopic } from '@/pages/sessions/new-session/topic-templates';
import { useSessionRecordingFlow, type RecorderUiState } from '@/pages/sessions/new-session/useSessionRecordingFlow';
import { useDailyPromptSuggestion } from '@/pages/sessions/new-session/useDailyPromptSuggestion';
import { useCivicsPracticeQuestion } from '@/pages/sessions/new-session/useCivicsPracticeQuestion';

const LEGACY_PATTERN_LABEL_RE = /^legacy_pattern(?:_\d+)?$/i;

function isUserFacingPatternLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !LEGACY_PATTERN_LABEL_RE.test(value.trim());
}

export function NewSessionPage() {
  const { user } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<ConversationSession | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [suggestedTopic, setSuggestedTopic] = useState('');
  const [selectedTemplateTopic, setSelectedTemplateTopic] = useState('');
  const [recentTopics, setRecentTopics] = useState<string[]>([]);
  const [isStubTranscriptionDetected, setIsStubTranscriptionDetected] = useState(false);
  const [recorderState, setRecorderState] = useState<RecorderUiState>('idle');
  const [showNotifyOption, setShowNotifyOption] = useState(false);
  const [notifyRequested, setNotifyRequested] = useState(false);
  const [hasAutoNavigatedToCoaching, setHasAutoNavigatedToCoaching] = useState(false);
  const navigate = useNavigate();

  const uiState = useSessionRecordingFlow({ session, recorderState, isProcessingRecording });

  // Launch-Readiness-Audit, Befund C: Pro verspricht bis zu 60 Minuten, der
  // Recorder war aber fest auf SESSION_PROCESSING_LIMITS.hardMaxAudioSeconds
  // (15 Minuten) gedeckelt. Bis das Entitlement geladen ist, gilt der
  // Starter-Fallback aus SESSION_PROCESSING_LIMITS.
  const { data: entitlement, isLoading: isEntitlementLoading } = useEntitlement(user?.id);
  // Live-gemeldet 21.08.2026: process-session lehnt die Verarbeitung ohne echte
  // user_entitlements-Zeile mit 402 ab (kein Abo, auch nicht im Trial), aber die
  // UI ließ bis hierher die komplette Aufnahme + den Upload zu, bevor der Fehler
  // erst danach auftauchte. `source: 'app_settings_fallback'` markiert genau
  // diesen Fall (siehe user-entitlements.service.ts) - damit vorab blockieren,
  // statt den Nutzer erst nach der Aufnahme scheitern zu lassen.
  const hasActiveEntitlement = entitlement ? entitlement.source === 'entitlement' : null;

  const effectiveHardMaxAudioSeconds = Math.min(
    entitlement?.maxSessionLengthSeconds ?? SESSION_PROCESSING_LIMITS.hardMaxAudioSeconds,
    SESSION_PROCESSING_LIMITS.absoluteMaxAudioSeconds,
  );
  const effectiveSoftMaxAudioSeconds = Math.max(
    SESSION_PROCESSING_LIMITS.minAudioSeconds,
    Math.round(effectiveHardMaxAudioSeconds * 0.8),
  );

  const stepItems = [
    { key: 'topic', label: '1. Thema wählen', done: Boolean(topic.trim()) },
    { key: 'start', label: '2. Thema bestätigen', done: Boolean(session) },
    { key: 'record', label: '3. Aufnahme starten', done: Boolean(session && session.status !== 'draft') },
    { key: 'review', label: '4. Speichern & analysieren', done: uiState === 'saved' },
  ] as const;

  const canCreate = Boolean(user?.id) && !isCreating;
  const resumeSessionId = searchParams.get('resumeSessionId');

  const { suggestion: dailyPromptSuggestion, overrideWithStaticTopic } = useDailyPromptSuggestion(
    user?.id,
    suggestedTopic || TOPIC_TEMPLATES[0],
    recentTopics,
  );

  // Lernpfade Phase E2b: für das Ziel "Leben in Deutschland" ersetzt eine echte Frage aus dem
  // BAMF-Katalog den generischen KI-Themenvorschlag -- siehe useCivicsPracticeQuestion.
  const { isCivicsGoal, question: civicsQuestion, isLoading: isCivicsQuestionLoading } = useCivicsPracticeQuestion(user?.id);
  // Lernpfade Phase F: Hybrid-Auswahl pro Session -- civics-Ziel bedeutet nicht mehr
  // zwingend jede Session eine Prüfungsfrage, der Nutzer entscheidet bei jedem
  // Sessionstart neu. null = noch nicht entschieden (Auswahl wird angezeigt).
  const [sessionModeChoice, setSessionModeChoice] = useState<'civics' | 'generic' | null>(null);

  useEffect(() => {
    if (!user?.id || !resumeSessionId || session) return;

    let cancelled = false;
    const loadExistingSession = async () => {
      try {
        const existingSession = await sessionService.getConversationSessionById(user.id, resumeSessionId);
        if (cancelled) return;
        if (!existingSession) {
          setErrorMessage('Die gewünschte Session wurde nicht gefunden.');
          return;
        }
        setSession(existingSession);
        if (existingSession.topic) {
          setTopic(existingSession.topic);
          setSelectedTemplateTopic(existingSession.topic);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Session konnte nicht geladen werden.');
        }
      }
    };

    void loadExistingSession();
    return () => {
      cancelled = true;
    };
  }, [resumeSessionId, session, user?.id]);

  useEffect(() => {
    if (!user?.id || resumeSessionId) return;

    let cancelled = false;
    const loadTopicContext = async () => {
      try {
        const sessions = await sessionService.listConversationSessions(user.id, { limit: 20 });
        if (cancelled) return;

        const topics = sessions
          .map((item) => item.topic?.trim() ?? '')
          .filter((item) => item.length > 0)
          .slice(0, 3);

        const recentTopicsNormalized = new Set(topics.map((item) => item.toLocaleLowerCase('de-DE')));
        const nextSuggestion = TOPIC_TEMPLATES.find((template) => !recentTopicsNormalized.has(template.toLocaleLowerCase('de-DE')));
        const initialTopic = nextSuggestion ?? pickRandomTopic(topics);

        setRecentTopics(topics);
        setSuggestedTopic(initialTopic);
        setTopic(initialTopic);
        setSelectedTemplateTopic(initialTopic);
      } catch {
        if (!cancelled) {
          const fallback = pickRandomTopic();
          setSuggestedTopic(fallback);
          setTopic(fallback);
          setSelectedTemplateTopic(fallback);
        }
      }
    };

    void loadTopicContext();

    return () => {
      cancelled = true;
    };
  }, [resumeSessionId, user?.id]);

  const startSession = useCallback(async (topicOverride?: string) => {
    if (!user?.id) {
      setErrorMessage('Du musst eingeloggt sein, um eine Session zu starten.');
      return;
    }

    setErrorMessage(null);
    setIsCreating(true);
    try {
      const created = await sessionService.createConversationSession(user.id, {
        title: `Daily Recording ${new Date().toLocaleDateString('de-DE')}`,
        source: 'web-microphone',
        topic: (topicOverride ?? topic).trim() || undefined,
        // Persistiert, welche BAMF-Frage diese Session behandelt, damit
        // civics_explanation_check serverseitig (process-session/_shared/civics-followup.ts)
        // nachschlagen kann, ohne auf React-State angewiesen zu sein.
        civicsQuestionId: sessionModeChoice === 'civics' && civicsQuestion ? civicsQuestion.id : undefined,
      });
      setSession(created);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Session konnte nicht gestartet werden.');
    } finally {
      setIsCreating(false);
    }
  }, [topic, user?.id, sessionModeChoice, civicsQuestion]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || session) return;
      const target = event.target as HTMLElement | null;
      if (target && ['TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      event.preventDefault();
      if (canCreate && topic.trim()) {
        void startSession(topic);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canCreate, session, startSession, topic]);

  const onRecordingStarted = async () => {
    if (!user?.id || !session?.id) return;
    const updated = await sessionService.updateConversationSessionStatus({
      sessionId: session.id,
      userId: user.id,
      status: 'recording',
      processing: {
        transcriptStatus: 'pending',
        analysisStatus: 'pending',
      },
    });
    setSession(updated);
  };

  // Bug-Fix (28.08.2026): Mustererkennung + Fokus-Themen-Auswahl + Improvement-Check liefen
  // bislang genau hier, clientseitig als Fire-and-Forget NACH dem Warten auf die komplette
  // process-session-Verarbeitung (10-60+ Sekunden) -- verpufften dadurch lautlos, sobald der
  // Tab wegnavigierte oder in den Hintergrund geriet. Verifiziert per SQL: 0 Zeilen in
  // focus_topics/detected_patterns/improvement_checks über die gesamte Produktions-DB, trotz
  // Nutzern mit ausreichend qualifizierten Analysen. Beide laufen jetzt serverseitig direkt in
  // process-session/index.ts (siehe _shared/focus-topic-followups.ts), unabhängig vom
  // Client-Tab -- hier nicht mehr aufrufen, sonst liefen sie doppelt (doppelte KI-Kosten,
  // doppelte Schreibversuche). Nachtrag (28.08.2026): civics_explanation_check ist jetzt
  // ebenfalls dort verdrahtet (siehe _shared/civics-followup.ts) -- die dafür nötige
  // Verknüpfung "welche civics_exam_questions-Zeile gehört zu dieser Session" wird seither in
  // startSession() nach conversation_sessions.metadata.civicsQuestionId geschrieben, statt nur
  // in diesem React-State zu leben.

  const onRecorded = async ({ blob, durationSeconds }: { blob: Blob; durationSeconds: number }) => {
    if (!user?.id || !session?.id) {
      throw new Error('Session-Kontext fehlt. Bitte Session starten.');
    }

    setIsProcessingRecording(true);
    setErrorMessage(null);
    setIsStubTranscriptionDetected(false);

    try {
      if (blob.size > SESSION_PROCESSING_LIMITS.maxFileSizeBytes) {
        throw new Error('Audio-Datei ist zu groß. Bitte kürzer aufnehmen oder Qualität reduzieren.');
      }
      if (durationSeconds < SESSION_PROCESSING_LIMITS.minAudioSeconds) {
        throw new Error('Aufnahme zu kurz. Bitte etwas länger sprechen.');
      }
      if (durationSeconds > SESSION_PROCESSING_LIMITS.absoluteMaxAudioSeconds) {
        throw new Error('Aufnahme zu lang. Bitte in mehrere kürzere Aufnahmen aufteilen.');
      }
      // Frisch geladen statt des mount-time maxSessionLengthSeconds-States: falls sich das
      // Entitlement zwischenzeitlich geändert hat (z. B. Downgrade während der Aufnahme),
      // gilt für die Freigabe der tatsächliche, aktuelle Stand.
      const entitlement = await userEntitlementsService.getEffectiveForUser(user.id);
      if (durationSeconds > entitlement.maxSessionLengthSeconds) {
        throw new Error(
          getUsageGuardMessage({
            code: USAGE_GUARD_ERROR_CODES.SESSION_LENGTH_LIMIT_EXCEEDED,
            limitValue: entitlement.maxSessionLengthSeconds,
          }),
        );
      }

      const upload = await sessionStorageService.uploadSessionAudio(session.id, user.id, blob);

      const updated = await sessionService.updateConversationSessionAfterUpload({
        sessionId: session.id,
        userId: user.id,
        objectPath: upload.filePath,
        durationSeconds,
        status: 'uploaded',
      });

      setSession(updated);

      void invokeProcessSession(session.id)
        .then((result) => {
          if (!result.ok) {
            if (result.statusCode === 409) {
              setErrorMessage('Session kann aktuell nicht verarbeitet werden. Bitte versuche es in Kürze erneut.');
              return;
            }
            if (result.statusCode === 422) {
              setErrorMessage('Audio-Datei fehlt oder ist noch nicht verfügbar. Bitte kurz warten und erneut versuchen.');
              return;
            }
            if (result.statusCode === 402) {
              setErrorMessage('Für die Verarbeitung wird ein aktives Abo (oder eine laufende Testphase) benötigt. Bitte wähle einen Plan.');
              return;
            }
            const processErrorMessage =
              typeof result.error === 'string'
                ? result.error
                : result.error?.message ?? 'Die Verarbeitung der Aufnahme ist fehlgeschlagen.';
            setErrorMessage(processErrorMessage);
            return;
          }
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'Die Verarbeitung der Aufnahme ist fehlgeschlagen.';
          setErrorMessage(message);
          console.error('[NewSessionPage] processSession failed', {
            sessionId: session.id,
            userId: user.id,
            error,
          });
        });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Aufnahme konnte nicht gespeichert werden.');
      throw error;
    } finally {
      setIsProcessingRecording(false);
    }
  };

  useEffect(() => {
    if (!user?.id || !session?.id) return;

    let stopped = false;
    const refreshSession = async () => {
      try {
        const latestSession = await sessionService.getConversationSessionById(user.id, session.id);
        if (stopped || !latestSession) return;
        setSession(latestSession);
      } catch (error) {
        console.warn('[NewSessionPage] refreshSession failed', {
          sessionId: session.id,
          userId: user.id,
          error,
        });
      }
    };

    const channel = supabaseClient
      .channel(`conversation_sessions:${session.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_sessions', filter: `id=eq.${session.id}` },
        () => {
          void refreshSession();
        },
      )
      .subscribe();

    // Sicherheitsnetz: falls der Realtime-Kanal getrennt wird (Tab im
    // Hintergrund, Netzwerkwechsel) oder ein Update ausnahmsweise nicht
    // ankommt, verhindert ein deutlich selteneres Poll-Intervall, dass der
    // Verarbeitungsstatus dauerhaft hängen bleibt.
    const fallbackIntervalId = window.setInterval(() => {
      void refreshSession();
    }, 20_000);

    return () => {
      stopped = true;
      window.clearInterval(fallbackIntervalId);
      void supabaseClient.removeChannel(channel);
    };
  }, [session?.id, user?.id]);

  useEffect(() => {
    if (!session?.id || uiState !== 'saved') return;
    const timer = window.setTimeout(() => setShowNotifyOption(true), 18_000);
    return () => window.clearTimeout(timer);
  }, [session?.id, uiState]);

  useEffect(() => {
    if (!user?.id || !session?.id || uiState !== 'saved' || hasAutoNavigatedToCoaching) return;

    let cancelled = false;
    const openCoachingIntroWhenReady = async () => {
      const analysis = await sessionAnalysisService.getBySessionId({ sessionId: session.id, userId: user.id });
      if (cancelled || !analysis || analysis.status !== 'completed') return;

      const detectedPatterns = Array.isArray(analysis.detectedPatterns)
        ? analysis.detectedPatterns
            .map((entry) => (entry && typeof entry === 'object' ? (entry as { label?: unknown }).label : null))
            .filter((value): value is string => isUserFacingPatternLabel(value))
            .slice(0, 3)
        : [];

      const priority =
        analysis.priorityIntervention && typeof analysis.priorityIntervention === 'object' && !Array.isArray(analysis.priorityIntervention)
          ? (analysis.priorityIntervention as { label?: unknown }).label
          : null;

      setHasAutoNavigatedToCoaching(true);

      // Live-gemeldet 21.08.2026: seit der Preisumstellung ist der Coach
      // Pro-exklusiv (TutorPage.tsx zeigt Nicht-Pro-Nutzern dort sofort eine
      // Upgrade-Karte, noch bevor die Analyse überhaupt sichtbar wird) -- ein
      // unbedingter Redirect zum "Coaching-Einstieg" führte Starter-Nutzer
      // also direkt in eine Sackgasse, statt sie ihr eigenes Ergebnis sehen
      // zu lassen. Starter landet stattdessen auf der Session-Detailseite,
      // wo die Analyse ohnehin angezeigt wird.
      if (entitlement?.planKey === 'pro') {
        navigate(paths.tutor, {
          replace: true,
          state: {
            coachingIntro: {
              sessionId: session.id,
              topic: session.topic,
              highlights: analysis.sessionSummary,
              mistakeHotspots: detectedPatterns,
              priorityFocus: isUserFacingPatternLabel(priority) ? priority : null,
            },
          },
        });
        return;
      }

      navigate(paths.sessions.detail.replace(':sessionId', session.id), { replace: true });
    };

    void openCoachingIntroWhenReady();

    return () => {
      cancelled = true;
    };
  }, [entitlement?.planKey, hasAutoNavigatedToCoaching, navigate, session?.id, session?.topic, uiState, user?.id]);

  const currentStepIndex = useMemo(() => {
    if (uiState === 'idle') return 0;
    if (uiState === 'ready') return 1;
    if (uiState === 'recording' || uiState === 'paused') return 2;
    return 3;
  }, [uiState]);

  const showRecordingFlow = uiState !== 'review' && uiState !== 'saved';

  const civicsTopicLabel = civicsQuestion ? `Leben in Deutschland – Frage ${civicsQuestion.externalNumber}` : '';
  const civicsOpeningQuestion = civicsQuestion
    ? `${civicsQuestion.questionText}\nA) ${civicsQuestion.optionA}  B) ${civicsQuestion.optionB}  C) ${civicsQuestion.optionC}  D) ${civicsQuestion.optionD}`
    : '';
  const civicsFollowUpQuestions = civicsQuestion ? ['Sag auch kurz, warum das die richtige Antwort ist.'] : [];

  const genericTopicPicker = (
    <SessionTopicPicker
      suggestion={dailyPromptSuggestion}
      selectedTemplateTopic={selectedTemplateTopic}
      isCreating={isCreating}
      canCreate={canCreate}
      onConfirmSuggested={() => {
        const value = dailyPromptSuggestion.title || TOPIC_TEMPLATES[0];
        setTopic(value);
        setSelectedTemplateTopic(value);
        void startSession(value);
      }}
      onPickDifferentTopic={() => {
        const randomTopic = pickRandomTopic([dailyPromptSuggestion.title, ...recentTopics]);
        setSuggestedTopic(randomTopic);
        overrideWithStaticTopic(randomTopic);
        setTopic(randomTopic);
        setSelectedTemplateTopic(randomTopic);
      }}
      onSelectTemplate={(value) => {
        overrideWithStaticTopic(value);
        setSelectedTemplateTopic(value);
        setTopic(value);
      }}
    />
  );

  // Ein bereits erstellter/fortgesetzter Aufnahme (resumeSessionId) darf nicht
  // durch diese Sperre unterbrochen werden - falls das Entitlement zwischenzeitlich
  // fehlt, lehnt process-session die Verarbeitung ohnehin mit der bestehenden
  // deutschen 402-Meldung ab (siehe onRecorded weiter oben). Blockiert wird nur
  // der Start einer neuen Aufnahme.
  if (isEntitlementLoading) {
    return <section className="page">Deine Sessionübersicht wird geladen …</section>;
  }

  if (hasActiveEntitlement === false && !session) {
    return (
      <section className="page">
        <PageHeader title="Session starten" subtitle="Nimm deine tägliche Sprachübung auf und speichere sie direkt." />
        <article className="card flow-card">
          <p><strong>Für Sessions wird ein aktives Abo benötigt</strong></p>
          <p>Du hast aktuell kein aktives Abo (oder eine laufende Testphase). Bitte wähle einen Plan, um deine erste Session aufzunehmen.</p>
          <Link to={paths.billing.pricing} className="button">
            Plan wählen
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="page">
      <PageHeader title="Session starten" subtitle="Nimm deine tägliche Sprachübung auf und speichere sie direkt." />

      <article className="card flow-card session-workflow-card session-workflow-card--glass">
        <div className="session-workflow-layout">
          <aside className="session-workflow-sidebar" aria-label="Sessionschritte">
            <p className="session-workflow-sidebar-title">Schneller Ablauf</p>
            <ul className="session-step-list">
              {stepItems.map((step, index) => (
                <li key={step.key}>
                  <button
                    type="button"
                    className={`session-step-item ${step.done ? 'is-done' : ''} ${currentStepIndex === index ? 'is-active' : ''}`}
                    disabled
                  >
                    <span aria-hidden="true" className="session-step-dot" />
                    <span>{step.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="session-workflow-main">
            {showRecordingFlow ? (
              <>
                <h3>{session ? 'Session läuft' : 'Session erstellen'}</h3>
                {!session ? (
                  isCivicsGoal && isCivicsQuestionLoading ? (
                    <p>Deine nächste Frage wird geladen …</p>
                  ) : isCivicsGoal && civicsQuestion && sessionModeChoice === null ? (
                    <div className="session-opener-bubble" role="status" aria-live="polite">
                      <p className="session-opener-question">Was möchtest du heute üben?</p>
                      <p className="session-opener-rationale">
                        Eine Prüfungsfrage zu "Leben in Deutschland" oder lieber frei sprechen?
                      </p>
                      <div className="button-row session-creation-actions button-row--stack-mobile">
                        <button type="button" className="button button-secondary" onClick={() => setSessionModeChoice('civics')}>
                          Prüfungsfrage üben
                        </button>
                        <button type="button" className="button button-secondary" onClick={() => setSessionModeChoice('generic')}>
                          Frei sprechen
                        </button>
                      </div>
                    </div>
                  ) : isCivicsGoal && civicsQuestion && sessionModeChoice === 'civics' ? (
                    <CivicsQuestionPicker
                      question={civicsQuestion}
                      isCreating={isCreating}
                      canCreate={canCreate}
                      onStart={() => {
                        setTopic(civicsTopicLabel);
                        setSelectedTemplateTopic(civicsTopicLabel);
                        void startSession(civicsTopicLabel);
                      }}
                    />
                  ) : (
                    genericTopicPicker
                  )
                ) : null}

                {/* Bug-Fix (27.08.2026): startSession() wirft z.B. bei erreichtem
                    Tageslimit einen Fehler, den errorMessage bereits auffängt --
                    gerendert wurde er aber nur innerhalb von SessionRecordingPanel,
                    das erst nach erfolgreicher Sessionerstellung erscheint. Schlägt
                    createConversationSession fehl, blieb die Meldung dadurch
                    unsichtbar und der Klick auf "Ja, das passt" wirkte wirkungslos. */}
                {!session && errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

                <SessionHistoryAccordion recentTopics={recentTopics} />

                {session ? (
                  <SessionRecordingPanel
                    session={session}
                    uiState={uiState}
                    errorMessage={errorMessage}
                    isProcessingRecording={isProcessingRecording}
                    isStubTranscriptionDetected={isStubTranscriptionDetected}
                    onRecordingStarted={onRecordingStarted}
                    onRecorded={onRecorded}
                    onRecorderStateChange={setRecorderState}
                    softMaxAudioSeconds={effectiveSoftMaxAudioSeconds}
                    hardMaxAudioSeconds={effectiveHardMaxAudioSeconds}
                    openingQuestion={
                      isCivicsGoal && civicsQuestion && sessionModeChoice === 'civics' ? civicsOpeningQuestion : dailyPromptSuggestion.promptText
                    }
                    followUpQuestions={
                      isCivicsGoal && civicsQuestion && sessionModeChoice === 'civics'
                        ? civicsFollowUpQuestions
                        : dailyPromptSuggestion.followUpQuestions
                    }
                  />
                ) : null}
              </>
            ) : null}

            {session && !showRecordingFlow ? (
              <SessionReviewPanel
                session={session}
                hasAutoNavigatedToCoaching={hasAutoNavigatedToCoaching}
                showNotifyOption={showNotifyOption}
                notifyRequested={notifyRequested}
                onNotifyRequested={() => setNotifyRequested(true)}
              />
            ) : null}

            {resumeSessionId && session ? <p>Fortsetzung geladen: Du kannst direkt weiter aufnehmen und hochladen.</p> : null}
          </div>
        </div>
      </article>
    </section>
  );
}
