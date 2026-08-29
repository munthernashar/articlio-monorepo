export const SCORE_PERCENT_MIN = 0;
export const SCORE_PERCENT_MAX = 100;
export const SCORE_FIVE_MIN = 0;
export const SCORE_FIVE_MAX = 5;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function clampPercentScore(value: number): number {
  return clamp(value, SCORE_PERCENT_MIN, SCORE_PERCENT_MAX);
}

export function clampFivePointScore(value: number): number {
  return clamp(value, SCORE_FIVE_MIN, SCORE_FIVE_MAX);
}

/**
 * Dokumentiertes Mapping für gemischte Skalen:
 * - Analyse/Confidence bleiben in 0-100
 * - Pattern-Severity und Focus-Priority bleiben in 0-5
 */
export function percentToFivePoint(value: number): number {
  const percent = clampPercentScore(value);
  return clampFivePointScore((percent / SCORE_PERCENT_MAX) * SCORE_FIVE_MAX);
}

export function fivePointToPercent(value: number): number {
  const fivePoint = clampFivePointScore(value);
  return clampPercentScore((fivePoint / SCORE_FIVE_MAX) * SCORE_PERCENT_MAX);
}
