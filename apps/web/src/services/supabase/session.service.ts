import { supabaseClient } from '@/services/supabase/client';
import { getCurrentDayBoundsUtcForTimezone } from '@/lib/timezone';
import { profileService } from '@/services/supabase/profile.service';
import { userEntitlementsService } from '@/services/supabase/user-entitlements.service';
import type { ConversationSessionStatus, ConversationSessionRow, Json } from '@/types/database';
import type { ConversationSession } from '@/types/domain';

type SessionMetadata = {
  audioFilePath?: string;
  durationSeconds?: number;
  topic?: string;
  language?: string;
  civicsQuestionId?: string;
  audioQuality?: {
    backgroundNoiseLevel?: 'low' | 'medium' | 'high';
    snrEstimateDb?: number;
    confidence?: number;
  };
  processing?: {
    transcriptStatus?: 'pending' | 'processing' | 'completed' | 'failed';
    analysisStatus?: 'pending' | 'processing' | 'completed' | 'failed';
    lastError?: string;
  };
};

type SessionInput = {
  title?: string;
  source?: string;
  topic?: string;
  civicsQuestionId?: string;
};

type DailyConversationLimitGuardInput = {
  dailyConversationSecondsLimit: number | null;
  secondsToday: number;
  newSessionDurationSeconds: number;
};

type BillingCyclePeriodRow = {
  period_start: string;
  period_end: string;
  monthly_token_limit: number | null;
};

function asRecord(value: Json): Record<string, Json | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function parseMetadata(value: Json): SessionMetadata {
  const metadata = asRecord(value);
  const processingRaw =
    typeof metadata.processing === 'object' && metadata.processing !== null && !Array.isArray(metadata.processing)
      ? (metadata.processing as Record<string, Json | undefined>)
      : undefined;

  const audioQualityRaw =
    typeof metadata.audioQuality === 'object' && metadata.audioQuality !== null && !Array.isArray(metadata.audioQuality)
      ? (metadata.audioQuality as Record<string, Json | undefined>)
      : undefined;

  return {
    audioFilePath: typeof metadata.audioFilePath === 'string' ? metadata.audioFilePath : undefined,
    durationSeconds: typeof metadata.durationSeconds === 'number' ? metadata.durationSeconds : undefined,
    topic: typeof metadata.topic === 'string' ? metadata.topic : undefined,
    language: typeof metadata.language === 'string' ? metadata.language : undefined,
    civicsQuestionId: typeof metadata.civicsQuestionId === 'string' ? metadata.civicsQuestionId : undefined,
    audioQuality: audioQualityRaw
      ? {
          backgroundNoiseLevel:
            audioQualityRaw.backgroundNoiseLevel === 'low' ||
            audioQualityRaw.backgroundNoiseLevel === 'medium' ||
            audioQualityRaw.backgroundNoiseLevel === 'high'
              ? audioQualityRaw.backgroundNoiseLevel
              : undefined,
          snrEstimateDb: typeof audioQualityRaw.snrEstimateDb === 'number' ? audioQualityRaw.snrEstimateDb : undefined,
          confidence: typeof audioQualityRaw.confidence === 'number' ? audioQualityRaw.confidence : undefined,
        }
      : undefined,
    processing: processingRaw
      ? {
          transcriptStatus:
            processingRaw.transcriptStatus === 'pending' ||
            processingRaw.transcriptStatus === 'processing' ||
            processingRaw.transcriptStatus === 'completed' ||
            processingRaw.transcriptStatus === 'failed'
              ? processingRaw.transcriptStatus
              : undefined,
          analysisStatus:
            processingRaw.analysisStatus === 'pending' ||
            processingRaw.analysisStatus === 'processing' ||
            processingRaw.analysisStatus === 'completed' ||
            processingRaw.analysisStatus === 'failed'
              ? processingRaw.analysisStatus
              : undefined,
          lastError: typeof processingRaw.lastError === 'string' ? processingRaw.lastError : undefined,
        }
      : undefined,
  };
}

function enforceDailyConversationSecondsLimit(input: DailyConversationLimitGuardInput): void {
  const { dailyConversationSecondsLimit, secondsToday, newSessionDurationSeconds } = input;

  if (dailyConversationSecondsLimit === null) {
    return;
  }

  const projectedDurationSeconds = secondsToday + newSessionDurationSeconds;
  if (projectedDurationSeconds > dailyConversationSecondsLimit) {
    throw new Error(
      `Tageslimit für Gesprächszeit erreicht: maximal ${dailyConversationSecondsLimit} Sekunden (${Math.round(dailyConversationSecondsLimit / 60)} Minuten) pro Tag erlaubt.`,
    );
  }
}

/**
 * Heutige Session-Anzahl und -Sekunden in einer Abfrage (zeitzonenkorrekt
 * nach Kalendertag des Nutzers) -- ersetzt zwei vormals getrennte Abfragen
 * (Count in createConversationSession, Sekundensumme in
 * enforceDailyConversationSecondsLimit) und wird zusätzlich von der
 * Profil-Nutzungsanzeige verwendet.
 */
export async function getTodaysUsageSummary(userId: string): Promise<{ sessionsToday: number; secondsToday: number }> {
  const userTimeZone = await profileService.getUserTimezone(userId);
  const { dayStartUtc, nextDayStartUtc } = getCurrentDayBoundsUtcForTimezone(userTimeZone);

  const { data, error } = await supabaseClient
    .from('conversation_sessions')
    .select('id, metadata')
    .eq('user_id', userId)
    .gte('created_at', dayStartUtc.toISOString())
    .lt('created_at', nextDayStartUtc.toISOString());

  if (error) {
    throw new Error(`Tagesnutzung konnte nicht geladen werden: ${error.message}`);
  }

  const rows = data ?? [];
  const secondsToday = rows.reduce((sum, row) => {
    const metadata = parseMetadata((row as { metadata: Json }).metadata);
    return sum + (metadata.durationSeconds ?? 0);
  }, 0);

  return { sessionsToday: rows.length, secondsToday };
}

/**
 * Session-Sekunden im aktuellen Abrechnungszeitraum des Nutzers, rein
 * informativ (kein Minuten-Limit dahinter) -- nutzt denselben Zeitraum wie
 * das Token-Backend-Limit (resolve_billing_cycle_period), statt einen
 * eigenen Kalendermonat-Begriff einzuführen.
 */
export async function getBillingPeriodUsageSummary(
  userId: string,
): Promise<{ periodStart: string; periodEnd: string; secondsUsed: number }> {
  const { data: periodRows, error: periodError } = await supabaseClient.rpc('resolve_billing_cycle_period', {
    p_user_id: userId,
  });

  if (periodError) {
    throw new Error(`Abrechnungszeitraum konnte nicht ermittelt werden: ${periodError.message}`);
  }

  const period = (Array.isArray(periodRows) ? periodRows[0] : null) as BillingCyclePeriodRow | null;
  if (!period) {
    throw new Error('Abrechnungszeitraum konnte nicht ermittelt werden: keine Daten.');
  }

  const { data, error } = await supabaseClient
    .from('conversation_sessions')
    .select('metadata')
    .eq('user_id', userId)
    .gte('created_at', period.period_start)
    .lt('created_at', period.period_end);

  if (error) {
    throw new Error(`Nutzung im Abrechnungszeitraum konnte nicht geladen werden: ${error.message}`);
  }

  const secondsUsed = (data ?? []).reduce((sum, row) => {
    const metadata = parseMetadata((row as { metadata: Json }).metadata);
    return sum + (metadata.durationSeconds ?? 0);
  }, 0);

  return { periodStart: period.period_start, periodEnd: period.period_end, secondsUsed };
}

function mapSession(row: ConversationSessionRow): ConversationSession {
  const metadata = parseMetadata(row.metadata);
  const transcriptStatus = metadata.processing?.transcriptStatus;
  const analysisStatus = metadata.processing?.analysisStatus;

  return {
    id: row.id,
    title: row.title ?? 'Session ohne Titel',
    source: row.source ?? 'web-mic',
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    durationSeconds: metadata.durationSeconds,
    audioFilePath: metadata.audioFilePath,
    topic: metadata.topic,
    language: metadata.language,
    civicsQuestionId: metadata.civicsQuestionId,
    audioQuality: metadata.audioQuality,
    processingLastError: metadata.processing?.lastError,
    processing: metadata.processing,
    transcriptStatus: transcriptStatus === 'completed' ? 'ready' : 'pending',
    analysisStatus: analysisStatus === 'completed' ? 'ready' : 'pending',
  };
}

export const sessionService = {
  async createConversationSession(userId: string, input?: SessionInput): Promise<ConversationSession> {
    const entitlement = await userEntitlementsService.getEffectiveForUser(userId);
    const { sessionsToday, secondsToday } = await getTodaysUsageSummary(userId);

    if (sessionsToday >= entitlement.sessionsPerDayLimit) {
      throw new Error(
        `Tageslimit erreicht: maximal ${entitlement.sessionsPerDayLimit} Sessions pro Tag. Bitte morgen fortsetzen.`,
      );
    }

    enforceDailyConversationSecondsLimit({
      dailyConversationSecondsLimit: entitlement.dailyConversationSecondsLimit,
      secondsToday,
      newSessionDurationSeconds: entitlement.maxSessionLengthSeconds,
    });

    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from('conversation_sessions')
      .insert({
        user_id: userId,
        title: input?.title ?? null,
        source: input?.source ?? 'web-mic',
        status: 'draft',
        started_at: nowIso,
        metadata: {
          topic: input?.topic ?? null,
          civicsQuestionId: input?.civicsQuestionId ?? null,
        },
      })
      .select('*')
      .single<ConversationSessionRow>();

    if (error || !data) {
      throw new Error(`Session konnte nicht erstellt werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapSession(data);
  },

async updateConversationSessionAfterUpload(params: {
  sessionId: string;
  userId: string;
  objectPath: string;
  durationSeconds: number;
  status: ConversationSessionStatus;
  audioQuality?: SessionMetadata['audioQuality'];
}) {
  console.log('[UPLOAD] updateConversationSessionAfterUpload START', params);

  const { sessionId, userId, objectPath, durationSeconds, status, audioQuality } = params;

  const existing = await this.getConversationSessionById(userId, sessionId);

  console.log('[UPLOAD] existing session', existing);

  if (!existing) {
    throw new Error('Session nicht gefunden.');
  }

  const payload = {
    status,
    ended_at: new Date().toISOString(),

    metadata: {
      audioFilePath: objectPath,
      durationSeconds,
      topic: existing.topic,
      language: existing.language,
      audioQuality: audioQuality ?? existing.audioQuality,
      processing: {
        transcriptStatus: 'pending',
        analysisStatus: 'pending',
      },
    },
  };

  console.log('[UPLOAD] update payload', payload);

  const result = await supabaseClient
    .from('conversation_sessions')
    .update(payload)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select('*')
    .single<ConversationSessionRow>();

  console.log('[UPLOAD] raw update result', result);

  if (result.error || !result.data) {
    console.error('[UPLOAD] update FAILED', result.error);

    throw new Error(
      `Session konnte nicht aktualisiert werden: ${
        result.error?.message ?? 'Unbekannter Fehler'
      }`,
    );
  }

  console.log(
    '[UPLOAD] persisted row JSON',
    JSON.stringify(result.data, null, 2),
  );
  console.log(
    '[UPLOAD] persisted audio_file_path',
    (result.data as Record<string, unknown>).audio_file_path,
  );


  return mapSession(result.data);
},

  async updateConversationSessionStatus(params: {
    sessionId: string;
    userId: string;
    status: ConversationSessionStatus;
    processing?: SessionMetadata['processing'];
    metadataPatch?: Partial<Omit<SessionMetadata, 'processing'>>;
  }) {
    const { sessionId, userId, status, processing, metadataPatch } = params;
    const existing = await this.getConversationSessionById(userId, sessionId);

    if (!existing) {
      throw new Error('Session nicht gefunden.');
    }

    const mergedMetadata: SessionMetadata = {
      audioFilePath: existing.audioFilePath,
      durationSeconds: existing.durationSeconds,
      topic: existing.topic,
      language: existing.language,
      audioQuality: existing.audioQuality,
      processing: processing ?? undefined,
      ...metadataPatch,
    };

    const { data, error } = await supabaseClient
      .from('conversation_sessions')
      .update({
        status,
        metadata: mergedMetadata,
      })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select('*')
      .single<ConversationSessionRow>();

    if (error || !data) {
      throw new Error(`Session-Status konnte nicht aktualisiert werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapSession(data);
  },

  async listConversationSessions(
    userId: string,
    options?: {
      limit?: number;
    },
  ): Promise<ConversationSession[]> {
    let query = supabaseClient
      .from('conversation_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (typeof options?.limit === 'number' && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query.returns<ConversationSessionRow[]>();

    if (error) {
      throw new Error(`Session-History konnte nicht geladen werden: ${error.message}`);
    }

    return (data ?? []).map(mapSession);
  },

  async getConversationSessionById(userId: string, sessionId: string): Promise<ConversationSession | null> {
    const { data, error } = await supabaseClient
      .from('conversation_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle<ConversationSessionRow>();

    if (error) {
      throw new Error(`Session konnte nicht geladen werden: ${error.message}`);
    }

    if (!data) return null;

    return mapSession(data);
  },

  async deleteConversationSession(userId: string, sessionId: string): Promise<void> {
    const { error } = await supabaseClient
      .from('conversation_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Session konnte nicht gelöscht werden: ${error.message}`);
    }
  },
};
