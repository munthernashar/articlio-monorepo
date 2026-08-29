export const TOPIC_TEMPLATES = [
  'Ein schwieriges Gespräch bei der Arbeit',
  'Eine Reise, die dich geprägt hat',
  'Gesundheit und Alltag: kleine Routinen',
  'Ein technisches Problem einfach erklären',
  'Feedback geben und annehmen',
  'Konfliktlösung im Team',
  'Bewerbungsgespräch: Stärken und Beispiele',
  'Ein Kunde hat eine Beschwerde – wie reagierst du?',
  'Was du diese Woche gelernt hast',
  'Ein Ziel für die nächsten 30 Tage',
] as const;

export function pickRandomTopic(exclude: string[] = []): string {
  const blocked = new Set(exclude.map((item) => item.toLocaleLowerCase('de-DE')));
  const candidates = TOPIC_TEMPLATES.filter((item) => !blocked.has(item.toLocaleLowerCase('de-DE')));
  const pool = candidates.length > 0 ? candidates : [...TOPIC_TEMPLATES];
  return pool[Math.floor(Math.random() * pool.length)] ?? TOPIC_TEMPLATES[0];
}
