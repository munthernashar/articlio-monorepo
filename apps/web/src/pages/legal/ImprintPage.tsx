import { Link } from 'react-router-dom'

export function ImprintPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/" style={{ color: '#666', marginBottom: '1rem', display: 'block' }}>← Zurück</Link>
        <h1 style={{ fontSize: '2rem' }}>Impressum</h1>
      </header>

      <article style={{ lineHeight: '1.8' }}>
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Angaben gemäß § 5 TMG</h2>
          <p>
            Articlio GmbH<br />
            Musterstra ße 1<br />
            80331 München<br />
            Deutschland
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Kontakt</h2>
          <p>
            E-Mail: info@articlio.de<br />
            Telefon: +49 89 12345678
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Vertreten durch</h2>
          <p>
            Max Mustermann (Gesch äftsf ührer)
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Registereintrag</h2>
          <p>
            Eintragung im Handelsregister.<br />
            Registergericht: Amtsgericht München<br />
            Registernummer: HRB 123456
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Umsatzsteuer-ID</h2>
          <p>
            Umsatzsteuer-Identifikationsnummer gemäß §27a Umsatzsteuergesetz:<br />
            DE123456789
          </p>
        </section>
      </article>
    </div>
  )
}