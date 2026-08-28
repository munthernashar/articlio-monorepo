import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4rem'
      }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Articlio</h1>
        <nav>
          <Link to="/login" style={{ marginRight: '1rem' }}>Login</Link>
          <Link to="/signup">Sign Up</Link>
        </nav>
      </header>

      <main>
        <section style={{ textAlign: 'center', padding: '4rem 0' }}>
          <h2 style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>
            Lerne smarter mit KI
          </h2>
          <p style={{ fontSize: '1.25rem', color: '#666', marginBottom: '2rem' }}>
            Articlio hilft dir, deine Lernziele zu erreichen - personalisiert und effizient.
          </p>
          <Link
            to="/signup"
            style={{
              backgroundColor: '#007AFF',
              color: '#fff',
              padding: '1rem 2rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '1.1rem'
            }}
          >
            Kostenlos starten
          </Link>
        </section>

        <section style={{ padding: '4rem 0' }}>
          <h3 style={{ fontSize: '2rem', marginBottom: '2rem', textAlign: 'center' }}>
            Features
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem'
          }}>
            <div style={{ padding: '2rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>KI-Tutor</h4>
              <p style={{ color: '#666' }}>Personalisierte Lernunterstutzung rund um die Uhr.</p>
            </div>
            <div style={{ padding: '2rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Fortschritts-Tracking</h4>
              <p style={{ color: '#666' }}>Verfolge deine Lernziele und Erfolge.</p>
            </div>
            <div style={{ padding: '2rem', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
              <h4 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Skill-Maps</h4>
              <p style={{ color: '#666' }}>Strukturierte Lernpfade fur jedes Thema.</p>
            </div>
          </div>
        </section>
      </main>

      <footer style={{
        marginTop: '4rem',
        padding: '2rem 0',
        borderTop: '1px solid #e0e0e0',
        textAlign: 'center',
        color: '#666'
      }}>
        <p>&copy; 2026 Articlio. Alle Rechte vorbehalten.</p>
      </footer>
    </div>
  )
}