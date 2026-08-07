/**
 * Contract: the readiness gate names tables the provisioning path actually
 * creates, and that the application actually depends on.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * SECURITY_CRITICAL_TABLES listed auth_users, auth_refresh_tokens, roles,
 * permissions and user_roles. None of the five exist after a correct install:
 * their only DDL lives in db/migrations/_consolidated/, a tree
 * scripts/db/migration-set.mjs quarantines deliberately. None of the five is
 * queried by any application code either — the only references in server/ were
 * the gate itself and its twin list in ensureCoreTables.
 *
 * So /readyz answered 503 on every correctly provisioned database, forever.
 * Reproduced end to end: install-fresh.mjs (767 tables) then deploy-migrate.mjs
 * (127/127 files), after which /api/health returned 200 and /readyz reported
 * "security-critical tables missing: auth_users, auth_refresh_tokens, roles,
 * permissions, user_roles". Behind a readiness probe, that service never
 * receives traffic.
 *
 * ── What this gate pins ───────────────────────────────────────────────────────
 * Two directions, because fixing only one recreates the problem:
 *
 *   1. SATISFIABLE — every named table is created by a wired migration. A gate
 *      that cannot go green is broken, not strict.
 *   2. LOAD-BEARING — every named table is read by application code. A gate
 *      naming tables nothing uses tests nothing, which is how the original list
 *      survived: it was never satisfiable, so it was never a signal.
 *
 * Both lists are read from source, so this cannot drift from the code it
 * guards.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVICES = path.join(REPO_ROOT, 'server/startup/services.ts');
const ENSURE = path.join(REPO_ROOT, 'server/db/ensureCoreTables.ts');

/** Parse a `const NAME = [ 'a', 'b' ]` string array out of TypeScript source. */
function readStringArray(file: string, name: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const m = new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(src);
  if (!m) throw new Error(`${name} not found in ${path.basename(file)}`);
  // Strip line comments before harvesting literals: the rationale comments name
  // the retired tables, and counting those as entries would defeat the test.
  const body = m[1].replace(/\/\/[^\n]*/g, '');
  return Array.from(body.matchAll(/'([^']+)'/g)).map((x) => x[1]);
}

const securityCritical = readStringArray(SERVICES, 'SECURITY_CRITICAL_TABLES');
const importantTables = readStringArray(ENSURE, 'IMPORTANT_TABLES');
const criticalTables = readStringArray(ENSURE, 'CRITICAL_TABLES');

/** grep -rl across the repo, excluding the two files that define the lists. */
function filesMentioning(needle: string, globs: string[]): string[] {
  try {
    const out = execFileSync(
      'grep',
      ['-rl', '--include=*.ts', '--include=*.js', '--include=*.sql', needle, ...globs],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    return out.split('\n').filter(Boolean);
  } catch {
    return []; // grep exits 1 when there are no matches
  }
}

describe('readiness security-critical table list', () => {
  it('is not empty — an empty list silently disables the gate', () => {
    expect(securityCritical.length).toBeGreaterThan(0);
  });

  it('every named table is checked, i.e. present in CRITICAL or IMPORTANT tables', () => {
    // The gate filters result.missingImportant. A table in neither list can
    // never appear there, so naming it here would be a no-op that reads as
    // coverage.
    const known = new Set([...importantTables, ...criticalTables]);
    const unchecked = securityCritical.filter((t) => !known.has(t));
    expect(unchecked).toEqual([]);
  });

  it('names no table whose only DDL is in the quarantined _consolidated tree', () => {
    // This is precisely what made /readyz unsatisfiable. A table created only
    // under db/migrations/_consolidated/ is never provisioned, because
    // scripts/db/migration-set.mjs excludes that tree on purpose.
    const unprovisionable = securityCritical.filter((t) => {
      const creators = filesMentioning(`CREATE TABLE IF NOT EXISTS ${t}`, ['migrations', 'db'])
        .concat(filesMentioning(`CREATE TABLE ${t}`, ['migrations', 'db']));
      if (creators.length === 0) return false; // covered by the next test
      return creators.every((f) => f.includes('_consolidated/'));
    });
    expect(unprovisionable).toEqual([]);
  });

  it('every named table is read by application code, not just by these lists', () => {
    // A table nothing queries cannot break anything by being absent, so gating
    // readiness on it tests nothing. The five retired entries all failed here.
    const orphaned = securityCritical.filter((t) => {
      const users = filesMentioning(t, ['server', 'shared']).filter(
        (f) =>
          !f.endsWith('server/startup/services.ts') &&
          !f.endsWith('server/db/ensureCoreTables.ts'),
      );
      return users.length === 0;
    });
    expect(orphaned).toEqual([]);
  });

  it('still covers the load-bearing auth surfaces', () => {
    // Guards against the opposite failure: making the gate satisfiable by
    // emptying it of anything that matters.
    for (const t of ['organization_users', 'platform_role_grants', 'revoked_tokens']) {
      expect(securityCritical).toContain(t);
    }
  });
});
