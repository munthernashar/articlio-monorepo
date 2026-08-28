import { Link } from 'react-router-dom'

export function SessionsListPage() {
  const sessions = [
    { id: 1, title: 'JavaScript Grundlagen', date: '2026-08-28', duration: '45 min' },
    { id: 2, title: 'React Hooks', date: '2026-08-27', duration: '60 min' },
    { id: 3, title: 'TypeScript Types', date: '2026-08-26', duration: '30 min' },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/dashboard" style={{ color: '#666', marginBottom: '1rem', display: 'block' }}>← Zurück</Link>
        <h1 style={{ fontSize: '2rem' }}>Sessions</h1>
      </header>

      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          to="/tutor"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#007AFF',
            color: '#fff',
            borderRadius: '4px',
            textDecoration: 'none'
          }}
        >
          Neue Session starten
        </Link>
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {sessions.map(session => (
          <Link
            key={session.id}
            to={`/sessions/${session.id}`}
            style={{
              display: 'block',
              padding: '1.5rem',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              textDecoration: 'none',
              color: 'inherit'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ marginBottom: '0.25rem' }}>{session.title}</h3>
                <small style={{ color: '#666' }}>{session.date}</small>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: '600' }}>{session.duration}</p>
                <small style={{ color: '#007AFF' }}>Details →</small>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}