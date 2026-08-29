import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { PublicNav } from '@/components/ui/PublicNav';
import { paths } from '@/app/routes/paths';
import { useAuth } from '@/features/auth/useAuth';

function useNextPath() {
  const location = useLocation();

  return useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('next') || paths.dashboard;
  }, [location.search]);
}

export function LoginPage() {
  const navigate = useNavigate();
  const nextPath = useNextPath();
  const { isAuthenticated, login, status, errorMessage, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (status === 'authenticated' && isAuthenticated) {
    return <Navigate to={nextPath} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError('Bitte E-Mail und Passwort eingeben.');
      return;
    }

    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate(nextPath, { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PublicNav />
      <section className="page auth-page">
        <PageHeader title="Anmelden" subtitle="Melde dich an, um mit dem Coach zu trainieren." />
        <article className="card auth-card">
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <label className="auth-label" htmlFor="email">
              E-Mail
            </label>
            <input
              className="auth-input"
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label className="auth-label" htmlFor="password">
              Passwort
            </label>
            <input
              className="auth-input"
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {(formError ?? errorMessage) ? <p className="auth-error">{formError ?? errorMessage}</p> : null}

            <button className={`button ${isSubmitting ? 'is-loading' : ''}`} type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              <span className="button-content">
                <span className="button-label">Einloggen</span>
                {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
              </span>
            </button>

            <div className="auth-links">
              <Link to={paths.auth.register}>Noch kein Konto? Registrieren</Link>
              <Link to={paths.auth.reset}>Passwort vergessen?</Link>
            </div>
          </form>
        </article>
      </section>
    </>
  );
}
