import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';
import { consentService, onOpenConsentSettings, type ConsentState } from '@/services/consent/consent.service';

const CONSENT_BANNER_SPACE_PROPERTY = '--consent-banner-space';

/**
 * Einwilligungsdialog für Reichweitenmessung. Erscheint, solange keine
 * Entscheidung vorliegt, und erneut, wenn Nutzer über den Footer-Link
 * "Cookie-Einstellungen" ihre Wahl ändern wollen.
 *
 * Kein Dark Pattern: Annehmen und Ablehnen sind gleich gestaltet, keine
 * vorausgewählte Zustimmung, kein Wegklicken ohne Entscheidung nötig.
 */
export function ConsentBanner() {
  const [state, setState] = useState<ConsentState>(() => consentService.getState());
  const [isOpen, setIsOpen] = useState(() => !consentService.hasDecided());
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => consentService.subscribe(setState), []);
  useEffect(() => onOpenConsentSettings(() => setIsOpen(true)), []);

  // Reserviert am unteren Seitenrand genau so viel Platz, wie das fixierte
  // Banner tatsächlich einnimmt, damit es auf kurzen Seiten keine
  // darunterliegenden interaktiven Elemente unklickbar verdeckt (z. B. den
  // zweiten CTA-Button auf /preise).
  useEffect(() => {
    if (!isOpen) {
      document.body.style.removeProperty(CONSENT_BANNER_SPACE_PROPERTY);
      return;
    }

    const node = bannerRef.current;
    if (!node) return;

    const updateSpace = () => {
      const rect = node.getBoundingClientRect();
      document.body.style.setProperty(CONSENT_BANNER_SPACE_PROPERTY, `${Math.ceil(rect.height + 24)}px`);
    };

    updateSpace();
    const observer = new ResizeObserver(updateSpace);
    observer.observe(node);
    window.addEventListener('resize', updateSpace);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSpace);
      document.body.style.removeProperty(CONSENT_BANNER_SPACE_PROPERTY);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAccept = () => {
    consentService.grant();
    setIsOpen(false);
  };

  const handleDecline = () => {
    consentService.deny();
    setIsOpen(false);
  };

  return (
    <div ref={bannerRef} className="consent-banner" role="dialog" aria-modal="false" aria-labelledby="consent-heading">
      <div className="consent-banner-body">
        <p id="consent-heading" className="consent-banner-title">
          Wir messen die Nutzung nur mit deiner Einwilligung
        </p>
        <p className="consent-banner-text">
          Mit deiner Zustimmung erfassen wir anonymisierte Nutzungsstatistiken, um Articlio zu
          verbessern. Ohne Zustimmung nutzen wir keine Analyse-Tools. Details in der{' '}
          <Link to={paths.legal.privacy}>Datenschutzerklärung</Link>.
        </p>
      </div>
      <div className="consent-banner-actions">
        <button type="button" className="button button-secondary" onClick={handleDecline}>
          Ablehnen
        </button>
        <button type="button" className="button" onClick={handleAccept}>
          Annehmen
        </button>
      </div>
      {state !== null ? (
        <p className="consent-banner-current">
          Aktuelle Einstellung: {state === 'granted' ? 'Messung erlaubt' : 'Messung abgelehnt'}
        </p>
      ) : null}
    </div>
  );
}
