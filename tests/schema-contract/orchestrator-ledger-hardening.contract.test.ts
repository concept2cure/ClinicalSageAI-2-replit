/**
 * Schema contract: the submission-orchestrator run ledger is hardened at the
 * database (auth/e-signature audit 2026-07-30, P1 follow-ups from
 * docs/compliance/part11-immutability-record-class-policy.md).
 *
 * Before db/migrations/20260730_orchestrator_run_ledger_hardening.sql:
 *   - deleting a run CASCADE-erased its entire step history (the audit's
 *     "append-only is described, not proven" finding);
 *   - step events accepted UPDATE/DELETE;
 *   - nothing recorded WHICH workflow definition produced a run, so a code
 *     change to the dependency graph silently changed the meaning of
 *     historical runs.
 *
 * These tests apply the REAL store port + the REAL hardening migration to an
 * in-process Postgres and attempt the mutations the policy forbids.
 *
 * @compliance 21 CFR Part 11 §11.10(e) — audit trails are append-only; the
 *             record must carry enough provenance to be interpreted without
 *             reference to mutable code.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STORE_PORT = 'db/migrations/20260725_submission_orchestrator_store_port.sql';
const HARDENING = 'db/migrations/20260730_orchestrator_run_ledger_hardening.sql';

const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('orchestrator run-ledger hardening', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    // FK prerequisites the store port references.
    await pg.exec(`
      CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
      CREATE TABLE submissions (id SERIAL PRIMARY KEY, organization_id INTEGER);
      INSERT INTO organizations (id, name) VALUES (1, 'org-a');
    `);
    await pg.exec(read(STORE_PORT));
    await pg.exec(read(HARDENING));

    await pg.query(
      `INSERT INTO submission_orchestrator_runs
         (run_id, organization_id, submission_id, application_number, region,
          submission_type, started_at, status, steps, workflow_version, dependency_graph_digest)
       VALUES ($1, 1, 'sub-1', 'NDA1', 'US', 'original', NOW(), 'running', '[]'::jsonb,
               'wdv-test-1', 'digest-abc')`,
      [RUN_ID],
    );
    await pg.query(
      `INSERT INTO submission_orchestrator_steps
         (run_id, step_key, event_type, status, input_hash)
       VALUES ($1, 'm3.compose', 'start', 'running', 'h1')`,
      [RUN_ID],
    );
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  it('is journaled in the canonical migration manifest (never push-only)', () => {
    const manifest = JSON.parse(read('db/migrations/migrations_manifest.json'));
    expect(manifest.executionOrder).toContain(
      '20260730_orchestrator_run_ledger_hardening.sql',
    );
  });

  it('run rows carry write-once workflow-definition provenance', async () => {
    const r = await pg.query<{ workflow_version: string; dependency_graph_digest: string }>(
      `SELECT workflow_version, dependency_graph_digest
         FROM submission_orchestrator_runs WHERE run_id = $1`,
      [RUN_ID],
    );
    expect(r.rows[0].workflow_version).toBe('wdv-test-1');
    expect(r.rows[0].dependency_graph_digest).toBe('digest-abc');
  });

  it('appending step events still works — append is the one permitted verb', async () => {
    const r = await pg.query<{ id: number }>(
      `INSERT INTO submission_orchestrator_steps
         (run_id, step_key, event_type, status, input_hash)
       VALUES ($1, 'm3.compose', 'complete', 'complete', 'h1') RETURNING id`,
      [RUN_ID],
    );
    expect(r.rows[0].id).toBeGreaterThan(0);
  });

  it('refuses UPDATE of a step event — history cannot be rewritten', async () => {
    await expect(
      pg.query(
        `UPDATE submission_orchestrator_steps SET status = 'complete' WHERE run_id = $1`,
        [RUN_ID],
      ),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('refuses DELETE of a step event', async () => {
    await expect(
      pg.query(`DELETE FROM submission_orchestrator_steps WHERE run_id = $1`, [RUN_ID]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('deleting a run with history is RESTRICTed — no more cascade erasure', async () => {
    // Pre-hardening this DELETE silently erased every step row. Now the FK
    // refuses while history exists (and the step trigger refuses removing the
    // history first).
    await expect(
      pg.query(`DELETE FROM submission_orchestrator_runs WHERE run_id = $1`, [RUN_ID]),
    ).rejects.toThrow(/RESTRICT setting of foreign key|violates foreign key constraint|IMMUTABILITY_VIOLATION/);

    // The history is intact afterwards.
    const steps = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM submission_orchestrator_steps WHERE run_id = $1`,
      [RUN_ID],
    );
    expect(steps.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('the FK swap is idempotent and only rewrites a CASCADE', async () => {
    // Re-applying the hardening migration must not error or duplicate anything.
    await pg.exec(read(HARDENING));
    const fk = await pg.query<{ confdeltype: string }>(
      `SELECT c.confdeltype
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'submission_orchestrator_steps' AND c.contype = 'f'
          AND c.confrelid = 'submission_orchestrator_runs'::regclass`,
    );
    expect(fk.rows).toHaveLength(1);
    expect(fk.rows[0].confdeltype).toBe('r'); // RESTRICT
  });
});
