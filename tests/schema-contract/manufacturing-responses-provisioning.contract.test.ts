/**
 * Contract: manufacturing.responses is created by a migration, not by the
 * first request that reaches the router.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * server/routes/manufacturing-routes.ts opened its two response handlers with
 * `await ensureResponsesTable()`, a CREATE TABLE IF NOT EXISTS run on the
 * request's own connection. The comment above it named the reason plainly —
 * "This covers the gap where migration-066 does not include a responses table"
 * — but covering a provisioning gap from inside a handler only works while the
 * application connects as a role that may create tables. The runtime role holds
 * SELECT/INSERT/UPDATE/DELETE on the manufacturing schema and nothing else, so
 * on a provisioned database with RLS enforcing:
 *
 *   GET /api/manufacturing/responses → 500 MFG_RESPONSES_LIST_ERROR
 *
 * and it repeated on every request, because the "ready" flag is only set after
 * the DDL succeeds.
 *
 * @compliance 21 CFR Part 11 §11.10(a) — validation of systems to ensure
 *             accuracy and reliability. A store created by whichever request
 *             arrives first, on whatever connection it happens to hold, is not
 *             a validated store.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTER_SRC = path.join(REPO_ROOT, 'server/routes/manufacturing-routes.ts');
const T = 60_000;

let jdb: JourneyDb;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: `CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);`,
    migrations: ['db/migrations/20260902_manufacturing_responses.sql'],
  });
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('the router does not provision its own store', () => {
  it('carries no DDL for manufacturing.responses', () => {
    const src = fs
      .readFileSync(ROUTER_SRC, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/CREATE\s+TABLE[\s\S]{0,80}manufacturing\.responses/i);
    expect(src).not.toMatch(/ensureResponsesTable/);
    expect(src).not.toMatch(/responsesTableReady/);
  });
});

describe('the migration backs the SQL the handlers actually run', () => {
  it('holds exactly the columns the read, insert and update name', async () => {
    const { rows } = await jdb.pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'manufacturing' AND table_name = 'responses'
        ORDER BY column_name`,
    );
    const cols = new Map(
      (rows as { column_name: string; data_type: string }[]).map(c => [c.column_name, c.data_type]),
    );
    expect([...cols.keys()]).toEqual([
      'created_at',
      'evidence_ids',
      'finding_id',
      'id',
      'org_id',
      'response_text',
      'section',
      'updated_at',
    ]);
    // uuid, like every other tenant key in this schema — the routes resolve the
    // organization UUID and the policy 066 installed matches on a uuid.
    expect(cols.get('org_id')).toBe('uuid');
    expect(cols.get('evidence_ids')).toBe('jsonb');
  }, T);

  it('runs the listing, insert and tenant-scoped update the handlers issue', async () => {
    const org = '11111111-2222-4333-8444-555555555555';
    const other = '99999999-2222-4333-8444-555555555555';

    const inserted = await jdb.pool.query(
      `INSERT INTO manufacturing.responses (finding_id, section, response_text, evidence_ids, org_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      ['FIND-01', '3.2.P.3', 'Deviation closed; batch record corrected.', JSON.stringify(['ev-1']), org],
    );
    expect(inserted.rows[0].finding_id).toBe('FIND-01');

    const listed = await jdb.pool.query(
      `SELECT * FROM manufacturing.responses WHERE org_id = $1 ORDER BY updated_at DESC`,
      [org],
    );
    expect(listed.rows).toHaveLength(1);

    // The update is tenant-scoped in the handler; another org's id matches nothing.
    const foreign = await jdb.pool.query(
      `UPDATE manufacturing.responses SET response_text = $1, updated_at = NOW()
        WHERE id = $2 AND org_id = $3 RETURNING id`,
      ['rewritten by another tenant', inserted.rows[0].id, other],
    );
    expect(foreign.rows).toHaveLength(0);

    const own = await jdb.pool.query(
      `UPDATE manufacturing.responses SET response_text = $1, updated_at = NOW()
        WHERE id = $2 AND org_id = $3 RETURNING response_text`,
      ['Deviation closed; CAPA-14 raised.', inserted.rows[0].id, org],
    );
    expect(own.rows[0].response_text).toBe('Deviation closed; CAPA-14 raised.');
  }, T);

  it('carries the schema’s tenant policy, so RLS is not left off a new table', async () => {
    const { rows } = await jdb.pool.query(
      `SELECT policyname FROM pg_policies
        WHERE schemaname = 'manufacturing' AND tablename = 'responses'`,
    );
    expect(rows.map((r: { policyname: string }) => r.policyname)).toContain(
      'tenant_isolation_policy',
    );
  }, T);
});
