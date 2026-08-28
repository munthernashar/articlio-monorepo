import { Link } from 'react-router-dom'

export function AdminDashboardPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Admin Dashboard</h1>
        <p style={{ color: '#666' }}>System-Ü¨bersicht und Verwaltung</p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '3rem'
      }}>
        <div style={{ padding: '1.5rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Nutzer</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>1,247</p>
        </div>
        <div style={{ padding: '1.5rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Sessions (heute)</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>342</p>
        </div>
        <div style={{ padding: '1.5rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Umsatz (Monat)</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>€12,450</p>
        </div>
        <div style={{ padding: '1.5rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Fehlerrate</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>0.2%</p>
        </div>
      </div>

      <section>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Verwaltung</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <Link to="/admin/users" style={{
            padding: '1.5rem',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit'
          }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Nutzerverwaltung</h3>
            <p style={{ color: '#666' }}>Benutzerkonten verwalten und einsehen</p>
          </Link>
          <Link to="/admin/sessions" style={{
            padding: '1.5rem',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit'
          }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Sessions</h3>
            <p style={{ color: '#666' }}>Alle Lernsessions überwachen</p>
          </Link>
          <Link to="/admin/billing" style={{
            padding: '1.5rem',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit'
          }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Abrechnungen</h3>
            <p style={{ color: '#666' }}>Zahlungen und Rechnungen</p>
          </Link>
          <Link to="/admin/settings" style={{
            padding: '1.5rem',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit'
          }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Einstellungen</h3>
            <p style={{ color: '#666' }}>Systemkonfiguration</p>
          </Link>
        </div>
      </section>
    </div>
  )
}