import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';
import { adminBillingEventsService, type AdminBillingEventItem } from '@/services/supabase/admin-billing-events.service';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function timelineAgeMinutes(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function AdminBillingEventsPage() {
  const [events, setEvents] = useState<AdminBillingEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const recent = await adminBillingEventsService.listRecent(250);
      setEvents(recent);
      if (!activeUserId && recent[0]?.userId) {
        setActiveUserId(recent[0].userId);
      }
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : 'Billing-Events konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const userIds = useMemo(
    () => Array.from(new Set(events.map((event) => event.userId).filter((value): value is string => Boolean(value)))),
    [events],
  );

  const timeline = useMemo(
    () => events.filter((event) => (activeUserId ? event.userId === activeUserId : true)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [events, activeUserId],
  );

  const onRetry = useCallback(async (eventId: string) => {
    await adminBillingEventsService.retryEvent(eventId);
    await loadEvents();
  }, [loadEvents]);

  return (
    <section className="page">

      <article className="card" style={{ marginBottom: '1rem' }}>
        <p>
          Standardmaßnahmen im Runbook:{' '}
          <a href="/docs/admin-billing-webhook-runbook.md" target="_blank" rel="noreferrer">
            docs/admin-billing-webhook-runbook.md
          </a>
        </p>
        <button className="button button-secondary" type="button" onClick={() => void loadEvents()}>
          Aktualisieren
        </button>{' '}
        <Link to={paths.admin.dashboard} className="button button-secondary" style={{ marginLeft: '0.5rem' }}>
          Zurück zum Admin Dashboard
        </Link>
      </article>

      <article className="card" style={{ marginBottom: '1rem' }}>
        <h3>Kunden-Timeline</h3>
        <label>
          User auswählen:{' '}
          <select value={activeUserId ?? ''} onChange={(event) => setActiveUserId(event.target.value || null)}>
            <option value="">Alle User</option>
            {userIds.map((userId) => (
              <option key={userId} value={userId}>
                {userId}
              </option>
            ))}
          </select>
        </label>
        <p style={{ marginTop: '0.5rem' }}>Events in Timeline: {timeline.length}</p>
      </article>

      <article className="card">
        {loading ? <p>Billing-Events werden geladen …</p> : null}
        {error ? <p>{error}</p> : null}
        {!loading && !error && timeline.length === 0 ? <p>Keine Billing-Events für die Auswahl vorhanden.</p> : null}

        {!loading && !error && timeline.length > 0 ? (
          <ul className="admin-audit-list">
            {timeline.map((event) => (
              <li key={event.id} className="admin-audit-item">
                <p>
                  <strong>{event.eventType}</strong> · Stripe Event: {event.stripeEventId}
                </p>
                <p>
                  User: {event.userId ?? '-'} · Status: {event.processingStatus} · Erstellt: {formatDateTime(event.createdAt)} ·{' '}
                  Age: {timelineAgeMinutes(event.createdAt)} min
                </p>
                <p>Fehler: {event.processingError ?? 'Kein Fehlertext verfügbar.'}</p>
                <p>
                  Audit/Trace: {event.traceId ? <code>{event.traceId}</code> : 'Kein trace_id im payload'}
                </p>
                <p>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void onRetry(event.id)}
                    disabled={event.processingStatus === 'processed' || event.processingStatus === 'processing'}
                  >
                    Retry
                  </button>{' '}
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void onRetry(event.id)}
                    disabled={event.processingStatus === 'processing'}
                  >
                    Replay
                  </button>
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </section>
  );
}
