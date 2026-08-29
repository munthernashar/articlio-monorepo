import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

/**
 * Fängt Render-Fehler irgendwo im Baum ab, statt die App auf einen weißen
 * Bildschirm einfrieren zu lassen. Nutzt ein einfaches <a href> statt
 * react-router's <Link>, damit die Fallback-UI auch dann funktioniert, wenn
 * der Fehler innerhalb des Router-Kontexts selbst aufgetreten ist.
 */
export function ErrorBoundary({ children }: Props) {
  return (
    <Sentry.ErrorBoundary
      fallback={() => (
        <div className="centered-page">
          <h1>Etwas ist hier stehengeblieben</h1>
          <p>Diese Seite konnte nicht geladen werden. Ein Neuladen behebt das meistens.</p>
          <a className="button" href="/">
            Seite neu laden
          </a>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
