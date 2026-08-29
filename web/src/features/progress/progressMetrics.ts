import { extractCategoryScore, type SessionAnalysisCategory } from '@/services/supabase/session-analysis.service';
import type { ImprovementCheckRow, SessionAnalysisRow } from '@/types/database';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function computeCategoryWindowDelta(
  analyses: SessionAnalysisRow[],
  category: SessionAnalysisCategory,
  recentWindow = 3,
  previousWindow = 3,
): number | null {
  const recent = analyses
    .slice(0, recentWindow)
    .map((entry) => extractCategoryScore(entry.category_scores_json, category))
    .filter((v): v is number => typeof v === 'number');
  const older = analyses
    .slice(recentWindow, recentWindow + previousWindow)
    .map((entry) => extractCategoryScore(entry.category_scores_json, category))
    .filter((v): v is number => typeof v === 'number');

  if (!recent.length || !older.length) return null;

  const avgRecent = recent.reduce((sum, score) => sum + score, 0) / recent.length;
  const avgOlder = older.reduce((sum, score) => sum + score, 0) / older.length;

  return Math.round(avgRecent - avgOlder);
}

export function computeSessionDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (typeof current !== 'number' || typeof previous !== 'number') return null;
  return Math.round(current - previous);
}

export function mapImprovementTimeline(improvements: ImprovementCheckRow[]) {
  return improvements
    .map((item) => {
      const payload = asRecord(item.result_payload);
      const baseline = typeof payload.baseline === 'number' ? payload.baseline : null;
      const average = typeof payload.average === 'number' ? payload.average : null;
      const delta = typeof payload.delta === 'number' ? Math.round(payload.delta) : null;
      const status = payload.status;
      const label = payload.label;
      const insufficient = status === 'insufficient_data' || label === 'insufficient_data' || item.status === 'skipped';

      return { id: item.id, createdAt: item.created_at, baseline, average, delta, insufficient };
    })
    .reverse();
}
