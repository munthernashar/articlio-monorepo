import type { OvercorrectionGuardPolicy } from '@/services/ai/types';

type GuardResult = {
  output: unknown;
  normalized: boolean;
  violations: string[];
};

const DEFAULT_POLICY: Required<
  Pick<
    OvercorrectionGuardPolicy,
    'maxCorrections' | 'maxNextSteps' | 'maxTutorFollowupQuestions' | 'maxTutorTopicMarkers' | 'maxItemTextLength' | 'focusMode'
  >
> = {
  maxCorrections: 3,
  maxNextSteps: 2,
  maxTutorFollowupQuestions: 1,
  maxTutorTopicMarkers: 2,
  maxItemTextLength: 260,
  focusMode: 'top_impact_first',
};

const DEFAULT_TUTOR_FIELDS = ['followup_question', 'next_question', 'check_question'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > maxLength ? `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : trimmed;
}

function correctionImpactScore(item: unknown): number {
  if (!isRecord(item)) {
    return 0;
  }

  if (typeof item.severity === 'number') {
    return item.severity;
  }

  if (typeof item.impact === 'string') {
    const impact = item.impact.toLowerCase();
    if (impact === 'high') return 3;
    if (impact === 'medium') return 2;
    if (impact === 'low') return 1;
  }

  return 0;
}

function normalizeCorrections(
  corrections: unknown,
  maxCorrections: number,
  maxItemTextLength: number,
  focusMode: OvercorrectionGuardPolicy['focusMode'],
): { value: unknown; changed: boolean; violation?: string } {
  if (!Array.isArray(corrections)) {
    return { value: corrections, changed: false };
  }

  const normalizedItems = corrections
    .filter(isRecord)
    .map((item) => ({
      ...item,
      original: sanitizeText(item.original, maxItemTextLength),
      corrected: sanitizeText(item.corrected, maxItemTextLength),
      reason: sanitizeText(item.reason, maxItemTextLength),
    }))
    .filter((item) => item.original && item.corrected && item.reason);

  const sorted =
    focusMode === 'top_impact_first'
      ? [...normalizedItems].sort((a, b) => correctionImpactScore(b) - correctionImpactScore(a))
      : normalizedItems;

  const limited = sorted.slice(0, maxCorrections);
  const changed = limited.length !== corrections.length || JSON.stringify(limited) !== JSON.stringify(corrections);

  return {
    value: limited,
    changed,
    violation:
      corrections.length > maxCorrections
        ? `Zu viele corrections (${corrections.length} > ${maxCorrections}); auf Top-Fehler gekürzt.`
        : undefined,
  };
}

function normalizeStringArray(value: unknown, maxItems: number, maxItemTextLength: number): {
  value: unknown;
  changed: boolean;
  violation?: string;
} {
  if (!Array.isArray(value)) {
    return { value, changed: false };
  }

  const normalized = value
    .map((entry) => sanitizeText(entry, maxItemTextLength))
    .filter((entry) => entry.length > 0)
    .slice(0, maxItems);

  return {
    value: normalized,
    changed: JSON.stringify(normalized) !== JSON.stringify(value),
    violation:
      value.length > maxItems ? `Zu viele Einträge (${value.length} > ${maxItems}); Liste wurde gekürzt.` : undefined,
  };
}

function normalizeTutorField(value: unknown, maxQuestions: number, maxItemTextLength: number): {
  value: unknown;
  changed: boolean;
  violation?: string;
} {
  if (Array.isArray(value)) {
    return normalizeStringArray(value, maxQuestions, maxItemTextLength);
  }

  if (typeof value !== 'string') {
    return { value, changed: false };
  }

  const questions = value
    .split('?')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part}?`)
    .slice(0, maxQuestions);

  const fallback = sanitizeText(value, maxItemTextLength);
  const normalized = questions.length > 0 ? sanitizeText(questions.join(' '), maxItemTextLength) : fallback;

  return {
    value: normalized,
    changed: normalized !== value,
    violation: questions.length > maxQuestions ? `Zu viele Tutor-Followups; auf ${maxQuestions} begrenzt.` : undefined,
  };
}

function applyTutorTopicMarkerGuard(
  output: Record<string, unknown>,
  fields: string[],
  maxTopicMarkers: number,
  maxItemTextLength: number,
): { changed: boolean; violations: string[] } {
  const topicMarkerPattern = /\b(außerdem|zusätzlich|anderes\s+thema|neues\s+thema|noch\s+ein\s+thema|themawechsel)\b/gi;
  const text = fields
    .map((field) => (typeof output[field] === 'string' ? output[field] : ''))
    .filter(Boolean)
    .join(' ');
  const markerMatches = text.match(topicMarkerPattern) ?? [];
  if (markerMatches.length <= maxTopicMarkers) {
    return { changed: false, violations: [] };
  }

  let changed = false;
  for (const field of fields) {
    if (typeof output[field] !== 'string') {
      continue;
    }
    const firstSentence = output[field].split(/[.!?]/)[0] ?? output[field];
    const sanitized = sanitizeText(firstSentence, maxItemTextLength);
    if (sanitized && sanitized !== output[field]) {
      output[field] = sanitized;
      changed = true;
    }
  }

  return {
    changed,
    violations: [`Zu viele neue Themenmarker (${markerMatches.length} > ${maxTopicMarkers}); Tutor-Output wurde fokussiert.`],
  };
}

export function applyOvercorrectionGuard(output: unknown, policy?: OvercorrectionGuardPolicy): GuardResult {
  if (!policy || !isRecord(output)) {
    return { output, normalized: false, violations: [] };
  }

  const merged = {
    ...DEFAULT_POLICY,
    ...policy,
  };
  const tutorFields = merged.tutorFollowupFields ?? DEFAULT_TUTOR_FIELDS;

  const nextOutput: Record<string, unknown> = { ...output };
  const violations: string[] = [];
  let changed = false;

  if (typeof merged.maxCorrections === 'number' && 'corrections' in nextOutput) {
    const result = normalizeCorrections(
      nextOutput.corrections,
      merged.maxCorrections,
      merged.maxItemTextLength,
      merged.focusMode,
    );
    nextOutput.corrections = result.value;
    changed = changed || result.changed;
    if (result.violation) {
      violations.push(result.violation);
    }
  }

  if (typeof merged.maxNextSteps === 'number' && 'next_steps' in nextOutput) {
    const result = normalizeStringArray(nextOutput.next_steps, merged.maxNextSteps, merged.maxItemTextLength);
    nextOutput.next_steps = result.value;
    changed = changed || result.changed;
    if (result.violation) {
      violations.push(result.violation);
    }
  }

  if (typeof merged.maxTutorFollowupQuestions === 'number') {
    for (const field of tutorFields) {
      if (!(field in nextOutput)) {
        continue;
      }
      const result = normalizeTutorField(
        nextOutput[field],
        merged.maxTutorFollowupQuestions,
        merged.maxItemTextLength,
      );
      nextOutput[field] = result.value;
      changed = changed || result.changed;
      if (result.violation) {
        violations.push(`${field}: ${result.violation}`);
      }
    }
  }

  if (typeof merged.maxTutorTopicMarkers === 'number') {
    const topicGuard = applyTutorTopicMarkerGuard(
      nextOutput,
      tutorFields,
      merged.maxTutorTopicMarkers,
      merged.maxItemTextLength,
    );
    changed = changed || topicGuard.changed;
    violations.push(...topicGuard.violations);
  }

  return {
    output: changed ? nextOutput : output,
    normalized: changed,
    violations,
  };
}
