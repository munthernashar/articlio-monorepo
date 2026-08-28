import { Link } from 'react-router-dom'

export function SkillMapPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/dashboard" style={{ color: '#666', marginBottom: '1rem', display: 'block' }}>← Zurück</Link>
        <h1 style={{ fontSize: '2rem' }}>Skill-Maps</h1>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem'
      }}>
        {['JavaScript Grundlagen', 'React Entwicklung', 'TypeScript Masterclass', 'Node.js Backend', 'Datenbanken'].map((skill, i) => (
          <div key={i} style={{
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '1.5rem'
          }}>
            <h3 style={{ marginBottom: '0.5rem' }}>{skill}</h3>
            <div style={{
              height: '8px',
              backgroundColor: '#f0f0f0',
              borderRadius: '4px',
              marginBottom: '0.5rem',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.random() * 100}%`,
                height: '100%',
                backgroundColor: '#007AFF',
                borderRadius: '4px'
              }} />
            </div>
            <small style={{ color: '#666' }}>{Math.floor(Math.random() * 100)}% abgeschlossen</small>
          </div>
        ))}
      </div>
    </div>
  )
}