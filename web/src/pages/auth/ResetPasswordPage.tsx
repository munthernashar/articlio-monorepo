import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { paths } from '@/app/routes/paths';
import { useAuth } from '@/features/auth/useAuth';

function hasRecoveryTokens(hash: string) {
  const params = new URLSearchParams(hash.replace('#', ''));
  return params.get('type') === 'recovery' && params.has('access_token');
}

export function ResetPasswordPage() {
  const { requestPasswordReset, updatePassword, errorMessage, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const isRecoveryFlow = useMemo(() => hasRecoveryTokens(window.location.hash), []);

  const onRequestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setInfoMessage(null);

    if (!email.trim()) {
      setInfoMessage('Bitte gib deine E-Mail-Adresse ein.');
      return;
    }

    setIsSubmitting(true);

    try {
      await requestPasswordReset(email);
      setInfoMessage('Reset-Link gesendet. Bitte prüfe deine Inbox.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onApplyNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setInfoMessage(null);

    if (!password || !confirmPassword) {
      setInfoMessage('Bitte fülle beide Passwortfelder aus.');
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

    setIsSubmitting(true);
    try {
      await updatePassword(password);
      setInfoMessage('Passwort erfolgreich aktualisiert. Du kannst dich jetzt einloggen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="page auth-page">
      <PageHeader
        title="Passwort zurücksetzen"
        subtitle="Fordere einen Link an oder setze dein Passwort nach dem E-Mail-Link direkt neu."
      />
      <article className="card auth-card">
        {isRecoveryFlow ? (
          <form className="auth-form" onSubmit={onApplyNewPassword} noValidate>
            <label className="auth-label" htmlFor="new-password">
              Neues Passwort
            </label>
            <input
              className="auth-input"
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            <label className="auth-label" htmlFor="new-password-confirm">
              Neues Passwort bestätigen
            </label>
            <input
              className="auth-input"
              id="new-password-confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />

            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
            {infoMessage ? <p className="auth-info">{infoMessage}</p> : null}

            <button className={`button ${isSubmitting ? 'is-loading' : ''}`} type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              <span className="button-content">
                <span className="button-label">Neues Passwort speichern</span>
                {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
              </span>
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={onRequestReset} noValidate>
            <label className="auth-label" htmlFor="reset-email">
              E-Mail
            </label>
            <input
              className="auth-input"
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
            {infoMessage ? <p className="auth-info">{infoMessage}</p> : null}

            <button className={`button ${isSubmitting ? 'is-loading' : ''}`} type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              <span className="button-content">
                <span className="button-label">Reset-Link senden</span>
                {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
              </span>
            </button>
          </form>
        )}

        <div className="auth-links">
          <Link to={paths.auth.login}>Zurück zum Login</Link>
        </div>
      </article>
    </section>
  );
}
