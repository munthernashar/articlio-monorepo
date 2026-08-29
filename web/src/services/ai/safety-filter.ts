export type SafetySeverity = 'low' | 'medium' | 'high';

export type SafetyFlag = {
  ruleId: string;
  label: string;
  language: 'de' | 'en';
  severity: SafetySeverity;
  path: string;
  match: string;
};

type SafetyRule = {
  ruleId: string;
  label: string;
  language: 'de' | 'en';
  severity: SafetySeverity;
  pattern: RegExp;
};

const OFFENSIVE_LANGUAGE_RULES: SafetyRule[] = [
  {
    ruleId: 'de-abwertend-idiot',
    label: 'Abwertende Beleidigung',
    language: 'de',
    severity: 'medium',
    pattern: /\bidiot(?:en|isch|in)?\b/giu,
  },
  {
    ruleId: 'de-abwertend-dumm',
    label: 'Abwertende Sprache',
    language: 'de',
    severity: 'medium',
    pattern: /\bdumm(?:kopf|e?r?)?\b/giu,
  },
  {
    ruleId: 'de-beleidigung-arrogant',
    label: 'Direkte Beleidigung',
    language: 'de',
    severity: 'high',
    pattern: /\b(halt\s+die\s+klappe|verpiss\s*dich|fick\s*dich|arschloch)\b/giu,
  },
  {
    ruleId: 'en-insult-idiot',
    label: 'Insulting language',
    language: 'en',
    severity: 'medium',
    pattern: /\bidiot(?:ic)?\b/giu,
  },
  {
    ruleId: 'en-insult-stupid',
    label: 'Insulting language',
    language: 'en',
    severity: 'medium',
    pattern: /\b(stupid|moron|dumb(?:ass)?)\b/giu,
  },
  {
    ruleId: 'en-profanity',
    label: 'Profanity / abuse',
    language: 'en',
    severity: 'high',
    pattern: /\b(fuck\s*you|asshole|bitch)\b/giu,
  },
];

function walkStrings(value: unknown, visitor: (path: string, text: string) => void, path = '$output'): void {
  if (typeof value === 'string') {
    visitor(path, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      walkStrings(entry, visitor, `${path}[${index}]`);
    });
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      walkStrings(nested, visitor, `${path}.${key}`);
    });
  }
}

export function detectOffensiveLanguage(value: unknown): SafetyFlag[] {
  const flags: SafetyFlag[] = [];

  walkStrings(value, (path, text) => {
    for (const rule of OFFENSIVE_LANGUAGE_RULES) {
      const matches = text.matchAll(rule.pattern);
      for (const match of matches) {
        if (!match[0]) {
          continue;
        }
        flags.push({
          ruleId: rule.ruleId,
          label: rule.label,
          language: rule.language,
          severity: rule.severity,
          path,
          match: match[0],
        });
      }
    }
  });

  return flags;
}

export const SAFE_RESPONSE_MESSAGE =
  'Ich kann hier keine beleidigende oder abwertende Formulierung ausgeben. Bitte formuliere neutral und respektvoll.';
