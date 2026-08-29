import type { ConversationSessionRow, Json } from '@/types/database';

const AI_ELIGIBLE_QUALITY_GATE_STATUSES = new Set(['valid', 'capped', 'approved', 'completed_capped']);

function asRecord(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function isAiEligibleSession(session: Pick<ConversationSessionRow, 'status' | 'metadata'> | null | undefined): boolean {
  if (!session) return false;
  const metadata = asRecord(session.metadata);
  const qualityGate = asRecord(metadata.qualityGate as Json);
  const status = qualityGate.status;

  if (typeof status === 'string' && AI_ELIGIBLE_QUALITY_GATE_STATUSES.has(status)) {
    return true;
  }

  if (typeof session.status !== 'string') {
    return true;
  }

  return session.status === 'completed' || session.status === 'completed_capped';
}
