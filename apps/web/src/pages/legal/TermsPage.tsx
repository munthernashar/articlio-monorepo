import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/" style={{ color: '#666', marginBottom: '1rem', display: 'block' }}>← Zurück</Link>
        <h1 style={{ fontSize: '2rem' }}>AGB</h1>
      </header>

      <article style={{ lineHeight: '1.8' }}>
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>1. Geltungsbereich</h2>
          <p>
            Diese Allgemeinen Geschäftsbedingungen gelten für alle Nutzer der Articlio-Plattform.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>2. Leistungen</h2>
          <p>
            Articlio bietet eine KI-gest ützte Lernplattform mit personalisiertem Tutor, Skill-Maps
            und Fortschritts-Tracking.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>3. Nutzungspflichten</h2>
          <p>
            Nutzer verpflichten sich, die Plattform nur für legale Zwecke zu nutzen und keine
            sch ädlichen Inhalte zu verbreiten.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>4. K ündigung</h2>
          <p>
            Das Konto kann jederzeit kostenlos gek ündigt werden.
          </p>
        </section>
      </article>
    </div>
  )
}