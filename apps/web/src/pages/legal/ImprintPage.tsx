import { PublicNav } from '@/components/ui/PublicNav';
import { LegalFooter } from '@/components/ui/LegalFooter';
import { LegalFact } from '@/pages/legal/LegalFact';
import { provider } from '@/content/legal/provider';

/**
 * Impressum nach §5 DDG.
 *
 * Die Pflicht trifft OpenBrain LLC trotz US-Sitz, weil der Dienst gezielt an
 * Nutzer in Deutschland gerichtet ist (deutschsprachig, Preise in Euro,
 * deutsche Zahlungsarten). Der Gründungsstaat und die File Number treten an
 * die Stelle von Handelsregister und Registernummer.
 */
export function ImprintPage() {
  return (
    <>
      <PublicNav />
      <main className="app-main page public-page legal-page">
        <header className="public-page-hero">
          <p className="public-kicker">Rechtliches</p>
          <h1>Impressum</h1>
          <p>Angaben gemäß §5 Digitale-Dienste-Gesetz (DDG).</p>
        </header>

        <article className="card public-card legal-card">
          <h2>Anbieter</h2>
          <p>
            {provider.legalName}
            <br />
            <LegalFact value={provider.street} />
            <br />
            <LegalFact value={provider.city} />
            <br />
            {provider.country}
          </p>

          <h2>Rechtsform und Registrierung</h2>
          <p>
            Rechtsform: {provider.legalForm}
            <br />
            Gründungsstaat: <LegalFact value={provider.incorporationState} />
            <br />
            Registernummer (File Number): <LegalFact value={provider.registrationNumber} />
          </p>

          <h2>Vertretungsberechtigt</h2>
          <p>
            <LegalFact value={provider.representative} />
          </p>

          <h2>Kontakt</h2>
          <p>
            E-Mail: <LegalFact value={provider.email} />
          </p>
          <p className="legal-note">
            Anfragen zum Vertrag und zur Nutzung beantworten wir unter{' '}
            <LegalFact value={provider.supportEmail} /> zeitnah und unmittelbar.
          </p>

          <h2>Umsatzsteuer</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer bzw. Registrierungsnummer im Nicht-EU-OSS-Verfahren:{' '}
            <LegalFact value={provider.vatId} />
          </p>

          <h2>Vertreter in der Europäischen Union</h2>
          <p>
            Vertreter nach Art. 27 DSGVO für Betroffene in der Europäischen Union:
            <br />
            <LegalFact value={provider.euRepresentativeName} />
            <br />
            <LegalFact value={provider.euRepresentativeAddress} />
            <br />
            E-Mail: <LegalFact value={provider.euRepresentativeEmail} />
          </p>

          <h2>Verantwortlich für den Inhalt</h2>
          <p>
            <LegalFact value={provider.representative} />, Anschrift wie oben.
          </p>

          <h2>Verbraucherstreitbeilegung</h2>
          <p>
            Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen (§36 Verbraucherstreitbeilegungsgesetz).
          </p>
          <p className="legal-note">
            Die Online-Streitbeilegungsplattform der Europäischen Kommission wurde zum 20. Juli 2025
            eingestellt. Ein Verweis darauf entfällt deshalb.
          </p>

          <h2>Haftung für Inhalte und Links</h2>
          <p>
            Für eigene Inhalte auf diesen Seiten sind wir nach den allgemeinen Gesetzen
            verantwortlich. Unser Angebot enthält Verweise auf externe Websites Dritter, auf deren
            Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte übernehmen wir keine
            Gewähr; verantwortlich ist stets der jeweilige Anbieter oder Betreiber. Werden uns
            Rechtsverletzungen bekannt, entfernen wir die betreffenden Verweise umgehend.
          </p>
        </article>

        <LegalFooter />
      </main>
    </>
  );
}
