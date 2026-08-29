import { useCallback, useEffect, useState } from 'react';
import { adminAuditLogService } from '@/services/supabase/admin-audit-log.service';
import { adminErrorMonitorService, type AdminSessionFailure } from '@/services/supabase/admin-error-monitor.service';
import type { AdminAuditLogEntryRow, PromptExecutionLogDbRow } from '@/types/database';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatActor(entry: AdminAuditLogEntryRow): string {
  if (entry.actor_display_name?.trim()) {
    return entry.actor_display_name;
  }

  return entry.actor_user_id ?? 'system';
}

function asPrettyJson(value: unknown): string {
  if (value == null) {
    return '-';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AdminToolsPanel() {
  const [logs, setLogs] = useState<AdminAuditLogEntryRow[]>([]);
  const [failedSessions, setFailedSessions] = useState<AdminSessionFailure[]>([]);
  const [failedPromptExecutions, setFailedPromptExecutions] = useState<PromptExecutionLogDbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, sessionFailures, promptFailures] = await Promise.all([
        adminAuditLogService.listRecent(30),
        adminErrorMonitorService.listFailedSessions(100),
        adminErrorMonitorService.listPromptExecutionFailures(100),
      ]);
      setLogs(data);
      setFailedSessions(sessionFailures);
      setFailedPromptExecutions(promptFailures);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : 'Audit-Logs konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <article className="card admin-tools-panel">
      <div className="admin-tools-header-row">
        <div>
          <h3>Admin Tools</h3>
          <p>Monitoring-Übersicht für kritische Admin-Änderungen (Rollen, Prompts, App Settings).</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void loadLogs()}>
          Aktualisieren
        </button>
      </div>

      {loading ? <p>Audit-Logs werden geladen …</p> : null}
      {error ? <p>{error}</p> : null}
      {!loading && !error && logs.length === 0 ? <p>Keine Audit-Einträge vorhanden.</p> : null}
      {!loading && !error ? (
        <section style={{ marginBottom: '1rem' }}>
          <h4>Globale Fehlerübersicht (Multi-User)</h4>
          <p>Session-Fehler gesamt: {failedSessions.length} · Prompt-Fehler gesamt: {failedPromptExecutions.length}</p>
          <details>
            <summary>Session-Fehler (alle Benutzer)</summary>
            {failedSessions.length === 0 ? <p>Keine fehlgeschlagenen Sessions.</p> : null}
            {failedSessions.length > 0 ? (
              <ul className="admin-audit-list">
                {failedSessions.map((sessionFailure) => (
                  <li key={sessionFailure.id} className="admin-audit-item">
                    <p>
                      <strong>{sessionFailure.title ?? 'Session ohne Titel'}</strong> · User: {sessionFailure.userId}
                    </p>
                    <p>
                      Quelle: {sessionFailure.source ?? '-'} · Aktualisiert: {formatDateTime(sessionFailure.updatedAt)}
                    </p>
                    <p>Fehler: {sessionFailure.lastError ?? 'Kein Fehlertext in metadata.processing.lastError vorhanden.'}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>

          <details style={{ marginTop: '0.75rem' }}>
            <summary>Prompt-Ausführungsfehler (alle Benutzer)</summary>
            {failedPromptExecutions.length === 0 ? <p>Keine fehlgeschlagenen Prompt-Ausführungen.</p> : null}
            {failedPromptExecutions.length > 0 ? (
              <ul className="admin-audit-list">
                {failedPromptExecutions.map((entry) => (
                  <li key={entry.id} className="admin-audit-item">
                    <p>
                      <strong>{entry.prompt_key}</strong> · Feature: {entry.feature_name} · User: {entry.user_id ?? 'system'}
                    </p>
                    <p>
                      Zeit: {formatDateTime(entry.created_at)} · Status: {entry.status} · Versuch: {entry.attempt_number}
                    </p>
                    <p>Fehler: {entry.error_message ?? 'Kein Fehlertext verfügbar.'}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        </section>
      ) : null}

      {!loading && !error && logs.length > 0 ? (
        <ul className="admin-audit-list">
          {logs.map((entry) => (
            <li className="admin-audit-item" key={entry.id}>
              <p>
                <strong>{entry.entity}</strong> · {entry.action.toUpperCase()} · {formatDateTime(entry.created_at)}
              </p>
              <p>
                Actor: {formatActor(entry)} · Entity-ID: {entry.entity_id ?? '-'} · Trace: {entry.trace_id ?? '-'}
              </p>
              <details>
                <summary>Before / After anzeigen</summary>
                <div className="admin-audit-json-grid">
                  <div>
                    <strong>Before</strong>
                    <pre>{asPrettyJson(entry.before_json)}</pre>
                  </div>
                  <div>
                    <strong>After</strong>
                    <pre>{asPrettyJson(entry.after_json)}</pre>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
