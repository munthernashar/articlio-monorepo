import { Link } from 'react-router-dom'

export function PricingPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Preise</h1>
        <p style={{ fontSize: '1.2rem', color: '#666' }}>
          W ähle den Plan, der zu dir passt
        </p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '2rem',
        marginBottom: '3rem'
      }}>
        <div style={{
          padding: '2rem',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Free</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>€0</p>
          <ul style={{ listStyle: 'none', marginBottom: '2rem', textAlign: 'left' }}>
            <li style={{ marginBottom: '0.5rem' }}>✓ 5 Sessions/Monat</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Basis KI-Tutor</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Lernfortschritt</li>
          </ul>
          <Link to="/signup" style={{
            display: 'block',
            padding: '0.75rem',
            backgroundColor: '#007AFF',
            color: '#fff',
            borderRadius: '4px',
            textDecoration: 'none'
          }}>Kostenlos starten</Link>
        </div>

        <div style={{
          padding: '2rem',
          border: '2px solid #007AFF',
          borderRadius: '8px',
          textAlign: 'center',
          position: 'relative'
        }}>
          <span style={{
            position: 'absolute',
            top: '-12px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#007AFF',
            color: '#fff',
            padding: '0.25rem 1rem',
            borderRadius: '4px',
            fontSize: '0.85rem'
          }}>Beliebt</span>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Pro</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>€9,99</p>
          <ul style={{ listStyle: 'none', marginBottom: '2rem', textAlign: 'left' }}>
            <li style={{ marginBottom: '0.5rem' }}>✓ Unbegrenzte Sessions</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Erweiterte KI-Tutor</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Skill-Maps</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Priorit äts-Support</li>
          </ul>
          <Link to="/signup" style={{
            display: 'block',
            padding: '0.75rem',
            backgroundColor: '#007AFF',
            color: '#fff',
            borderRadius: '4px',
            textDecoration: 'none'
          }}>Jetzt upgraden</Link>
        </div>

        <div style={{
          padding: '2rem',
          border: '1px solid #e0e0e0',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Team</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>€29,99</p>
          <ul style={{ listStyle: 'none', marginBottom: '2rem', textAlign: 'left' }}>
            <li style={{ marginBottom: '0.5rem' }}>✓ Alles aus Pro</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Bis zu 10 Nutzer</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Team-Analytics</li>
            <li style={{ marginBottom: '0.5rem' }}>✓ Dedizierter Support</li>
          </ul>
          <Link to="/signup" style={{
            display: 'block',
            padding: '0.75rem',
            backgroundColor: '#007AFF',
            color: '#fff',
            borderRadius: '4px',
            textDecoration: 'none'
          }}>Team erstellen</Link>
        </div>
      </div>
    </div>
  )
}