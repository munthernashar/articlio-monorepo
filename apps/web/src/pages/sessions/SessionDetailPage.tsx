import { Link } from 'react-router-dom'

export function SessionDetailPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/sessions" style={{ color: '#666', marginBottom: '1rem', display: 'block' }}>← Zurück</Link>
        <h1 style={{ fontSize: '2rem' }}>Session Details</h1>
      </header>

      <div style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '2rem',
        marginBottom: '2rem'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>JavaScript Grundlagen</h2>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>28. August 2026 • 45 Minuten</p>

        <h3 style={{ marginBottom: '0.5rem' }}>Transkript</h3>
        <div style={{
          backgroundColor: '#f5f5f5',
          padding: '1.5rem',
          borderRadius: '4px',
          marginBottom: '1.5rem',
          minHeight: '200px'
        }}>
          <p style={{ marginBottom: '1rem' }}>
            <strong>Frage:</strong> Was ist der Unterschied zwischen let und const?
          </p>
          <p style={{ marginBottom: '1rem' }}>
            <strong>Antwort:</strong> const wird für Variablen verwendet, deren Wert sich nicht ändern soll...
          </p>
        </div>

        <button style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#007AFF',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Session fortsetzen
        </button>
      </div>
    </div>
  )
}