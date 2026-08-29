import { useEffect, useState } from 'react';
import { appVersionInfo } from '@/lib/app-version';
import { appSettingsService, DEFAULT_APP_SETTINGS } from '@/services/supabase/app-settings.service';
import type { AppSettings, AppFeatureKey, FeedbackHardness } from '@/types/app-settings';

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    categoryWeights: { ...settings.categoryWeights },
    featureFlags: { ...settings.featureFlags },
  };
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(cloneSettings(DEFAULT_APP_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const loaded = await appSettingsService.getSettings(true);
        setSettings(cloneSettings(loaded));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Settings konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const setNumber = (key: keyof AppSettings, value: number) => {
    setInfoMessage(null);
    setSettings((current) => ({ ...current, [key]: Number.isNaN(value) ? 0 : value }));
  };

  const setRangedNumber = (key: keyof AppSettings, value: number, min: number, max: number) => {
    const next = Number.isNaN(value) ? min : Math.max(min, Math.min(max, value));
    setNumber(key, next);
  };

  const setFeature = (key: AppFeatureKey, value: boolean) => {
    setInfoMessage(null);
    setSettings((current) => ({
      ...current,
      featureFlags: {
        ...current.featureFlags,
        [key]: value,
      },
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const saved = await appSettingsService.updateSettings(settings);
      setSettings(cloneSettings(saved));
      setInfoMessage('Einstellungen gespeichert.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Settings konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <article className="card">
        <h3>Version</h3>
        <p>
          Aktive App-Version: <strong>{appVersionInfo.version}</strong>
        </p>
        <p>
          GitHub Commit (Identifier): <code>{appVersionInfo.gitSha}</code>
        </p>
        <p>
          Build-ID: <code>{appVersionInfo.buildIdentifier}</code>
        </p>
      </article>

      {loading ? <article className="card">Einstellungen werden geladen …</article> : null}
      {errorMessage ? <article className="card auth-error">{errorMessage}</article> : null}
      {infoMessage ? <article className="card auth-info">{infoMessage}</article> : null}

      {!loading ? (
        <article className="card admin-form-card">
          <h3>Lernlogik</h3>

          <label className="auth-label" htmlFor="min-diagnosis">
            Diagnosephase: Sessions (3-5)
          </label>
          <input
            id="min-diagnosis"
            className="auth-input"
            type="number"
            min={3}
            max={5}
            value={settings.minSessionsForDiagnosis}
            onChange={(event) => setRangedNumber('minSessionsForDiagnosis', Number(event.target.value), 3, 5)}
          />

          <label className="auth-label" htmlFor="improvement-min-recent-sessions">
            Improvement: minimale Anzahl freier Sessions
          </label>
          <input
            id="improvement-min-recent-sessions"
            className="auth-input"
            type="number"
            min={1}
            max={20}
            value={settings.improvementMinRecentSessions}
            onChange={(event) =>
              setRangedNumber('improvementMinRecentSessions', Number(event.target.value), 1, 20)
            }
          />

          <label className="auth-label" htmlFor="improvement-min-confidence">
            Improvement: minimale LLM-Confidence (0-100)
          </label>
          <input
            id="improvement-min-confidence"
            className="auth-input"
            type="number"
            min={0}
            max={100}
            value={settings.improvementMinConfidence}
            onChange={(event) => setRangedNumber('improvementMinConfidence', Number(event.target.value), 0, 100)}
          />

          <label className="auth-label" htmlFor="improvement-required-streak">
            Improvement: benötigte Streak für "improved" (optional)
          </label>
          <input
            id="improvement-required-streak"
            className="auth-input"
            type="number"
            min={1}
            max={10}
            placeholder="leer = deaktiviert"
            value={settings.improvementRequiredStreak ?? ''}
            onChange={(event) => {
              setInfoMessage(null);
              const raw = event.target.value;
              if (raw.trim() === '') {
                setSettings((current) => ({ ...current, improvementRequiredStreak: null }));
                return;
              }
              const parsed = Number(raw);
              setSettings((current) => ({
                ...current,
                improvementRequiredStreak: Number.isNaN(parsed) ? null : Math.max(1, Math.min(10, parsed)),
              }));
            }}
          />

          <label className="auth-label" htmlFor="max-sessions-day">
            Default: Maximale Sessions pro Tag (Fallback ohne User-Entitlement)
          </label>
          <input
            id="max-sessions-day"
            className="auth-input"
            type="number"
            min={1}
            max={20}
            value={settings.maxSessionsPerDay}
            onChange={(event) => setRangedNumber('maxSessionsPerDay', Number(event.target.value), 1, 20)}
          />

          <label className="auth-label" htmlFor="max-session-length-seconds">
            Default: Maximale Session-Länge (Fallback ohne User-Entitlement)
          </label>
          <input
            id="max-session-length-seconds"
            className="auth-input"
            type="number"
            min={60}
            max={7200}
            value={settings.maxSessionLengthSeconds}
            onChange={(event) => setRangedNumber('maxSessionLengthSeconds', Number(event.target.value), 60, 7200)}
          />
          <p style={{ marginTop: '-0.5rem', marginBottom: '1rem', opacity: 0.8 }}>
            Aktuell: {Math.round(settings.maxSessionLengthSeconds / 60)} Minuten ({settings.maxSessionLengthSeconds}{' '}
            Sekunden)
          </p>

          <label className="auth-label" htmlFor="primary-session-index">
            Welche Session pro Tag zählt voll in den Haupt-Score
          </label>
          <input
            id="primary-session-index"
            className="auth-input"
            type="number"
            min={1}
            max={20}
            value={settings.primaryScoreSessionIndex}
            onChange={(event) => setRangedNumber('primaryScoreSessionIndex', Number(event.target.value), 1, 20)}
          />

          <label className="auth-label" htmlFor="diagnosis-max-sessions">
            Diagnosephase: maximal analysierte Sessions
          </label>
          <input
            id="diagnosis-max-sessions"
            className="auth-input"
            type="number"
            min={3}
            max={12}
            value={settings.diagnosisMaxSessions}
            onChange={(event) => setRangedNumber('diagnosisMaxSessions', Number(event.target.value), 3, 12)}
          />

          <label className="auth-label" htmlFor="session-lookback-limit">
            Pattern-Erkennung: Session-Lookback-Limit
          </label>
          <input
            id="session-lookback-limit"
            className="auth-input"
            type="number"
            min={3}
            max={20}
            value={settings.sessionLookbackLimit}
            onChange={(event) => setRangedNumber('sessionLookbackLimit', Number(event.target.value), 3, 20)}
          />

          <label className="auth-label" htmlFor="non-primary-session-score-multiplier">
            Score-Multiplikator für nicht-primäre Session (0.1-1.0)
          </label>
          <input
            id="non-primary-session-score-multiplier"
            className="auth-input"
            type="number"
            min={0.1}
            max={1}
            step={0.05}
            value={settings.nonPrimarySessionScoreMultiplier}
            onChange={(event) =>
              setRangedNumber('nonPrimarySessionScoreMultiplier', Number(event.target.value), 0.1, 1)
            }
          />

          <label className="auth-label" htmlFor="focus-recurrence-threshold">
            Fokusauswahl: Mindest-Recurrence (0.1-1.0)
          </label>
          <input
            id="focus-recurrence-threshold"
            className="auth-input"
            type="number"
            min={0.1}
            max={1}
            step={0.05}
            value={settings.focusRecurrenceThreshold}
            onChange={(event) => setRangedNumber('focusRecurrenceThreshold', Number(event.target.value), 0.1, 1)}
          />

          <label className="auth-label" htmlFor="worsened-delta-threshold">
            Improvement: Worsened-Schwelle Delta zu Baseline (-3.0 bis 0)
          </label>
          <input
            id="worsened-delta-threshold"
            className="auth-input"
            type="number"
            min={-3}
            max={0}
            step={0.1}
            value={settings.worsenedDeltaThreshold}
            onChange={(event) => setRangedNumber('worsenedDeltaThreshold', Number(event.target.value), -3, 0)}
          />

          <h3>Gewichtung der Kategorien</h3>
          <div className="admin-grid-3">
            {Object.entries(settings.categoryWeights).map(([key, value]) => {
              const categoryKey = key as keyof AppSettings['categoryWeights'];
              return (
              <label key={key} className="auth-label">
                {key}
                <input
                  className="auth-input"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={value}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      categoryWeights: {
                        ...current.categoryWeights,
                        [categoryKey]: Number(event.target.value),
                      },
                    }))
                  }
                />
              </label>
              );
            })}
          </div>

          <h3>Coaching / Feedback</h3>
          <label className="auth-label" htmlFor="feedback-hardness">
            Härtegrad des Feedbacks
          </label>
          <select
            id="feedback-hardness"
            className="auth-input"
            value={settings.feedbackHardness}
            onChange={(event) =>
              setSettings((current) => ({ ...current, feedbackHardness: event.target.value as FeedbackHardness }))
            }
          >
            <option value="soft">soft</option>
            <option value="balanced">balanced</option>
            <option value="direct">direct</option>
          </select>

          <label className="auth-label" htmlFor="tutor-language">
            Sprache der Coaching-Erklärungen
          </label>
          <input
            id="tutor-language"
            className="auth-input"
            value={settings.tutorExplanationLanguage}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                tutorExplanationLanguage: event.target.value,
              }))
            }
          />

          <h3>Feature-Flags</h3>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={settings.featureFlags.session_analysis}
              onChange={(event) => setFeature('session_analysis', event.target.checked)}
            />
            Session-Analyse aktiv
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={settings.featureFlags.multi_session_patterns}
              onChange={(event) => setFeature('multi_session_patterns', event.target.checked)}
            />
            Mustererkennung über Sessions aktiv
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={settings.featureFlags.focus_topic_selection}
              onChange={(event) => setFeature('focus_topic_selection', event.target.checked)}
            />
            Fokus-Themen-Auswahl aktiv
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={settings.featureFlags.tutor}
              onChange={(event) => setFeature('tutor', event.target.checked)}
            />
            Coaching aktiv
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={settings.featureFlags.improvement_checks}
              onChange={(event) => setFeature('improvement_checks', event.target.checked)}
            />
            Improvement-Checks aktiv
          </label>

          <div className="button-row" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="button" onClick={saveSettings} disabled={saving}>
              {saving ? 'Speichere …' : 'Settings speichern'}
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
