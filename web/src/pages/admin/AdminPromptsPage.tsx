import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';
import { withTimeout } from '@/lib/with-timeout';
import { promptAdminService } from '@/services/supabase/prompt-admin.service';
import type {
  PromptDefinitionRow,
  PromptRuntimeHealthCheck,
  PromptRuntimeHealthStatus,
} from '@/types/prompt-admin';

type PromptDefinitionGroup = {
  promptKey: string;
  versions: PromptDefinitionRow[];
};

function formatUpdatedAt(value: string) {
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function toRuntimeWarning(status: PromptRuntimeHealthStatus | undefined): string | null {
  if (!status || status.status === 'healthy') return null;
  if (status.status === 'error') {
    return `${status.adminHint}${status.invalidReason ? ` (${status.invalidReason})` : ''}`;
  }
  if (status.status === 'fallback') {
    return `${status.adminHint} (${status.fallbackReason ?? 'db_missing'})`;
  }
  return status.adminHint;
}

export function AdminPromptsPage() {
  const [prompts, setPrompts] = useState<PromptDefinitionRow[]>([]);
  const [runtimeHealth, setRuntimeHealth] = useState<PromptRuntimeHealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, runtimeSourceStatuses] = await withTimeout(
        Promise.all([
          promptAdminService.listPromptDefinitions(),
          promptAdminService.getPromptRuntimeHealthCheck(),
        ]),
        10_000,
        'Zeitüberschreitung beim Laden, bitte neu laden.',
      );
      setPrompts(data);
      setRuntimeHealth(runtimeSourceStatuses);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : 'Prompts konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  const groups = useMemo<PromptDefinitionGroup[]>(() => {
    const grouped = new Map<string, PromptDefinitionRow[]>();

    prompts.forEach((prompt) => {
      grouped.set(prompt.prompt_key, [...(grouped.get(prompt.prompt_key) ?? []), prompt]);
    });

    return [...grouped.entries()].map(([promptKey, versions]) => ({ promptKey, versions }));
  }, [prompts]);

  const runtimeStatuses = useMemo(() => {
    return (runtimeHealth?.statuses ?? []).reduce<Record<string, PromptRuntimeHealthStatus>>((accumulator, status) => {
      accumulator[status.promptKey] = status;
      return accumulator;
    }, {});
  }, [runtimeHealth]);

  return (
    <section className="page">

      {loading ? <article className="card">Prompts werden geladen …</article> : null}
      {error ? (
        <article className="card">
          <p>{error}</p>
          <button className="button button-secondary" type="button" onClick={() => void loadPrompts()}>
            Erneut versuchen
          </button>
        </article>
      ) : null}

      {!loading && !error && runtimeHealth ? (
        <article className="card">
          <p>
            <strong>
              {runtimeHealth.dbActivePromptKeys}/{runtimeHealth.totalPromptKeys} Prompts DB-aktiv
            </strong>
          </p>
          <p>
            <strong>{runtimeHealth.fallbackExecutions24h} Fallback-Ausführungen in {runtimeHealth.windowHours}h</strong>
          </p>
          {runtimeHealth.warningPromptKeys.length > 0 ? (
            <p>
              Warnstatus: {runtimeHealth.warningPromptKeys.join(', ')}
            </p>
          ) : (
            <p>Keine Prompt-Keys mit Warnstatus.</p>
          )}
        </article>
      ) : null}

      {!loading && !error
          ? groups.map((group) => {
            const latest = group.versions[0];
            if (!latest) return null;
            const activeVersion = group.versions.find((version) => version.is_active);
            const runtimeStatus = runtimeStatuses[group.promptKey];
            const runtimeReason = toRuntimeWarning(runtimeStatus);

            return (
              <article className="card" key={group.promptKey}>
                <div className="admin-prompts-row">
                  <div>
                    <h3>{group.promptKey}</h3>
                    <p>
                      Neueste Version: v{latest.version} · Aktualisiert: {formatUpdatedAt(latest.updated_at)}
                    </p>
                    <p>
                      Aktiv: {activeVersion ? `v${activeVersion.version}` : 'keine aktive Version'} · Gesamtversionen:{' '}
                      {group.versions.length}
                    </p>
                    {runtimeReason ? (
                      <p className="admin-runtime-warning-badge">
                        Runtime-Hinweis: {runtimeReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="admin-prompts-actions">
                    <Link className="button" to={paths.admin.promptDetail(group.promptKey)}>
                      Öffnen
                    </Link>
                    {runtimeReason ? (
                      <Link className="button button-secondary" to={paths.admin.promptDetail(group.promptKey)}>
                        DB-Version aktivieren
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        : null}
    </section>
  );
}
