import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROMPT_REGISTRY_FILE = 'src/services/ai/prompt-registry.ts';
const MIGRATIONS_DIR = 'supabase/migrations';

// Historische Altlasten: Diese Seeds wurden durch kanonische Keys/Migrationen abgelöst.
const LEGACY_MIGRATION_FILES = new Set(['20260422114000_seed_prompt_definitions.sql']);

// Demo-Prompts sind bewusst nicht Teil des produktiven Prompt-Registry-Abgleichs.
const IGNORED_SQL_KEY_PREFIXES = ['demo_'];

function parsePromptKeysFromTs(source: string): Set<string> {
  const matches = source.matchAll(/promptKey:\s*'([^']+)'/g);
  return new Set([...matches].map((match) => match[1]));
}

function splitTopLevelSqlList(input: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inSingleQuote) {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      if (current.trim().length > 0) {
        parts.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

function parsePromptKeysFromSql(sql: string): Set<string> {
  const keys = new Set<string>();
  const insertRegex = /insert\s+into\s+public\.prompt_definitions\s*\(([^)]+)\)\s*values\s*([\s\S]*?)(?:on\s+conflict[\s\S]*?)?;/gi;

  for (const match of sql.matchAll(insertRegex)) {
    const columns = match[1].split(',').map((value) => value.trim());
    const promptKeyIndex = columns.indexOf('prompt_key');
    if (promptKeyIndex < 0) {
      continue;
    }

    const valuesBlock = match[2];
    const tupleStrings = splitTopLevelSqlList(valuesBlock)
      .map((value) => value.trim())
      .filter((value) => value.startsWith('(') && value.endsWith(')'))
      .map((value) => value.slice(1, -1));

    for (const tupleString of tupleStrings) {
      const fields = splitTopLevelSqlList(tupleString);
      if (fields.length <= promptKeyIndex) {
        continue;
      }

      const rawPromptKey = fields[promptKeyIndex].trim();
      const promptKeyMatch = rawPromptKey.match(/^'((?:''|[^'])*)'$/);
      if (!promptKeyMatch) {
        continue;
      }

      const promptKey = promptKeyMatch[1].replaceAll("''", "'");
      if (IGNORED_SQL_KEY_PREFIXES.some((prefix) => promptKey.startsWith(prefix))) {
        continue;
      }

      keys.add(promptKey);
    }
  }

  return keys;
}

function sortedDiff(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

const tsSource = readFileSync(PROMPT_REGISTRY_FILE, 'utf8');
const tsKeys = parsePromptKeysFromTs(tsSource);

const sqlFiles = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.includes('seed') && file.endsWith('.sql'))
  .sort();

const sqlKeys = new Set<string>();
const ignoredLegacyFiles: string[] = [];
const schemaDriftSeedFiles: string[] = [];
for (const file of sqlFiles) {
  if (LEGACY_MIGRATION_FILES.has(file)) {
    ignoredLegacyFiles.push(file);
    continue;
  }

  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  if (sql.includes('"additionalProperties":true')) {
    schemaDriftSeedFiles.push(file);
  }
  const parsedKeys = parsePromptKeysFromSql(sql);
  for (const key of parsedKeys) {
    sqlKeys.add(key);
  }
}

const onlyInTs = sortedDiff(tsKeys, sqlKeys);
const onlyInSql = sortedDiff(sqlKeys, tsKeys);
const shared = [...tsKeys].filter((value) => sqlKeys.has(value)).sort();
const hasPromptKeyDrift = onlyInTs.length > 0 || onlyInSql.length > 0;
const hasSchemaDrift = schemaDriftSeedFiles.length > 0;

console.log('Prompt Key Audit');
console.log('================');
console.log(`TS keys (${tsKeys.size}): ${[...tsKeys].sort().join(', ')}`);
console.log(`SQL keys (${sqlKeys.size}): ${[...sqlKeys].sort().join(', ')}`);
console.log('');
console.log(`Only in TS (${onlyInTs.length}): ${onlyInTs.join(', ') || '-'}`);
console.log(`Only in SQL (${onlyInSql.length}): ${onlyInSql.join(', ') || '-'}`);
console.log(`Shared (${shared.length}): ${shared.join(', ') || '-'}`);

if (ignoredLegacyFiles.length > 0) {
  console.log('');
  console.log(`Ignored legacy seed files: ${ignoredLegacyFiles.join(', ')}`);
}

if (schemaDriftSeedFiles.length > 0) {
  console.log('');
  console.log(`Potential schema drift seed files: ${schemaDriftSeedFiles.join(', ')}`);
}

if (hasPromptKeyDrift || hasSchemaDrift) {
  console.error('\n❌ Prompt drift detected (keys and/or schema placeholders).');
  process.exit(1);
}

console.log('\n✅ No prompt-key drift detected.');
