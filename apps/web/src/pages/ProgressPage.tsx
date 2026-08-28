import { Link } from 'react-router-dom'

export function ProgressPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/dashboard" style={{ color: '#666', marginBottom: '1rem', display: 'block' }}>← Zurück</Link>
        <h1 style={{ fontSize: '2rem' }}>Fortschritt</h1>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '3rem'
      }}>
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <h3 style={{ marginBottom: '0.5rem', color: '#666' }}>Sessions</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>42</p>
        </div>
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <h3 style={{ marginBottom: '0.5rem', color: '#666' }}>Stunden gelernt</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>28.5</p>
        </div>
        <div style={{
          padding: '1.5rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <h3 style={{ marginBottom: '0.5rem', color: '#666' }}>Skills</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>12</p>
        </div>
      </div>

      <section>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Aktiv it ät</h2>
        <div style={{
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          padding: '1.5rem',
          minHeight: '200px',
          backgroundColor: '#fafafa'
        }}>
          <p style={{ color: '#999', textAlign: 'center' }}>Chart wird geladen...</p>
        </div>
      </section>
    </div>
  )
}