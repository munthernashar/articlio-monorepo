import { isMissing, type ProviderFact } from '@/content/legal/provider';

/**
 * Rendert eine Betreiberangabe. Fehlt sie, erscheint statt einer erfundenen
 * Angabe ein deutlich sichtbarer Hinweis, welche Information beschafft werden
 * muss. Eine falsche Pflichtangabe im Impressum ist schlimmer als eine
 * erkennbar offene.
 */
export function LegalFact({ value }: { value: ProviderFact }) {
  if (isMissing(value)) {
    return (
      <mark className="legal-missing" role="note">
        Angabe erforderlich: {value.label}
      </mark>
    );
  }

  return <>{value}</>;
}
