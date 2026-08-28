import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signUpWithEmailPassword } from '@articlio/api'

export function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await signUpWithEmailPassword(email, password)
      if (result.error) {
        setError(result.error.message)
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      setError('Registrierung fehlgeschlagen. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      maxWidth: '400px',
      margin: '4rem auto',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '2rem', textAlign: 'center' }}>Registrieren</h1>

      {error && (
        <div style={{
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          padding: '1rem',
          marginBottom: '1rem',
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Passwort</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '1rem'
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            backgroundColor: '#007AFF',
            color: '#fff',
            padding: '0.75rem',
            borderRadius: '4px',
            border: 'none',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Lade...' : 'Konto erstellen'}
        </button>
      </form>

      <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#666' }}>
        Bereits ein Konto? <Link to="/login">Login</Link>
      </p>
    </div>
  )
}