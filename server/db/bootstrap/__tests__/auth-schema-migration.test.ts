/**
 * The boot checks exactly what the deploy creates (MR-03 Stage 3, OPS-16).
 *
 * The auth-schema statements moved from the API's boot, where they ran on the
 * owner connection, to migrations/20261022_auth_schema_and_seeded_organizations.sql.
 * The boot now only asks whether their result is there (missingAuthSchema).
 * Two lists of the same columns drift unless something holds them together.
 * The tables are migrations/0000_sweet_joseph.sql's (install-fresh applies it
 * to every database); the 20261022 file adds the columns 0000 lacks. So this
 * test requires the boot to check nothing the deploy does not create, the
 * migration to add nothing the boot does not check, and the migration to
 * define no table of its own (a second definition is what
 * ci:duplicate-table-ddl refuses).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AUTH_SCHEMA_COLUMNS, missingAuthSchema } from '../auth-schema';
import { C2C_MIGRATION_FILES } from '../../../../scripts/db/migration-set.mjs';

const MIGRATION = 'migrations/20261022_auth_schema_and_seeded_organizations.sql';
const CREATOR = 'migrations/0000_sweet_joseph.sql';
const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const uncomment = (text: string) => text.replace(/--[^\n]*/g, '');
const sql = uncomment(readFileSync(root(MIGRATION), 'utf8'));
const creatorSql = uncomment(readFileSync(root(CREATOR), 'utf8'));

/** table → columns `ADD COLUMN IF NOT EXISTS` adds. */
function addedColumns(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of text.matchAll(/ALTER TABLE\s+(\w+)\s+([\s\S]*?);/g)) {
    for (const c of m[2].matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)/g)) {
      if (!out.has(m[1])) out.set(m[1], new Set());
      out.get(m[1])!.add(c[1]);
    }
  }
  return out;
}

/** The columns a CREATE TABLE in `text` gives `table` (quoted or bare identifiers). */
function createdColumns(text: string, table: string): Set<string> {
  const m = text.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?"?${table}"?\\s*\\(([\\s\\S]*?)\\n\\);`));
  const cols = new Set<string>();
  for (const line of (m?.[1] ?? '').split('\n')) {
    const col = line.trim().match(/^"?(\w+)"?\s+[a-zA-Z]/);
    if (col && !['CONSTRAINT', 'UNIQUE', 'PRIMARY'].includes(col[1].toUpperCase())) cols.add(col[1]);
  }
  return cols;
}

describe('the auth schema: what the boot checks is what the deploy creates', () => {
  const added = addedColumns(sql);
  const tables = Object.keys(AUTH_SCHEMA_COLUMNS);

  it('defines no table: 0000_sweet_joseph.sql creates each one the boot checks', () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
    for (const table of tables) expect(createdColumns(creatorSql, table).size, table).toBeGreaterThan(0);
  });

  it.each(tables)('%s: every column the boot checks is created or added by the deploy', (table) => {
    const deployed = new Set([...createdColumns(creatorSql, table), ...(added.get(table) ?? [])]);
    expect(AUTH_SCHEMA_COLUMNS[table].filter((c) => !deployed.has(c))).toEqual([]);
  });

  it('adds no column the boot does not check, to no table it does not check', () => {
    for (const [table, cols] of added) {
      expect(tables, table).toContain(table);
      expect([...cols].filter((c) => !AUTH_SCHEMA_COLUMNS[table].includes(c)), table).toEqual([]);
    }
  });

  it('is in the migration set, immediately before the default-workspace sweep', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(MIGRATION);
    expect(at).toBeGreaterThan(-1);
    expect(files[at + 1]).toBe('migrations/20260923_organization_default_client_workspace.sql');
  });

  it('seeds both organisations and asserts both rows', () => {
    expect(sql).toMatch(/VALUES \('Default', 'default'\)/);
    expect(sql).toMatch(/'Concept2Cure Therapeutics', 'concept2cure'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'seeded organisations: expected 2/);
  });

  it('leaves no DDL in the boot bootstrap', () => {
    for (const file of ['auth-schema.ts', 'index.ts', 'seed-default-org.ts']) {
      const code = readFileSync(root(`server/db/bootstrap/${file}`), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\b(ALTER TABLE|CREATE TABLE|CREATE SCHEMA|CREATE EXTENSION|ADD CONSTRAINT)\b/);
      expect(code, file).not.toMatch(/INSERT INTO organizations/);
    }
  });
});

describe('missingAuthSchema', () => {
  const everything = Object.entries(AUTH_SCHEMA_COLUMNS).flatMap(([table, cols]) =>
    cols.map((column) => ({ table_name: table, column_name: column })),
  );

  it('is empty when every column is present', async () => {
    const db = { query: async () => ({ rows: everything }) };
    expect(await missingAuthSchema(db)).toEqual([]);
  });

  it('names each absent column as table.column, sorted', async () => {
    const rows = everything.filter(
      (r) => !(r.table_name === 'users' && r.column_name === 'mfa_totp_last_step') && r.table_name !== 'module_subscriptions',
    );
    const db = { query: async () => ({ rows }) };
    expect(await missingAuthSchema(db)).toEqual([
      'module_subscriptions.created_at',
      'module_subscriptions.enabled',
      'module_subscriptions.id',
      'module_subscriptions.module_id',
      'module_subscriptions.organization_id',
      'users.mfa_totp_last_step',
    ]);
  });

  it('reads public schema columns for exactly these tables', async () => {
    let seen: { text: string; values?: unknown[] } | null = null;
    const db = {
      query: async (text: string, values?: unknown[]) => {
        seen = { text, values };
        return { rows: everything };
      },
    };
    await missingAuthSchema(db);
    expect(seen!.text).toMatch(/information_schema\.columns/);
    expect(seen!.text).toMatch(/table_schema = 'public'/);
    expect(seen!.values).toEqual([Object.keys(AUTH_SCHEMA_COLUMNS)]);
  });
});
