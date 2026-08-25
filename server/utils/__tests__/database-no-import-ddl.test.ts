/**
 * Importing a data-access module must not issue DDL.
 *
 * server/utils/database.js used to call `initializeTables()` — CREATE TABLE IF
 * NOT EXISTS for ind_projects / ind_sections / ind_timelines — as a
 * fire-and-forget side effect of module load, on the shared request pool. Five
 * modules import it, so loading any of them ran DDL.
 *
 * It could not work in production: the runtime connects as the non-superuser
 * `app_service` role, and PostgreSQL checks CREATE on the schema BEFORE the
 * IF-NOT-EXISTS short-circuit ("permission denied for schema public", confirmed
 * on PG16) — and under RLS_ENFORCE=on the unscoped query is rejected before
 * even that. `.catch(console.error)` made both failures invisible. Its
 * ind_projects also had no organization_id, while the installers create it WITH
 * a tenant column, RLS forced, and a policy — so if that DDL had ever won on a
 * fresh database it would have produced a tenant-isolation hole.
 *
 * ── Why this reads the source instead of spying on the pool ──────────────────
 * The natural version of this test — import the module and assert the mocked
 * pool saw no CREATE — is not reliable here. The suite runs in a shared
 * singleFork worker, so by the time this file executes another test may already
 * have imported the module (a cached import issues nothing, and the test passes
 * for the wrong reason); and forcing a genuine reload with `vi.resetModules()`
 * re-runs the `vi.mock('pg')` factory, which detaches the captured mock and
 * leaves `mockPool.query.mock` undefined. Both roads lead to a test whose green
 * means nothing, which is the failure mode this whole area is being cleaned of.
 *
 * Reading the file is deterministic and pins the actual invariant: no DDL text,
 * and no module-scope statement that could execute any.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MODULE_PATH = path.join(__dirname, '..', 'database.js');

/** Strip comments so the header above (which quotes the removed DDL) is not a match. */
function code(source: string): string {
  return source
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !/^(\/\/|\/\*|\*)/.test(trimmed);
    })
    .join('\n');
}

describe('server/utils/database.js — importing must not issue DDL', () => {
  const source = code(fs.readFileSync(MODULE_PATH, 'utf8'));

  it('contains no DDL', () => {
    // Schema belongs to scripts/db/install-fresh.mjs and deploy-migrate.mjs,
    // which run as the OWNER. Startup code validates and never creates —
    // server/db/ensureCoreTables.ts is the pattern ("Instead of creating
    // tables, it validates required tables exist").
    const ddl = source.match(/\b(CREATE|ALTER|DROP|TRUNCATE)\s+(TABLE|INDEX|SCHEMA|TYPE|VIEW|SEQUENCE)\b/gi);
    expect(ddl).toBeNull();
  });

  it('has no module-scope statement that runs a query on import', () => {
    // The defect was the side effect, not the function name: any top-level call
    // re-introduces it. Module scope is everything at indentation zero that is
    // not an import, export, declaration, or block continuation.
    const topLevelCalls = source
      .split('\n')
      .filter(line => /^[a-zA-Z_$][\w$.]*\s*\(/.test(line) || /^if\s*\(/.test(line))
      .map(line => line.trim());

    expect(topLevelCalls).toEqual([]);
  });

  it('no longer exports a table-creating initializer', async () => {
    const mod = await import('../database.js');
    expect((mod as Record<string, unknown>).initializeTables).toBeUndefined();
    expect(Object.keys((mod.default ?? {}) as object).sort()).toEqual([
      'getClient',
      'pool',
      'query',
      'transaction',
    ]);
  });
});
