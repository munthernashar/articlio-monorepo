import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { paths } from '@/app/routes/paths';
import { Skeleton } from '@/components/ui/Skeleton';

type ProtectedRouteProps = {
  redirectTo?: string;
};

export function ProtectedRoute({ redirectTo = paths.auth.login }: ProtectedRouteProps) {
  const location = useLocation();
  const { status, isAuthenticated, isOnboardingCompleted } = useAuth();

  if (status === 'loading') {
    return (
      <section className="page skeleton-page" aria-busy="true" aria-label="Wird geladen">
        <Skeleton width="40%" height="1.75rem" />
        <div className="card skeleton-card">
          <Skeleton width="60%" height="1.1rem" />
          <Skeleton width="100%" height="0.9rem" />
          <Skeleton width="85%" height="0.9rem" />
        </div>
        <div className="card skeleton-card">
          <Skeleton width="45%" height="1.1rem" />
          <Skeleton width="100%" height="0.9rem" />
        </div>
      </section>
    );
  }

  if (!isAuthenticated) {
    const redirectTarget = `${redirectTo}?next=${encodeURIComponent(location.pathname)}`;
    return <Navigate to={redirectTarget} replace />;
  }

  if (!isOnboardingCompleted && location.pathname !== paths.onboarding) {
    return <Navigate to={paths.onboarding} replace />;
  }

  return <Outlet />;
}
