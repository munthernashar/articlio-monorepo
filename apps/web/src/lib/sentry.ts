import * as Sentry from '@sentry/react';
import { appConfig } from '@/lib/config';

/**
 * Ohne VITE_SENTRY_DSN bleibt Sentry vollständig inaktiv -- kein Netzwerk-Aufruf,
 * kein Fehler. Sobald ein Projekt-DSN gesetzt wird, greift Error-Tracking ohne
 * weiteren Code-Eingriff (Launch-Readiness-Audit, Zwölfter Nachtrag: keinerlei
 * Sichtbarkeit auf Produktionsfehler war der schwerwiegendste Technik-Befund).
 */
export function initSentry(): void {
  if (!appConfig.sentry.dsn) {
    return;
  }

  Sentry.init({
    dsn: appConfig.sentry.dsn,
    environment: appConfig.env,
    tracesSampleRate: 0,
  });
}
