import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { PublicNav } from '@/components/ui/PublicNav';
import { paths } from '@/app/routes/paths';
import { useAuth } from '@/features/auth/useAuth';
import { funnelTracking } from '@/services/analytics/funnel-tracking';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, requestSignupVerificationEmail, status, isAuthenticated, errorMessage, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isAwaitingEmailVerification, setIsAwaitingEmailVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  if (status === 'authenticated' && isAuthenticated) {
    return <Navigate to={paths.dashboard} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setInfoMessage(null);
    funnelTracking.trackFunnelEvent('signup_started', { source: 'register_page' });

    if (!email.trim() || !password || !confirmPassword) {
      setInfoMessage('Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    if (password.length < 8) {
      setInfoMessage('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    if (password !== confirmPassword) {
      setInfoMessage('Die Passwörter stimmen nicht überein.');
      return;
    }

    if (!hasAcceptedLegal) {
      setInfoMessage('Bitte stimme den Nutzungsbedingungen und der Datenschutzerklärung zu, um fortzufahren.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await register(email, password);

      if (result.session) {
        funnelTracking.trackFunnelEvent('signup_completed', { verificationRequired: false });
        navigate(paths.dashboard, { replace: true });
        return;
      }

      funnelTracking.trackFunnelEvent('signup_completed', { verificationRequired: true });
      setVerificationEmail(email);
      setIsAwaitingEmailVerification(true);
      setInfoMessage('Fast geschafft: Bitte bestätige zuerst deine E-Mail-Adresse, bevor du dich einloggst.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResendVerification = async () => {
    if (!verificationEmail) {
      setInfoMessage('Bitte registriere dich erneut, damit wir die Bestätigungs-E-Mail zuordnen können.');
      return;
    }

    clearError();
    setInfoMessage(null);
    setIsSubmitting(true);

    try {
      await requestSignupVerificationEmail(verificationEmail);
      setInfoMessage('Bestätigungs-E-Mail wurde erneut gesendet. Bitte prüfe auch deinen Spam-Ordner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAwaitingEmailVerification) {
    return (
      <>
        <PublicNav />
        <section className="page auth-page">
          <PageHeader title="E-Mail bestätigen" subtitle="Bitte bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren." />
          <article className="card auth-card">
            <div className="auth-form" role="status" aria-live="polite">
              <p className="auth-info">
                Wir haben eine Bestätigungs-E-Mail an <strong>{verificationEmail}</strong> gesendet.
              </p>
              <p className="auth-info">
                Als Nächstes: Öffne die E-Mail, klicke auf den Bestätigungslink und logge dich danach ein.
              </p>
              <p className="auth-info">
                Keine E-Mail erhalten? Prüfe Spam/Werbung oder fordere unten eine neue Bestätigungs-E-Mail an.
              </p>
              {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
              {infoMessage ? <p className="auth-info">{infoMessage}</p> : null}

              <button className={`button ${isSubmitting ? 'is-loading' : ''}`} type="button" onClick={onResendVerification} disabled={isSubmitting} aria-busy={isSubmitting}>
                <span className="button-content">
                  <span className="button-label">Bestätigungs-E-Mail erneut senden</span>
                  {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
                </span>
              </button>

              <div className="auth-links">
                <Link to={paths.auth.login}>Zurück zum Login</Link>
              </div>
            </div>
          </article>
        </section>
      </>
    );
  }

  return (
    <>
      <PublicNav />
      <section className="page auth-page">
        <PageHeader title="Registrierung" subtitle="Erstelle dein Lernprofil in weniger als 2 Minuten." />
        <article className="card auth-card">
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <label className="auth-label" htmlFor="register-email">
              E-Mail
            </label>
            <input
              className="auth-input"
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label className="auth-label" htmlFor="register-password">
              Passwort
            </label>
            <input
              className="auth-input"
              id="register-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <label className="auth-label" htmlFor="register-confirm-password">
              Passwort bestätigen
            </label>
            <input
              className="auth-input"
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />

            <label className="auth-checkbox" htmlFor="register-legal-consent">
              <input
                id="register-legal-consent"
                type="checkbox"
                checked={hasAcceptedLegal}
                onChange={(event) => setHasAcceptedLegal(event.target.checked)}
                required
              />
              <span>
                Ich akzeptiere die{' '}
                <a href={paths.legal.terms} target="_blank" rel="noreferrer">
                  Allgemeinen Geschäftsbedingungen
                </a>{' '}
                und die{' '}
                <a href={paths.legal.privacy} target="_blank" rel="noreferrer">
                  Datenschutzerklärung
                </a>
                .
              </span>
            </label>

            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
            {infoMessage ? <p className="auth-info">{infoMessage}</p> : null}

            <button className={`button ${isSubmitting ? 'is-loading' : ''}`} type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              <span className="button-content">
                <span className="button-label">Registrieren</span>
                {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
              </span>
            </button>

            <div className="auth-links">
              <Link to={paths.auth.login}>Bereits registriert? Zum Login</Link>
            </div>
          </form>
        </article>
      </section>
    </>
  );
}
