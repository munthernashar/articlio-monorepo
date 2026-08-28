import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, signOut } from '@articlio/api'
import type { User } from '@supabase/supabase-js'
import { LoadingSpinner } from '@articlio/ui'

export function TutorPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
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
    return <LoadingSpinner size="large" text="Lade Tutor..." />
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <h1 style={{ fontSize: '2rem' }}>KI-Tutor</h1>
        <div>
          <span style={{ marginRight: '1rem', color: '#666' }}>{user?.email}</span>
          <button onClick={handleLogout} style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#f44336',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}>Logout</button>
        </div>
      </header>

      <main>
        <div style={{
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          padding: '2rem',
          marginBottom: '2rem',
          minHeight: '300px'
        }}>
          <h2 style={{ marginBottom: '1rem' }}>Wie kann ich dir helfen?</h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Stelle mir eine Frage oder beschreibe dein Lernthema.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Deine Nachricht..."
            rows={5}
            style={{
              width: '100%',
              padding: '1rem',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '1rem',
              fontFamily: 'inherit',
              resize: 'vertical'
            }}
          />
          <button
            style={{
              marginTop: '1rem',
              padding: '0.75rem 2rem',
              backgroundColor: '#007AFF',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Senden
          </button>
        </div>
      </main>
    </div>
  )
}