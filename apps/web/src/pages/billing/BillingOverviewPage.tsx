import { Link } from 'react-router-dom'

export function BillingOverviewPage() {
  const invoices = [
    { id: 'INV-2026-001', date: '2026-08-01', amount: '€9,99', status: 'Bezahlt' },
    { id: 'INV-2026-002', date: '2026-07-01', amount: '€9,99', status: 'Bezahlt' },
    { id: 'INV-2026-003', date: '2026-06-01', amount: '€9,99', status: 'Bezahlt' },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <Link to="/dashboard" style={{ color: '#666', marginBottom: '1rem', display: 'block' }}>← Zurück</Link>
        <h1 style={{ fontSize: '2rem' }}>Abrechnung</h1>
      </header>

      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '2rem',
        borderRadius: '8px',
        marginBottom: '2rem'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Aktueller Plan</h2>
        <p style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Pro - €9,99/Monat</p>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>N ächste Abbuchung: 01.09.2026</p>
        <button style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#f44336',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Plan kündigen
        </button>
      </div>

      <section>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Rechnungen</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {invoices.map(invoice => (
            <div key={invoice.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.5rem',
              border: '1px solid #e0e0e0',
              borderRadius: '8px'
            }}>
              <div>
                <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{invoice.id}</p>
                <small style={{ color: '#666' }}>{invoice.date}</small>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{invoice.amount}</p>
                <small style={{ color: '#4caf50' }}>{invoice.status}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}