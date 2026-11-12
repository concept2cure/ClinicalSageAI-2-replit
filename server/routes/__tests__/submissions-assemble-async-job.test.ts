/**
 * The test package answers 202 with a job, and its answer is read back by job id (MR-03 Stage 6 steps 4–6, OPS-17).
 *
 * Assembling a 200-leaf IND of 80-page documents took p95 56 s on four cores
 * (docs/evidence/D1/2026-11-12-edge-timeouts/), at the 60 s CloudFront and ALB
 * edge. A caller that sends `Prefer: respond-async` now gets 202 once the
 * request's refusals are decided; the dry run goes on, and its answer, 200 or
 * the recorded 422 refusal, is stored on the job for the session's
 * organization only. Without the header the route answers as before.
 *
 * The job table and the tracking-project read are held in memory behind the
 * request's client; the assembly resolves when the test says so.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-assemble-async-secret-32-chars';
});

const asm = vi.hoisted(() => ({ impl: (async () => ({})) as (...a: unknown[]) => Promise<unknown> }));
vi.mock('../../services/ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ectd/assemble-from-core')>();
  return { ...actual, assembleSequence: (...a: unknown[]) => asm.impl(...a) };
});

interface JobRow { job_id: string; organization_id: number; project_id: number; surface_key: string; runtime_profile_key: string; status: string; result_summary: unknown; started_at: Date; completed_at: Date | null }
const db = vi.hoisted(() => ({ jobs: [] as JobRow[], trackingProject: 41 as number | null, released: 0 }));
vi.mock('../../db/requestDb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/requestDb')>();
  const query = async (sql: string, params: unknown[] = []) => {
    if (/FROM ectd_sequences e\s+JOIN submissions/i.test(sql)) return { rows: db.trackingProject === null ? [] : [{ id: db.trackingProject }] };
    if (/INSERT INTO artifact_compute_jobs/i.test(sql)) {
      db.jobs.push({ job_id: params[0] as string, organization_id: params[1] as number, project_id: params[2] as number, surface_key: params[3] as string,
        runtime_profile_key: params[5] as string, status: 'running', result_summary: {}, started_at: new Date(), completed_at: null });
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE artifact_compute_jobs/i.test(sql)) {
      const job = db.jobs.find((j) => j.job_id === params[0] && j.organization_id === params[1] && j.status === 'running');
      if (!job) return { rows: [], rowCount: 0 };
      Object.assign(job, { status: params[2], result_summary: JSON.parse(params[3] as string), completed_at: new Date() });
      return { rows: [], rowCount: 1 };
    }
    if (/FROM artifact_compute_jobs/i.test(sql)) {
      return { rows: db.jobs.filter((j) => j.job_id === params[0] && j.organization_id === params[1] && j.surface_key === params[2] && j.runtime_profile_key === params[3]) };
    }
    return { rows: [] };
  };
  return { ...actual, requestPgClient: () => ({ query }) };
});
vi.mock('../../db/requestDbLease', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/requestDbLease')>();
  return { ...actual, retainRequestDbClient: () => async () => { db.released += 1; } };
});

import request from 'supertest';
import express from 'express';
import { EctdAssemblyBlockedError } from '../../services/ectd/assemble-from-core';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  const org = Number(req.headers['x-test-org'] ?? 7);
  req.user = { id: 3, userId: 3, organizationId: org, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

const assembled = {
  bundle: { sha256: 'a'.repeat(64), format: 'zip', sizeBytes: 1024 },
  materialized: 200, skipped: [], unresolvedLeaves: [], unfinalized: 0, unfinalizedSections: [],
  cleanup: async () => {}, auditTrail: { persisted: true, chained: true },
};

/** An assembly that ends when the test calls finish (or fail). */
function heldAssembly() {
  let finish!: () => void;
  let failWith!: (err: unknown) => void;
  asm.impl = () => new Promise((resolve, reject) => { finish = () => resolve(assembled); failWith = reject; });
  return { finish: () => finish(), fail: (err: unknown) => failWith(err) };
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const start = () => request(app).post('/api/submissions/sequences/11/assemble').set('Prefer', 'respond-async').send({});
const poll = (path: string, org = 7) => request(app).get(path).set('x-test-org', String(org));

beforeEach(() => {
  db.jobs = [];
  db.trackingProject = 41;
  db.released = 0;
});

describe('POST /sequences/:seqId/assemble with Prefer: respond-async', () => {
  it('answers 202 while the assembly runs, and the job holds the full answer once it ends', async () => {
    const held = heldAssembly();
    const accepted = await start();
    expect(accepted.status).toBe(202);
    expect(accepted.headers['preference-applied']).toBe('respond-async');
    expect(accepted.body).toMatchObject({ status: 'running', jobId: expect.stringMatching(/^rjob_\d+_[0-9a-f]{16}$/) });
    expect(accepted.body.poll).toBe(`/api/submissions/sequences/11/assemble/jobs/${accepted.body.jobId}`);
    expect(db.jobs).toEqual([expect.objectContaining({ organization_id: 7, project_id: 41, surface_key: 'sequence-assemble', runtime_profile_key: 'ectd-in-process', status: 'running' })]);

    const running = await poll(accepted.body.poll);
    expect(running.body).toMatchObject({ status: 'running' });

    held.finish();
    await settle();
    const done = await poll(accepted.body.poll);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect(done.body.result).toEqual({ status: 200, body: expect.objectContaining({ ok: true, dryRun: true, packageProduced: false, materialized: 200, auditTrail: { persisted: true, chained: true } }) });
    expect(db.released).toBe(1);
  });

  it('a refused assembly is stored as the 422 refusal, with the record of it', async () => {
    const held = heldAssembly();
    const accepted = await start();
    held.fail(new EctdAssemblyBlockedError('ICH eCTD STF Specification v2.6.1: "study-report" is not a defined file-tag on "Tox" (m4.2.3.2).', { persisted: true, chained: true } as never));
    await settle();
    const done = await poll(accepted.body.poll);
    expect(done.body.status).toBe('completed');
    expect(done.body.result).toEqual({ status: 422, body: { error: { code: 'ECTD_ASSEMBLE_BLOCKED', message: expect.stringMatching(/not a defined file-tag/) }, auditTrail: { persisted: true, chained: true } } });
  });

  it('an assembly that throws is stored as failed with a sentence and a reference, not its error text', async () => {
    const held = heldAssembly();
    const accepted = await start();
    held.fail(new TypeError('cannot read properties of undefined (reading "bundle")'));
    await settle();
    const done = await poll(accepted.body.poll);
    expect(done.body).toMatchObject({ status: 'failed', error: `The test package could not be assembled on the server. Reference ${accepted.body.jobId}.` });
    expect(JSON.stringify(done.body)).not.toMatch(/undefined/);
    expect(db.released).toBe(1);
  });

  it("another organization's session reads 404 for the job, as does a malformed id", async () => {
    const held = heldAssembly();
    const accepted = await start();
    held.finish();
    await settle();
    expect((await poll(accepted.body.poll, 8)).status).toBe(404);
    expect((await poll('/api/submissions/sequences/11/assemble/jobs/rjob_1_zz')).status).toBe(404);
  });

  it('a refusal decided before any work is still answered at once, with no job', async () => {
    const res = await request(app).post('/api/submissions/sequences/11/assemble').set('Prefer', 'respond-async').send({ applicationId: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DRY_RUN_TAKES_NO_IDENTITY');
    expect(db.jobs).toEqual([]);
  });

  it('a sequence with no tracking project is assembled synchronously', async () => {
    db.trackingProject = null;
    asm.impl = async () => assembled;
    const res = await start();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, materialized: 200 });
    expect(db.jobs).toEqual([]);
  });
});

describe('POST /sequences/:seqId/assemble without the preference', () => {
  it('answers synchronously, as before, and records no job', async () => {
    asm.impl = async () => assembled;
    const res = await request(app).post('/api/submissions/sequences/11/assemble').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, dryRun: true, materialized: 200 });
    expect(db.jobs).toEqual([]);
  });
});
