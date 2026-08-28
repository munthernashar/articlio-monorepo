import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, signOut, getProfile, updateProfile } from '@articlio/api'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@articlio/types'
import { LoadingSpinner } from '@articlio/ui'

export function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    async function loadData() {
      const u = await getCurrentUser()
      setUser(u)
      if (!u) {
        navigate('/login')
        return
      }
      const p = await getProfile(u.id)
      setProfile(p)
      if (p) setFullName(p.full_name || '')
      setLoading(false)
    }
    loadData()
  }, [navigate])

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    await updateProfile(user.id, { full_name: fullName })
    setSaving(false)
    alert('Profil aktualisiert!')
  }

  if (loading) {
    return <LoadingSpinner size="large" text="Lade Profil..." />
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <h1 style={{ fontSize: '2rem' }}>Profil</h1>
        <button onClick={handleLogout} style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#f44336',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>Logout</button>
      </header>

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>E-Mail</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '4px',
              border: '1px solid #ddd',
              backgroundColor: '#f5f5f5',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Dein Name"
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
          disabled={saving}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#007AFF',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1
          }}
        >
          {saving ? 'Speichert...' : 'Speichern'}
        </button>
      </form>
    </div>
  )
}