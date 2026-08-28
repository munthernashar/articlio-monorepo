import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/" style={{ color: '#666', marginBottom: '1rem', display: 'block' }}>← Zurück</Link>
        <h1 style={{ fontSize: '2rem' }}>Datenschutzerkl ärung</h1>
      </header>

      <article style={{ lineHeight: '1.8' }}>
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>1. Verantwortlicher</h2>
          <p>Articlio GmbH<br />Musterstra ße 1<br />12345 München</p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>2. Erhebung von Daten</h2>
          <p>
            Wir erheben nur die Daten, die du uns freiwillig zur Verfügung stellst (E-Mail, Name).
            Die Nutzung unserer Plattform erfolgt auf Basis der DSGVO.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>3. Cookies</h2>
          <p>
            Diese Website verwendet notwendige Cookies für die Session-Verwaltung.
            Analytics-Cookies werden nur mit deiner Einwilligung verwendet.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>4. Deine Rechte</h2>
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung deiner Daten.
          </p>
        </section>
      </article>
    </div>
  )
}