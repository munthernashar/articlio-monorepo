import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';
import { PublicNav } from '@/components/ui/PublicNav';
import { LegalFooter } from '@/components/ui/LegalFooter';

const featureHighlights = [
  {
    title: 'Realistische Gesprächssimulation',
    description: 'Trainiere Alltagssituationen wie Arztbesuch, Behördengang oder Small Talk mit dialogbasiertem KI-Feedback.',
  },
  {
    title: 'Klare Fortschrittsanalyse',
    description: 'Erhalte strukturierte Hinweise zu Ausdruck, Grammatik, Redefluss und wiederkehrenden Mustern.',
  },
  {
    title: 'Fokus auf relevante Schwächen',
    description: 'Articlio priorisiert typische Fehler und begleitet dich mit Übungen, bis sie stabil verbessert sind.',
  },
  {
    title: 'Lernpfade für Prüfungen und Zertifikate',
    description: 'Wähle dein Ziel – DTZ, Einbürgerung, Ehegattennachzug, Fachsprachprüfung für Ärzte, Pflege-Zertifikat, Leben in Deutschland oder ein allgemeines Zertifikat – und dein Training richtet sich danach aus.',
  },
  {
    title: 'Lernen im eigenen Tempo',
    description: 'Kurze Sessions für den Alltag oder längere Trainingsblöcke – abgestimmt auf deinen Lernrhythmus.',
  },
];

export function FeaturesPage() {
  return (
    <>
      <PublicNav />
      <main className="app-main page public-page">
        <header className="public-page-hero">
          <p className="public-kicker">Warum Articlio</p>
          <h1>Features, die aus Üben echte Sprechsicherheit machen</h1>
          <p>
            Articlio kombiniert KI-gestützte Gespräche mit persönlichem Lernfokus, damit Deutsch im Alltag schneller natürlich wird.
          </p>
        </header>

        <section className="public-grid">
          {featureHighlights.map((feature) => (
            <article key={feature.title} className="card public-card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </section>

        <section className="card public-cta">
          <h2>Bereit für den nächsten Sprachsprung?</h2>
          <p>Sieh dir die Preise und enthaltenen Leistungen an oder starte direkt mit der Registrierung.</p>
          <div className="button-row">
            <Link className="button button-secondary" to={paths.public.pricing}>
              Zu den Preisen
            </Link>
            <Link className="button" to={paths.auth.register}>
              Jetzt registrieren
            </Link>
          </div>
        </section>

        <LegalFooter />
      </main>
    </>
  );
}
