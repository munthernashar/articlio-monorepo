import type { BillingPlanContract } from '@/services/api/contracts';

const formatFeatureKey = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());

const formatLimitEntry = (limitKey: string, limitValue: number) => {
  if (limitKey === 'sessionsPerDay') {
    return limitValue === 1 ? '1 Session pro Tag' : `Bis zu ${limitValue} Sessions pro Tag`;
  }

  if (limitKey === 'maxSessionLengthMinutes') {
    return `Session-Länge bis ${limitValue} Minuten`;
  }

  return `${formatFeatureKey(limitKey)}: ${limitValue}`;
};

const FEATURE_FLAG_LABELS: Record<string, string> = {
  progress_overview: 'Fortschrittsübersicht',
  learning_history: 'Lernhistorie',
  priority_analysis: 'Priorisierte Analyse',
  coach_access: 'Strukturierter KI-Coach mit persönlichen Trainingspfaden',
  lernpfade_access: 'Lernpfade für Prüfungen & Zertifikate',
};

const formatFeatureFlagEntry = (featureKey: string) => FEATURE_FLAG_LABELS[featureKey] ?? formatFeatureKey(featureKey);

export type BillingPlanUiModel = {
  key: BillingPlanContract['planKey'];
  name: string;
  price: string;
  note: string;
  features: string[];
};

/**
 * PAngV: Endpreise gegenüber Verbrauchern müssen die Umsatzsteuer enthalten
 * und das kenntlich machen. `price_label` kommt aus dem zentralen
 * Plan-Katalog (DB) oder dem Fallback-Katalog und ist bereits ein
 * Bruttopreis; hier wird nur der Pflichthinweis ergänzt, unabhängig vom
 * konkreten Betrag – damit bleibt die Anzeige auch bei Preisänderungen
 * korrekt, ohne dass dieser Hinweis vergessen werden kann.
 */
function withVatNote(priceLabel: string): string {
  const trimmed = priceLabel.trim();
  if (/mwst/i.test(trimmed) || /umsatzsteuer/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} · inkl. MwSt.`;
}

export function mapPlanContractToUiModel(plan: BillingPlanContract): BillingPlanUiModel {
  return {
    key: plan.planKey,
    name: plan.displayName,
    price: withVatNote(plan.priceLabel),
    note: plan.note,
    features: [
      ...Object.entries(plan.limits).map(([limitKey, limitValue]) => formatLimitEntry(limitKey, limitValue)),
      ...Object.entries(plan.featureFlags)
        .filter(([, isEnabled]) => isEnabled)
        .map(([featureKey]) => formatFeatureFlagEntry(featureKey)),
    ],
  };
}
