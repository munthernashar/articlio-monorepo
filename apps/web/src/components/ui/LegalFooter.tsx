import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';
import { openConsentSettings } from '@/services/consent/consent.service';

/**
 * Rechtlicher Fußbereich für alle öffentlichen Seiten. Verlinkt die vier
 * Pflichtseiten und öffnet erneut den Cookie-Dialog, falls Nutzer ihre
 * Einwilligung nachträglich ändern wollen.
 */
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="Rechtliches">
        <Link to={paths.legal.imprint}>Impressum</Link>
        <Link to={paths.legal.privacy}>Datenschutz</Link>
        <Link to={paths.legal.terms}>AGB</Link>
        <Link to={paths.legal.withdrawal}>Widerruf</Link>
        <button type="button" className="legal-footer-consent" onClick={openConsentSettings}>
          Cookie-Einstellungen
        </button>
      </nav>
    </footer>
  );
}
