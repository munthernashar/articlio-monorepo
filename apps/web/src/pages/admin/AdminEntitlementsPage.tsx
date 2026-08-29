import { useState } from 'react';
import { userEntitlementsService } from '@/services/supabase/user-entitlements.service';
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

export function AdminEntitlementsPage() {
  const [form, setForm] = useState<EntitlementFormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadUserEntitlement = async () => {
    if (!form.userId.trim()) {
      setErrorMessage('Bitte eine User-ID eingeben.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const entry = await userEntitlementsService.getByUserId(form.userId.trim());

      if (!entry) {
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
        <label className="auth-label" htmlFor="ent-user-id">User-ID</label>
        <input
          id="ent-user-id"
          className="auth-input"
          value={form.userId}
          onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
          placeholder="UUID aus auth.users / profiles.id"
        />
        <div className="button-row" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="button button-secondary" onClick={loadUserEntitlement} disabled={loading}>
            {loading ? 'Lade …' : 'Vorhandenes Entitlement laden'}
          </button>
        </div>

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
