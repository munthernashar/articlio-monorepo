/**
 * Einwilligungsverwaltung für nicht notwendige Verarbeitungen (§25 Abs. 1
 * TDDDG, Art. 6 Abs. 1 lit. a DSGVO).
 *
 * Betroffen sind ausschließlich die Reichweitenmessung (Funnel-Events,
 * `articlio_funnel_trace_id`) und Vercel Analytics / Speed Insights. Die
 * Anwendung selbst – Auth, Sessions, Zahlung – braucht keine Einwilligung,
 * weil sie technisch notwendig ist, und ist von dieser Gate nicht betroffen.
 *
 * Ohne explizite Entscheidung ('granted') bleibt jede analytische
 * Verarbeitung aus. Das ist die Standardeinstellung, nicht ein Sonderfall.
 */

const CONSENT_STORAGE_KEY = 'articlio_consent_analytics';

export type ConsentState = 'granted' | 'denied' | null;

type Listener = (state: ConsentState) => void;

const listeners = new Set<Listener>();

function readStoredConsent(): ConsentState {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

let currentState: ConsentState = readStoredConsent();

function notify() {
  listeners.forEach((listener) => listener(currentState));
}

export const consentService = {
  getState(): ConsentState {
    return currentState;
  },

  hasDecided(): boolean {
    return currentState !== null;
  },

  isAnalyticsAllowed(): boolean {
    return currentState === 'granted';
  },

  grant(): void {
    currentState = 'granted';
    window.localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    notify();
  },

  deny(): void {
    currentState = 'denied';
    window.localStorage.setItem(CONSENT_STORAGE_KEY, 'denied');
    notify();
  },

  /** Setzt die Entscheidung zurück, sodass der Dialog erneut erscheint. */
  reset(): void {
    currentState = null;
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    notify();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const OPEN_SETTINGS_EVENT = 'articlio:open-consent-settings';

/** Von `LegalFooter` aufgerufen, um den Dialog erneut zu öffnen. */
export function openConsentSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
}

export function onOpenConsentSettings(handler: () => void): () => void {
  window.addEventListener(OPEN_SETTINGS_EVENT, handler);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler);
}
