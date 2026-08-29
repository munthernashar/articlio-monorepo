import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureSupabaseClient } from '@articlio/api'
import App from './App'
import './styles/index.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or anon key')
}

configureSupabaseClient(supabaseUrl, supabaseAnonKey)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
