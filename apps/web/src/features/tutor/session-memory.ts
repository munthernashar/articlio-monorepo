import type { SessionMemory } from '@/services/coach/coach.types';

const SESSION_MEMORY_STORAGE_KEY = 'articlio.coach.path-memory.v1';

export function createPathKey(topicTitle?: string): string {
  return (topicTitle || 'general').trim().toLowerCase();
}

export function readSessionMemory(pathKey: string): SessionMemory | null {
  try {
    const raw = window.localStorage.getItem(SESSION_MEMORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, SessionMemory>;
    return parsed[pathKey] ?? null;
  } catch {
    return null;
  }
}

export function writeSessionMemory(memory: SessionMemory) {
  try {
    const raw = window.localStorage.getItem(SESSION_MEMORY_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, SessionMemory>) : {};
    parsed[memory.pathKey] = memory;
    window.localStorage.setItem(SESSION_MEMORY_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore persistence errors
  }
}
