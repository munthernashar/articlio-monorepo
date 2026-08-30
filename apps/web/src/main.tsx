import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureSupabaseClient } from '@articlio/api'
import { AuthProvider } from './features/auth/AuthContext'
import { AppRouter } from './app/routes/AppRouter'
import { ErrorBoundary } from './components/ErrorBoundary'
import { appConfig } from './lib/config'
import './styles/global.css'

// Configure the shared @articlio/api Supabase client before any route/component
// can access services such as gamification.
configureSupabaseClient(appConfig.supabase.url, appConfig.supabase.anonKey)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <AppRouter />
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
