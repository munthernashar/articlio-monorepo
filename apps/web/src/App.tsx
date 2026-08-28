import { useEffect, useState } from 'react'
import { getCurrentUser, signOut } from '@articlio/api'
import type { User } from '@supabase/supabase-js'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentUser().then(setUser).finally(() => setLoading(false))
  }, [])

  async function handleLogout() {
    await signOut()
    setUser(null)
  }

  if (loading) {
    return <div>Lade...</div>
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Articlio Web</h1>
      {user ? (
        <div>
          <p>Eingeloggt als: {user.email}</p>
          <button onClick={handleLogout}>Logout</button>
        </div>
      ) : (
        <p>Nicht eingeloggt</p>
      )}
    </div>
  )
}

export default App