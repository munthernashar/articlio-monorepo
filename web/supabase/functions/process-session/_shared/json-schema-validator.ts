// Deno-Port von src/services/ai/json-schema-validator.ts (1:1, siehe
// prompt-types.ts für den Hintergrund der Duplizierung).

import type { JsonSchema } from './prompt-types.ts';

function getValueType(value: unknown): JsonSchema['type'] | 'unknown' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
}

export function validateWithSchema(schema: JsonSchema, value: unknown, path = '$'): string[] {
  const errors: string[] = [];
  const actualType = getValueType(value);
  const acceptedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];

  const acceptsActualType =
    acceptedTypes.includes(actualType as never) ||
    (acceptedTypes.includes('integer' as never) &&
      actualType === 'number' &&
      Number.isInteger(value));

  if (!acceptsActualType) {
    errors.push(`${path}: erwarteter Typ ${acceptedTypes.join('|')}, erhalten ${actualType}`);
    return errors;
  }

  if (schema.oneOf?.length) {
    const branchErrors = schema.oneOf.map((candidate) => validateWithSchema(candidate, value, path));
    if (!branchErrors.some((entry) => entry.length === 0)) {
      errors.push(`${path}: entspricht keinem erlaubten oneOf-Schema`);
      return errors;
    }
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value as never)) {
    errors.push(`${path}: Wert liegt nicht in enum [${schema.enum.join(', ')}]`);
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    const numberValue = value as number;

    if (schema.type === 'integer' && !Number.isInteger(numberValue)) {
      errors.push(`${path}: erwarteter Typ integer, erhalten number`);
    }

    if (typeof schema.minimum === 'number' && numberValue < schema.minimum) {
      errors.push(`${path}: Wert ${numberValue} ist kleiner als Minimum ${schema.minimum}`);
    }

    if (typeof schema.maximum === 'number' && numberValue > schema.maximum) {
      errors.push(`${path}: Wert ${numberValue} ist größer als Maximum ${schema.maximum}`);
    }
  }

  if (schema.type === 'object') {
    const objectValue = value as Record<string, unknown>;
    const required = schema.required ?? [];
    const allowedProperties = new Set(Object.keys(schema.properties ?? {}));

    for (const key of required) {
      if (!(key in objectValue)) {
        errors.push(`${path}.${key}: Pflichtfeld fehlt`);
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) {
        if (!allowedProperties.has(key)) {
          errors.push(`${path}.${key}: nicht erlaubt`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (key in objectValue) {
          errors.push(...validateWithSchema(propertySchema, objectValue[key], `${path}.${key}`));
        }
      }
    }
  }

  if (schema.type === 'array' && schema.items) {
    const arrayValue = value as unknown[];
    if (typeof schema.minItems === 'number' && arrayValue.length < schema.minItems) {
      errors.push(`${path}: Array-Länge ${arrayValue.length} ist kleiner als minItems ${schema.minItems}`);
    }
    if (typeof schema.maxItems === 'number' && arrayValue.length > schema.maxItems) {
      errors.push(`${path}: Array-Länge ${arrayValue.length} ist größer als maxItems ${schema.maxItems}`);
    }
    arrayValue.forEach((item, index) => {
      errors.push(...validateWithSchema(schema.items as JsonSchema, item, `${path}[${index}]`));
    });
  }

  return errors;
}
