import type { ConversationSessionStatus } from '@/types/database';
import type { UserRole as AuthUserRole } from '@/types/auth';

// AP1-Konsistenz: Rollen sind systemweit ausschließlich `user | admin`.
export type UserRole = AuthUserRole;

export type SessionProcessingStatusValue = 'pending' | 'processing' | 'completed' | 'failed';

export type ConversationSession = {
  id: string;
  title: string;
  source: string;
  status: ConversationSessionStatus;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  audioFilePath?: string;
  topic?: string;
  language?: string;
  civicsQuestionId?: string;
  audioQuality?: {
    backgroundNoiseLevel?: 'low' | 'medium' | 'high';
    snrEstimateDb?: number;
    confidence?: number;
  };
  processingLastError?: string;
  processing?: {
    transcriptStatus?: SessionProcessingStatusValue;
    analysisStatus?: SessionProcessingStatusValue;
    lastError?: string;
  };
  transcriptStatus: 'pending' | 'ready';
  analysisStatus: 'pending' | 'ready';
};
