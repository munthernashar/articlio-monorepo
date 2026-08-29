import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AppRouter } from '@/app/routes/AppRouter';
import { AuthGate } from '@/features/auth/AuthGate';
import { ConsentBanner } from '@/components/ui/ConsentBanner';
import { ConsentedAnalytics } from '@/components/analytics/ConsentedAnalytics';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initSentry } from '@/lib/sentry';
import '@/styles/global.css';

initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthGate>
            <AppRouter />
            <ConsentedAnalytics />
            <ConsentBanner />
          </AuthGate>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
    <SpeedInsights />
  </React.StrictMode>,
);
