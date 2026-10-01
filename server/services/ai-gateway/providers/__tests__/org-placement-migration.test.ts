/**
 * The tenant placement policy reaches every deployed database.
 *
 * DbOrgPlacementResolver fails closed: a query that errors is an unknown
 * policy, and an unknown policy refuses a tenant payload in production. So a
 * column it SELECTs that is missing from a deployed database would refuse every
 * tenant-bound AI call — and ci:column-reachability cannot see that case,
 * because it counts install-fresh (which ran this file) as an applier, while an
 * already-provisioned database only ever runs deploy-migrate's
 * C2C_MIGRATION_FILES. Verified: with the entry removed from the set, that gate
 * still reports OK. These assertions do not.
 *
 * Launch row D6.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  C2C_MIGRATION_FILES,
  TENANT_ISOLATION_SWEEP,
  UUID_TENANT_ISOLATION_NONPUBLIC,
} from '../../../../../scripts/db/migration-set.mjs';

const ROOT = path.resolve(__dirname, '../../../../..');
const MIGRATION = 'migrations/20260608_ai_placement_policies.sql';

function resolverColumns(): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'server/services/ai-gateway/providers/org-placement-db.ts'), 'utf8');
  const select = /SELECT([\s\S]*?)FROM\s+ai_placement_policies/.exec(src);
  if (!select) throw new Error('resolver SELECT not found');
  return select[1].split(',').map(c => c.trim()).filter(Boolean);
}

describe('ai_placement_policies migration', () => {
  it('is applied on every deploy, before the final tenant-isolation pair', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(MIGRATION);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC));
    expect(at).toBeLessThan(files.indexOf(TENANT_ISOLATION_SWEEP));
  });

  it('adds, on an existing table, every column the resolver reads', () => {
    const sql = fs.readFileSync(path.join(ROOT, MIGRATION), 'utf8');
    const columns = resolverColumns();
    expect(columns).toEqual(expect.arrayContaining(['allowed_substrates', 'allowed_providers', 'public_source_frontier']));
    const original = new Set(['required_data_residency', 'zero_data_retention', 'allowed_substrates']);
    for (const column of columns) {
      if (original.has(column)) {
        expect(sql).toMatch(new RegExp(`\\b${column}\\b`));
      } else {
        // A column added after the table first shipped must be ADD COLUMN IF
        // NOT EXISTS: CREATE TABLE IF NOT EXISTS does not add it to an existing table.
        expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
      }
    }
  });
});
