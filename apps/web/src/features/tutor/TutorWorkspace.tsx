import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Skeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/useCurrentUser';
import { appConfig } from '@/lib/config';
import { withTimeout } from '@/lib/with-timeout';
import type { CoachSessionState, CoachTaskPlanItem, SessionMemory } from '@/services/coach/coach.types';
import { coachRuntimeService } from '@/services/coach/coach-runtime.service';
import { profileService } from '@/services/supabase/profile.service';
import { buildLearningGoalContextText, learningGoalCatalogService } from '@/services/supabase/learning-goal-catalog.service';
import { tutorService, type ActiveTutorFocusTopic, type TutorCyclePhase, type TutorMessage } from '@/services/supabase/tutor.service';
import { checkCoachReadiness } from './coach-readiness';
import {
  AI_TECHNICAL_ERROR_MESSAGE,
  buildDialogueJson,
  createInitialSessionState,
  createSessionState,
  normalizeAiNextTask,
  normalizePhase,
} from './coach-task-plan';
import { normalizeCompletionLine, normalizeFollowupQuestion, normalizeMicroFeedback, normalizeTrainedItems } from './coach-text-normalization';
import { createPathKey, readSessionMemory, writeSessionMemory } from './session-memory';
import { TutorChatHistory } from './TutorChatHistory';
import { TutorCompletionPanel } from './TutorCompletionPanel';
import { TutorErrorBanner } from './TutorErrorBanner';
import { TutorSessionHeader } from './TutorSessionHeader';
import { TutorTaskPanel } from './TutorTaskPanel';

type UnderstandingState = 'not_yet' | 'partial' | 'sufficient' | 'unknown';

type CompletionUiContent = {
  completionTitle?: string;
  completionMessage?: string;
  trainedItems?: string[];
  assessmentLabel?: string;
  coachClosingLine?: string;
  reflectionPrompt?: string;
};

type TutorWorkspaceProps = {
  selectedTrainingTitle?: string;
  selectedTrainingReason?: string;
  sessionIntro?: string;
  sessionCompletionNote?: string;
  sessionPresenceLine?: string;
  onSessionCompleted?: () => void;
};

export function TutorWorkspace({ selectedTrainingTitle, selectedTrainingReason, sessionIntro, sessionCompletionNote, sessionPresenceLine, onSessionCompleted }: TutorWorkspaceProps) {
  const { user, isLoading } = useCurrentUser();
  const [focusTopic, setFocusTopic] = useState<ActiveTutorFocusTopic | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [explanationText, setExplanationText] = useState('');
  const [understandingState, setUnderstandingState] = useState<UnderstandingState>('unknown');
  const [cyclePhase, setCyclePhase] = useState<TutorCyclePhase>('explanation');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [writtenAnswer, setWrittenAnswer] = useState('');
  const [coachSession, setCoachSession] = useState<CoachSessionState>(createInitialSessionState());
  const [microFeedback, setMicroFeedback] = useState<string>('');
  const [audioCoachHint, setAudioCoachHint] = useState<string>('Audioaufnahme bereit.');
  const [audioSuccessNote, setAudioSuccessNote] = useState<string>('');
  const [pathMemory, setPathMemory] = useState<SessionMemory | null>(null);
  const [reflectionText, setReflectionText] = useState('');
  const [reflectionSaved, setReflectionSaved] = useState(false);
  const [aiCompletion, setAiCompletion] = useState<CompletionUiContent | null>(null);
  const [learningGoalContext, setLearningGoalContext] = useState('');

  useEffect(() => {
    if (!user?.id) {
      setLearningGoalContext('');
      return;
    }
    let isMounted = true;
    const loadLearningGoalContext = async () => {
      const [profile, goals] = await Promise.all([
        profileService.getOnboardingProfile(user.id).catch(() => null),
        learningGoalCatalogService.listActiveGoals().catch(() => []),
      ]);
      if (!isMounted) return;
      const selectedGoal = goals.find((goal) => goal.goalKey === profile?.learning_goal_key) ?? null;
      setLearningGoalContext(buildLearningGoalContextText(selectedGoal, profile?.german_level ?? null));
    };
    void loadLearningGoalContext();
    return () => { isMounted = false; };
  }, [user?.id]);

  const dialogueJson = useMemo(() => buildDialogueJson(messages), [messages]);

  const processClarificationQuestion = useCallback(async (questionInput: string, options?: { inputMode?: 'text' | 'voice'; durationSeconds?: number; transcriptConfidence?: number }) => {
    if (!user?.id || !focusTopic || !sessionId) return;
    const question = questionInput.trim();
    if (!question || cyclePhase !== 'clarification' || coachSession.completedTasks >= coachSession.totalTasks) return;
    setIsBusy(true); setErrorMessage(null); setAudioSuccessNote('');
    const userMessage: TutorMessage = { id: crypto.randomUUID(), role: 'user', type: 'user_message', cyclePhase: 'clarification', text: question, createdAt: new Date().toISOString() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    try {
      await tutorService.saveInteraction({ userId: user.id, sessionId, promptText: question, responseText: question, payload: { role: 'user', type: 'user_message', cycle_phase: 'clarification', input_mode: options?.inputMode ?? 'text', duration_seconds: options?.durationSeconds, transcript_confidence: options?.transcriptConfidence } });
      await tutorService.updateSessionCyclePhase({ userId: user.id, sessionId, cyclePhase: 'clarification' });
      let feedbackText = '';
      let aiNextTask: Pick<CoachTaskPlanItem, 'mode' | 'prompt' | 'recommendedInput'> | null = null;
      const nextStepReadinessOk = appConfig.features.enableAiCoachNextStep ? await checkCoachReadiness('nextStep') : false;
      if (appConfig.features.enableAiCoachNextStep && nextStepReadinessOk) {
        try {
          const aiNextStep = await coachRuntimeService.getNextStep({ sessionGoal: selectedTrainingTitle || focusTopic.title, learnerTurn: question, context: { selectedTrainingPath: selectedTrainingTitle || focusTopic.title, currentTask: coachSession.currentPrompt, currentTaskIndex: coachSession.completedTasks + 1, totalTasks: coachSession.totalTasks, userAnswer: question, sessionMemory: pathMemory, recentWins: focusTopic.recentWins, recentChallenges: focusTopic.recentChallenges, sessionHistory: nextMessages.slice(-10).map((message) => ({ role: message.role, type: message.type, text: message.text })) }, learningGoalContext });
          const aiMicroFeedback = normalizeMicroFeedback(aiNextStep.coachMessage);
          const aiFollowup = normalizeFollowupQuestion(aiNextStep.followupQuestion ?? aiNextStep.learnerAction);
          if (aiMicroFeedback) feedbackText = aiFollowup ? `${aiMicroFeedback} ${aiFollowup}` : aiMicroFeedback;
          if (appConfig.features.enableAiCoachDynamicNextStep) {
            const readinessOk = await checkCoachReadiness('dynamicNextStep');
            if (readinessOk) { aiNextTask = normalizeAiNextTask(aiNextStep.nextTask); if (!aiNextTask && aiNextStep.nextTask) console.debug('[CoachRuntime] Discarded AI nextTask suggestion: validation_failed'); }
            else if (aiNextStep.nextTask) console.debug('[CoachRuntime] Discarded AI nextTask suggestion: readiness_gate_failed');
          }
        } catch { throw new Error(AI_TECHNICAL_ERROR_MESSAGE); }
      } else { throw new Error(AI_TECHNICAL_ERROR_MESSAGE); }
      const upcomingPlanTask = coachSession.taskPlan[Math.min(coachSession.totalTasks, coachSession.completedTasks + 1)];
      if (!aiNextTask && !upcomingPlanTask) throw new Error(AI_TECHNICAL_ERROR_MESSAGE);
      setMicroFeedback(feedbackText);
      setCoachSession((current) => { const nextCompletedTasks = Math.min(current.totalTasks, current.completedTasks + 1); const nextTask = current.taskPlan[nextCompletedTasks]; const resolvedTask = aiNextTask ?? nextTask; if (!resolvedTask) return current; return { ...current, level: current.level, currentPrompt: resolvedTask.prompt, completedTasks: nextCompletedTasks, currentMode: resolvedTask.mode, recommendedInput: resolvedTask.recommendedInput ?? 'mixed' }; });
      setPathMemory((current) => { const pathKey = createPathKey(selectedTrainingTitle || focusTopic?.title); const next = current ?? { pathKey, lastModes: [], stablePhrases: [], difficultTransitions: [], transferReadiness: 0, sessionsCompleted: 0, updatedAt: new Date().toISOString() }; const modeChain = [...next.lastModes, coachSession.currentMode].slice(-5); const updated = { ...next, lastModes: modeChain, stablePhrases: next.stablePhrases, difficultTransitions: next.difficultTransitions, lastDailySituation: coachSession.currentMode === 'daily_situation' ? question : next.lastDailySituation, lastFreeResponseStyle: coachSession.currentMode === 'free_response' || coachSession.currentMode === 'continue_dialogue' ? question : next.lastFreeResponseStyle, transferReadiness: next.transferReadiness, updatedAt: new Date().toISOString() }; writeSessionMemory(updated); return updated; });
      const followup = await tutorService.generateFollowupAnswer({ topicTitle: focusTopic.title, topicDescription: focusTopic.description ?? '', explanationText, learnerQuestion: question, dialogueJson: buildDialogueJson(nextMessages) });
      const followupForDisplay = !followup.scope_ok ? await tutorService.generateFollowupAnswer({ topicTitle: focusTopic.title, topicDescription: focusTopic.description ?? '', explanationText, learnerQuestion: `${question}\n\nBitte beantworte nur innerhalb des Fokus-Themas "${focusTopic.title}".`, dialogueJson: buildDialogueJson(nextMessages) }) : followup;
      if (!followupForDisplay.scope_ok) { setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', type: 'followup', text: `Bleiben wir kurz bei "${focusTopic.title}" -- frag mich gern noch mal genauer dazu.`, createdAt: new Date().toISOString(), followupScopeOk: false, followupRedirectedToFocus: followupForDisplay.redirected_to_focus }]); return; }
      const tutorText = tutorService.formatFollowupText(followupForDisplay);
      await tutorService.saveInteraction({ userId: user.id, sessionId, promptText: question, responseText: tutorText, payload: { ...tutorService.toFollowupPayload(followupForDisplay), cycle_phase: 'clarification' } });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', type: 'followup', cyclePhase: 'clarification', text: tutorText, createdAt: new Date().toISOString(), followupAnswer: followupForDisplay.answer, followupNextQuestion: followupForDisplay.next_question, followupScopeOk: followupForDisplay.scope_ok, followupRedirectedToFocus: followupForDisplay.redirected_to_focus }]);
      setCyclePhase('understanding');
      await tutorService.updateSessionCyclePhase({ userId: user.id, sessionId, cyclePhase: 'understanding' });
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Rückfrage konnte nicht verarbeitet werden.'); }
    finally { setIsBusy(false); }
  }, [coachSession, cyclePhase, explanationText, focusTopic, learningGoalContext, messages, pathMemory, selectedTrainingTitle, sessionId, user?.id]);

  const bootstrapTutor = useCallback(async (mountedRef: { current: boolean }) => {
    if (!user?.id) { if (mountedRef.current) { setFocusTopic(null); setSessionId(null); setReflectionText(''); setReflectionSaved(false); setMessages([]); setExplanationText(''); setUnderstandingState('unknown'); setCyclePhase('explanation'); setErrorMessage(null); setCoachSession(createInitialSessionState()); } return; }
    setIsBusy(true); setErrorMessage(null);
    try {
      const topic = await withTimeout(tutorService.getActiveFocusTopic(user.id), 10_000, 'Zeitüberschreitung beim Laden, bitte neu laden.');
      if (!mountedRef.current) return;
      const effectiveTopic: ActiveTutorFocusTopic | null = topic ?? (selectedTrainingTitle ? { id: '', topicKey: '', title: selectedTrainingTitle, description: selectedTrainingReason ?? null, status: 'in_training', tutorGoal: '', metadata: {} } : null);
      setFocusTopic(effectiveTopic);
      const key = createPathKey(selectedTrainingTitle || effectiveTopic?.title);
      const memory = readSessionMemory(key); setPathMemory(memory);
      const onboardingProfile = await profileService.getOnboardingProfile(user.id);
      const learnerLevel = onboardingProfile?.german_level ?? undefined;
      const initialCoachSession = await createSessionState(selectedTrainingTitle || effectiveTopic?.title, memory, learnerLevel, learningGoalContext);
      if (!mountedRef.current) return;
      setCoachSession(initialCoachSession);
      if (!effectiveTopic) { setSessionId(null); setReflectionText(''); setReflectionSaved(false); setMessages([]); setExplanationText(''); setUnderstandingState('unknown'); setCyclePhase('explanation'); setCoachSession(await createSessionState(selectedTrainingTitle, null, learnerLevel, learningGoalContext)); return; }
      const session = await withTimeout(tutorService.getOrCreateTutorSession(user.id, effectiveTopic.title), 10_000, 'Zeitüberschreitung beim Laden, bitte neu laden.');
      if (!mountedRef.current) return;
      setSessionId(session.id);
      const history = await withTimeout(tutorService.listInteractions(user.id, session.id), 10_000, 'Zeitüberschreitung beim Laden, bitte neu laden.');
      if (!mountedRef.current) return;
      if (history.length > 0) { setMessages(history); const lastPhase = [...history].reverse().find((entry) => entry.cyclePhase)?.cyclePhase; setCyclePhase(normalizePhase(lastPhase)); const firstExplanation = history.find((entry) => entry.type === 'explanation' && entry.role === 'assistant'); if (firstExplanation) setExplanationText(firstExplanation.text); return; }
      const explanation = await withTimeout(tutorService.generateExplanation({ topicTitle: effectiveTopic.title, topicDescription: effectiveTopic.description ?? '' }), 10_000, 'Zeitüberschreitung beim Laden, bitte neu laden.');
      if (!mountedRef.current) return;
      const renderedExamples = explanation.examples.map((example) => `falsch: ${example.incorrect}\nkorrekt: ${example.correct}\nwarum: ${example.why}`).join('\n\n');
      const renderedText = `${explanation.explanation}\n\nBeispiele (falsch → besser):\n${renderedExamples}\n\n${explanation.check_question}`;
      await tutorService.saveInteraction({ userId: user.id, sessionId: session.id, promptText: `Erklärung für Fokus-Thema: ${effectiveTopic.title}`, responseText: renderedText, payload: { role: 'assistant', type: 'explanation', cycle_phase: 'explanation', explanation: explanation.explanation, examples: explanation.examples, check_question: explanation.check_question } });
      await tutorService.updateSessionCyclePhase({ userId: user.id, sessionId: session.id, cyclePhase: 'clarification' });
      if (!mountedRef.current) return;
      setExplanationText(renderedText); setCyclePhase('clarification'); setReflectionText(''); setReflectionSaved(false); setMessages([{ id: crypto.randomUUID(), role: 'assistant', type: 'explanation', cyclePhase: 'explanation', text: renderedText, createdAt: new Date().toISOString(), explanationExamples: explanation.examples, explanationCheckQuestion: explanation.check_question }]);
    } catch (error) { if (mountedRef.current) setErrorMessage(error instanceof Error ? error.message : 'Coach konnte nicht initialisiert werden.'); }
    finally { if (mountedRef.current) setIsBusy(false); }
  }, [learningGoalContext, selectedTrainingTitle, selectedTrainingReason, user?.id]);

  useEffect(() => { const mountedRef = { current: true }; void bootstrapTutor(mountedRef); return () => { mountedRef.current = false; }; }, [bootstrapTutor, retryKey]);

  const sessionReason = selectedTrainingReason || focusTopic?.description?.trim() || '';
  const sessionGoal = selectedTrainingTitle || focusTopic?.title || '';
  const reflectionPrompt = 'Optional: Was hat dir heute beim Üben am meisten geholfen?';
  const currentTask = Math.min(coachSession.completedTasks + 1, coachSession.totalTasks);
  const isSessionCompleted = coachSession.completedTasks >= coachSession.totalTasks;
  const taskTransition = useMemo(() => coachSession.taskPlan[Math.min(coachSession.completedTasks, coachSession.totalTasks - 1)]?.transition ?? '', [coachSession]);
  const trainedTodayPoints = useMemo(() => aiCompletion?.trainedItems ?? [], [aiCompletion?.trainedItems]);
  const completionAssessment = useMemo(() => aiCompletion?.assessmentLabel ?? '', [aiCompletion?.assessmentLabel]);
  const hasAiCompletionContent = useMemo(() => Boolean(aiCompletion?.completionTitle || aiCompletion?.completionMessage || trainedTodayPoints.length > 0 || completionAssessment), [aiCompletion?.completionMessage, aiCompletion?.completionTitle, completionAssessment, trainedTodayPoints.length]);
  const completionInputsRef = useRef({ microFeedback, understandingState, sessionCompletionNote, cyclePhase, selectedTrainingTitle, completedTasks: coachSession.completedTasks, totalTasks: coachSession.totalTasks });
  completionInputsRef.current = { microFeedback, understandingState, sessionCompletionNote, cyclePhase, selectedTrainingTitle, completedTasks: coachSession.completedTasks, totalTasks: coachSession.totalTasks };
  const completionRequestedRef = useRef(false);
  useEffect(() => {
    if (!isSessionCompleted || !focusTopic) { completionRequestedRef.current = false; setAiCompletion(null); return; }
    if (completionRequestedRef.current) return;
    completionRequestedRef.current = true;
    if (!appConfig.features.enableAiCoachCompletion) { setAiCompletion(null); return; }
    let cancelled = false;
    void (async () => {
      const ready = await checkCoachReadiness('completion'); if (!ready || cancelled) return;
      const inputs = completionInputsRef.current;
      try {
        const result = await coachRuntimeService.completeSession({ sessionGoal: inputs.selectedTrainingTitle || focusTopic.title, sessionFindings: { microFeedback: inputs.microFeedback, understandingState: inputs.understandingState, sessionCompletionNote: inputs.sessionCompletionNote, completedTasks: inputs.completedTasks, totalTasks: inputs.totalTasks, focusTopicTitle: inputs.selectedTrainingTitle || focusTopic.title }, currentState: inputs.cyclePhase, learningGoalContext });
        if (cancelled) return;
        setAiCompletion({ completionTitle: normalizeCompletionLine(result.summary, 80) ?? undefined, completionMessage: normalizeCompletionLine(result.retainedStrength, 180) ?? undefined, trainedItems: normalizeTrainedItems([result.retainedStrength, result.remainingFocus, result.nextSessionHint]) ?? undefined, assessmentLabel: normalizeCompletionLine(result.completionStatus, 40) ?? undefined });
      } catch (error) { console.error('[CoachRuntime] coach_session_completion execution failed', error); if (!cancelled) setAiCompletion(null); }
    })();
    return () => { cancelled = true; };
  }, [focusTopic, isSessionCompleted, learningGoalContext]);
  useEffect(() => { if (isSessionCompleted) onSessionCompleted?.(); }, [isSessionCompleted, onSessionCompleted]);

  const handleUnderstandingCheckRef = useRef<(() => Promise<void>) | null>(null);
  handleUnderstandingCheckRef.current = handleUnderstandingCheck;
  useEffect(() => { if (cyclePhase === 'understanding') void handleUnderstandingCheckRef.current?.(); }, [cyclePhase]);

  const handleRecordedClarification = useCallback(async ({ blob, durationSeconds }: { blob: Blob; durationSeconds: number }) => {
    if (!user?.id || !sessionId) return;
    try {
      const transcript = await tutorService.createClarificationFromAudio({ userId: user.id, sessionId, audioBlob: blob, durationSeconds, expectedLanguage: 'de' });
      setAudioSuccessNote('Antwort aufgenommen.');
      await processClarificationQuestion(transcript, { inputMode: 'voice', durationSeconds, transcriptConfidence: transcript ? 1 : undefined });
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Rückfrage-Audio konnte nicht verarbeitet werden.'); }
  }, [processClarificationQuestion, sessionId, user?.id]);

  async function handleUnderstandingCheck() {
    if (!user?.id || !focusTopic || !sessionId || !explanationText) return;
    if (cyclePhase !== 'understanding' || isBusy) return;
    setIsBusy(true); setErrorMessage(null); setAudioSuccessNote('');
    try {
      const check = await tutorService.runUnderstandingCheck({ topicTitle: focusTopic.title, topicDescription: focusTopic.description ?? '', explanationText, dialogueJson });
      const nextAction = check.status === 'sufficient' ? 'Nutze das Thema in deiner nächsten Session in einem echten Satz.' : 'Stell mir noch eine gezielte Frage dazu und bring ein kurzes Alltagsbeispiel.';
      const checkText = `${check.feedback}\n\n${nextAction}\n\n${check.next_step}`;
      await tutorService.saveInteraction({ userId: user.id, sessionId, promptText: 'understanding_check_v1', responseText: checkText, payload: { role: 'assistant', type: 'understanding_check', status: check.status, cycle_phase: 'understanding' } });
      await tutorService.updateSessionCyclePhase({ userId: user.id, sessionId, cyclePhase: 'understanding' });
      if (focusTopic.id) await tutorService.persistUnderstandingStatus({ userId: user.id, focusTopicId: focusTopic.id, status: check.status, feedback: check.feedback, nextStep: check.next_step });
      if (check.status === 'sufficient') {
        await tutorService.markDialogueCompleted({ userId: user.id, sessionId, criterion: 'understanding_check.status=sufficient_phase' });
        await tutorService.updateSessionCyclePhase({ userId: user.id, sessionId, cyclePhase: 'transfer_ready' });
        setCyclePhase('transfer_ready');
        setCoachSession((current) => ({ ...current, completedTasks: current.totalTasks }));
      } else {
        await tutorService.updateSessionCyclePhase({ userId: user.id, sessionId, cyclePhase: 'clarification' });
        setCyclePhase('clarification');
      }
      setUnderstandingState(check.status);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', type: 'understanding_check', cyclePhase: check.status === 'sufficient' ? 'transfer_ready' : 'understanding', text: checkText, createdAt: new Date().toISOString() }]);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Verständnis-Check konnte nicht ausgeführt werden.'); }
    finally { setIsBusy(false); }
  }

  const handleSaveReflection = useCallback(async () => {
    let aiFocusSignal: string | undefined; const aiMemoryUpdates: string[] = [];
    if (appConfig.features.enableAiCoachReflection) {
      const readinessOk = await checkCoachReadiness('reflection');
      if (readinessOk) {
        try {
          const aiReflection = await coachRuntimeService.interpretReflection({ learnerReflection: reflectionText.trim(), learningContext: coachSession.currentPrompt, recentSignals: pathMemory?.difficultTransitions ?? [], learningGoalContext });
          aiFocusSignal = aiReflection.suggestedFocus;
          if (aiReflection.interpretedNeed) aiMemoryUpdates.push(`Interpretation (${aiReflection.reflectionState}): ${aiReflection.interpretedNeed}`);
          if (aiReflection.suggestedFocus) aiMemoryUpdates.push(`Nächster Fokus: ${aiReflection.suggestedFocus}`);
        } catch (error) { console.error('[CoachRuntime] Reflection interpretation failed', error); }
      }
    }
    setPathMemory((current) => { if (!current) return current; const updated = { ...current, lastReflection: reflectionText.trim(), lastReflectionFocus: aiFocusSignal, difficultTransitions: aiMemoryUpdates.length ? Array.from(new Set([...current.difficultTransitions, ...aiMemoryUpdates])).slice(-8) : current.difficultTransitions, updatedAt: new Date().toISOString() }; writeSessionMemory(updated); return updated; });
    setReflectionSaved(true);
  }, [coachSession.currentPrompt, learningGoalContext, pathMemory?.difficultTransitions, reflectionText]);

  if (isLoading || isBusy) return <article className="card skeleton-card" aria-busy="true" aria-label="Coaching wird vorbereitet"><Skeleton width="30%" height="1.1rem" /><Skeleton width="65%" height="1.5rem" /><Skeleton width="90%" height="0.9rem" /><Skeleton width="100%" height="0.9rem" /><Skeleton width="45%" height="2.4rem" /></article>;
  if (!focusTopic) return <article className="card"><h3>Coach</h3><p>Du hast noch kein Trainingsthema. Nach ein paar weiteren Sessions schlägt dir dein Coach automatisch eins vor.</p></article>;
  return <article className="card tutor-card"><TutorSessionHeader title={selectedTrainingTitle || focusTopic.title} sessionReason={sessionReason} sessionPresenceLine={sessionPresenceLine} currentTask={currentTask} totalTasks={coachSession.totalTasks} sessionGoal={sessionGoal} sessionIntro={sessionIntro} relapseNotice={focusTopic.status === 'rueckfall_erkannt' ? focusTopic.tutorGoal : undefined} />{!isSessionCompleted ? <TutorTaskPanel taskTransition={taskTransition} microFeedback={microFeedback} currentPrompt={coachSession.currentPrompt} audioCoachHint={audioCoachHint} audioSuccessNote={audioSuccessNote} writtenAnswer={writtenAnswer} onWrittenAnswerChange={setWrittenAnswer} isBusy={isBusy} cyclePhase={cyclePhase} onAudioStateChange={(state) => { if (state === 'recording') setAudioCoachHint('Aufnahme läuft.'); if (state === 'idle' || state === 'ready_to_upload') setAudioCoachHint('Audioaufnahme bereit.'); }} onAudioRecorded={handleRecordedClarification} onSubmitWrittenAnswer={async () => { setAudioSuccessNote('Antwort aufgenommen.'); await processClarificationQuestion(writtenAnswer, { inputMode: 'text' }); setWrittenAnswer(''); }} /> : <TutorCompletionPanel hasAiCompletionContent={hasAiCompletionContent} completionTitle={aiCompletion?.completionTitle} completionMessage={aiCompletion?.completionMessage} trainedTodayPoints={trainedTodayPoints} completionAssessment={completionAssessment} aiTechnicalErrorMessage={AI_TECHNICAL_ERROR_MESSAGE} reflectionPrompt={reflectionPrompt} reflectionText={reflectionText} onReflectionTextChange={setReflectionText} reflectionSaved={reflectionSaved} onSaveReflection={() => { void handleSaveReflection(); }} onSkipReflection={() => setReflectionSaved(true)} onRetryTraining={() => setRetryKey((current) => current + 1)} />}<TutorErrorBanner errorMessage={errorMessage} onRetry={() => setRetryKey((current) => current + 1)} /><TutorChatHistory messages={messages} /></article>;
}
