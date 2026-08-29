import { SESSION_PROCESSING_LIMITS } from '@/lib/config';

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function charCount(text: string): number {
  return text.trim().length;
}

export function capTranscript(text: string): string {
  const cappedByChars = text.slice(0, SESSION_PROCESSING_LIMITS.maxTranscriptCharacters);
  const words = cappedByChars.trim().split(/\s+/).filter(Boolean);
  if (words.length <= SESSION_PROCESSING_LIMITS.maxTranscriptWords) {
    return cappedByChars;
  }
  return words.slice(0, SESSION_PROCESSING_LIMITS.maxTranscriptWords).join(' ');
}
