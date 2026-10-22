/**
 * The boot checks exactly what the deploy creates (MR-03 Stage 3, OPS-16).
 *
 * The auth-schema statements moved from the API's boot, where they ran on the
 * owner connection, to migrations/20261022_auth_schema_and_seeded_organizations.sql.
 * The boot now only asks whether their result is there (missingAuthSchema).
 * Two lists of the same columns drift unless something holds them together:
 * this test reads the migration and requires AUTH_SCHEMA_COLUMNS to be exactly
 * what it creates and adds, table by table.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AUTH_SCHEMA_COLUMNS, missingAuthSchema } from '../auth-schema';
// @ts-expect-error — plain .mjs, no declaration file
import { C2C_MIGRATION_FILES } from '../../../../scripts/db/migration-set.mjs';

const MIGRATION = 'migrations/20261022_auth_schema_and_seeded_organizations.sql';
const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const sql = readFileSync(root(MIGRATION), 'utf8').replace(/--[^\n]*/g, '');

/** table → columns the migration creates (CREATE TABLE) or adds (ADD COLUMN IF NOT EXISTS). */
function migrationColumns(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (table: string, column: string) => {
    if (!out.has(table)) out.set(table, new Set());
    out.get(table)!.add(column);
  };
  for (const m of text.matchAll(/ALTER TABLE\s+(\w+)\s+([\s\S]*?);/g)) {
    for (const c of m[2].matchAll(/ADD COLUMN IF NOT EXISTS\s+(\w+)/g)) add(m[1], c[1]);
  }
  for (const m of text.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    for (const line of m[2].split('\n')) {
      const col = line.trim().match(/^(\w+)\s+[A-Z]/);
      if (col && col[1] !== 'UNIQUE') add(m[1], col[1]);
    }
  }
  return out;
}

describe('the auth schema: what the boot checks is what the deploy creates', () => {
  const created = migrationColumns(sql);

  it('names the same tables', () => {
    expect([...created.keys()].sort()).toEqual(Object.keys(AUTH_SCHEMA_COLUMNS).sort());
  });

  it.each(Object.keys(AUTH_SCHEMA_COLUMNS))('%s: the same columns', (table) => {
    expect([...(created.get(table) ?? [])].sort()).toEqual([...AUTH_SCHEMA_COLUMNS[table]].sort());
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
