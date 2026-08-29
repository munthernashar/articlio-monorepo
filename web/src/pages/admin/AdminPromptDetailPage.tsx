import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { paths } from '@/app/routes/paths';
import { useAuth } from '@/features/auth/useAuth';
import { promptAdminService } from '@/services/supabase/prompt-admin.service';
import type {
  PromptVariableDefinition,
  PromptVariableType,
  PromptDefinitionRow,
  PromptDefinitionUpdateInput,
  PromptExecutionLogRow,
  PromptParseFailureRate,
  PromptExecutionTestResult,
  PromptRuntimeSourceStatus,
} from '@/types/prompt-admin';
import type { Json, PromptResponseFormat } from '@/types/database';

const ALLOWED_RESPONSE_FORMATS: PromptResponseFormat[] = ['json_object', 'text'];

type ComparedPromptField = {
  key: string;
  label: string;
  baseValue: string;
  targetValue: string;
  changed: boolean;
  multiline?: boolean;
  longTextDiff?: boolean;
};

type PromptFormState = {
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  developerPrompt: string;
  userPromptTemplate: string;
  expectedOutputSchemaJsonRaw: string;
  promptVariablesDefinition: PromptVariableDefinition[];
  model: string;
  maxOutputTokens: number;
  responseFormat: PromptResponseFormat;
  isActive: boolean;
};

function collectVariableNames(template: string): string[] {
  return Array.from(template.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g))
    .map((match) => match[1] ?? '')
    .filter((entry) => entry.length > 0);
}

function isVariableType(value: unknown): value is PromptVariableType {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'json';
}

function normalizePromptVariableDefinitions(input: Json, template: string): PromptVariableDefinition[] {
  if (Array.isArray(input)) {
    const normalized = input
      .map((entry) => {
        if (!entry || Array.isArray(entry) || typeof entry !== 'object') return null;
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!name) return null;
        return {
          name,
          type: isVariableType(entry.type) ? entry.type : 'string',
          required: typeof entry.required === 'boolean' ? entry.required : true,
          description: typeof entry.description === 'string' ? entry.description : '',
          defaultValue:
            typeof entry.defaultValue === 'string'
              ? entry.defaultValue
              : typeof entry.default === 'string'
                ? entry.default
                : '',
        } satisfies PromptVariableDefinition;
      })
      .filter((entry): entry is PromptVariableDefinition => Boolean(entry));

    if (normalized.length > 0) {
      return normalized;
    }
  }

  return collectVariableNames(template).map((name) => ({
    name,
    type: 'string',
    required: true,
    description: '',
    defaultValue: '',
  }));
}

function buildFormState(prompt: PromptDefinitionRow): PromptFormState {
  return {
    name: prompt.name,
    description: prompt.description,
    category: prompt.category,
    systemPrompt: prompt.system_prompt,
    developerPrompt: prompt.developer_prompt,
    userPromptTemplate: prompt.user_prompt_template,
    expectedOutputSchemaJsonRaw: JSON.stringify(prompt.expected_output_schema_json, null, 2),
    promptVariablesDefinition: normalizePromptVariableDefinitions(
      prompt.prompt_variables_definition_json,
      prompt.user_prompt_template,
    ),
    model: prompt.model,
    maxOutputTokens: prompt.max_output_tokens,
    responseFormat: prompt.response_format,
    isActive: prompt.is_active,
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function toRuntimeFallbackReason(status: PromptRuntimeSourceStatus | null): string | null {
  if (!status || !status.runtimeUsesFallback) return null;
  if (!status.hasActiveDbVersion) return 'Keine aktive DB-Version vorhanden.';
  if (status.fallbackReason) return status.fallbackReason;
  return 'Registry-Fallback wurde in den Runtime-Logs beobachtet.';
}

function toIsoDateBoundary(value: string, boundary: 'start' | 'end'): string {
  const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${value}T${time}Z`).toISOString();
}

function getMetadataObject(metadata: Json): Record<string, string> {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
    return {};
  }

  return Object.entries(metadata).reduce<Record<string, string>>((accumulator, [key, value]) => {
    accumulator[key] = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return accumulator;
  }, {});
}

type TextDiffRow = {
  type: 'same' | 'removed' | 'added';
  text: string;
};

function buildLineDiffRows(baseValue: string, targetValue: string): TextDiffRow[] {
  const baseLines = baseValue.split('\n');
  const targetLines = targetValue.split('\n');
  const rows: TextDiffRow[] = [];
  const maxLength = Math.max(baseLines.length, targetLines.length);

  for (let index = 0; index < maxLength; index += 1) {
    const baseLine = baseLines[index];
    const targetLine = targetLines[index];

    if (baseLine === targetLine) {
      rows.push({ type: 'same', text: baseLine ?? '' });
      continue;
    }

    if (baseLine !== undefined) {
      rows.push({ type: 'removed', text: baseLine });
    }
    if (targetLine !== undefined) {
      rows.push({ type: 'added', text: targetLine });
    }
  }

  return rows;
}

export function AdminPromptDetailPage() {
  const { promptKey } = useParams<{ promptKey: string }>();
  const { user } = useAuth();

  const [versions, setVersions] = useState<PromptDefinitionRow[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [baseComparePromptId, setBaseComparePromptId] = useState<string>('');
  const [targetComparePromptId, setTargetComparePromptId] = useState<string>('');
  const [formState, setFormState] = useState<PromptFormState | null>(null);
  const [logs, setLogs] = useState<PromptExecutionLogRow[]>([]);
  const [testVariableValues, setTestVariableValues] = useState<Record<string, string>>({});
  const [testVariablesRaw, setTestVariablesRaw] = useState('{\n  "learner_utterance": "Ich habe gestern gehen ins Büro.",\n  "level": "B1"\n}');
  const [testResult, setTestResult] = useState<PromptExecutionTestResult | null>(null);
  const [parseFailureRate, setParseFailureRate] = useState<PromptParseFailureRate | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<PromptRuntimeSourceStatus | null>(null);
  const [metricsDateFrom, setMetricsDateFrom] = useState<string>('');
  const [metricsDateTo, setMetricsDateTo] = useState<string>('');
  const [metricsUserId, setMetricsUserId] = useState<string>('');
  const [metricsLoading, setMetricsLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningTest, setRunningTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtimeFallbackReason = useMemo(() => toRuntimeFallbackReason(runtimeStatus), [runtimeStatus]);

  const selectedPrompt = useMemo(
    () => versions.find((version) => version.id === selectedPromptId) ?? null,
    [selectedPromptId, versions],
  );
  const baseComparePrompt = useMemo(
    () => versions.find((version) => version.id === baseComparePromptId) ?? null,
    [baseComparePromptId, versions],
  );
  const targetComparePrompt = useMemo(
    () => versions.find((version) => version.id === targetComparePromptId) ?? null,
    [targetComparePromptId, versions],
  );

  const comparedFields = useMemo<ComparedPromptField[]>(() => {
    if (!baseComparePrompt || !targetComparePrompt) return [];

    const baseMetadata = getMetadataObject(baseComparePrompt.metadata);
    const targetMetadata = getMetadataObject(targetComparePrompt.metadata);
    const metadataKeys = Array.from(new Set([...Object.keys(baseMetadata), ...Object.keys(targetMetadata)])).sort();

    const fields: ComparedPromptField[] = [
      {
        key: 'system_prompt',
        label: 'system_prompt',
        baseValue: baseComparePrompt.system_prompt,
        targetValue: targetComparePrompt.system_prompt,
        changed: baseComparePrompt.system_prompt !== targetComparePrompt.system_prompt,
        multiline: true,
        longTextDiff: true,
      },
      {
        key: 'developer_prompt',
        label: 'developer_prompt',
        baseValue: baseComparePrompt.developer_prompt,
        targetValue: targetComparePrompt.developer_prompt,
        changed: baseComparePrompt.developer_prompt !== targetComparePrompt.developer_prompt,
        multiline: true,
        longTextDiff: true,
      },
      {
        key: 'user_prompt_template',
        label: 'user_prompt_template',
        baseValue: baseComparePrompt.user_prompt_template,
        targetValue: targetComparePrompt.user_prompt_template,
        changed: baseComparePrompt.user_prompt_template !== targetComparePrompt.user_prompt_template,
        multiline: true,
        longTextDiff: true,
      },
      {
        key: 'model',
        label: 'model',
        baseValue: baseComparePrompt.model,
        targetValue: targetComparePrompt.model,
        changed: baseComparePrompt.model !== targetComparePrompt.model,
      },
      {
        key: 'max_output_tokens',
        label: 'max_output_tokens',
        baseValue: String(baseComparePrompt.max_output_tokens),
        targetValue: String(targetComparePrompt.max_output_tokens),
        changed: baseComparePrompt.max_output_tokens !== targetComparePrompt.max_output_tokens,
      },
      {
        key: 'response_format',
        label: 'response_format',
        baseValue: baseComparePrompt.response_format,
        targetValue: targetComparePrompt.response_format,
        changed: baseComparePrompt.response_format !== targetComparePrompt.response_format,
      },
      {
        key: 'is_active',
        label: 'is_active',
        baseValue: baseComparePrompt.is_active ? 'true' : 'false',
        targetValue: targetComparePrompt.is_active ? 'true' : 'false',
        changed: baseComparePrompt.is_active !== targetComparePrompt.is_active,
      },
    ];

    metadataKeys.forEach((metadataKey) => {
      const baseValue = baseMetadata[metadataKey] ?? '(nicht gesetzt)';
      const targetValue = targetMetadata[metadataKey] ?? '(nicht gesetzt)';
      fields.push({
        key: `metadata.${metadataKey}`,
        label: `metadata.${metadataKey}`,
        baseValue,
        targetValue,
        changed: baseValue !== targetValue,
        multiline: baseValue.includes('\n') || targetValue.includes('\n'),
      });
    });

    return fields;
  }, [baseComparePrompt, targetComparePrompt]);

  const metricsFilters = useMemo(() => {
    return {
      from: metricsDateFrom ? toIsoDateBoundary(metricsDateFrom, 'start') : null,
      to: metricsDateTo ? toIsoDateBoundary(metricsDateTo, 'end') : null,
      userId: metricsUserId.trim() || null,
    };
  }, [metricsDateFrom, metricsDateTo, metricsUserId]);

  const loadParseFailureRate = useCallback(async () => {
    if (!promptKey) return;
    setMetricsLoading(true);
    try {
      const rate = await promptAdminService.getParseFailureRate({
        promptKey,
        from: metricsFilters.from,
        to: metricsFilters.to,
        userId: metricsFilters.userId,
      });
      setParseFailureRate(rate);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : 'Parsing-Fehlerrate konnte nicht geladen werden.');
    } finally {
      setMetricsLoading(false);
    }
  }, [promptKey, metricsFilters.from, metricsFilters.to, metricsFilters.userId]);

  const loadData = useCallback(async (focusPromptId?: string) => {
    if (!promptKey) return;
    setLoading(true);
    setError(null);

    try {
      const allPrompts = await promptAdminService.listPromptDefinitions();
      const matchingVersions = allPrompts.filter((prompt) => prompt.prompt_key === promptKey);

      if (matchingVersions.length === 0) {
        setVersions([]);
        setSelectedPromptId('');
        setFormState(null);
        setLogs([]);
        setRuntimeStatus(null);
        return;
      }

      const initialPromptSelection = matchingVersions.find((prompt) => prompt.id === focusPromptId) ?? matchingVersions[0];
      if (!initialPromptSelection) {
        setVersions([]);
        setSelectedPromptId('');
        setFormState(null);
        setLogs([]);
        setRuntimeStatus(null);
        return;
      }

      setVersions(matchingVersions);
      setSelectedPromptId(initialPromptSelection.id);
      setBaseComparePromptId(initialPromptSelection.id);
      setTargetComparePromptId(matchingVersions[0]?.id ?? initialPromptSelection.id);
      setFormState(buildFormState(initialPromptSelection));

      const [nextLogs, nextRuntimeStatus] = await Promise.all([
        promptAdminService.listExecutionLogs(initialPromptSelection.id),
        promptAdminService.getPromptRuntimeSourceStatus(promptKey),
      ]);
      setLogs(nextLogs);
      setRuntimeStatus(nextRuntimeStatus);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : 'Prompt-Details konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [promptKey]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadParseFailureRate();
  }, [loadParseFailureRate]);

  useEffect(() => {
    if (!selectedPrompt) return;
    const nextFormState = buildFormState(selectedPrompt);
    setFormState(nextFormState);
    setTestVariableValues(
      nextFormState.promptVariablesDefinition.reduce<Record<string, string>>((accumulator, variable) => {
        accumulator[variable.name] = variable.defaultValue;
        return accumulator;
      }, {}),
    );
    promptAdminService
      .listExecutionLogs(selectedPrompt.id)
      .then(setLogs)
      .catch((serviceError) => {
        setError(serviceError instanceof Error ? serviceError.message : 'Logs konnten nicht geladen werden.');
      });
  }, [selectedPrompt, selectedPromptId]);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedPrompt || !formState || !user?.id) {
      setError('Prompt konnte nicht gespeichert werden: fehlender Nutzer oder Prompt.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let expectedOutputSchemaJson: Json;
      try {
        expectedOutputSchemaJson = JSON.parse(formState.expectedOutputSchemaJsonRaw) as Json;
      } catch {
        throw new Error('expected_output_schema_json ist kein valides JSON.');
      }

      const input: PromptDefinitionUpdateInput = {
        name: formState.name.trim(),
        description: formState.description.trim(),
        category: formState.category.trim(),
        systemPrompt: formState.systemPrompt,
        developerPrompt: formState.developerPrompt,
        userPromptTemplate: formState.userPromptTemplate,
        expectedOutputSchemaJson,
        promptVariablesDefinition: formState.promptVariablesDefinition,
        model: formState.model,
        maxOutputTokens: formState.maxOutputTokens,
        responseFormat: formState.responseFormat,
        isActive: formState.isActive,
      };
      const created = await promptAdminService.createNewPromptVersion(selectedPrompt, input, user.id);
      await loadData(created.id);
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : 'Prompt konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const onRunTest = async () => {
    if (!selectedPrompt || !user?.id) {
      setError('Prompt-Test nicht möglich: fehlender Nutzer oder Prompt.');
      return;
    }

    setRunningTest(true);
    setError(null);
    setTestResult(null);

    try {
      const definitions = formState?.promptVariablesDefinition ?? [];
      let variables: Record<string, unknown> = {};

      if (definitions.length > 0) {
        const errors: string[] = [];
        const parsedVariables: Record<string, unknown> = {};

        definitions.forEach((definition) => {
          const rawValue = testVariableValues[definition.name] ?? '';
          if (definition.required && rawValue.trim() === '') {
            errors.push(`Variable "${definition.name}" ist erforderlich.`);
            return;
          }
          if (!definition.required && rawValue.trim() === '') return;

          if (definition.type === 'string') {
            parsedVariables[definition.name] = rawValue;
            return;
          }
          if (definition.type === 'number') {
            const parsed = Number.parseFloat(rawValue);
            if (!Number.isFinite(parsed)) {
              errors.push(`Variable "${definition.name}" muss eine Zahl sein.`);
              return;
            }
            parsedVariables[definition.name] = parsed;
            return;
          }
          if (definition.type === 'boolean') {
            const normalized = rawValue.trim().toLowerCase();
            if (normalized !== 'true' && normalized !== 'false') {
              errors.push(`Variable "${definition.name}" muss "true" oder "false" sein.`);
              return;
            }
            parsedVariables[definition.name] = normalized === 'true';
            return;
          }
          try {
            parsedVariables[definition.name] = JSON.parse(rawValue);
          } catch {
            errors.push(`Variable "${definition.name}" muss valides JSON sein.`);
          }
        });

        if (errors.length > 0) {
          throw new Error(errors.join(' '));
        }
        variables = parsedVariables;
      } else {
        variables = JSON.parse(testVariablesRaw) as Record<string, unknown>;
      }

      const result = await promptAdminService.runPromptTest({
        prompt: selectedPrompt,
        userId: user.id,
        variables,
      });

      setTestResult(result);
      const nextLogs = await promptAdminService.listExecutionLogs(selectedPrompt.id);
      setLogs(nextLogs);
      await loadParseFailureRate();
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : 'Prompt-Test fehlgeschlagen.');
    } finally {
      setRunningTest(false);
    }
  };

  return (
    <section className="page">
      <PageHeader title={`Prompt: ${promptKey ?? 'Unbekannt'}`} subtitle="Versionieren, testen und Logs einsehen." />

      <article className="card">
        <Link to={paths.admin.prompts}>← Zurück zur Prompt-Liste</Link>
      </article>

      {loading ? <article className="card">Prompt-Details werden geladen …</article> : null}
      {error ? <article className="card">{error}</article> : null}

      {!loading && selectedPrompt && formState ? (
        <>
          {runtimeFallbackReason ? (
            <article className="card admin-runtime-warning-banner">
              <div>
                <strong>Runtime nutzt Seed/Fallback</strong>
                <p>
                  Grund: {runtimeFallbackReason}
                  {runtimeStatus?.fallbackObservedAt
                    ? ` · Letzter Fallback: ${formatDateTime(runtimeStatus.fallbackObservedAt)}`
                    : ''}
                </p>
              </div>
              <p>
                <a href="#isActive">Zur Aktivierung einer DB-Version (is_active) springen</a>
              </p>
            </article>
          ) : null}

          <article className="card admin-form-card">
            <h3>Parsing-Fehlerrate</h3>
            <p>
              Fehlerkriterien: <code>status=failed</code> bei Parse/Schema,{' '}
              <code>validation_repair_status=&apos;failed&apos;</code>, API <code>parse_error</code>.
            </p>
            <div className="admin-grid-3">
              <div>
                <label className="auth-label" htmlFor="metricsDateFrom">
                  Von (Datum)
                </label>
                <input
                  id="metricsDateFrom"
                  className="auth-input"
                  type="date"
                  value={metricsDateFrom}
                  onChange={(event) => setMetricsDateFrom(event.target.value)}
                />
              </div>
              <div>
                <label className="auth-label" htmlFor="metricsDateTo">
                  Bis (Datum)
                </label>
                <input
                  id="metricsDateTo"
                  className="auth-input"
                  type="date"
                  value={metricsDateTo}
                  onChange={(event) => setMetricsDateTo(event.target.value)}
                />
              </div>
              <div>
                <label className="auth-label" htmlFor="metricsUserId">
                  User-ID (optional)
                </label>
                <input
                  id="metricsUserId"
                  className="auth-input"
                  value={metricsUserId}
                  onChange={(event) => setMetricsUserId(event.target.value)}
                  placeholder="z. B. auth user id"
                />
              </div>
            </div>
            <div className="admin-metrics-actions">
              <button type="button" className="button button-secondary" onClick={() => void loadParseFailureRate()}>
                Aktualisieren
              </button>
            </div>
            {metricsLoading ? <p>Metriken werden geladen …</p> : null}
            {parseFailureRate ? (
              <div className="admin-metrics-grid">
                <p>
                  Prompt-Key: <strong>{parseFailureRate.promptKey}</strong>
                </p>
                <p>
                  User-Filter: <strong>{parseFailureRate.userId ?? 'Alle'}</strong>
                </p>
                <p>
                  Ausführungen gesamt: <strong>{parseFailureRate.totalExecutions}</strong>
                </p>
                <p>
                  Parse-Fehler: <strong>{parseFailureRate.parseFailures}</strong>
                </p>
                <p>
                  Fehlerrate: <strong>{(parseFailureRate.rate * 100).toFixed(2)}%</strong>
                </p>
                <p>
                  Zeitraum:{' '}
                  <strong>
                    {metricsDateFrom || '−∞'} bis {metricsDateTo || '+∞'}
                  </strong>
                </p>
              </div>
            ) : null}
          </article>

          <article className="card admin-form-card">
            <h3>Version auswählen</h3>
            <select
              className="auth-input"
              value={selectedPromptId}
              onChange={(event) => setSelectedPromptId(event.target.value)}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version} {version.is_active ? '· aktiv' : ''} · {formatDateTime(version.updated_at)}
                </option>
              ))}
            </select>
          </article>

          <article className="card admin-form-card">
            <h3>Versionen vergleichen</h3>
            <div className="admin-grid-2">
              <div>
                <label className="auth-label" htmlFor="baseComparePrompt">
                  Basisversion
                </label>
                <select
                  id="baseComparePrompt"
                  className="auth-input"
                  value={baseComparePromptId}
                  onChange={(event) => setBaseComparePromptId(event.target.value)}
                >
                  {versions.map((version) => (
                    <option key={`base-${version.id}`} value={version.id}>
                      v{version.version} {version.is_active ? '· aktiv' : ''} · {formatDateTime(version.updated_at)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="auth-label" htmlFor="targetComparePrompt">
                  Zielversion
                </label>
                <select
                  id="targetComparePrompt"
                  className="auth-input"
                  value={targetComparePromptId}
                  onChange={(event) => setTargetComparePromptId(event.target.value)}
                >
                  {versions.map((version) => (
                    <option key={`target-${version.id}`} value={version.id}>
                      v{version.version} {version.is_active ? '· aktiv' : ''} · {formatDateTime(version.updated_at)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {baseComparePrompt && targetComparePrompt ? (
              <div className="admin-compare-list">
                {comparedFields.map((field) => {
                  const diffRows = field.longTextDiff && field.changed ? buildLineDiffRows(field.baseValue, field.targetValue) : [];

                  return (
                    <article
                      key={field.key}
                      className={`admin-compare-item ${field.changed ? 'admin-compare-item-changed' : ''}`}
                    >
                      <h4>
                        {field.label} {field.changed ? '· geändert' : '· unverändert'}
                      </h4>
                      <div className={`admin-compare-grid ${field.multiline ? 'admin-compare-grid-multiline' : ''}`}>
                        <div>
                          <p className="admin-compare-label">
                            Basis · v{baseComparePrompt.version}
                          </p>
                          <pre>{field.baseValue}</pre>
                        </div>
                        <div>
                          <p className="admin-compare-label">
                            Ziel · v{targetComparePrompt.version}
                          </p>
                          <pre>{field.targetValue}</pre>
                        </div>
                      </div>
                      {diffRows.length > 0 ? (
                        <details>
                          <summary>Zeilen-Diff anzeigen</summary>
                          <pre className="admin-diff-view">
                            {diffRows.map((row, index) => (
                              <div key={`${field.key}-diff-${index}`} className={`admin-diff-line admin-diff-line-${row.type}`}>
                                {row.type === 'removed' ? '-' : row.type === 'added' ? '+' : ' '}
                                {row.text}
                              </div>
                            ))}
                          </pre>
                        </details>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </article>

          <form className="card admin-form-card" onSubmit={onSave}>
            <h3>Neue Version erstellen</h3>
            <label className="auth-label" htmlFor="name">
              name
            </label>
            <input
              id="name"
              className="auth-input"
              value={formState.name}
              onChange={(event) => setFormState((state) => (state ? { ...state, name: event.target.value } : state))}
              required
            />

            <label className="auth-label" htmlFor="description">
              description
            </label>
            <textarea
              id="description"
              className="auth-input admin-textarea"
              value={formState.description}
              onChange={(event) => setFormState((state) => (state ? { ...state, description: event.target.value } : state))}
              rows={3}
              required
            />

            <label className="auth-label" htmlFor="category">
              category
            </label>
            <input
              id="category"
              className="auth-input"
              value={formState.category}
              onChange={(event) => setFormState((state) => (state ? { ...state, category: event.target.value } : state))}
              required
            />

            <label className="auth-label" htmlFor="systemPrompt">
              system_prompt
            </label>
            <textarea
              id="systemPrompt"
              className="auth-input admin-textarea"
              value={formState.systemPrompt}
              onChange={(event) => setFormState((state) => (state ? { ...state, systemPrompt: event.target.value } : state))}
              rows={4}
            />

            <label className="auth-label" htmlFor="developerPrompt">
              developer_prompt
            </label>
            <textarea
              id="developerPrompt"
              className="auth-input admin-textarea"
              value={formState.developerPrompt}
              onChange={(event) =>
                setFormState((state) => (state ? { ...state, developerPrompt: event.target.value } : state))
              }
              rows={4}
            />

            <label className="auth-label" htmlFor="userPromptTemplate">
              user_prompt_template
            </label>
            <textarea
              id="userPromptTemplate"
              className="auth-input admin-textarea"
              value={formState.userPromptTemplate}
              onChange={(event) =>
                setFormState((state) => (state ? { ...state, userPromptTemplate: event.target.value } : state))
              }
              rows={5}
            />

            <label className="auth-label" htmlFor="expectedOutputSchemaJsonRaw">
              expected_output_schema_json
            </label>
            <textarea
              id="expectedOutputSchemaJsonRaw"
              className="auth-input admin-textarea"
              value={formState.expectedOutputSchemaJsonRaw}
              onChange={(event) =>
                setFormState((state) => (state ? { ...state, expectedOutputSchemaJsonRaw: event.target.value } : state))
              }
              rows={8}
            />

            <h4>prompt_variables_definition</h4>
            <p>Schema für Variablen im Prompt-Template (name, type, required, description, default).</p>
            {formState.promptVariablesDefinition.map((variable, index) => (
              <div className="admin-grid-3" key={`${variable.name}-${index}`}>
                <input
                  className="auth-input"
                  placeholder="name"
                  value={variable.name}
                  onChange={(event) =>
                    setFormState((state) =>
                      state
                        ? {
                            ...state,
                            promptVariablesDefinition: state.promptVariablesDefinition.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, name: event.target.value } : entry,
                            ),
                          }
                        : state,
                    )
                  }
                />
                <select
                  className="auth-input"
                  value={variable.type}
                  onChange={(event) =>
                    setFormState((state) =>
                      state
                        ? {
                            ...state,
                            promptVariablesDefinition: state.promptVariablesDefinition.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, type: event.target.value as PromptVariableType }
                                : entry,
                            ),
                          }
                        : state,
                    )
                  }
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="json">json</option>
                </select>
                <input
                  className="auth-input"
                  placeholder="default"
                  value={variable.defaultValue}
                  onChange={(event) =>
                    setFormState((state) =>
                      state
                        ? {
                            ...state,
                            promptVariablesDefinition: state.promptVariablesDefinition.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, defaultValue: event.target.value } : entry,
                            ),
                          }
                        : state,
                    )
                  }
                />
                <input
                  className="auth-input"
                  placeholder="description"
                  value={variable.description}
                  onChange={(event) =>
                    setFormState((state) =>
                      state
                        ? {
                            ...state,
                            promptVariablesDefinition: state.promptVariablesDefinition.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, description: event.target.value } : entry,
                            ),
                          }
                        : state,
                    )
                  }
                />
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={variable.required}
                    onChange={(event) =>
                      setFormState((state) =>
                        state
                          ? {
                              ...state,
                              promptVariablesDefinition: state.promptVariablesDefinition.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, required: event.target.checked } : entry,
                              ),
                            }
                          : state,
                      )
                    }
                  />
                  required
                </label>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() =>
                    setFormState((state) =>
                      state
                        ? {
                            ...state,
                            promptVariablesDefinition: state.promptVariablesDefinition.filter(
                              (_, entryIndex) => entryIndex !== index,
                            ),
                          }
                        : state,
                    )
                  }
                >
                  Entfernen
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button button-secondary"
              onClick={() =>
                setFormState((state) =>
                  state
                    ? {
                        ...state,
                        promptVariablesDefinition: [
                          ...state.promptVariablesDefinition,
                          { name: '', type: 'string', required: true, description: '', defaultValue: '' },
                        ],
                      }
                    : state,
                )
              }
            >
              Variable hinzufügen
            </button>

            <div className="admin-grid-3">
              <div>
                <label className="auth-label" htmlFor="model">
                  model
                </label>
                <input
                  id="model"
                  className="auth-input"
                  value={formState.model}
                  onChange={(event) => setFormState((state) => (state ? { ...state, model: event.target.value } : state))}
                />
              </div>
              <div>
                <label className="auth-label" htmlFor="maxOutputTokens">
                  max_output_tokens
                </label>
                <input
                  id="maxOutputTokens"
                  className="auth-input"
                  type="number"
                  min={1}
                  value={formState.maxOutputTokens}
                  onChange={(event) =>
                    setFormState((state) =>
                      state ? { ...state, maxOutputTokens: Number.parseInt(event.target.value, 10) || 1 } : state,
                    )
                  }
                />
              </div>
              <div>
                <label className="auth-label" htmlFor="responseFormat">
                  response_format
                </label>
                <select
                  id="responseFormat"
                  className="auth-input"
                  value={formState.responseFormat}
                  onChange={(event) =>
                    setFormState((state) =>
                      state ? { ...state, responseFormat: event.target.value as PromptResponseFormat } : state,
                    )
                  }
                >
                  {ALLOWED_RESPONSE_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="admin-checkbox" htmlFor="isActive">
              <input
                id="isActive"
                type="checkbox"
                checked={formState.isActive}
                onChange={(event) =>
                  setFormState((state) => (state ? { ...state, isActive: event.target.checked } : state))
                }
              />
              is_active
            </label>

            <button type="submit" className="button" disabled={saving}>
              {saving ? 'Speichert …' : 'Als neue Version speichern'}
            </button>
          </form>

          <article className="card admin-form-card">
            <h3>Test-Runner</h3>
            <p>Variablen werden anhand des definierten Schemas validiert.</p>
            <p>Hinweis: Der Test nutzt dieselben Parse- und Schema-Regeln wie die produktive Ausführung.</p>
            {formState.promptVariablesDefinition.length > 0 ? (
              <div className="admin-grid-2">
                {formState.promptVariablesDefinition.map((variable) => (
                  <div key={`test-var-${variable.name}`}>
                    <label className="auth-label">
                      {variable.name} ({variable.type}) {variable.required ? '*' : ''}
                    </label>
                    <input
                      className="auth-input"
                      value={testVariableValues[variable.name] ?? variable.defaultValue}
                      onChange={(event) =>
                        setTestVariableValues((state) => ({
                          ...state,
                          [variable.name]: event.target.value,
                        }))
                      }
                      placeholder={variable.description || variable.defaultValue}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <textarea
                className="auth-input admin-textarea"
                value={testVariablesRaw}
                onChange={(event) => setTestVariablesRaw(event.target.value)}
                rows={8}
              />
            )}
            <button type="button" className="button" onClick={onRunTest} disabled={runningTest}>
              {runningTest ? 'Test läuft …' : 'Prompt testen'}
            </button>

            {testResult ? (
              <div className="admin-test-result">
                <p>Status: {testResult.ok ? 'success' : 'failed'}</p>
                <p>Latenz: {testResult.latencyMs}ms</p>
                {testResult.errorMessage ? <p>Fehler (Zusammenfassung): {testResult.errorMessage}</p> : null}
                {testResult.validationErrors.length > 0 ? (
                  <details>
                    <summary>Fehlerdetails ({testResult.validationErrors.length})</summary>
                    <ul>
                      {testResult.validationErrors.map((validationError, index) => (
                        <li key={`validation-error-${index}`}>{validationError}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <h4>Rohantwort</h4>
                <pre>{testResult.rawResponse || 'Keine Rohantwort vorhanden'}</pre>
                <h4>Geparstes JSON</h4>
                <pre>{JSON.stringify(testResult.parsedOutput, null, 2)}</pre>
              </div>
            ) : null}
          </article>

          <article className="card admin-form-card">
            <h3>Ausführungslogs</h3>
            {logs.length === 0 ? <p>Keine Logs vorhanden.</p> : null}
            <div className="admin-log-list">
              {logs.map((log) => (
                <details key={log.id}>
                  <summary>
                    {formatDateTime(log.created_at)} · {log.success ? 'success' : 'failed'} · {log.latency_ms ?? '-'}ms
                  </summary>
                  <p>
                  </p>
                  <p>
                    Feature: {log.feature_name} · User: {log.user_id ?? '-'} · Session: {log.session_id ?? '-'}
                  </p>
                  {log.error_message ? <p>Fehler: {log.error_message}</p> : null}
                  <h4>Input Payload</h4>
                  <pre>{JSON.stringify(log.input_payload_json, null, 2)}</pre>
                  <h4>Rendered Prompt</h4>
                  <pre>{JSON.stringify(log.rendered_prompt_json, null, 2)}</pre>
                  <h4>Rohantwort</h4>
                  <pre>{log.raw_model_output ?? 'Keine Rohantwort'}</pre>
                  <h4>Parsed Output</h4>
                  <pre>{JSON.stringify(log.parsed_output, null, 2)}</pre>
                </details>
              ))}
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}
