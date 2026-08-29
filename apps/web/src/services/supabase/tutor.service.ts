import { aiOrchestratorService } from '@/services/ai/ai-orchestrator.service';
import { getFocusTopicPolicy, isTutorReleasedForFocus } from '@/services/domain/focus-topic-policy';
import { applyFocusEvent, withNormalizedStatusHistory } from '@/services/domain/focus-topic-transitions';
import { TUTOR_ELIGIBLE_FOCUS_STATUSES } from '@/services/domain/focus-topic-state';
import { appSettingsService } from '@/services/supabase/app-settings.service';
import { sessionService } from '@/services/supabase/session.service';
import { sessionStorageService } from '@/services/supabase/session-storage.service';
import { supabaseClient } from '@/services/supabase/client';
import type { ConversationSessionRow, ConversationSessionStatus, FocusTopicRow, Json, TutorInteractionRow } from '@/types/database';

const TUTOR_ACTIVE_SESSION_STATUSES: ConversationSessionStatus[] = ['draft', 'training_in_progress'];

export type ActiveTutorFocusTopic = {
  id: string;
  topicKey: string;
  title: string;
  description: string | null;
  status: FocusTopicRow['status'];
  tutorGoal: string;
  metadata: Json;
  recentWins?: string[];
  recentChallenges?: string[];
};

export type TutorMessage = {
  id: string;
  role: 'assistant' | 'user';
  type: 'explanation' | 'followup' | 'understanding_check' | 'user_message';
  cyclePhase?: TutorCyclePhase;
  text: string;
  createdAt: string;
  explanationExamples?: TutorExplanationOutput['examples'];
  explanationCheckQuestion?: string;
  followupAnswer?: string;
  followupNextQuestion?: string;
  followupScopeOk?: boolean;
  followupRedirectedToFocus?: boolean;
  inputMode?: 'text' | 'voice';
  durationSeconds?: number;
  transcriptConfidence?: number;
};

export type TutorCyclePhase = 'explanation' | 'clarification' | 'understanding' | 'transfer_ready';

type TutorExplanationOutput = {
  explanation: string;
  examples: Array<{
    incorrect: string;
    correct: string;
    why: string;
  }>;
  check_question: string;
  redirected_to_focus: boolean;
};

type TutorFollowupOutput = {
  answer: string;
  scope_ok: boolean;
  redirected_to_focus: boolean;
  next_question: string;
};

// Launch-Readiness-Audit, Befund K (P1 #5, docs/daf-cefr-prompt-audit-2026-05-06.md):
// "verpflichtender Transfer-Check" -- "sufficient" erst nach nachgewiesenem
// Re-Use unter leicht variierter Bedingung, nicht nur nach einer Checkfrage.
type TransferEvidence = {
  reuse_demonstrated: boolean;
  context_variation: string;
};

type UnderstandingCheckOutput = {
  status: 'not_yet' | 'partial' | 'sufficient';
  feedback: string;
  next_step: 'clarification' | 'transfer_ready';
  redirected_to_focus: boolean;
  transfer_evidence: TransferEvidence;
};

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function countSentences(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return normalized
    .split(/[.!?]+/g)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function hasMetaTheoryBlock(text: string): boolean {
  const normalized = text.toLowerCase();
  return ['theorie', 'grammatikregel', 'definition', 'regel:', 'merke:'].some((marker) => normalized.includes(marker));
}

function toShortContrastiveExplanation(examples: Array<{ incorrect: string; correct: string; why: string }>): string {
  return examples
    .slice(0, 2)
    .map((example) => `Nicht: ${example.incorrect}. Besser: ${example.correct}, weil ${example.why}`)
    .join(' ');
}

function parseExplanationOutput(input: unknown): TutorExplanationOutput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('tutor_explanation muss ein Objekt liefern.');
  }

  const payload = input as Record<string, unknown>;
  if (!Array.isArray(payload.examples)) {
    throw new Error('tutor_explanation.examples fehlt oder ist ungültig.');
  }
  if (typeof payload.redirected_to_focus !== 'boolean') {
    throw new Error('tutor_explanation.redirected_to_focus muss boolean sein.');
  }

  const examples = payload.examples
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const example = entry as Record<string, unknown>;
      const incorrect = safeString(example.incorrect);
      const correct = safeString(example.correct);
      const why = safeString(example.why);

      if (!incorrect || !correct || !why) {
        return null;
      }

      return { incorrect, correct, why };
    })
    .filter((entry): entry is { incorrect: string; correct: string; why: string } => Boolean(entry))
    .slice(0, 3);
  if (examples.length < 2) {
    throw new Error('tutor_explanation.examples muss mindestens 2 gültige kontrastive Beispiele enthalten.');
  }

  const rawExplanation = safeString(payload.explanation, 'Ich erkläre das Fokus-Thema nun in klaren, kurzen Schritten.');
  const violatesExplanationFormat = countSentences(rawExplanation) > 3 || hasMetaTheoryBlock(rawExplanation);
  const explanation = violatesExplanationFormat ? toShortContrastiveExplanation(examples) : rawExplanation;

  return {
    explanation,
    examples,
    check_question: safeString(payload.check_question, 'Was ist aus deiner Sicht der zentrale Punkt für dieses Fokus-Thema?'),
    redirected_to_focus: payload.redirected_to_focus,
  };
}

function parseFollowupOutput(input: unknown): TutorFollowupOutput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('tutor_followup_answer muss ein Objekt liefern.');
  }

  const payload = (input ?? {}) as Record<string, unknown>;
  if (typeof payload.scope_ok !== 'boolean') {
    throw new Error('tutor_followup_answer.scope_ok muss boolean sein.');
  }
  if (typeof payload.redirected_to_focus !== 'boolean') {
    throw new Error('tutor_followup_answer.redirected_to_focus muss boolean sein.');
  }

  const followupOutput: TutorFollowupOutput = {
    answer: safeString(payload.answer, 'Präzise Frage. Wir klären sie Schritt für Schritt innerhalb des Fokus-Themas.'),
    next_question: safeString(payload.next_question, 'Wie würdest du diesen Punkt in eigenen Worten formulieren?'),
    scope_ok: payload.scope_ok,
    redirected_to_focus: payload.redirected_to_focus,
  };

  if (hasClassicDrillPattern(followupOutput)) {
    throw new Error('tutor_followup_answer enthält ein klassisches Übungs-/Drill-Muster.');
  }

  return followupOutput;
}

function hasClassicDrillPattern(output: TutorFollowupOutput): boolean {
  const normalizedText = [
    output.answer,
    output.next_question,
  ]
    .join(' ')
    .toLowerCase();

  const blockedPatterns = [
    /\blückentext\b/,
    /\bdrill(s)?\b/,
    /\bfülle\b.*\blücke/,
    /\bsetze\b.*\bein/,
    /\bübungsblatt\b/,
    /\b20\s*sätze\b/,
    /\bkonjugiere\b/,
  ];

  return blockedPatterns.some((pattern) => pattern.test(normalizedText));
}

function formatFollowupText(followup: TutorFollowupOutput): string {
  return [
    followup.answer,
    followup.redirected_to_focus ? 'Hinweis: Wir richten den Dialogue wieder auf das Fokus-Thema aus.' : null,
    `Nächste Frage: ${followup.next_question}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n\n');
}

function toFollowupPayload(followup: TutorFollowupOutput): Record<string, unknown> {
  return {
    role: 'assistant',
    type: 'followup',
    answer: followup.answer,
    next_question: followup.next_question,
    scope_ok: followup.scope_ok,
    redirected_to_focus: followup.redirected_to_focus,
  };
}

function buildScopeBoundFallbackFollowup(params: {
  topicTitle: string;
}): TutorFollowupOutput {
  return {
    answer: `Wir bleiben im Focus Area „${params.topicTitle}“. Ich kläre nur diesen Punkt, ohne ein neues Sprachthema zu öffnen.`,
    next_question: 'Formuliere deine Rückfrage bitte mit genau einem Fokuspunkt neu.',
    scope_ok: false,
    redirected_to_focus: true,
  };
}

function parseTransferEvidence(value: unknown): TransferEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('understanding_check.transfer_evidence fehlt oder ist ungültig.');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.reuse_demonstrated !== 'boolean') {
    throw new Error('understanding_check.transfer_evidence.reuse_demonstrated muss boolean sein.');
  }
  if (typeof raw.context_variation !== 'string') {
    throw new Error('understanding_check.transfer_evidence.context_variation muss ein String sein.');
  }

  return {
    reuse_demonstrated: raw.reuse_demonstrated,
    context_variation: raw.context_variation.trim(),
  };
}

function parseUnderstandingCheckOutput(input: unknown): UnderstandingCheckOutput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('understanding_check muss ein Objekt liefern.');
  }

  const payload = input as Record<string, unknown>;
  if (payload.status !== 'not_yet' && payload.status !== 'partial' && payload.status !== 'sufficient') {
    throw new Error('understanding_check.status muss not_yet, partial oder sufficient sein.');
  }
  if (typeof payload.redirected_to_focus !== 'boolean') {
    throw new Error('understanding_check.redirected_to_focus muss boolean sein.');
  }
  const transferEvidence = parseTransferEvidence(payload.transfer_evidence);

  // Verpflichtender Transfer-Check: "sufficient" ist nur gültig, wenn ein
  // Re-Use unter leicht variierter Bedingung tatsächlich nachgewiesen wurde
  // (nicht bloß behauptet). Sonst wird auf "partial" heruntergestuft --
  // konsistent mit dem Selbstheilungsmuster in parseExplanationOutput, statt
  // die gesamte Prüfung ohne Retry-Schleife scheitern zu lassen.
  const claimsSufficient = payload.status === 'sufficient';
  const transferProven = transferEvidence.reuse_demonstrated && transferEvidence.context_variation.length > 0;
  const status = claimsSufficient && !transferProven ? 'partial' : payload.status;

  const parsedNextStep =
    payload.next_step === 'clarification' || payload.next_step === 'transfer_ready'
      ? payload.next_step
      : status === 'sufficient'
        ? 'transfer_ready'
        : 'clarification';
  const nextStep = status === 'sufficient' ? parsedNextStep : 'clarification';

  return {
    status,
    feedback: safeString(
      payload.feedback,
      status === 'sufficient' ? 'Das Verständnis ist ausreichend stabil für den nächsten Schritt.' : 'Guter Zwischenstand – wir präzisieren den Punkt noch kurz.',
    ),
    next_step: nextStep,
    redirected_to_focus: payload.redirected_to_focus,
    transfer_evidence: transferEvidence,
  };
}


function asRecord(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseCyclePhase(value: unknown): TutorCyclePhase | null {
  return value === 'explanation' || value === 'clarification' || value === 'understanding' || value === 'transfer_ready'
    ? value
    : null;
}

function normalizeClarificationQuestion(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw new Error('Keine Frage im Audio erkannt. Bitte sprich deine Rückfrage klar und versuche es erneut.');
  }

  const tokenCount = normalized.split(' ').filter(Boolean).length;
  if (normalized.length < 6 || tokenCount < 2) {
    throw new Error('Die erkannte Rückfrage ist zu kurz. Bitte formuliere sie etwas genauer.');
  }

  return normalized;
}

export const tutorService = {
  async getActiveFocusTopic(userId: string): Promise<ActiveTutorFocusTopic | null> {
    const settings = await appSettingsService.getSettings();
    if (!appSettingsService.isFeatureEnabled(settings, 'tutor')) {
      return null;
    }

    const { data, error } = await supabaseClient
      .from('focus_topics')
      .select('*')
      .eq('user_id', userId)
      .in('status', TUTOR_ELIGIBLE_FOCUS_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(10)
      .returns<FocusTopicRow[]>();

    if (error) {
      throw new Error(`Aktives Fokus-Thema konnte nicht geladen werden: ${error.message}`);
    }

    const activeTopic = (data ?? []).find((topic) => {
      return isTutorReleasedForFocus({ status: topic.status, masteryLevel: topic.mastery_level });
    });

    if (!activeTopic) {
      return null;
    }

    const policy = getFocusTopicPolicy({ status: activeTopic.status, masteryLevel: activeTopic.mastery_level });
    if (!policy || !policy.tutor.isReleased) return null;

    return {
      id: activeTopic.id,
      topicKey: activeTopic.topic_key,
      title: activeTopic.title,
      description: activeTopic.description,
      status: activeTopic.status,
      tutorGoal: policy.tutor.goal,
      metadata: activeTopic.metadata,
    };
  },

  async getOrCreateTutorSession(userId: string, focusTopicTitle: string): Promise<ConversationSessionRow> {
    const { data, error } = await supabaseClient
      .from('conversation_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('source', 'tutor')
      .in('status', TUTOR_ACTIVE_SESSION_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<ConversationSessionRow>();

    if (error) {
      throw new Error(`Tutor-Session konnte nicht geladen werden: ${error.message}`);
    }

    if (data) {
      if (data.status === 'training_in_progress') {
        return data;
      }

      const currentMetadata = asRecord(data.metadata);
      const currentTutorLifecycle =
        currentMetadata.tutor_lifecycle && typeof currentMetadata.tutor_lifecycle === 'object' && !Array.isArray(currentMetadata.tutor_lifecycle)
          ? (currentMetadata.tutor_lifecycle as Record<string, unknown>)
          : {};
      const { data: activatedSession, error: activateError } = await supabaseClient
        .from('conversation_sessions')
        .update({
          source: 'tutor',
          status: 'training_in_progress',
          metadata: toJson({
            ...currentMetadata,
            tutor_lifecycle: {
              ...currentTutorLifecycle,
              started_at: data.started_at ?? new Date().toISOString(),
              completion_event_recorded: false,
              cycle_phase: parseCyclePhase(currentTutorLifecycle.cycle_phase) ?? 'explanation',
            },
          }),
        })
        .eq('id', data.id)
        .eq('user_id', userId)
        .select('*')
        .single<ConversationSessionRow>();

      if (activateError || !activatedSession) {
        throw new Error(`Tutor-Session konnte nicht aktiviert werden: ${activateError?.message ?? 'Unbekannter Fehler'}`);
      }

      return activatedSession;
    }

    const created = await sessionService.createConversationSession(userId, {
      source: 'tutor',
      title: `Tutor: ${focusTopicTitle}`,
    });

    const nowIso = new Date().toISOString();
    const { data: initializedSession, error: initError } = await supabaseClient
      .from('conversation_sessions')
      .update({
        source: 'tutor',
        status: 'training_in_progress',
        started_at: created.startedAt ?? nowIso,
        metadata: toJson({
          topic: focusTopicTitle,
          tutor_lifecycle: {
            started_at: created.startedAt ?? nowIso,
            completion_event_recorded: false,
            cycle_phase: 'explanation',
          },
        }),
      })
      .eq('id', created.id)
      .eq('user_id', userId)
      .select('*')
      .single<ConversationSessionRow>();

    if (initError || !initializedSession) {
      throw new Error(`Tutor-Session konnte nicht initialisiert werden: ${initError?.message ?? 'Unbekannter Fehler'}`);
    }

    return initializedSession;
  },

  async markDialogueCompleted(params: {
    userId: string;
    sessionId: string;
    criterion: 'understanding_check.status=sufficient_phase';
  }) {
    const { data: sessionRow, error: sessionError } = await supabaseClient
      .from('conversation_sessions')
      .select('*')
      .eq('id', params.sessionId)
      .eq('user_id', params.userId)
      .eq('source', 'tutor')
      .maybeSingle<ConversationSessionRow>();

    if (sessionError) {
      throw new Error(`Tutor-Session konnte nicht geladen werden: ${sessionError.message}`);
    }

    if (!sessionRow) {
      throw new Error('Tutor-Session nicht gefunden.');
    }

    const { data: completionEvent, error: completionLookupError } = await supabaseClient
      .from('tutor_interactions')
      .select('id')
      .eq('user_id', params.userId)
      .eq('session_id', params.sessionId)
      .contains('interaction_payload', { event: 'dialogue_completed' })
      .limit(1)
      .maybeSingle<Pick<TutorInteractionRow, 'id'>>();

    if (completionLookupError) {
      throw new Error(`Tutor-Abschluss-Event konnte nicht geprüft werden: ${completionLookupError.message}`);
    }

    if (!completionEvent) {
      await this.saveInteraction({
        userId: params.userId,
        sessionId: params.sessionId,
        promptText: 'dialogue_completed',
        responseText: 'Tutor-Dialog abgeschlossen.',
        payload: {
          role: 'assistant',
          type: 'understanding_check',
          event: 'dialogue_completed',
          completion_criterion: params.criterion,
          cycle_phase: 'transfer_ready',
        },
      });
    }

    const currentMetadata = asRecord(sessionRow.metadata);
    const currentTutorLifecycle =
      currentMetadata.tutor_lifecycle && typeof currentMetadata.tutor_lifecycle === 'object' && !Array.isArray(currentMetadata.tutor_lifecycle)
        ? (currentMetadata.tutor_lifecycle as Record<string, unknown>)
        : {};

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabaseClient
      .from('conversation_sessions')
      .update({
        source: 'tutor',
        status: 'completed',
        ended_at: nowIso,
        metadata: toJson({
          ...currentMetadata,
          tutor_lifecycle: {
            ...currentTutorLifecycle,
            completion_event_recorded: true,
            completion_criterion: params.criterion,
            completed_at: nowIso,
            cycle_phase: 'transfer_ready',
          },
        }),
      })
      .eq('id', params.sessionId)
      .eq('user_id', params.userId);

    if (updateError) {
      throw new Error(`Tutor-Session konnte nicht abgeschlossen werden: ${updateError.message}`);
    }
  },

  async listInteractions(userId: string, sessionId: string): Promise<TutorMessage[]> {
    const { data, error } = await supabaseClient
      .from('tutor_interactions')
      .select('*')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .returns<TutorInteractionRow[]>();

    if (error) {
      throw new Error(`Tutor-Interaktionen konnten nicht geladen werden: ${error.message}`);
    }

    return (data ?? []).flatMap((entry) => {
      const payload = (entry.interaction_payload ?? {}) as Record<string, unknown>;
      // Legacy-Mapping: historisch gespeicherte `learner`-Einträge werden auf AP1 `user` normalisiert.
      const role = payload.role === 'assistant' ? 'assistant' : 'user';
      const type = safeString(payload.type) as TutorMessage['type'];
      const cyclePhase = parseCyclePhase(payload.cycle_phase);
      const text = safeString(entry.response_text ?? entry.prompt_text ?? '');

      if (!text) {
        return [];
      }

      return [
        {
          id: entry.id,
          role,
          type: type || 'followup',
          cyclePhase: cyclePhase ?? undefined,
          text,
          createdAt: entry.created_at,
          explanationExamples:
            role === 'assistant' && type === 'explanation' && Array.isArray(payload.examples)
              ? payload.examples
                  .map((candidate) => {
                    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
                      return null;
                    }
                    const example = candidate as Record<string, unknown>;
                    const incorrect = safeString(example.incorrect);
                    const correct = safeString(example.correct);
                    const why = safeString(example.why);
                    return incorrect && correct && why ? { incorrect, correct, why } : null;
                  })
                  .filter((candidate): candidate is { incorrect: string; correct: string; why: string } => Boolean(candidate))
                  .slice(0, 3)
              : undefined,
          explanationCheckQuestion:
            role === 'assistant' && type === 'explanation' ? safeString(payload.check_question) || undefined : undefined,
          followupAnswer: role === 'assistant' && type === 'followup' ? safeString(payload.answer) || undefined : undefined,
          followupNextQuestion:
            role === 'assistant' && type === 'followup' ? safeString(payload.next_question) || undefined : undefined,
          followupScopeOk: role === 'assistant' && type === 'followup' ? payload.scope_ok === true : undefined,
          followupRedirectedToFocus:
            role === 'assistant' && type === 'followup' ? payload.redirected_to_focus === true : undefined,
          inputMode: role === 'user' && (payload.input_mode === 'voice' || payload.input_mode === 'text') ? (payload.input_mode as 'voice' | 'text') : undefined,
          durationSeconds:
            role === 'user' && typeof payload.duration_seconds === 'number' && Number.isFinite(payload.duration_seconds)
              ? payload.duration_seconds
              : undefined,
          transcriptConfidence:
            role === 'user' && typeof payload.transcript_confidence === 'number' && Number.isFinite(payload.transcript_confidence)
              ? payload.transcript_confidence
              : undefined,
        },
      ];
    });
  },

  async saveInteraction(params: {
    userId: string;
    sessionId: string;
    status?: TutorInteractionRow['status'];
    promptText?: string | null;
    responseText?: string | null;
    modelName?: string | null;
    payload?: Record<string, unknown>;
  }) {
    const { error } = await supabaseClient.from('tutor_interactions').insert({
      user_id: params.userId,
      session_id: params.sessionId,
      status: params.status ?? 'responded',
      prompt_text: params.promptText ?? null,
      response_text: params.responseText ?? null,
      model_name: params.modelName ?? 'gpt-4.1-mini',
      interaction_payload: toJson(params.payload ?? {}),
    });

    if (error) {
      throw new Error(`Tutor-Interaktion konnte nicht gespeichert werden: ${error.message}`);
    }
  },

  async updateSessionCyclePhase(params: { userId: string; sessionId: string; cyclePhase: TutorCyclePhase }) {
    const { data: sessionRow, error: loadError } = await supabaseClient
      .from('conversation_sessions')
      .select('metadata')
      .eq('id', params.sessionId)
      .eq('user_id', params.userId)
      .single<Pick<ConversationSessionRow, 'metadata'>>();

    if (loadError || !sessionRow) {
      throw new Error(`Tutor-Session-Metadaten konnten nicht geladen werden: ${loadError?.message ?? 'Unbekannter Fehler'}`);
    }

    const currentMetadata = asRecord(sessionRow.metadata);
    const currentTutorLifecycle =
      currentMetadata.tutor_lifecycle && typeof currentMetadata.tutor_lifecycle === 'object' && !Array.isArray(currentMetadata.tutor_lifecycle)
        ? (currentMetadata.tutor_lifecycle as Record<string, unknown>)
        : {};

    const { error: updateError } = await supabaseClient
      .from('conversation_sessions')
      .update({
        metadata: toJson({
          ...currentMetadata,
          tutor_lifecycle: {
            ...currentTutorLifecycle,
            cycle_phase: params.cyclePhase,
          },
        }),
      })
      .eq('id', params.sessionId)
      .eq('user_id', params.userId);

    if (updateError) {
      throw new Error(`Tutor-Session-Phase konnte nicht aktualisiert werden: ${updateError.message}`);
    }
  },

  async generateExplanation(params: {
    topicTitle: string;
    topicDescription: string;
    traceId?: string;
    workflowId?: string;
    pipelineStep?: string;
    attemptNumber?: number;
  }): Promise<TutorExplanationOutput> {
    const settings = await appSettingsService.getSettings();
    const result = await aiOrchestratorService.executePrompt<TutorExplanationOutput>({
      promptKey: 'tutor_explanation',
      variables: {
        topic_title: params.topicTitle,
        topic_description: params.topicDescription,
        tutor_language: settings.tutorExplanationLanguage,
        feedback_hardness: settings.feedbackHardness,
      },
      executionContext: {
        traceId: params.traceId,
        workflowId: params.workflowId,
        pipelineStep: params.pipelineStep ?? 'tutor_explanation',
        attemptNumber: params.attemptNumber,
      },
    });

    if (!result.ok || !result.output) {
      throw new Error(result.errorMessage ?? 'Tutor-Erklärung konnte nicht erstellt werden.');
    }

    return parseExplanationOutput(result.output);
  },

  async generateFollowupAnswer(params: {
    topicTitle: string;
    topicDescription: string;
    explanationText: string;
    learnerQuestion: string;
    dialogueJson: string;
    traceId?: string;
    workflowId?: string;
    pipelineStep?: string;
    attemptNumber?: number;
  }): Promise<TutorFollowupOutput> {
    const settings = await appSettingsService.getSettings();
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await aiOrchestratorService.executePrompt<TutorFollowupOutput>({
        promptKey: 'tutor_followup_answer',
        variables: {
          topic_title: params.topicTitle,
          topic_description: params.topicDescription,
          explanation_text: params.explanationText,
          learner_question: params.learnerQuestion,
          dialogue_json: params.dialogueJson,
          tutor_language: settings.tutorExplanationLanguage,
          feedback_hardness: settings.feedbackHardness,
        },
        executionContext: {
          traceId: params.traceId,
          workflowId: params.workflowId,
          pipelineStep: params.pipelineStep ?? 'tutor_followup_answer',
          attemptNumber: (params.attemptNumber ?? 0) + attempt,
        },
      });

      if (!result.ok || !result.output) {
        if (attempt === maxAttempts) {
          throw new Error(result.errorMessage ?? 'Tutor-Antwort konnte nicht erstellt werden.');
        }
        continue;
      }

      try {
        const parsed = parseFollowupOutput(result.output);
        if (!parsed.scope_ok) {
          if (attempt === maxAttempts) {
            return buildScopeBoundFallbackFollowup({
              topicTitle: params.topicTitle,
            });
          }
          continue;
        }
        return parsed;
      } catch (error) {
        if (attempt === maxAttempts) {
          return buildScopeBoundFallbackFollowup({
            topicTitle: params.topicTitle,
          });
        }
      }
    }

    return buildScopeBoundFallbackFollowup({
      topicTitle: params.topicTitle,
    });
  },
  async createClarificationFromAudio(params: {
    userId: string;
    sessionId: string;
    audioBlob: Blob;
    durationSeconds: number;
    expectedLanguage?: string;
  }): Promise<string> {
    const { bucket, filePath } = await sessionStorageService.uploadSessionAudio(`tutor-${params.sessionId}`, params.userId, params.audioBlob);
    const { data, error } = await supabaseClient.functions.invoke('transcribe-session-audio', {
      body: {
        userId: params.userId,
        sessionId: `tutor-${params.sessionId}`,
        audioBucket: bucket,
        audioFilePath: filePath,
        expectedLanguage: params.expectedLanguage ?? 'de',
        durationSeconds: params.durationSeconds,
      },
    });

    if (error) {
      throw new Error(`Transkription fehlgeschlagen: ${error.message}`);
    }

    const transcript = typeof data?.data?.rawTranscript === 'string' ? data.data.rawTranscript : '';
    return normalizeClarificationQuestion(transcript);
  },
  formatFollowupText,
  toFollowupPayload,

  async runUnderstandingCheck(params: {
    topicTitle: string;
    topicDescription: string;
    explanationText: string;
    dialogueJson: string;
    traceId?: string;
    workflowId?: string;
    pipelineStep?: string;
    attemptNumber?: number;
  }): Promise<UnderstandingCheckOutput> {
    const settings = await appSettingsService.getSettings();
    const result = await aiOrchestratorService.executePrompt<UnderstandingCheckOutput>({
      promptKey: 'understanding_check',
      variables: {
        topic_title: params.topicTitle,
        topic_description: params.topicDescription,
        explanation_text: params.explanationText,
        dialogue_json: params.dialogueJson,
        tutor_language: settings.tutorExplanationLanguage,
        feedback_hardness: settings.feedbackHardness,
      },
      executionContext: {
        traceId: params.traceId,
        workflowId: params.workflowId,
        pipelineStep: params.pipelineStep ?? 'tutor_understanding_check',
        attemptNumber: params.attemptNumber,
      },
    });

    if (!result.ok || !result.output) {
      throw new Error(result.errorMessage ?? 'Verständnisprüfung konnte nicht ausgeführt werden.');
    }

    return parseUnderstandingCheckOutput(result.output);
  },

  async persistUnderstandingStatus(params: {
    userId: string;
    focusTopicId: string;
    status: 'not_yet' | 'partial' | 'sufficient';
    feedback: string;
    nextStep: string;
  }) {
    const { data: currentTopic, error: loadError } = await supabaseClient
      .from('focus_topics')
      .select('status,metadata')
      .eq('id', params.focusTopicId)
      .eq('user_id', params.userId)
      .single<{ status: FocusTopicRow['status']; metadata: Json }>();

    if (loadError) {
      throw new Error(`Fokus-Thema konnte nicht geladen werden: ${loadError.message}`);
    }

    const currentMetadata = withNormalizedStatusHistory(currentTopic?.metadata);
    const eventByStatus = {
      sufficient: 'tutor_mark_sufficient',
      partial: 'tutor_mark_partial',
      not_yet: 'tutor_mark_not_yet',
    } as const;
    const transition = applyFocusEvent(
      currentTopic.status,
      eventByStatus[params.status],
      {
        metadata: currentMetadata,
        reason: `understanding_check:${params.status}`,
        source: 'tutor.service',
      },
    );

    const nextMetadata = {
      ...transition.metadata,
      tutor: {
        understanding_status: params.status,
        feedback: params.feedback,
        next_step: params.nextStep,
        updated_at: new Date().toISOString(),
      },
    };

    const { error: updateError } = await supabaseClient
      .from('focus_topics')
      .update({
        status: transition.nextStatus,
        metadata: toJson(nextMetadata),
      })
      .eq('id', params.focusTopicId)
      .eq('user_id', params.userId);

    if (updateError) {
      throw new Error(`Verständnisstatus konnte nicht gespeichert werden: ${updateError.message}`);
    }
  },
};
