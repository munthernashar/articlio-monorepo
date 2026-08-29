export type PricingTableVersion = '2026-04-23';

export type ModelPricing = {
  inputPer1MUsd: number;
  outputPer1MUsd: number;
};

const DEFAULT_PRICING: ModelPricing = {
  inputPer1MUsd: 0,
  outputPer1MUsd: 0,
};

const PRICING_TABLES: Record<PricingTableVersion, Record<string, ModelPricing>> = {
  '2026-04-23': {
    'gpt-4.1': { inputPer1MUsd: 2, outputPer1MUsd: 8 },
    'gpt-4.1-mini': { inputPer1MUsd: 0.4, outputPer1MUsd: 1.6 },
    'gpt-4.1-nano': { inputPer1MUsd: 0.1, outputPer1MUsd: 0.4 },
    'gpt-4o': { inputPer1MUsd: 5, outputPer1MUsd: 15 },
    'gpt-4o-mini': { inputPer1MUsd: 0.15, outputPer1MUsd: 0.6 },
    'o3': { inputPer1MUsd: 2, outputPer1MUsd: 8 },
    'o4-mini': { inputPer1MUsd: 1.1, outputPer1MUsd: 4.4 },
    // Nachtrag (27.08.2026): fehlte hier, obwohl session_analysis (der teuerste Prompt pro
    // Session) seit jeher auf gpt-5-mini läuft -- jede Ausführung wurde deshalb mit 0 $
    // verbucht (resolveModelPricing() fiel auf DEFAULT_PRICING zurück). Werte aus der
    // öffentlichen OpenAI-Preisliste zur gpt-5-Familie, nicht live gegen die echte Rechnung
    // verifiziert -- bei Gelegenheit gegenprüfen.
    'gpt-5-mini': { inputPer1MUsd: 0.25, outputPer1MUsd: 2.0 },
    'gpt-5': { inputPer1MUsd: 1.25, outputPer1MUsd: 10.0 },
  },
};

export const ACTIVE_PRICING_VERSION: PricingTableVersion = '2026-04-23';

function roundUsd(value: number): number {
  return Number(value.toFixed(8));
}

export function resolveModelPricing(model: string, version: PricingTableVersion = ACTIVE_PRICING_VERSION): ModelPricing {
  const pricingTable = PRICING_TABLES[version];
  return pricingTable[model] ?? DEFAULT_PRICING;
}

export function calculateEstimatedCostUsd(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  version?: PricingTableVersion;
}): { estimatedCostUsd: number; pricingVersion: PricingTableVersion } {
  const version = params.version ?? ACTIVE_PRICING_VERSION;
  const pricing = resolveModelPricing(params.model, version);
  const inputCost = (Math.max(0, params.inputTokens) / 1_000_000) * pricing.inputPer1MUsd;
  const outputCost = (Math.max(0, params.outputTokens) / 1_000_000) * pricing.outputPer1MUsd;

  return {
    estimatedCostUsd: roundUsd(inputCost + outputCost),
    pricingVersion: version,
  };
}
