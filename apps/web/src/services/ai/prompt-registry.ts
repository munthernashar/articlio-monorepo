import type { PromptDefinition, PromptRegistryStore } from '@/services/ai/types';

/**
 * Parst ausschließlich Legacy-Eingangs-Identifier in ihre kanonische Basis.
 * Keine allgemeine Prompt-Auflösung, nur Input-Normalisierung für alte Formate.
 */
function parseLegacyPromptIdentifier(legacyPromptIdentifier: string): { promptKeyBase: string } | null {
  const legacyMatch = /^(?<promptKeyBase>.+)_v\d+$/.exec(legacyPromptIdentifier);
  const promptKeyBase = legacyMatch?.groups?.promptKeyBase;

  if (!promptKeyBase) {
    return null;
  }

  return { promptKeyBase };
}

/**
 * Legacy-Kompatibilitätsschicht für eingehende Prompt-Identifier.
 * Diese Logik lebt bewusst außerhalb des Registry-Kerninterfaces.
 */
export function resolveLegacyPromptKey(promptIdentifier: string): string {
  const parsedLegacyPromptIdentifier = parseLegacyPromptIdentifier(promptIdentifier);
  if (parsedLegacyPromptIdentifier) {
    return parsedLegacyPromptIdentifier.promptKeyBase;
  }

  return promptIdentifier;
}

export class PromptRegistry implements PromptRegistryStore {
  /**
   * KANONISCHES REGISTRY-MODELL
   * - intern wird ausschließlich mit `promptKey` gearbeitet
   * - jede Definition ist eindeutig über `promptKey` identifiziert
   */
  private readonly byPromptKey = new Map<string, PromptDefinition>();

  constructor(prompts: PromptDefinition[]) {
    prompts.forEach((prompt) => {
      this.byPromptKey.set(prompt.promptKey, prompt);
    });
  }

  getPromptByKey(promptKey: string): PromptDefinition | null {
    return this.byPromptKey.get(promptKey) ?? null;
  }

  listPrompts(): PromptDefinition[] {
    return [...this.byPromptKey.values()];
  }
}

export const promptRegistry = new PromptRegistry([]);
