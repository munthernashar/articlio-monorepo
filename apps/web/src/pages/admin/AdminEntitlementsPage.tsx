import { useState } from 'react';
import { userEntitlementsService, type AdminUserSearchResult } from '@/services/supabase/user-entitlements.service';
import type { UserEntitlementStatus } from '@/types/user-entitlements';

type EntitlementFormState = {
  userId: string;
  planKey: string;
  sessionsPerDayLimit: number;
  maxSessionLengthSeconds: number;
  dailyConversationSecondsLimit: string;
  monthlyTokenLimit: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  status: UserEntitlementStatus;
};

const INITIAL_FORM: EntitlementFormState = {
  userId: '',
  planKey: 'support-override',
  sessionsPerDayLimit: 3,
  maxSessionLengthSeconds: 900,
  dailyConversationSecondsLimit: '',
  monthlyTokenLimit: '',
  billingPeriodStart: '',
  billingPeriodEnd: '',
  status: 'active',
};

// Backoffice-Zuweisung ohne Bezahlung (07.09.2026): Werte 1:1 gespiegelt aus
// supabase/functions/stripe-webhook/index.ts (PLAN_CONFIGS + FREE_PLAN_CONFIG) und aus
// grant_free_entitlement() (Migration 20260827170000ff.) -- reine Ausfüllhilfe für dieses
// Formular, admin kann jeden Wert danach noch von Hand anpassen. Bei einer künftigen
// Preis-/Limit-Änderung dort UND hier nachziehen (kein automatischer Abgleich, wie auch sonst
// in diesem Codebase üblich, siehe z. B. model-pricing.ts-Duplikate zwischen Client/Edge).
type PlanTemplate = {
  key: string;
  label: string;
  planKey: string;
  sessionsPerDayLimit: number;
  maxSessionLengthSeconds: number;
  dailyConversationSecondsLimit: number | null;
  monthlyTokenLimit: number | null;
};

const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    key: 'free',
    label: 'Free (kostenlos, 1 Session/Tag, 3 Min)',
    planKey: 'free',
    sessionsPerDayLimit: 1,
    maxSessionLengthSeconds: 180,
    dailyConversationSecondsLimit: null,
    monthlyTokenLimit: 200000,
  },
  {
    key: 'starter',
    label: 'Starter (5 €/Monat, 1 Session/Tag, 15 Min)',
    planKey: 'starter',
    sessionsPerDayLimit: 1,
    maxSessionLengthSeconds: 900,
    dailyConversationSecondsLimit: null,
    monthlyTokenLimit: 300000,
  },
  {
    key: 'pro',
    label: 'Pro (9 €/Monat, 1 Session/Tag, 15 Min, Coach)',
    planKey: 'pro',
    sessionsPerDayLimit: 1,
    maxSessionLengthSeconds: 900,
    dailyConversationSecondsLimit: null,
    monthlyTokenLimit: 1200000,
  },
];

export function AdminEntitlementsPage() {
  const [form, setForm] = useState<EntitlementFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AdminUserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadUserEntitlement = async (userIdOverride?: string) => {
    const userId = (userIdOverride ?? form.userId).trim();
    if (!userId) {
      setErrorMessage('Bitte eine User-ID eingeben.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const entry = await userEntitlementsService.getByUserId(userId);

      if (!entry) {
        setForm((current) => ({ ...current, userId }));
        setInfoMessage('Kein Override vorhanden. Du kannst unten einen neuen Eintrag speichern.');
        return;
      }

      setForm((current) => ({
        ...current,
        userId: entry.userId,
        planKey: entry.planKey,
        sessionsPerDayLimit: entry.sessionsPerDayLimit,
        maxSessionLengthSeconds: entry.maxSessionLengthSeconds,
        dailyConversationSecondsLimit: entry.dailyConversationSecondsLimit?.toString() ?? '',
        monthlyTokenLimit: entry.monthlyTokenLimit?.toString() ?? '',
        billingPeriodStart: entry.billingPeriodStart?.slice(0, 10) ?? '',
        billingPeriodEnd: entry.billingPeriodEnd?.slice(0, 10) ?? '',
        status: entry.status,
      }));
      setInfoMessage('Entitlement geladen.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Entitlement konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async () => {
    if (searchQuery.trim().length < 2) {
      setSearchError('Bitte mindestens 2 Zeichen eingeben.');
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const results = await userEntitlementsService.searchUsersByEmail(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('Keine Nutzer gefunden.');
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Nutzersuche fehlgeschlagen.');
    } finally {
      setSearching(false);
    }
  };

  const selectSearchResult = (result: AdminUserSearchResult) => {
    void loadUserEntitlement(result.userId);
  };

  const applyPlanTemplate = (templateKey: string) => {
    const template = PLAN_TEMPLATES.find((entry) => entry.key === templateKey);
    if (!template) return;

    setForm((current) => ({
      ...current,
      planKey: template.planKey,
      sessionsPerDayLimit: template.sessionsPerDayLimit,
      maxSessionLengthSeconds: template.maxSessionLengthSeconds,
      dailyConversationSecondsLimit: template.dailyConversationSecondsLimit?.toString() ?? '',
      monthlyTokenLimit: template.monthlyTokenLimit?.toString() ?? '',
    }));
    setInfoMessage(`Vorlage "${template.label}" übernommen -- vor dem Speichern bei Bedarf noch anpassen.`);
  };

  const save = async () => {
    if (!form.userId.trim()) {
      setErrorMessage('Bitte eine User-ID eingeben.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      await userEntitlementsService.upsertEntitlement({
        userId: form.userId.trim(),
        planKey: form.planKey.trim() || 'support-override',
        sessionsPerDayLimit: form.sessionsPerDayLimit,
        maxSessionLengthSeconds: form.maxSessionLengthSeconds,
        dailyConversationSecondsLimit:
          form.dailyConversationSecondsLimit.trim() === '' ? null : Number(form.dailyConversationSecondsLimit),
        monthlyTokenLimit: form.monthlyTokenLimit.trim() === '' ? null : Number(form.monthlyTokenLimit),
        billingPeriodStart: form.billingPeriodStart ? `${form.billingPeriodStart}T00:00:00.000Z` : null,
        billingPeriodEnd: form.billingPeriodEnd ? `${form.billingPeriodEnd}T23:59:59.000Z` : null,
        status: form.status,
      });

      setInfoMessage('Entitlement gespeichert.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Entitlement konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      {errorMessage ? <article className="card auth-error">{errorMessage}</article> : null}
      {infoMessage ? <article className="card auth-info">{infoMessage}</article> : null}

      <article className="card admin-form-card">
        <label className="auth-label" htmlFor="ent-search-email">Nutzer per E-Mail suchen</label>
        <div className="button-row" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
          <input
            id="ent-search-email"
            className="auth-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void searchUsers();
              }
            }}
            placeholder="z. B. munther@ oder gmx.de"
          />
          <button type="button" className="button button-secondary" onClick={searchUsers} disabled={searching}>
            {searching ? 'Suche …' : 'Suchen'}
          </button>
        </div>
        {searchError ? <p className="auth-error">{searchError}</p> : null}
        {searchResults.length > 0 ? (
          <ul className="admin-log-list">
            {searchResults.map((result) => (
              <li key={result.userId}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => selectSearchResult(result)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  {result.email ?? result.userId} — {result.displayName ?? 'ohne Namen'} · aktuell:{' '}
                  {result.currentPlanKey ?? 'kein Entitlement'}
                  {result.currentStatus ? ` (${result.currentStatus})` : ''}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </article>

      <article className="card admin-form-card">
        <label className="auth-label" htmlFor="ent-user-id">User-ID</label>
        <input
          id="ent-user-id"
          className="auth-input"
          value={form.userId}
          onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
          placeholder="UUID aus auth.users / profiles.id"
        />
        <div className="button-row" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="button button-secondary" onClick={() => loadUserEntitlement()} disabled={loading}>
            {loading ? 'Lade …' : 'Vorhandenes Entitlement laden'}
          </button>
        </div>

        <label className="auth-label" htmlFor="ent-plan-template">Paket-Vorlage (füllt die Felder unten aus)</label>
        <select
          id="ent-plan-template"
          className="auth-input"
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) applyPlanTemplate(event.target.value);
            event.target.value = '';
          }}
        >
          <option value="">— Vorlage wählen —</option>
          {PLAN_TEMPLATES.map((template) => (
            <option key={template.key} value={template.key}>
              {template.label}
            </option>
          ))}
        </select>

        <label className="auth-label" htmlFor="ent-plan-key">Plan-Key</label>
        <input
          id="ent-plan-key"
          className="auth-input"
          value={form.planKey}
          onChange={(event) => setForm((current) => ({ ...current, planKey: event.target.value }))}
        />

        <label className="auth-label" htmlFor="ent-sessions-day">Sessions pro Tag</label>
        <input
          id="ent-sessions-day"
          className="auth-input"
          type="number"
          min={1}
          max={100}
          value={form.sessionsPerDayLimit}
          onChange={(event) =>
            setForm((current) => ({ ...current, sessionsPerDayLimit: Number(event.target.value) || 1 }))
          }
        />

        <label className="auth-label" htmlFor="ent-max-length">Max. Session-Länge (Sekunden)</label>
        <input
          id="ent-max-length"
          className="auth-input"
          type="number"
          min={60}
          max={86400}
          value={form.maxSessionLengthSeconds}
          onChange={(event) =>
            setForm((current) => ({ ...current, maxSessionLengthSeconds: Number(event.target.value) || 60 }))
          }
        />

        <label className="auth-label" htmlFor="ent-daily-seconds">Daily Conversation Seconds Limit (optional)</label>
        <input
          id="ent-daily-seconds"
          className="auth-input"
          type="number"
          min={60}
          value={form.dailyConversationSecondsLimit}
          onChange={(event) => setForm((current) => ({ ...current, dailyConversationSecondsLimit: event.target.value }))}
        />

        <label className="auth-label" htmlFor="ent-monthly-tokens">Monthly Token Limit (optional)</label>
        <input
          id="ent-monthly-tokens"
          className="auth-input"
          type="number"
          min={1}
          value={form.monthlyTokenLimit}
          onChange={(event) => setForm((current) => ({ ...current, monthlyTokenLimit: event.target.value }))}
        />

        <label className="auth-label" htmlFor="ent-billing-start">Billing Start (optional)</label>
        <input
          id="ent-billing-start"
          className="auth-input"
          type="date"
          value={form.billingPeriodStart}
          onChange={(event) => setForm((current) => ({ ...current, billingPeriodStart: event.target.value }))}
        />

        <label className="auth-label" htmlFor="ent-billing-end">Billing End (optional)</label>
        <input
          id="ent-billing-end"
          className="auth-input"
          type="date"
          value={form.billingPeriodEnd}
          onChange={(event) => setForm((current) => ({ ...current, billingPeriodEnd: event.target.value }))}
        />

        <label className="auth-label" htmlFor="ent-status">Status</label>
        <select
          id="ent-status"
          className="auth-input"
          value={form.status}
          onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as UserEntitlementStatus }))}
        >
          <option value="active">active</option>
          <option value="grace">grace</option>
          <option value="suspended">suspended</option>
          <option value="expired">expired</option>
        </select>

        <div className="button-row" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="button" onClick={save} disabled={saving}>
            {saving ? 'Speichere …' : 'Entitlement speichern'}
          </button>
        </div>
      </article>
    </section>
  );
}
