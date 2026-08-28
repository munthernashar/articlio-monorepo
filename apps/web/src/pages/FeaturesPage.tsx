import { Link } from 'react-router-dom'

export function FeaturesPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Features</h1>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>
          Entdecke, was Articlio kann
        </p>
      </header>

      <div style={{ display: 'grid', gap: '3rem' }}>
        <section style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>KI-Tutor</h2>
            <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '1.5rem' }}>
              Unser KI-Tutor unterst ützt dich rund um die Uhr bei deinen Lernfragen.
              Personalisiert und geduldig.
            </p>
            <Link to="/signup" style={{
              color: '#007AFF',
              fontWeight: '600'
            }}>Jetzt ausprobieren →</Link>
          </div>
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '2rem',
            borderRadius: '8px',
            minHeight: '200px'
          }}>
            <div style={{ color: '#999', textAlign: 'center' }}>Screenshot</div>
          </div>
        </section>

        <section style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          alignItems: 'center'
        }}>
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '2rem',
            borderRadius: '8px',
            minHeight: '200px'
          }}>
            <div style={{ color: '#999', textAlign: 'center' }}>Screenshot</div>
          </div>
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Skill-Maps</h2>
            <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '1.5rem' }}>
              Strukturierte Lernpfade f ür jedes Thema. Verfolge deinen Fortschritt
              und erreiche deine Ziele schneller.
            </p>
            <Link to="/signup" style={{
              color: '#007AFF',
              fontWeight: '600'
            }}>Mehr erfahren →</Link>
          </div>
        </section>

        <section style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Fortschritts-Tracking</h2>
            <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '1.5rem' }}>
              Detaillierte Analysen deines Lernfortschritts. Verstehe deine Stärken
              und verbessere Schw ächen.
            </p>
            <Link to="/signup" style={{
              color: '#007AFF',
              fontWeight: '600'
            }}>Statistiken ansehen →</Link>
          </div>
          <div style={{
            backgroundColor: '#f5f5f5',
            padding: '2rem',
            borderRadius: '8px',
            minHeight: '200px'
          }}>
            <div style={{ color: '#999', textAlign: 'center' }}>Screenshot</div>
          </div>
        </section>
      </div>
    </div>
  )
}