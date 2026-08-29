import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { paths } from '@/app/routes/paths';
import { useAuth } from '@/features/auth/useAuth';
import { profileService } from '@/services/supabase/profile.service';
import { authService } from '@/services/supabase/auth.service';
import type { GermanLevel } from '@/types/database';

const GERMAN_LEVELS: GermanLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user, status, isAuthenticated, isOnboardingCompleted, refreshProfileState } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nativeLanguage, setNativeLanguage] = useState('');
  const [germanLevel, setGermanLevel] = useState<GermanLevel>('A1');
  const [timezone, setTimezone] = useState(getBrowserTimezone());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => firstName.trim().length > 0 && lastName.trim().length > 0 && nativeLanguage.trim().length >= 2 && !isSubmitting,
    [firstName, lastName, nativeLanguage, isSubmitting],
  );

  useEffect(() => {
    if (!user?.id) return;

    let isMounted = true;
    const loadProfile = async () => {
      const profile = await profileService.getOnboardingProfile(user.id);
      if (!profile || !isMounted) return;

      const [given = '', ...rest] = (profile.display_name ?? '').trim().split(/\s+/).filter(Boolean);
      setFirstName(given);
      setLastName(rest.join(' '));
      setNativeLanguage(profile.native_language ?? '');
      setGermanLevel(profile.german_level ?? 'A1');
      setTimezone(profile.timezone || getBrowserTimezone());
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  if (status === 'loading') {
    return <section className="card">Einen Moment …</section>;
  }

  if (!isAuthenticated) {
    return <Navigate to={paths.auth.login} replace />;
  }

  if (isOnboardingCompleted) {
    return <Navigate to={paths.dashboard} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !canSubmit) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      await profileService.completeOnboarding(user.id, {
        displayName: fullName,
        nativeLanguage,
        germanLevel,
        timezone,
      });
      await authService.updateDisplayName(fullName);
      await refreshProfileState();
      navigate(paths.sessions.new, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Deine Angaben konnten nicht gespeichert werden. Bitte versuch's noch mal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="page auth-page">
      <PageHeader
        title="Willkommen bei Articlio"
        subtitle="Noch zwei kurze Fragen, dann startet direkt deine erste Session – in weniger als 5 Minuten hast du deine erste Analyse mit persönlicher Empfehlung."
      />
      <article className="card auth-card">
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label" htmlFor="onboarding-first-name">
            Vorname
          </label>
          <input
            className="auth-input"
            id="onboarding-first-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            maxLength={120}
            required
          />
          <label className="auth-label" htmlFor="onboarding-last-name">
            Nachname
          </label>
          <input className="auth-input" id="onboarding-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={120} required />

          <label className="auth-label" htmlFor="onboarding-native-language">
            Muttersprache
          </label>
          <input
            className="auth-input"
            id="onboarding-native-language"
            value={nativeLanguage}
            onChange={(event) => setNativeLanguage(event.target.value)}
            minLength={2}
            maxLength={100}
            required
          />

          <label className="auth-label" htmlFor="onboarding-german-level">
            Deutsch-Niveau (CEFR)
          </label>
          <select
            className="auth-input"
            id="onboarding-german-level"
            value={germanLevel}
            onChange={(event) => setGermanLevel(event.target.value as GermanLevel)}
          >
            {GERMAN_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>

          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

          <button
            className={`button ${isSubmitting ? 'is-loading' : ''}`}
            type="submit"
            disabled={!canSubmit}
            aria-busy={isSubmitting}
          >
            <span className="button-content">
              <span className="button-label">Los geht's</span>
              {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
            </span>
          </button>
        </form>
      </article>
    </section>
  );
}
