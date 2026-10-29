/**
 * The boot sweep over the CSR queues (2026-10-30; csr-queue-recovery.ts).
 *
 * A restart stops a CSR worker mid-run. On boot, items stalled past their own
 * queue's stall rule are resumed once as the user who asked, even when two
 * instances boot together; a requester whose access was removed gets a typed
 * failure, and nothing runs as them or as anyone else. Real
 * migrations/20260628_csr_job_state.sql in PGlite (replayed twice), the real
 * access check (requireCsrJobAccess over the project-sharing tables) and the
 * real narrative worker; SYNTHETIC data (support/adam-narrative-synthetic.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ tables: vi.fn(), adam: vi.fn() }));
vi.mock('../../../db', () => ({ db: null, getPool: () => { throw new Error('no pool in this test'); } }));
vi.mock('../saved-clinical-tables.js', () => ({ readSavedClinicalTables: h.tables }));
vi.mock('../vault-source-input.js', () => ({ readCsrAdamDatasets: h.adam }));
import { buildCsrNarratives, type NarrativeQueryable } from '../csr-narrative-store';
import { readLatestNarrativeRun, runNarrativeRun } from '../csr-narrative-run';
import { runCsrQueueRecovery, type CsrQueueRecoveryDeps, type StalledItem } from '../csr-queue-recovery';
import { narrativeBundle, narrativeDatasets } from './support/adam-narrative-synthetic';

const SQL = readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8');
const PROTOCOL = 'SYN-LMN201-PROTOCOL';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const receipt = { documentId: '11111111-2222-4333-8444-000000000099', sha256: 'e'.repeat(64), studyId: 'SYN-NARR', protocolNumber: PROTOCOL };
const OWNER = 5;
const SHARED = 8;
let db: PGlite;
const q: NarrativeQueryable = { query: (text, params) => db.query<Record<string, unknown>>(text, params as never[]) };

function sweepDeps(dispatched: StalledItem[], permitted?: Set<number>): CsrQueueRecoveryDeps {
  return {
    discover: (text, params) => q.query(text, params),
    withOrganization: (_org, fn) => fn(q),
    permitted: async ids => permitted ?? new Set(ids),
    dispatch: async (item) => {
      dispatched.push(item);
      // The narrative queue's own worker, on the test connection; the build and assembly workers are recorded only.
      if (item.queue === 'narrative') await runNarrativeRun(item.id, item.organizationId, { withOrganization: (_o, fn) => fn(q as never), build: buildCsrNarratives });
    },
  };
}

async function job(id: number, status: string, requestedBy: number | null) {
  const bound = JSON.stringify({ studyInfo: { protocolNumber: PROTOCOL }, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'SYN-NARR' } });
  await db.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by, updated_at)
    VALUES ($1, 7, 11, $2, $3, $4, $5, now() - interval '2 hours')`, [id, PROTOCOL, status, bound, requestedBy]);
}
/** A narrative run its worker left 'running' (attempt 1), last written `minutesAgo` minutes ago. */
async function narrativeRun(jobId: number, requestedBy: number | null, minutesAgo: number): Promise<number> {
  const { rows } = await db.query<{ id: number }>(`INSERT INTO csr_narrative_runs (organization_id, job_id, requested_by, status, attempt, subjects_done, subjects_total, started_at, updated_at)
    VALUES (7, $1, $2, 'running', 1, 12, 80, now() - interval '1 hour', now() - $3 * interval '1 minute') RETURNING id`, [jobId, requestedBy, minutesAgo]);
  return rows[0].id;
}
async function assemblyRun(jobId: number, requestedBy: number | null, minutesAgo: number): Promise<number> {
  const { rows } = await db.query<{ id: number }>(`INSERT INTO csr_assembly_runs (organization_id, job_id, requested_by, status, progress, stage, started_at, updated_at)
    VALUES (7, $1, $2, 'assembling', 40, 'Rendering §16.2.7', now() - interval '1 hour', now() - $3 * interval '1 minute') RETURNING id`, [jobId, requestedBy, minutesAgo]);
  return rows[0].id;
}
const row = async (table: 'csr_narrative_runs' | 'csr_assembly_runs' | 'csr_build_jobs', id: number) =>
  (await db.query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
    CREATE TABLE users (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, client_workspace_id integer,
      status text, regulatory_program_id uuid, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer);
    INSERT INTO organizations (id) VALUES (7);
    INSERT INTO users (id) VALUES (5), (8);
  `);
  await db.exec(SQL);
  await db.exec(SQL); // every deploy re-runs the file
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`
    TRUNCATE csr_build_jobs, organization_users, projects, project_members RESTART IDENTITY CASCADE;
    INSERT INTO organization_users (organization_id, user_id, role) VALUES (7, 5, 'member'), (7, 8, 'member');
    INSERT INTO projects VALUES (11, 7, NULL, 'active', NULL, 5, 5,
      '{"projectSharing":{"visibility":"private","members":[{"userId":8,"role":"use","status":"active"}]}}');
    INSERT INTO project_members VALUES (11, 7, 8, 'use', 'active');
  `);
  h.tables.mockReset().mockResolvedValue({ runId: RUN, programId: PROGRAM, studies: [{ source: receipt, tables: {} }] });
  h.adam.mockReset().mockResolvedValue({ bundle: narrativeBundle(), datasets: narrativeDatasets(400), componentsApproved: true });
});

describe('CSR queue boot recovery (SYNTHETIC data)', () => {
  it('two instances booting together resume each stalled item once, as its requester; a live run is left alone', async () => {
    await job(1, 'complete', OWNER);
    await job(2, 'complete', OWNER);
    await job(4, 'drafting', OWNER); // a build its worker left drafting
    const stalled = await narrativeRun(1, OWNER, 10);
    const live = await narrativeRun(2, OWNER, 1);
    const assembly = await assemblyRun(1, OWNER, 20);

    const dispatched: StalledItem[] = [];
    const [a, b] = await Promise.all([runCsrQueueRecovery(sweepDeps(dispatched)), runCsrQueueRecovery(sweepDeps(dispatched))]);

    expect(dispatched.map(i => `${i.queue}:${i.id}:${i.requestedBy}`).sort()).toEqual(['assembly:1:5', 'build:4:5', `narrative:${stalled}:5`]);
    expect(a.resumed + b.resumed).toBe(3);
    expect(a.notClaimed + b.notClaimed).toBe(3);

    const resumed = await readLatestNarrativeRun(q, 7, 1);
    expect(resumed).toMatchObject({ id: stalled, status: 'complete', attempt: 2, subjectsDone: 80, subjectsTotal: 80, stalled: false });
    expect((await row('csr_narrative_runs', stalled)).requested_by).toBe(OWNER);
    expect(h.tables).toHaveBeenCalledTimes(1);
    expect(h.tables).toHaveBeenLastCalledWith(expect.anything(), { organizationId: 7, userId: OWNER, programId: PROGRAM }, RUN);

    expect(await row('csr_narrative_runs', live)).toMatchObject({ status: 'running', attempt: 1, subjects_done: 12 });
    expect(await row('csr_build_jobs', 4)).toMatchObject({ status: 'queued', requested_by: OWNER });
    expect(await row('csr_assembly_runs', assembly)).toMatchObject({ status: 'queued', requested_by: OWNER, error: null });
  });

  it('a requester whose project access was removed gets a typed failure in each queue, and nothing runs', async () => {
    await job(1, 'complete', SHARED);
    await job(5, 'drafting', SHARED);
    const narrative = await narrativeRun(1, SHARED, 10);
    const assembly = await assemblyRun(1, SHARED, 20);
    await db.query(`UPDATE project_members SET status = 'revoked' WHERE project_id = 11 AND user_id = $1`, [SHARED]);

    const dispatched: StalledItem[] = [];
    const [a, b] = await Promise.all([runCsrQueueRecovery(sweepDeps(dispatched)), runCsrQueueRecovery(sweepDeps(dispatched))]);

    expect(dispatched).toEqual([]);
    expect(a.refused + b.refused).toBe(3);
    expect(h.tables).not.toHaveBeenCalled();
    expect(await row('csr_narrative_runs', narrative)).toMatchObject({ status: 'failed', requested_by: SHARED,
      error: { code: 'CSR_PROJECT_ACCESS_DENIED', message: expect.stringMatching(/not resumed after the server restarted, and it was not run as anyone else/) } });
    expect(await row('csr_assembly_runs', assembly)).toMatchObject({ status: 'failed', stage: 'Failed', error: { code: 'CSR_PROJECT_ACCESS_DENIED' } });
    expect(await row('csr_build_jobs', 5)).toMatchObject({ status: 'failed', error: { reason: 'project_access_refused', code: 'CSR_PROJECT_ACCESS_DENIED' } });
    expect((await db.query(`SELECT count(*)::int AS n FROM csr_narrative_outputs WHERE job_id = 1`)).rows[0]).toEqual({ n: 0 });
  });

  it('a requester who no longer exists, or an archived project, is a typed failure too', async () => {
    await job(1, 'complete', OWNER);
    await job(6, 'drafting', null);
    const assembly = await assemblyRun(1, null, 20);
    const dispatched: StalledItem[] = [];
    await runCsrQueueRecovery(sweepDeps(dispatched));
    expect(dispatched).toEqual([]);
    expect(await row('csr_assembly_runs', assembly)).toMatchObject({ status: 'failed', error: { code: 'CSR_ASSEMBLY_REQUESTER_MISSING' } });
    expect(await row('csr_build_jobs', 6)).toMatchObject({ status: 'failed', error: { reason: 'requester_missing', code: 'CSR_BUILD_REQUESTER_MISSING' } });

    await db.query(`UPDATE projects SET status = 'archived' WHERE id = 11`);
    const narrative = await narrativeRun(1, OWNER, 10);
    await runCsrQueueRecovery(sweepDeps(dispatched));
    expect(dispatched).toEqual([]);
    expect(await row('csr_narrative_runs', narrative)).toMatchObject({ status: 'failed', error: { code: 'CSR_PROJECT_ARCHIVED' } });
  });

  it('an organization not permitted background work is left as it is', async () => {
    await job(1, 'complete', OWNER);
    const narrative = await narrativeRun(1, OWNER, 10);
    const dispatched: StalledItem[] = [];
    const summary = await runCsrQueueRecovery(sweepDeps(dispatched, new Set()));
    expect(summary).toMatchObject({ found: 1, skippedNotPermitted: 1, resumed: 0 });
    expect(dispatched).toEqual([]);
    expect(await row('csr_narrative_runs', narrative)).toMatchObject({ status: 'running', attempt: 1 });
  });
});
