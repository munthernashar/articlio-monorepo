import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, GraduationCap, MessageSquareText, Mic, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { paths } from '@/app/routes/paths';
import { PublicNav } from '@/components/ui/PublicNav';
import { LegalFooter } from '@/components/ui/LegalFooter';
import { ICON_SIZE_MD, ICON_SIZE_SM } from '@/lib/icon-sizes';
import { funnelTracking } from '@/services/analytics/funnel-tracking';

const benefits: Array<{ title: string; text: string; icon: LucideIcon }> = [
  {
    title: 'Sofort wissen, was du sagen sollst',
    text: 'Nach jeder Session bekommst du konkrete Formulierungen, die du gleich im nächsten Gespräch nutzen kannst.',
    icon: MessageSquareText,
  },
  {
    title: 'Messbarer Lernfortschritt statt Bauchgefühl',
    text: 'Du siehst genau, wo du stehst: was du schon gut kannst, woran du gerade arbeitest und was als Nächstes drankommt.',
    icon: TrendingUp,
  },
  {
    title: 'Praxisnahes Coaching für echte Situationen',
    text: 'Ob Bewerbungsgespräch, Kundentermin oder Teammeeting: du übst genau die Situationen, die für dich gerade zählen.',
    icon: Target,
  },
  {
    title: 'Gezielt auf deine Prüfung vorbereiten',
    text: 'Ob Einbürgerungstest, Fachsprachprüfung für Ärzte oder Pflege-Zertifikat: wähle dein Ziel im Profil, und dein Training richtet sich danach aus.',
    icon: GraduationCap,
  },
];

const featureCards = [
  'Dein Coach hört zu und gibt dir sofort Feedback',
  'Jede Session kannst du dir mit Korrekturen noch mal ansehen',
  'Dein Training passt sich deinem Sprachniveau an',
  'Konkrete Tipps, passend zu deinem Gespräch',
  'Du siehst jede Woche, wie du dich entwickelst',
  'Alle deine Sessions sind sicher gespeichert, jederzeit abrufbar',
];

const steps: Array<{ title: string; text: string; icon: LucideIcon }> = [
  { title: '1. Gespräch führen', text: 'Du sprichst frei in realistischen Szenarien statt trockener Theorie.', icon: Mic },
  { title: '2. Feedback bekommen', text: 'Du hörst in Sekunden, was gut lief und woran du noch arbeiten kannst.', icon: Sparkles },
  { title: '3. Sicherer sprechen', text: 'Du übst weiter, bis es sich im echten Gespräch einfach richtig anfühlt.', icon: TrendingUp },
];

export function LandingPage() {
  useEffect(() => {
    funnelTracking.trackFunnelEvent('landing_viewed', { surface: 'landing_page' });
  }, []);

  return (
    <>
      <PublicNav />
      <main className="landing-page">
        <section className="landing-hero-section">
          <div className="landing-hero-glow" />
          <div className="landing-container landing-hero-content">
            <div className="landing-chip">Dein Coach für sicheres Business-Deutsch</div>

            <div className="landing-hero-grid">
              <div>
                <h1 className="landing-hero-title">Kommuniziere klar, selbstbewusst und überzeugend in jedem wichtigen Gespräch.</h1>
                <p className="landing-hero-copy">
                  Du übst echte Gesprächssituationen und bekommst danach genau zu hören, was gut war und was noch
                  nicht -- bis du dich beim Sprechen sicher fühlst.
                </p>

                <div className="landing-hero-actions">
                  <Link className="button" to={paths.auth.register}>
                    Jetzt kostenlos starten
                  </Link>
                  <Link className="button button-secondary" to={paths.public.pricing}>
                    Preise & Pläne ansehen
                  </Link>
                </div>
              </div>

              <aside className="landing-metrics-panel">
                <h2 className="landing-card-title">Warum Lernende Articlio wählen</h2>
                <div className="landing-metrics-list">
                  <article className="landing-metric-card">
                    <p className="landing-metric-value">Spürbar</p>
                    <p className="landing-metric-copy">sicherer und schneller formulieren in realen Gesprächen</p>
                  </article>
                  <article className="landing-metric-card">
                    <p className="landing-metric-value">10 Min</p>
                    <p className="landing-metric-copy">pro Session -- kurz und konzentriert</p>
                  </article>
                  <article className="landing-metric-card">
                    <p className="landing-metric-value">24/7</p>
                    <p className="landing-metric-copy">dein Coach ist da, wenn du Zeit hast</p>
                  </article>
                </div>
              </aside>
            </div>
          </div>
        </section>


        <section className="landing-section">
          <div className="landing-container landing-benefits-grid">
            {benefits.map((benefit) => (
              <article key={benefit.title} className="landing-surface-card">
                <span className="landing-card-icon" aria-hidden="true">
                  <benefit.icon size={ICON_SIZE_MD} />
                </span>
                <h2 className="landing-card-title">{benefit.title}</h2>
                <p className="landing-card-copy">{benefit.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-container landing-deep-panel">
            <p className="landing-kicker">So funktioniert Articlio</p>
            <div className="landing-steps-grid">
              {steps.map((step) => (
                <article key={step.title} className="landing-step-card">
                  <span className="landing-card-icon" aria-hidden="true">
                    <step.icon size={ICON_SIZE_MD} />
                  </span>
                  <h3 className="landing-step-title">{step.title}</h3>
                  <p className="landing-card-copy">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-container landing-surface-card">
            <h2 className="landing-card-title">Alles, was du für dein Training brauchst</h2>
            <ul className="landing-feature-grid">
              {featureCards.map((item) => (
                <li key={item} className="landing-feature-item">
                  <Check aria-hidden="true" size={ICON_SIZE_SM} className="landing-feature-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-section landing-cta-section">
          <div className="landing-container landing-cta-card">
            <h2 className="landing-cta-title">Bereit für Gespräche, die wirklich Ergebnisse bringen?</h2>
            <p className="landing-cta-copy">
              Starte heute mit Articlio -- schon nach der ersten Session merkst du, wie viel leichter dir das
              Sprechen fällt.
            </p>
            <div className="landing-hero-actions">
              <Link className="button" to={paths.auth.register}>Kostenlos registrieren</Link>
              <Link className="button button-secondary" to={paths.auth.login}>Zum Login</Link>
            </div>
          </div>
        </section>

        <LegalFooter />
      </main>
    </>
  );
}
