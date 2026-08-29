import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/layout/AppShell';
import { paths } from '@/app/routes/paths';
import { LandingPage } from '@/pages/LandingPage';
import { FeaturesPage } from '@/pages/FeaturesPage';
import { PricingPage } from '@/pages/PricingPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AdminRoute } from '@/features/auth/AdminRoute';
import { ImprintPage } from '@/pages/legal/ImprintPage';
import { PrivacyPage } from '@/pages/legal/PrivacyPage';
import { TermsPage } from '@/pages/legal/TermsPage';
import { WithdrawalPage } from '@/pages/legal/WithdrawalPage';

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const SessionHistoryPage = lazy(() =>
  import('@/pages/sessions/SessionHistoryPage').then((module) => ({ default: module.SessionHistoryPage })),
);
const SessionDetailPage = lazy(() =>
  import('@/pages/sessions/SessionDetailPage').then((module) => ({ default: module.SessionDetailPage })),
);
const NewSessionPage = lazy(() => import('@/pages/sessions/NewSessionPage').then((module) => ({ default: module.NewSessionPage })));
const TutorPage = lazy(() => import('@/pages/TutorPage').then((module) => ({ default: module.TutorPage })));
const SkillMapPage = lazy(() => import('@/pages/SkillMapPage').then((module) => ({ default: module.SkillMapPage })));
const BillingPricingPage = lazy(() => import('@/pages/billing/PricingPage').then((module) => ({ default: module.BillingPricingPage })));
const BillingSuccessPage = lazy(() => import('@/pages/billing/BillingSuccessPage').then((module) => ({ default: module.BillingSuccessPage })));
const BillingCancelPage = lazy(() => import('@/pages/billing/BillingCancelPage').then((module) => ({ default: module.BillingCancelPage })));

const AdminWorkspaceLayout = lazy(() =>
  import('@/features/admin/AdminWorkspaceLayout').then((module) => ({ default: module.AdminWorkspaceLayout })),
);
const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage })),
);
const AdminPromptsPage = lazy(() => import('@/pages/admin/AdminPromptsPage').then((module) => ({ default: module.AdminPromptsPage })));
const AdminPromptDetailPage = lazy(() =>
  import('@/pages/admin/AdminPromptDetailPage').then((module) => ({ default: module.AdminPromptDetailPage })),
);
const AdminSettingsPage = lazy(() =>
  import('@/pages/admin/AdminSettingsPage').then((module) => ({ default: module.AdminSettingsPage })),
);
const AdminEntitlementsPage = lazy(() =>
  import('@/pages/admin/AdminEntitlementsPage').then((module) => ({ default: module.AdminEntitlementsPage })),
);
const AdminBillingEventsPage = lazy(() =>
  import('@/pages/admin/AdminBillingEventsPage').then((module) => ({ default: module.AdminBillingEventsPage })),
);

function RouteLoadingFallback() {
  return <div className="p-4 text-sm text-slate-600">Seite wird geladen…</div>;
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path={paths.landing} element={<LandingPage />} />
        <Route path={paths.public.features} element={<FeaturesPage />} />
        <Route path={paths.public.pricing} element={<PricingPage />} />
        <Route path={paths.auth.login} element={<LoginPage />} />
        <Route path={paths.auth.register} element={<RegisterPage />} />
        <Route path={paths.auth.reset} element={<ResetPasswordPage />} />
        <Route path={paths.legal.imprint} element={<ImprintPage />} />
        <Route path={paths.legal.privacy} element={<PrivacyPage />} />
        <Route path={paths.legal.terms} element={<TermsPage />} />
        <Route path={paths.legal.withdrawal} element={<WithdrawalPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path={paths.dashboard} element={<DashboardPage />} />
            <Route path={paths.onboarding} element={<OnboardingPage />} />
            <Route path={paths.sessions.list} element={<SessionHistoryPage />} />
            <Route path={paths.sessions.new} element={<NewSessionPage />} />
            <Route path={paths.sessions.detail} element={<SessionDetailPage />} />
            <Route path={paths.tutor} element={<TutorPage />} />
            <Route path={paths.progress} element={<Navigate to={paths.dashboard} replace />} />
            <Route path={paths.skillMap} element={<SkillMapPage />} />
            <Route path={paths.profile} element={<ProfilePage />} />
            <Route path={paths.billing.pricing} element={<BillingPricingPage />} />
            <Route path={paths.billing.success} element={<BillingSuccessPage />} />
            <Route path={paths.billing.cancel} element={<BillingCancelPage />} />

            <Route element={<AdminRoute />}>
              <Route path={paths.admin.dashboard} element={<AdminWorkspaceLayout />}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="prompts" element={<AdminPromptsPage />} />
                <Route path="prompts/:promptKey" element={<AdminPromptDetailPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="entitlements" element={<AdminEntitlementsPage />} />
                <Route path="billing-events" element={<AdminBillingEventsPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="/home" element={<Navigate to={paths.dashboard} replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
