import { Check } from 'lucide-react';
import { ICON_SIZE_SM } from '@/lib/icon-sizes';

type PlanFeatureListProps = {
  features: readonly string[];
};

/** Gemeinsame Darstellung der Plan-Leistungen für die öffentliche Preisseite
 *  und die Abo-Seite - beide rendern dieselbe features-Liste. */
export function PlanFeatureList({ features }: PlanFeatureListProps) {
  return (
    <ul className="plan-feature-list">
      {features.map((feature) => (
        <li key={feature} className="plan-feature-item">
          <Check aria-hidden="true" size={ICON_SIZE_SM} className="plan-feature-icon" />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}
