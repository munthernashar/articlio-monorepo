import { supabaseClient } from '@/services/supabase/client';
import { appSettingsService } from '@/services/supabase/app-settings.service';
import { clampFivePointScore } from '@/services/ai/scoring';
import { normalizeSessionAnalysisRow } from '@/services/supabase/session-analysis-compat';
import { ANALYSIS_CATEGORY_KEYS } from '@/types/app-settings';
import type { Json, ProcessingStatus, SessionAnalysisRow } from '@/types/database';

export const SESSION_ANALYSIS_CATEGORIES = ANALYSIS_CATEGORY_KEYS;

export type SessionAnalysisCategory = (typeof SESSION_ANALYSIS_CATEGORIES)[number];

// Launch-Readiness-Audit, Befund K (P0 #1, docs/daf-cefr-prompt-audit-2026-05-06.md):
// CEFR-Bänder, an denen die May-Audit-Empfehlung "jeder Score bekommt externe
// didaktische Bedeutung" gemessen wird.
export const CEFR_BANDS = [
  'A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2', 'C1.1', 'C1.2', 'C2',
] as const;

export type CefrBand = (typeof CEFR_BANDS)[number];

export type SessionAnalysisCategoryScore = {
  score: number;
  confidence: number;
  justification: string;
  evidence: string[];
  cefr_band_estimate: CefrBand;
  can_do_evidence: string[];
  limiting_factor: string;
};

export type SessionAnalysisCategoryScores = Record<SessionAnalysisCategory, SessionAnalysisCategoryScore>;

export type SessionAnalysisRecord = {
  id: string;
  sessionId: string;
  userId: string;
  transcriptId: string | null;
  status: ProcessingStatus;
  scoreOverall: number | null;
  categoryScores: Json;
  detectedPatterns: Json;
  priorityIntervention: Json;
  overallConfidence: number | null;
  categoryConfidence: Json;
  sessionSummary: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type SessionAnalysisOutput = {
  category_scores: SessionAnalysisCategoryScores;
  detected_patterns: Array<{
    pattern_key: string;
    label: string;
    description: string;
    frequency_estimate: 'low' | 'medium' | 'high';
    communicative_impact: 'low' | 'medium' | 'high';
    category: SessionAnalysisCategory;
  }>;
  priority_intervention: {
    pattern_key: string;
    label: string;
    reason: string;
  };
  session_summary: string;
};


export function extractCategoryScore(categoryScores: Json, category: SessionAnalysisCategory | string): number | null {
  if (!categoryScores || typeof categoryScores !== 'object' || Array.isArray(categoryScores)) {
    return null;
  }

  const value = (categoryScores as Record<string, unknown>)[category];
  if (typeof value === 'number') {
    return clampFivePointScore(value);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const score = (value as Record<string, unknown>).score;
    return typeof score === 'number' ? clampFivePointScore(score) : null;
  }

  return null;
}

export function extractCefrBand(categoryScores: Json, category: SessionAnalysisCategory | string): CefrBand | null {
  if (!categoryScores || typeof categoryScores !== 'object' || Array.isArray(categoryScores)) {
    return null;
  }

  const value = (categoryScores as Record<string, unknown>)[category];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const band = (value as Record<string, unknown>).cefr_band_estimate;
  return isCefrBand(band) ? band : null;
}

export function extractLimitingFactor(categoryScores: Json, category: SessionAnalysisCategory | string): string | null {
  if (!categoryScores || typeof categoryScores !== 'object' || Array.isArray(categoryScores)) {
    return null;
  }

  const value = (categoryScores as Record<string, unknown>)[category];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const limitingFactor = (value as Record<string, unknown>).limiting_factor;
  return typeof limitingFactor === 'string' && limitingFactor.trim().length > 0 ? limitingFactor : null;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function mapRow(row: SessionAnalysisRow): SessionAnalysisRecord {
  const normalizedRow = normalizeSessionAnalysisRow(row);
  const metrics = row.metrics && typeof row.metrics === 'object' && !Array.isArray(row.metrics) ? row.metrics : {};
  const summary = row.summary && typeof row.summary === 'object' && !Array.isArray(row.summary) ? row.summary : {};
  return {
    id: normalizedRow.id,
    sessionId: normalizedRow.session_id,
    userId: normalizedRow.user_id,
    transcriptId: normalizedRow.transcript_id,
    status: normalizedRow.status,
    scoreOverall: normalizedRow.score_overall,
    categoryScores: normalizedRow.category_scores_json,
    detectedPatterns: normalizedRow.detected_patterns_json,
    priorityIntervention: normalizedRow.priority_intervention_json,
    overallConfidence: null,
    categoryConfidence: {},
    sessionSummary: normalizedRow.session_summary,
    lastError: normalizedRow.last_error,
    updatedAt: normalizedRow.updated_at,
  };
}

async function getSessionOrdinalForToday(userId: string): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseClient
    .from('session_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('created_at', dayStart.toISOString());

  if (error) {
    throw new Error(`Tages-Sessions konnten nicht gezählt werden: ${error.message}`);
  }

  return (count ?? 0) + 1;
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAnalysisCategory(value: unknown): value is SessionAnalysisCategory {
  return typeof value === 'string' && (SESSION_ANALYSIS_CATEGORIES as readonly string[]).includes(value);
}

function isPatternImpact(value: unknown): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isCefrBand(value: unknown): value is CefrBand {
  return typeof value === 'string' && (CEFR_BANDS as readonly string[]).includes(value);
}

export function parseAndValidateSessionAnalysisOutput(input: unknown): SessionAnalysisOutput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Analyse-JSON muss ein Objekt sein.');
  }

  const payload = input as Record<string, unknown>;
  const categoryScores = payload.category_scores;
  const detectedPatterns = payload.detected_patterns;
  const priorityIntervention = payload.priority_intervention;
  const sessionSummary = payload.session_summary;

  const allowedTopLevelKeys = new Set([
    'category_scores',
    'detected_patterns',
    'priority_intervention',
    'session_summary',
  ]);
  const unknownTopLevelKeys = Object.keys(payload).filter((key) => !allowedTopLevelKeys.has(key));
  if (unknownTopLevelKeys.length > 0) {
    throw new Error(`Unbekannte Felder im Analyse-JSON: ${unknownTopLevelKeys.join(', ')}.`);
  }

  if (!categoryScores || typeof categoryScores !== 'object' || Array.isArray(categoryScores)) {
    throw new Error('category_scores fehlt oder ist ungültig.');
  }

  const normalizedScores = {} as SessionAnalysisCategoryScores;
  const categoryScoresRecord = categoryScores as Record<string, unknown>;
  for (const category of SESSION_ANALYSIS_CATEGORIES) {
    const rawValue = categoryScoresRecord[category];
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      throw new Error(`category_scores.${category} fehlt oder ist kein Objekt.`);
    }

    const scoreObj = rawValue as Record<string, unknown>;
    const allowedCategoryScoreKeys = new Set([
      'score',
      'confidence',
      'justification',
      'evidence',
      'cefr_band_estimate',
      'can_do_evidence',
      'limiting_factor',
    ]);
    const unknownCategoryScoreKeys = Object.keys(scoreObj).filter((key) => !allowedCategoryScoreKeys.has(key));
    if (unknownCategoryScoreKeys.length > 0) {
      throw new Error(
        `category_scores.${category} enthält unbekannte Felder: ${unknownCategoryScoreKeys.join(', ')}.`,
      );
    }

    if (!Number.isInteger(scoreObj.score) || (scoreObj.score as number) < 0 || (scoreObj.score as number) > 5) {
      throw new Error(`category_scores.${category}.score muss ein Integer zwischen 0 und 5 sein.`);
    }
    if (typeof scoreObj.confidence !== 'number' || !Number.isFinite(scoreObj.confidence) || scoreObj.confidence < 0 || scoreObj.confidence > 1) {
      throw new Error(`category_scores.${category}.confidence muss eine Zahl zwischen 0.0 und 1.0 sein.`);
    }
    if (!hasString(scoreObj.justification)) {
      throw new Error(`category_scores.${category}.justification muss ein nicht-leerer String sein.`);
    }
    if (!Array.isArray(scoreObj.evidence) || !scoreObj.evidence.every(hasString)) {
      throw new Error(`category_scores.${category}.evidence muss ein String-Array sein.`);
    }
    // Launch-Readiness-Audit, Befund K (P0 #1): CEFR-Can-Do-Layer -- jeder Score
    // bekommt eine extern interpretierbare didaktische Bedeutung.
    if (!isCefrBand(scoreObj.cefr_band_estimate)) {
      throw new Error(
        `category_scores.${category}.cefr_band_estimate muss eines von ${CEFR_BANDS.join(', ')} sein.`,
      );
    }
    if (
      !Array.isArray(scoreObj.can_do_evidence)
      || scoreObj.can_do_evidence.length < 2
      || scoreObj.can_do_evidence.length > 3
      || !scoreObj.can_do_evidence.every(hasString)
    ) {
      throw new Error(`category_scores.${category}.can_do_evidence muss 2-3 nicht-leere Strings enthalten.`);
    }
    if (!hasString(scoreObj.limiting_factor)) {
      throw new Error(`category_scores.${category}.limiting_factor muss ein nicht-leerer String sein.`);
    }

    const score = scoreObj.score as number;
    const confidence = scoreObj.confidence as number;
    const justification = scoreObj.justification as string;
    const evidence = scoreObj.evidence as string[];
    const cefrBandEstimate = scoreObj.cefr_band_estimate as CefrBand;
    const canDoEvidence = scoreObj.can_do_evidence as string[];
    const limitingFactor = scoreObj.limiting_factor as string;

    normalizedScores[category] = {
      score,
      confidence,
      justification,
      evidence,
      cefr_band_estimate: cefrBandEstimate,
      can_do_evidence: canDoEvidence,
      limiting_factor: limitingFactor,
    };
  }

  const unknownCategoryKeys = Object.keys(categoryScoresRecord).filter((key) => !isAnalysisCategory(key));
  if (unknownCategoryKeys.length > 0) {
    throw new Error(`category_scores enthält unbekannte Kategorien: ${unknownCategoryKeys.join(', ')}.`);
  }

  if (!Array.isArray(detectedPatterns)) {
    throw new Error('detected_patterns muss ein Array sein.');
  }

  const normalizedPatterns = detectedPatterns.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Jeder detected_pattern-Eintrag muss ein Objekt sein.');
    }
    const pattern = item as Record<string, unknown>;
    const allowedPatternKeys = new Set([
      'pattern_key',
      'label',
      'description',
      'frequency_estimate',
      'communicative_impact',
      'category',
    ]);
    const unknownPatternKeys = Object.keys(pattern).filter((key) => !allowedPatternKeys.has(key));
    if (unknownPatternKeys.length > 0) {
      throw new Error(`detected_patterns enthält unbekannte Felder: ${unknownPatternKeys.join(', ')}.`);
    }
    if (!hasString(pattern.pattern_key)) {
      throw new Error('detected_patterns[].pattern_key muss ein nicht-leerer String sein.');
    }
    if (!hasString(pattern.label)) {
      throw new Error('detected_patterns[].label muss ein nicht-leerer String sein.');
    }
    if (!hasString(pattern.description)) {
      throw new Error('detected_patterns[].description muss ein nicht-leerer String sein.');
    }
    if (!isPatternImpact(pattern.frequency_estimate)) {
      throw new Error('detected_patterns[].frequency_estimate muss "low", "medium" oder "high" sein.');
    }
    if (!isPatternImpact(pattern.communicative_impact)) {
      throw new Error('detected_patterns[].communicative_impact muss "low", "medium" oder "high" sein.');
    }
    if (!isAnalysisCategory(pattern.category)) {
      throw new Error('detected_patterns[].category muss eine gültige Analysekategorie sein.');
    }
    const patternKey = pattern.pattern_key as string;
    const label = pattern.label as string;
    const description = pattern.description as string;
    const frequencyEstimate = pattern.frequency_estimate as 'low' | 'medium' | 'high';
    const communicativeImpact = pattern.communicative_impact as 'low' | 'medium' | 'high';
    const patternCategory = pattern.category as SessionAnalysisCategory;

    return {
      pattern_key: patternKey,
      label,
      description,
      frequency_estimate: frequencyEstimate,
      communicative_impact: communicativeImpact,
      category: patternCategory,
    };
  });

  if (!priorityIntervention || typeof priorityIntervention !== 'object' || Array.isArray(priorityIntervention)) {
    throw new Error('priority_intervention fehlt oder ist ungültig.');
  }

  const intervention = priorityIntervention as Record<string, unknown>;
  const allowedPriorityInterventionKeys = new Set(['pattern_key', 'label', 'reason']);
  const unknownPriorityInterventionKeys = Object.keys(intervention).filter((key) => !allowedPriorityInterventionKeys.has(key));
  if (unknownPriorityInterventionKeys.length > 0) {
    throw new Error(
      `priority_intervention enthält unbekannte Felder: ${unknownPriorityInterventionKeys.join(', ')}.`,
    );
  }
  if (!hasString(intervention.pattern_key)) {
    throw new Error('priority_intervention.pattern_key muss ein nicht-leerer String sein.');
  }
  if (!hasString(intervention.label)) {
    throw new Error('priority_intervention.label muss ein nicht-leerer String sein.');
  }
  if (!hasString(intervention.reason)) {
    throw new Error('priority_intervention.reason muss ein nicht-leerer String sein.');
  }

  if (!hasString(sessionSummary)) {
    throw new Error('session_summary fehlt oder ist leer.');
  }

  return {
    category_scores: normalizedScores,
    detected_patterns: normalizedPatterns,
    priority_intervention: {
      pattern_key: intervention.pattern_key as string,
      label: intervention.label as string,
      reason: intervention.reason as string,
    },
    session_summary: sessionSummary,
  };
}

export const sessionAnalysisService = {
  async upsertPendingAnalysis(params: { sessionId: string; userId: string; transcriptId: string | null }) {
    const { sessionId, userId, transcriptId } = params;

    const { data, error } = await supabaseClient
      .from('session_analyses')
      .upsert(
        {
          session_id: sessionId,
          user_id: userId,
          transcript_id: transcriptId,
          status: 'pending',
        },
        {
          onConflict: 'session_id',
          ignoreDuplicates: false,
        },
      )
      .select('*')
      .single<SessionAnalysisRow>();

    if (error || !data) {
      throw new Error(`Analyse-Record konnte nicht vorbereitet werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapRow(data);
  },

  async markProcessing(params: { sessionId: string; userId: string; transcriptId: string | null }) {
    const { sessionId, userId, transcriptId } = params;

    const { data, error } = await supabaseClient
      .from('session_analyses')
      .update({
        status: 'processing',
        transcript_id: transcriptId,
        last_error: null,
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select('*')
      .single<SessionAnalysisRow>();

    if (error || !data) {
      throw new Error(`Analyse-Status konnte nicht auf processing gesetzt werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapRow(data);
  },

  async markCompleted(params: {
    sessionId: string;
    userId: string;
    transcriptId: string | null;
    analysisVersion: string;
    output: SessionAnalysisOutput;
  }) {
    const { sessionId, userId, transcriptId, analysisVersion, output } = params;
    const settings = await appSettingsService.getSettings();

    const weightedEntries = SESSION_ANALYSIS_CATEGORIES.map((category) => {
      const score = output.category_scores[category].score;
      const weight = settings.categoryWeights[category] ?? 1;
      return {
        score,
        weight: Math.max(0, weight),
      };
    });

    const weightedSum = weightedEntries.reduce((acc, entry) => acc + entry.score * entry.weight, 0);
    const totalWeight = weightedEntries.reduce((acc, entry) => acc + entry.weight, 0);
    const weightedOverall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

    const sessionOrdinal = await getSessionOrdinalForToday(userId);
    const primarySessionIndex = Math.max(1, settings.primaryScoreSessionIndex);
    const scoreMultiplier =
      sessionOrdinal === primarySessionIndex ? 1 : Math.max(0.1, Math.min(1, settings.nonPrimarySessionScoreMultiplier));
    const overall = weightedOverall === null ? null : Math.round(weightedOverall * scoreMultiplier);

    const { data, error } = await supabaseClient
      .from('session_analyses')
      .update({
        status: 'completed',
        transcript_id: transcriptId,
        analysis_version: analysisVersion,
        score_overall: overall,
        category_scores_json: toJson(output.category_scores),
        detected_patterns_json: toJson(output.detected_patterns),
        priority_intervention_json: toJson(output.priority_intervention),
        session_summary: output.session_summary,
        summary: {
          session_summary: output.session_summary,
          settings: {
            score_multiplier: scoreMultiplier,
            session_ordinal_of_day: sessionOrdinal,
            primary_score_session_index: primarySessionIndex,
          },
        },
        metrics: {
          detected_patterns: output.detected_patterns,
        },
        recommendations: [output.priority_intervention],
        last_error: null,
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select('*')
      .single<SessionAnalysisRow>();

    if (error || !data) {
      throw new Error(`Analyse konnte nicht als completed gespeichert werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapRow(data);
  },

  async markFailed(params: { sessionId: string; userId: string; errorMessage: string }) {
    const { sessionId, userId, errorMessage } = params;

    const { data, error } = await supabaseClient
      .from('session_analyses')
      .update({
        status: 'failed',
        last_error: errorMessage,
      })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .select('*')
      .single<SessionAnalysisRow>();

    if (error || !data) {
      throw new Error(`Analyse-Fehlerstatus konnte nicht gespeichert werden: ${error?.message ?? 'Unbekannter Fehler'}`);
    }

    return mapRow(data);
  },

  async getBySessionId(params: { sessionId: string; userId: string }) {
    const { sessionId, userId } = params;

    const { data, error } = await supabaseClient
      .from('session_analyses')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<SessionAnalysisRow>();

    if (error) {
      throw new Error(`Analyse konnte nicht geladen werden: ${error.message}`);
    }

    return data ? mapRow(data) : null;
  },
};
