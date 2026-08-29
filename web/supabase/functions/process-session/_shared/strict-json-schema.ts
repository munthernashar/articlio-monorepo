// Deno-Port der Structured-Output-Gating-Logik aus
// src/services/api/openai-api.service.ts (canUseStructuredOutput /
// makeStrictJsonSchema, 1:1). Wichtig: process-session prüfte bislang
// direkt den rohen `response_format`-DB-Wert auf den String "json_schema"
// (der wegen der DB-Check-Constraint auf 'json_object'|'text' nie
// vorkommen konnte -- Launch-Readiness-Audit Befund D). Der Client
// entscheidet dagegen strukturell: `outputFormat === 'json_object'` plus ein
// gültiges Objekt-Schema mit mindestens einer Property reicht. Das wird hier
// exakt nachgebildet, ohne dass die DB-Constraint erweitert werden muss.

export function hasStructuredOutputProperties(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return false;
  }

  const candidate = schema as Record<string, unknown>;

  return (
    candidate.type === 'object' &&
    !!candidate.properties &&
    typeof candidate.properties === 'object' &&
    !Array.isArray(candidate.properties) &&
    Object.keys(candidate.properties as Record<string, unknown>).length > 0
  );
}

export function makeStrictJsonSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return schema;
  }

  const source = schema as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([propertyName, propertySchema]) => [
          propertyName,
          makeStrictJsonSchema(propertySchema),
        ]),
      );
      continue;
    }

    if (key === 'items') {
      next[key] = makeStrictJsonSchema(value);
      continue;
    }

    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      next[key] = Array.isArray(value) ? value.map(makeStrictJsonSchema) : value;
      continue;
    }

    next[key] = makeStrictJsonSchema(value);
  }

  if (source.type === 'object') {
    const properties =
      next.properties && typeof next.properties === 'object' && !Array.isArray(next.properties)
        ? (next.properties as Record<string, unknown>)
        : {};

    next.properties = properties;
    next.required = Object.keys(properties);
    next.additionalProperties = false;
  }

  return next;
}
