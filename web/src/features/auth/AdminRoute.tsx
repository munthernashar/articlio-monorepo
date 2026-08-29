import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { paths } from '@/app/routes/paths';

export function AdminRoute() {
  const { status, isAdmin } = useAuth();

  if (status === 'loading') {
    return <section className="card">Berechtigungen werden geprüft …</section>;
  }

  if (!isAdmin) {
    return <Navigate to={paths.dashboard} replace />;
  }

  return <Outlet />;
}
