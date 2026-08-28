import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUser, signOut } from '@articlio/api'
import type { User } from '@supabase/supabase-js'
import { LoadingSpinner } from '@articlio/ui'

export function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    getCurrentUser().then(u => {
      setUser(u)
      setLoading(false)
      if (!u) navigate('/login')
    })
  }, [navigate])

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  if (loading) {
    return <LoadingSpinner size="large" text="Lade Dashboard..." />
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <h1 style={{ fontSize: '2rem' }}>Dashboard</h1>
        <button
          onClick={handleLogout}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#f44336',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </header>

      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '2rem',
        borderRadius: '8px',
        marginBottom: '2rem'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Willkommen, {user?.email}</h2>
        <p style={{ color: '#666' }}>
          Dies ist dein Dashboard. Hier siehst du deine Lernfortschritte und Aktivitaten.
        </p>
      </div>

      <section>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Schnellzugriff</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem'
        }}>
          <Link
            to="/sessions"
            style={{
              padding: '1.5rem',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              textDecoration: 'none',
              color: 'inherit'
            }}
          >
            <h4 style={{ marginBottom: '0.5rem' }}>Sessions</h4>
            <p style={{ color: '#666' }}>Deine Lernsessions</p>
          </Link>
          <Link
            to="/profile"
            style={{
              padding: '1.5rem',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              textDecoration: 'none',
              color: 'inherit'
            }}
          >
            <h4 style={{ marginBottom: '0.5rem' }}>Profil</h4>
            <p style={{ color: '#666' }}>Kontoeinstellungen</p>
          </Link>
        </div>
      </section>
    </div>
  )
}