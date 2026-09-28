/**
 * Every column the AI ledger writer inserts is created by the ledger's
 * migration, on a fresh database and on one that already has the table (D6).
 *
 * ci:insert-columns-declared compares INSERTs against Drizzle models, and
 * ai.gateway_audit_log has none, so no gate checked this INSERT's columns. A
 * column missing from the migration fails every INSERT at plan time inside the
 * writer's catch: the ledger records nothing. The readiness probe refuses such
 * a table at runtime (audit-tenant-scope.test.ts); this is the static half.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEDGER_COLUMNS } from '../audit';
import { C2C_MIGRATION_FILES } from '../../../../scripts/db/migration-set.mjs';

const ROOT = path.resolve(__dirname, '../../../..');
const MIGRATION = 'db/migrations/20260813_ai_gateway_audit_log.sql';
const sql = fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8').replace(/--[^\n]*/g, '');

function createTableColumns(): Set<string> {
  const body = /CREATE TABLE IF NOT EXISTS ai\.gateway_audit_log \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? '';
  return new Set(
    body
      .split('\n')
      .map(l => /^\s*([a-z_]+)\s+[A-Z]/.exec(l)?.[1])
      .filter((c): c is string => !!c),
  );
}

function addedColumns(): Set<string> {
  return new Set([...sql.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/g)].map(m => m[1]));
}

describe('ai.gateway_audit_log migration', () => {
  it('is applied on every deploy', () => {
    expect(C2C_MIGRATION_FILES as string[]).toContain(MIGRATION);
  });

  it('creates every column the writer inserts, on a fresh database', () => {
    const created = createTableColumns();
    expect(LEDGER_COLUMNS.filter(c => !created.has(c))).toEqual([]);
  });

  it('adds every provenance column to a table that already exists', () => {
    const added = addedColumns();
    const provenance = LEDGER_COLUMNS.slice(LEDGER_COLUMNS.indexOf('payload_provenance'));
    expect(provenance.length).toBeGreaterThan(0);
    expect(provenance.filter(c => !added.has(c))).toEqual([]);
  });
});
