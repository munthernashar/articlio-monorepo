import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, Award, Clock, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { Badge } from '@/components/ui/Badge';
import { ICON_SIZE_MD } from '@/lib/icon-sizes';
import { paths } from '@/app/routes/paths';
import { useAuth } from '@/features/auth/useAuth';
import { authService } from '@/services/supabase/auth.service';
import { profileService } from '@/services/supabase/profile.service';
import { accountDataExportService } from '@/services/supabase/account-data-export.service';
import { accountDeletionService } from '@/services/supabase/account-deletion.service';
import { useEntitlement } from '@/services/supabase/useEntitlement';
import { useSessionUsage } from '@/features/profile/useSessionUsage';
import { learningGoalCatalogService } from '@/services/supabase/learning-goal-catalog.service';
import type { LearningGoalCategory, LearningGoalContract } from '@/services/supabase/learning-goal-catalog.service';
import { goalAchievementsService, type GoalAchievement } from '@/services/supabase/goal-achievements.service';
import type { GermanLevel } from '@/types/database';

function secondsToWholeMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/** Das Erreichen der täglichen Trainingszeit ist ein Erfolg, kein
 *  Risiko/Limit -- daher keine Gelb/Rot-Warnstufen. Der Balken bleibt
 *  während des Trainings in der Akzentfarbe und wird bei Zielerreichung
 *  grün, statt eine Annäherung an eine Grenze zu signalisieren. */
function usageBarColor(percentUsed: number): string {
  return percentUsed >= 1 ? 'var(--color-success)' : 'var(--accent)';
}

const DELETE_CONFIRMATION_PHRASE = 'LÖSCHEN';

const GERMAN_LEVELS: GermanLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const LEARNING_GOAL_CATEGORY_LABELS: Record<LearningGoalCategory, string> = {
  integration: 'Integration',
  beruf: 'Beruf',
  familie: 'Familie',
  allgemein: 'Allgemein',
};

// Muss exakt mit dem CHECK-Constraint profiles_bundesland_allowed übereinstimmen
// (Migration 20260826140000_create_civics_exam_questions.sql).
const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen',
  'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz',
  'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen',
];

const CIVICS_GOAL_KEY = 'leben_in_deutschland';

function formatAchievementDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function ProfilePage() {
  const { user, status, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { data: entitlement } = useEntitlement(user?.id);
  const { data: usage, isLoading: isUsageLoading, error: usageError } = useSessionUsage(user?.id);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nativeLanguage, setNativeLanguage] = useState('');
  const [germanLevel, setGermanLevel] = useState<GermanLevel>('A1');
  const [learningGoalKey, setLearningGoalKey] = useState<string>('');
  const [learningGoals, setLearningGoals] = useState<LearningGoalContract[]>([]);
  const [bundesland, setBundesland] = useState<string>('');
  const [achievements, setAchievements] = useState<GoalAchievement[]>([]);
  const [timezone, setTimezone] = useState(getBrowserTimezone());
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let isMounted = true;

    const load = async () => {
      const profile = await profileService.getOnboardingProfile(user.id);
      if (!isMounted) return;
      setEmail(user.email ?? '');
      const [given = '', ...rest] = (profile?.display_name ?? '').trim().split(/\s+/).filter(Boolean);
      setFirstName(given);
      setLastName(rest.join(' '));
      setNativeLanguage(profile?.native_language ?? '');
      setGermanLevel(profile?.german_level ?? 'A1');
      setLearningGoalKey(profile?.learning_goal_key ?? '');
      setBundesland(profile?.bundesland ?? '');
      setTimezone(profile?.timezone ?? getBrowserTimezone());
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!user?.id) {
      setAchievements([]);
      return;
    }
    let isMounted = true;

    const loadAchievements = async () => {
      const result = await goalAchievementsService.getAchievements(user.id);
      if (isMounted) setAchievements(result);
    };

    void loadAchievements();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadGoals = async () => {
      const goals = await learningGoalCatalogService.listActiveGoals();
      if (isMounted) {
        setLearningGoals(goals);
      }
    };

    void loadGoals();
    return () => {
      isMounted = false;
    };
  }, []);

  const learningGoalsByCategory = useMemo(() => {
    const grouped = new Map<LearningGoalCategory, LearningGoalContract[]>();
    for (const goal of learningGoals) {
      const existing = grouped.get(goal.category) ?? [];
      existing.push(goal);
      grouped.set(goal.category, existing);
    }
    return grouped;
  }, [learningGoals]);

  const civicsGoalNeedsBundesland = learningGoalKey === CIVICS_GOAL_KEY && bundesland.trim().length === 0;

  const canSubmit = useMemo(
    () =>
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      nativeLanguage.trim().length >= 2 &&
      timezone.trim().length > 0 &&
      !civicsGoalNeedsBundesland &&
      !isSubmitting,
    [firstName, lastName, nativeLanguage, timezone, civicsGoalNeedsBundesland, isSubmitting],
  );

  if (status === 'loading') return <section className="card">Profil wird geladen …</section>;
  if (!isAuthenticated) return <Navigate to={paths.auth.login} replace />;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || !canSubmit) return;

    setIsSubmitting(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      if (email.trim().toLowerCase() !== (user.email ?? '').toLowerCase()) {
        await authService.updateEmail(email.trim());
      }

      if (newPassword.trim().length > 0) {
        await authService.updatePassword(newPassword.trim());
      }

      await profileService.updateProfile(user.id, {
        displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
        nativeLanguage,
        germanLevel,
        timezone,
        learningGoalKey: learningGoalKey.trim().length > 0 ? learningGoalKey : null,
        bundesland: bundesland.trim().length > 0 ? bundesland : null,
      });
      await authService.updateDisplayName(`${firstName.trim()} ${lastName.trim()}`.trim());

      setNewPassword('');
      setMessage('Profil erfolgreich gespeichert.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Profil konnte nicht gespeichert werden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onExportData = async () => {
    if (!user?.id) return;
    setExportError(null);
    setIsExporting(true);
    try {
      await accountDataExportService.downloadExport(user.id);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Datenexport fehlgeschlagen.');
    } finally {
      setIsExporting(false);
    }
  };

  const onDeleteAccount = async () => {
    if (deleteConfirmationInput.trim().toUpperCase() !== DELETE_CONFIRMATION_PHRASE) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await accountDeletionService.deleteOwnAccount();
      await authService.signOut();
      navigate(paths.landing, { replace: true });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Konto konnte nicht gelöscht werden.');
      setIsDeleting(false);
    }
  };

  return (
    <section className="page auth-page">
      <PageHeader title="Profil bearbeiten" subtitle="Bearbeite deine Kontodaten und alle Onboarding-Angaben an einem Ort." />
      <article className="card auth-card">
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label" htmlFor="profile-email">E-Mail</label>
          <input id="profile-email" className="auth-input" value={email} onChange={(event) => setEmail(event.target.value)} required />

          <label className="auth-label" htmlFor="profile-password">Neues Passwort (optional)</label>
          <input
            id="profile-password"
            className="auth-input"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            type="password"
            placeholder="Mindestens 8 Zeichen"
          />

          <label className="auth-label" htmlFor="profile-first-name">Vorname</label>
          <input id="profile-first-name" className="auth-input" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />

          <label className="auth-label" htmlFor="profile-last-name">Nachname</label>
          <input id="profile-last-name" className="auth-input" value={lastName} onChange={(event) => setLastName(event.target.value)} required />

          <label className="auth-label" htmlFor="profile-native-language">Muttersprache</label>
          <input
            id="profile-native-language"
            className="auth-input"
            value={nativeLanguage}
            onChange={(event) => setNativeLanguage(event.target.value)}
            minLength={2}
            required
          />

          <label className="auth-label" htmlFor="profile-german-level">Deutsch-Niveau (CEFR)</label>
          <select id="profile-german-level" className="auth-input" value={germanLevel} onChange={(event) => setGermanLevel(event.target.value as GermanLevel)}>
            {GERMAN_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>

          <h3 style={{ marginTop: 8, marginBottom: 0 }}>Dein Lernziel</h3>
          {entitlement?.planKey === 'free' ? (
            <>
              <p style={{ opacity: 0.8, marginTop: 0 }}>
                Lernpfade für Prüfungen und Zertifikate (DTZ, Einbürgerung, Fachsprachprüfung, Pflege,
                Leben in Deutschland und mehr) sind ab Starter dabei.
              </p>
              <Link to={paths.billing.pricing} className="button button-secondary">
                Auf Starter upgraden
              </Link>
            </>
          ) : (
            <>
              <p style={{ opacity: 0.8, marginTop: 0 }}>
                Bereitest du dich auf eine bestimmte Prüfung oder ein Zertifikat vor? Wähl sie hier aus, dann passt
                sich dein Training darauf an. Ohne Ziel übst du einfach frei weiter.
              </p>
              <label className="auth-label" htmlFor="profile-learning-goal">Lernziel (optional)</label>
              <select
                id="profile-learning-goal"
                className="auth-input"
                value={learningGoalKey}
                onChange={(event) => setLearningGoalKey(event.target.value)}
              >
                <option value="">Kein spezifisches Ziel</option>
                {Array.from(learningGoalsByCategory.entries()).map(([category, goals]) => (
                  <optgroup key={category} label={LEARNING_GOAL_CATEGORY_LABELS[category]}>
                    {goals.map((goal) => (
                      <option key={goal.goalKey} value={goal.goalKey}>
                        {goal.displayName}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              {learningGoalKey === CIVICS_GOAL_KEY ? (
                <>
                  <label className="auth-label" htmlFor="profile-bundesland">Bundesland</label>
                  <select
                    id="profile-bundesland"
                    className="auth-input"
                    value={bundesland}
                    onChange={(event) => setBundesland(event.target.value)}
                  >
                    <option value="">Bitte wählen ...</option>
                    {BUNDESLAENDER.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                  <p style={{ opacity: 0.8, marginTop: 0 }}>
                    Nur für "Leben in Deutschland" wichtig: so bekommst du neben den bundesweiten Fragen auch die
                    aus deinem Bundesland. Für deine anderen Ziele brauchst du das nicht.
                  </p>
                  {civicsGoalNeedsBundesland ? (
                    <p className="auth-error">Bitte wähle dein Bundesland, um dieses Ziel zu speichern.</p>
                  ) : null}
                </>
              ) : null}
            </>
          )}

          <label className="auth-label" htmlFor="profile-timezone">Zeitzone</label>
          <input id="profile-timezone" className="auth-input" value={timezone} onChange={(event) => setTimezone(event.target.value)} required />

          {message ? <p className="auth-info">{message}</p> : null}
          {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

          <button className={`button ${isSubmitting ? 'is-loading' : ''}`} type="submit" disabled={!canSubmit}>
            Speichern
          </button>
        </form>
      </article>

      {achievements.length > 0 ? (
        <article className="card auth-card">
          <h2 className="card-heading-with-icon">
            <Award aria-hidden="true" size={ICON_SIZE_MD} className="item-icon" />
            Meine Erfolge
          </h2>
          <div className="button-row" style={{ flexWrap: 'wrap' }}>
            {achievements.map((achievement) => (
              <Badge key={achievement.goalKey} tone="success" title={`Erreicht am ${formatAchievementDate(achievement.achievedAt)}`}>
                {achievement.displayName}
              </Badge>
            ))}
          </div>
        </article>
      ) : null}

      <article className="card auth-card">
        <h2 className="card-heading-with-icon">
          <Clock aria-hidden="true" size={ICON_SIZE_MD} className="item-icon" />
          Meine Nutzung
        </h2>
        {isUsageLoading || !entitlement ? (
          <p>Nutzung wird geladen …</p>
        ) : usageError ? (
          <InlineAlert tone="danger">
            {usageError instanceof Error ? usageError.message : 'Nutzung konnte nicht geladen werden.'}
          </InlineAlert>
        ) : usage ? (
          (() => {
            const dailyGoalSeconds = entitlement.sessionsPerDayLimit * entitlement.maxSessionLengthSeconds;
            const dailyGoalMinutes = secondsToWholeMinutes(dailyGoalSeconds);
            const minutesToday = secondsToWholeMinutes(usage.secondsToday);
            const percentToday = dailyGoalSeconds > 0 ? usage.secondsToday / dailyGoalSeconds : 0;
            const isGoalReached = usage.secondsToday >= dailyGoalSeconds;
            const minutesThisPeriod = secondsToWholeMinutes(usage.secondsThisPeriod);

            return (
              <>
                <div className="usage-meter-block">
                  <div className="usage-meter-head">
                    <p>Heute</p>
                    <strong>
                      {minutesToday} von {dailyGoalMinutes} Minuten
                    </strong>
                  </div>
                  <div
                    className="progress-meter"
                    role="progressbar"
                    aria-valuenow={minutesToday}
                    aria-valuemin={0}
                    aria-valuemax={dailyGoalMinutes}
                    aria-label={`${minutesToday} von ${dailyGoalMinutes} Minuten heute trainiert`}
                  >
                    <div
                      className="progress-meter-fill"
                      style={{ width: `${Math.min(100, percentToday * 100)}%`, background: usageBarColor(percentToday) }}
                    />
                  </div>
                  {isGoalReached ? <Badge tone="success">Tagesziel erreicht</Badge> : null}
                </div>
                <p className="usage-period-note">
                  {minutesThisPeriod} Minuten in dieser Abrechnungsperiode.
                </p>
              </>
            );
          })()
        ) : null}
      </article>

      <article className="card auth-card">
        <h2 className="card-heading-with-icon">
          <Download aria-hidden="true" size={ICON_SIZE_MD} className="item-icon" />
          Meine Daten
        </h2>
        <p>
          Lade eine Kopie aller bei uns über dich gespeicherten Daten herunter (Profil, Sessions,
          Transkripte, Analysen, Fokus-Themen, Abo-Informationen) als JSON-Datei.
        </p>
        <button
          type="button"
          className={`button button-secondary ${isExporting ? 'is-loading' : ''}`}
          onClick={() => void onExportData()}
          disabled={isExporting}
        >
          {isExporting ? 'Export wird erstellt …' : 'Meine Daten exportieren'}
        </button>
        {exportError ? <InlineAlert tone="danger">{exportError}</InlineAlert> : null}
      </article>

      <article className="card card--danger auth-card">
        <h2 className="card-heading-with-icon">
          <AlertTriangle aria-hidden="true" size={ICON_SIZE_MD} className="card-heading-icon--danger" />
          Konto löschen
        </h2>
        <p>
          Löscht dein Konto und alle damit verbundenen Daten unwiderruflich: Profil, Sessions,
          Transkripte, Analysen, Fokus-Themen und dein Stripe-Abo (wird sofort gekündigt). Diese
          Aktion kann nicht rückgängig gemacht werden.
        </p>
        <label className="auth-label" htmlFor="delete-confirmation">
          Gib zur Bestätigung <strong>{DELETE_CONFIRMATION_PHRASE}</strong> ein
        </label>
        <input
          id="delete-confirmation"
          className="auth-input"
          value={deleteConfirmationInput}
          onChange={(event) => setDeleteConfirmationInput(event.target.value)}
          placeholder={DELETE_CONFIRMATION_PHRASE}
        />
        {deleteError ? <InlineAlert tone="danger">{deleteError}</InlineAlert> : null}
        <button
          type="button"
          className="button button-danger"
          onClick={() => void onDeleteAccount()}
          disabled={isDeleting || deleteConfirmationInput.trim().toUpperCase() !== DELETE_CONFIRMATION_PHRASE}
        >
          {isDeleting ? 'Konto wird gelöscht …' : 'Konto endgültig löschen'}
        </button>
      </article>
    </section>
  );
}
