/**
 * Contract: the rules engine can resolve an assignee by role.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `CreateTaskHandler.execute` (server/services/rules-engine/actions/index.ts)
 * resolves `params.assignToRole` with:
 *
 *     SELECT u.id FROM users u
 *      JOIN user_roles ur ON u.id = ur.user_id
 *      WHERE ur.role = $1 AND u.organization_id = $2
 *
 * Two things in that statement do not exist, and PostgreSQL rejects both at
 * PLAN time, so it fails 100% of the time:
 *
 *   user_roles            no Drizzle model, no CREATE in either migration
 *                         lineage. Executed live: relation "user_roles" does
 *                         not exist.
 *   users.organization_id `users` carries only default_organization_id.
 *
 * The file itself already says so. Fixing a NEIGHBOURING statement at :250-262
 * left this note:
 *
 *   > joined `user_roles` — a table with no Drizzle model and no CREATE in
 *   > either migration lineage — and filtered `u.organization_id`, which
 *   > `users` does not have. Org membership lives in `organization_users`
 *   > (users carries only default_organization_id), which is also where the
 *   > role actually is.
 *
 * The neighbour was fixed. This statement, with the same two faults, was not.
 *
 * ── WHY IT MATTERS ───────────────────────────────────────────────────────────
 * It is reachable: `server/routes/project-rules.ts:531` ships a rule template
 * with `assignToRole: 'qa_reviewer'`. So every `create_task` rule action that
 * assigns by role fails. The handler's catch returns
 * `{ success: false, error }` — honest, not a fabricated success — so this is a
 * feature that cannot work rather than silent data loss. It still cannot work.
 *
 * `server/db/ensureCoreTables.ts:51-56` records that `user_roles` and its
 * cohort are *deliberately* absent ("nothing creates them … and nothing queries
 * them"). The second half of that claim was not true while this JOIN existed.
 * The fix is therefore to query `organization_users`, NOT to provision
 * `user_roles` — provisioning it would contradict a recorded decision.
 *
 * ── Mechanism ────────────────────────────────────────────────────────────────
 * PREPARE plans a statement without executing it, so an unknown table or column
 * raises 42P01/42703 with no fixtures and no writes. The statement is extracted
 * from the SOURCE, so this gate cannot drift from the code it guards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = path.join(REPO_ROOT, 'server/services/rules-engine/actions/index.ts');

/** The assignee-resolution statement, read out of the handler. */
function assigneeQuery(src: string): string {
  const m = /`(SELECT u\.id FROM users u[\s\S]*?)`/.exec(src);
  if (!m) throw new Error('assignee-resolution statement not found in source');
  return m[1].trim();
}

let pg: PGlite;
let planError: { code?: string; message?: string } | null = null;
let sql = '';

beforeAll(async () => {
  sql = assigneeQuery(fs.readFileSync(SOURCE, 'utf8'));
  pg = new PGlite();
  // The three relations the corrected statement needs, with only the columns it
  // touches. `user_roles` is deliberately NOT created: it does not exist on a
  // provisioned database and, per ensureCoreTables.ts, is not meant to.
  await pg.exec(`
    CREATE TABLE users (id serial PRIMARY KEY, default_organization_id integer);
    CREATE TABLE organization_users (
      id serial PRIMARY KEY, organization_id integer, user_id integer, role text
    );
    CREATE TABLE unified_tasks (
      id serial PRIMARY KEY, assignee_id integer, deleted_at timestamptz, status text
    );
  `);
  try {
    await pg.exec(`PREPARE assignee AS ${sql}`);
  } catch (e) {
    planError = e as { code?: string; message?: string };
  }
}, 120_000);

afterAll(async () => { await pg?.close(); });

describe('the assignee-resolution statement plans against the real schema', () => {
  it('was extracted from the source, not restated here', () => {
    expect(sql).toMatch(/SELECT u\.id FROM users u/);
    expect(sql).toMatch(/ORDER BY/);
  });

  it('does not reference user_roles', () => {
    // A table with no Drizzle model and no CREATE in either lineage. Executed
    // live: relation "user_roles" does not exist.
    expect(sql).not.toMatch(/\buser_roles\b/);
  });

  it('does not filter users.organization_id', () => {
    // `users` has only default_organization_id; org membership and role both
    // live on organization_users.
    expect(sql).not.toMatch(/\bu\.organization_id\b/);
  });

  it('plans clean — no 42P01 and no 42703', () => {
    // Was: ERROR relation "user_roles" does not exist.
    expect(planError?.message ?? null).toBeNull();
  });
});
