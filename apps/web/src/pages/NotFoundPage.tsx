import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '4rem 2rem'
    }}>
      <h1 style={{ fontSize: '4rem', marginBottom: '1rem' }}>404</h1>
      <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#666' }}>Seite nicht gefunden</h2>
      <p style={{ marginBottom: '2rem', color: '#999' }}>
        Die gesuchte Seite existiert nicht.
      </p>
      <Link
        to="/"
        style={{
          backgroundColor: '#007AFF',
          color: '#fff',
          padding: '0.75rem 1.5rem',
          borderRadius: '4px',
          textDecoration: 'none'
        }}
      >
        Zuruck zur Startseite
      </Link>
    </div>
  )
}