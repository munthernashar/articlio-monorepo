const ASSISTANT_LANGUAGE_PATTERNS = [/\bals ki\b/i, /\bki-assistent\w*\b/i, /\bi can help\b/i];
const GAMIFICATION_PATTERNS = [/\bpunkte\b/i, /\bscore\b/i, /\bstreak\b/i, /\blevel\b/i, /\bbadge\b/i];
const KPI_LANGUAGE_PATTERNS = [/\bkpi\b/i, /\bperformance\b/i, /\bbenchmark\b/i, /\bconversion\b/i, /\bvelocity\b/i];
const THERAPY_LANGUAGE_PATTERNS = [/\btrauma\b/i, /\bheilung\b/i, /\binneres kind\b/i, /\bselbstwert\b/i];
const MOTIVATIONAL_CLICHE_PATTERNS = [/\bdu schaffst das\b/i, /\bgib nicht auf\b/i, /\bbleib dran\b/i];
const OPEN_CHAT_PATTERNS = [/\berzähl mir .*\b/i, /\bworüber möchtest du reden\b/i, /\bfrag mich alles\b/i];

export const isCalmCoachCopy = (text: string): boolean => {
  const exclamationCount = (text.match(/!/g) ?? []).length;
  return exclamationCount <= 1 && !/\b(super|mega|wow)\b/i.test(text);
};

export const containsGamificationLanguage = (text: string): boolean =>
  GAMIFICATION_PATTERNS.some((pattern) => pattern.test(text));

export const containsAssistantLanguage = (text: string): boolean =>
  ASSISTANT_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));

export const containsKpiLanguage = (text: string): boolean =>
  KPI_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));

export const containsTherapyLanguage = (text: string): boolean =>
  THERAPY_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));

export const containsMotivationalCliches = (text: string): boolean =>
  MOTIVATIONAL_CLICHE_PATTERNS.some((pattern) => pattern.test(text));

export const containsOpenChatPrompt = (text: string): boolean =>
  OPEN_CHAT_PATTERNS.some((pattern) => pattern.test(text));

export const containsEmojis = (text: string): boolean => /\p{Extended_Pictographic}/u.test(text);

export const isTooLong = (text: string, maxWords = 90): boolean => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > maxWords;
};
