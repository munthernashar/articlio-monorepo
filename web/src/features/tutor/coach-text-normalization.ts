function splitShortSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeMicroFeedback(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (/\b(json|prompt|api|token|system|modell|model|runtime|debug|payload)\b/i.test(normalized)) return null;

  const sentences = splitShortSentences(normalized);
  if (sentences.length === 0) return null;
  const trimmedSentences = sentences.slice(0, 2);
  const candidate = trimmedSentences.join(' ').trim();
  if (!candidate || candidate.length > 220) return null;
  return candidate;
}

export function normalizeFollowupQuestion(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  if (/\b(json|prompt|api|token|system|modell|model|runtime|debug|payload)\b/i.test(normalized)) return null;

  const firstSentence = splitShortSentences(normalized)[0]?.trim();
  if (!firstSentence || firstSentence.length > 120) return null;
  return firstSentence;
}

export function isSafeTaskPrompt(text: string): boolean {
  if (text.length < 12 || text.length > 180) return false;
  if (/[{}[\]<>]/.test(text)) return false;
  if (/\b(json|prompt|api|token|system|modell|model|runtime|debug|payload|kpi|gamification|score|streak)\b/i.test(text)) return false;
  if (/\b(chatte|chat|erzähle frei|sag irgend|sprich über alles|frag mich irgend|was denkst du)\b/i.test(text)) return false;
  return true;
}

export function normalizeCompletionLine(text: unknown, maxLength: number): string | null {
  if (typeof text !== 'string') return null;
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maxLength) return null;
  if (/[{}[\]<>]|[0-9]{2,}|[%]/.test(normalized)) return null;
  if (/[\u{1F300}-\u{1FAFF}]/u.test(normalized)) return null;
  if (/\b(json|api|kpi|score|runtime|prompt|token|debug|system|therapie|trauma|heilung|selbsthilfe|diagnose)\b/i.test(normalized)) return null;
  return normalized;
}

export function normalizeTrainedItems(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => normalizeCompletionLine(item, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  return items.length > 0 ? items : null;
}
