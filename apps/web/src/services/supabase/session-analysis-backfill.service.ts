import { supabaseClient } from '@/services/supabase/client';
import {
  normalizeSessionAnalysisRow,
} from '@/services/supabase/session-analysis-compat';
import type { Json, SessionAnalysisRow } from '@/types/database';

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isEqualJson(left: Json, right: Json): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasNormalizationDiff(before: SessionAnalysisRow, after: SessionAnalysisRow): boolean {
  return (
    !isEqualJson(before.category_scores_json, after.category_scores_json) ||
    !isEqualJson(before.detected_patterns_json, after.detected_patterns_json) ||
    !isEqualJson(before.priority_intervention_json, after.priority_intervention_json)
  );
}

export const sessionAnalysisBackfillService = {
  async normalizeLegacyJsonColumns(params: { userId?: string; batchSize?: number } = {}) {
    const batchSize = params.batchSize ?? 200;

    let query = supabaseClient
      .from('session_analyses')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (params.userId) {
      query = query.eq('user_id', params.userId);
    }

    const { data, error } = await query.returns<SessionAnalysisRow[]>();

    if (error) {
      throw new Error(`Legacy-Backfill konnte Session-Analysen nicht laden: ${error.message}`);
    }

    const rows = data ?? [];
    const toUpdate = rows
      .map((row) => ({ before: row, after: normalizeSessionAnalysisRow(row) }))
      .filter((pair) => hasNormalizationDiff(pair.before, pair.after));

    for (const pair of toUpdate) {
      const normalized = normalizeSessionAnalysisRow(pair.before);
      const { error: updateError } = await supabaseClient
        .from('session_analyses')
        .update({
          category_scores_json: toJson(normalized.category_scores_json),
          detected_patterns_json: toJson(normalized.detected_patterns_json),
          priority_intervention_json: toJson(normalized.priority_intervention_json),
        })
        .eq('id', pair.before.id);

      if (updateError) {
        throw new Error(`Legacy-Backfill fehlgeschlagen (analysis_id=${pair.before.id}): ${updateError.message}`);
      }
    }

    return {
      scanned: rows.length,
      updated: toUpdate.length,
    };
  },
};
