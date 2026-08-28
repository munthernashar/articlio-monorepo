import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from '@articlio/ui'
import { LandingPage } from './pages/LandingPage'
import { LoginPage, SignupPage } from './pages/auth'
import { DashboardPage } from './pages/DashboardPage'
import { TutorPage } from './pages/TutorPage'
import { ProfilePage } from './pages/ProfilePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PricingPage } from './pages/PricingPage'
import { FeaturesPage } from './pages/FeaturesPage'
import { SkillMapPage } from './pages/SkillMapPage'
import { ProgressPage } from './pages/ProgressPage'
import { SessionsListPage, SessionDetailPage } from './pages/sessions'
import { PrivacyPage, TermsPage, ImprintPage } from './pages/legal'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { BillingOverviewPage } from './pages/billing/BillingOverviewPage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tutor" element={<TutorPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/skills" element={<SkillMapPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/sessions" element={<SessionsListPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/billing" element={<BillingOverviewPage />} />
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/imprint" element={<ImprintPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App