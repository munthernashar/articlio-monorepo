import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACTIVE_TUTOR_IMPROVEMENT_PROMPT_KEYS = [
  'tutor_explanation',
  'tutor_followup_answer',
  'understanding_check',
  'improvement_check',
] as const;

const MIGRATION_20260423113000 = resolve(
  process.cwd(),
  'supabase/migrations/20260423113000_seed_missing_admin_prompts.sql',
);
const MIGRATION_20260424234000 = resolve(
  process.cwd(),
  'supabase/migrations/20260424234000_harden_tutor_prompt_schemas.sql',
);

function extractBalancedJsonbBuildObject(source: string, fromIndex: number): string {
  const start = source.indexOf('jsonb_build_object(', fromIndex);
  if (start < 0) {
    throw new Error(`jsonb_build_object(...) nicht gefunden (fromIndex=${fromIndex}).`);
  }

  let depth = 0;
  let end = -1;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end < 0) {
    throw new Error('Konnte Ende von jsonb_build_object(...) nicht bestimmen.');
  }

  return source.slice(start, end);
}

function normalizeSqlSchemaExpression(sqlExpr: string): string {
  return sqlExpr.replace(/\s+/g, ' ').trim();
}

function expectSchemaHardeningGuard(schemaSql: string): void {
  expect(schemaSql).not.toMatch(/'additionalProperties'\s*,\s*true/i);
  expect(schemaSql).not.toMatch(/"additionalProperties"\s*:\s*true/i);
  expect(schemaSql).toMatch(/'additionalProperties'\s*,\s*false/i);
}

function extractSchemaFromSeedMigration(sql: string, promptKey: string): string {
  const marker = `when '${promptKey}' then`;
  const markerIndex = sql.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  return extractBalancedJsonbBuildObject(sql, markerIndex);
}

function extractSchemaFromHardeningMigration(sql: string, promptKey: string): string {
  const marker = `'${promptKey}'::text as prompt_key`;
  const markerIndex = sql.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  return extractBalancedJsonbBuildObject(sql, markerIndex);
}

describe('db prompt tutor schema compatibility guards', () => {
  it('Audit-Grep auf Seed- und Hardening-Migrationen findet für die 4 Prompt-Keys kein additionalProperties=true', () => {
    const sql = readFileSync(MIGRATION_20260423113000, 'utf8');
    const hardeningSql = readFileSync(MIGRATION_20260424234000, 'utf8');

    for (const key of ACTIVE_TUTOR_IMPROVEMENT_PROMPT_KEYS) {
      const seedSchemaSql = extractSchemaFromSeedMigration(sql, key);
      expectSchemaHardeningGuard(seedSchemaSql);

      const hardeningSchemaSql = extractSchemaFromHardeningMigration(hardeningSql, key);
      expectSchemaHardeningGuard(hardeningSchemaSql);
    }
  });

  it('Schemas in 20260423113000 und 20260424234000 sind für die 4 Prompt-Keys semantisch identisch', () => {
    const seedSql = readFileSync(MIGRATION_20260423113000, 'utf8');
    const hardenedSql = readFileSync(MIGRATION_20260424234000, 'utf8');

    for (const key of ACTIVE_TUTOR_IMPROVEMENT_PROMPT_KEYS) {
      const seedSchema = normalizeSqlSchemaExpression(extractSchemaFromSeedMigration(seedSql, key));
      const hardenedSchema = normalizeSqlSchemaExpression(extractSchemaFromHardeningMigration(hardenedSql, key));

      expect(seedSchema).toBe(hardenedSchema);
    }
  });
});
