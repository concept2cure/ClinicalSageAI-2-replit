/**
 * A long compile answers 202 with a job, and its full result is read back by job id (MR-03 Stage 6 steps 4–6, OPS-17).
 *
 * Behind CloudFront and the ALB a request unanswered for 60 s is cut with a
 * 504 while the server finishes the compile and records it. A 200-leaf IND of
 * 80-page documents compiled in p95 59.3 s on four cores
 * (docs/evidence/D1/2026-11-12-edge-timeouts/). A caller that sends
 * `Prefer: respond-async` now gets 202 once every refusal is decided, and
 * GET /:projectIdent/jobs/:jobId returns the CompilationResult the synchronous
 * route returns, for its own organization only.
 *
 * The job table is held in memory on the pool mock, keyed by organization as
 * the real tenant policy keys it. The assembly takes 70 s on fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse } from '../setup';

const { poolQuery, assembleSequenceMock } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  assembleSequenceMock: vi.fn(),
}));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));
vi.mock('../../server/services/ectd/assemble-from-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/ectd/assemble-from-core')>();
  return { assembleSequence: assembleSequenceMock, assembledTransmitBlockers: actual.assembledTransmitBlockers };
});

import ectdCompileRoutes from '../../server/routes/ectd-compile';
import { ORG, UUID, handlerOf, makeBundleZip, assembledResult, makeReq, mockSpineOn, REAL_BACKBONE } from './ectd-compile-spine.harness';

const compile = handlerOf(ectdCompileRoutes, '/:projectIdent/compile', 'post');
const readJob = handlerOf(ectdCompileRoutes, '/:projectIdent/jobs/:jobId', 'get');
const mockSpine = mockSpineOn(poolQuery);
const TRACKING_PROJECT = 41;

interface JobRow { job_id: string; organization_id: number; project_id: number; surface_key: string; runtime_profile_key: string; status: string; result_summary: unknown; started_at: Date; completed_at: Date | null }
let jobs: JobRow[] = [];

/** The spine's reads, plus the tracking project and an in-memory artifact_compute_jobs. */
function withJobTable(options: { trackingRows?: Array<{ id: number }>; trackingError?: boolean } = {}) {
  const spine = poolQuery.getMockImplementation()!;
  poolQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/FROM projects\s+WHERE regulatory_program_id/i.test(sql)) {
      if (options.trackingError) throw new Error('tracking anchor lookup unavailable');
      return { rows: params[0] === UUID && params[1] === ORG ? options.trackingRows ?? [{ id: TRACKING_PROJECT }] : [] };
    }
    if (/INSERT INTO artifact_compute_jobs/i.test(sql)) {
      jobs.push({ job_id: params[0] as string, organization_id: params[1] as number, project_id: params[2] as number, surface_key: params[3] as string,
        runtime_profile_key: params[5] as string, status: 'running', result_summary: {}, started_at: new Date(), completed_at: null });
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE artifact_compute_jobs/i.test(sql)) {
      const job = jobs.find((j) => j.job_id === params[0] && j.organization_id === params[1] && j.status === 'running');
      if (!job) return { rows: [], rowCount: 0 };
      job.status = params[2] as string;
      job.result_summary = JSON.parse(params[3] as string);
      job.completed_at = new Date();
      return { rows: [], rowCount: 1 };
    }
    if (/FROM artifact_compute_jobs/i.test(sql)) {
      return { rows: jobs.filter((j) => j.job_id === params[0] && j.organization_id === params[1] && j.surface_key === params[2] && j.runtime_profile_key === params[3]) };
    }
    return spine(sql, params);
  });
}

const asyncReq = (body: Record<string, unknown> = {}) => {
  const r = makeReq(body);
  r.headers.prefer = 'respond-async';
  return r;
};
const jobReq = (jobId: string, org = ORG) => {
  const r = makeReq();
  r.params.jobId = jobId;
  r.tenantId = org;
  return r;
};
/** Let the detached work run to its end: real event-loop turns (only setTimeout is faked). */
const settle = async () => {
  const deadline = performance.now() + 10_000;
  while (jobs.some((j) => j.status === 'running') && performance.now() < deadline) {
    await new Promise((r) => (globalThis as unknown as { setImmediate: (f: () => void) => void }).setImmediate(() => r(undefined)));
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(100);
  }
};

beforeEach(async () => {
  vi.clearAllMocks();
  jobs = [];
  mockSpine();
  withJobTable();
  const { zipPath } = await makeBundleZip(REAL_BACKBONE);
  assembleSequenceMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(assembledResult(zipPath)), 70_000)));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('POST /compile with Prefer: respond-async', () => {
  it('answers 202 with a job before the 70 s assembly ends, and the job holds the full result once it has', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    let assembled = false;
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => { assembled = true; resolve(assembledResult(zipPath)); }, 70_000)));
    const res = createMockResponse() as any;
    await compile(asyncReq(), res);
    // Answered while the 70 s assembly is still running: no timer has moved.
    expect(res.status).toHaveBeenCalledWith(202);
    expect(assembled).toBe(false);
    const accepted = res.json.mock.calls[0][0];
    expect(accepted).toMatchObject({ status: 'running', jobId: expect.stringMatching(/^rjob_\d+_[0-9a-f]{16}$/) });
    expect(accepted.poll).toBe(`/api/ectd-compile/${UUID}/jobs/${accepted.jobId}`);
    expect(jobs).toEqual([expect.objectContaining({ organization_id: ORG, project_id: TRACKING_PROJECT, surface_key: 'ectd-compile', runtime_profile_key: 'ectd-in-process', status: 'running' })]);

    const before = createMockResponse() as any;
    await readJob(jobReq(accepted.jobId), before);
    expect(before.json.mock.calls[0][0]).toMatchObject({ jobId: accepted.jobId, status: 'running' });

    await vi.advanceTimersByTimeAsync(70_000);
    await settle();
    const after = createMockResponse() as any;
    await readJob(jobReq(accepted.jobId), after);
    const done = after.json.mock.calls[0][0];
    expect(done.status).toBe('completed');
    expect(assembled).toBe(true);
    expect(done.result).toMatchObject({ projectIdent: UUID, programId: UUID, submissionId: 55, sequenceNumber: '0000', region: 'fda', xmlBackbone: REAL_BACKBONE });
    expect(done.result.status).toEqual(expect.any(String));
  });

  it("another organization's session reads 404 for the job", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const res = createMockResponse() as any;
    await compile(asyncReq(), res);
    const { jobId } = res.json.mock.calls[0][0];
    await vi.advanceTimersByTimeAsync(70_000);
    await settle();
    const other = createMockResponse() as any;
    await readJob(jobReq(jobId, ORG + 1), other);
    expect(other.status).toHaveBeenCalledWith(404);
    expect(other.json.mock.calls[0][0].error.code).toBe('JOB_NOT_FOUND');
  });

  it('a malformed job id is 404 and reads nothing', async () => {
    const res = createMockResponse() as any;
    await readJob(jobReq("rjob_1_x' OR 1=1"), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(poolQuery.mock.calls.some(([sql]) => /FROM artifact_compute_jobs/i.test(String(sql)))).toBe(false);
  });

  it('a compile that throws is stored as failed with a sentence and a reference, never as an empty result', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    assembleSequenceMock.mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new TypeError('cannot read properties of undefined')), 70_000)));
    const res = createMockResponse() as any;
    await compile(asyncReq(), res);
    const { jobId } = res.json.mock.calls[0][0];
    await vi.advanceTimersByTimeAsync(70_000);
    await settle();
    const after = createMockResponse() as any;
    await readJob(jobReq(jobId), after);
    const job = after.json.mock.calls[0][0];
    if (job.status === 'failed') {
      expect(job.error).toBe(`The compile failed on the server and was not recorded. Reference ${jobId}.`);
      expect(job.error).not.toMatch(/undefined/);
    } else {
      // The compile turns an assembly error into a failed CompilationResult of its own.
      expect(job.status).toBe('completed');
      expect(job.result.status).toBe('failed');
      expect(job.result.leafFilesRendered).toBe(0);
    }
  });

  it('a refusal is still decided before any job: a contradicting region is 409, with no job and no assembly', async () => {
    const res = createMockResponse() as any;
    await compile(asyncReq({ region: 'EMA' }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(jobs).toEqual([]);
    expect(assembleSequenceMock).not.toHaveBeenCalled();
  });
});

describe('Async compile tracking anchors', () => {
  it('a program without a tracking anchor keeps the synchronous result and creates no job', async () => {
    withJobTable({ trackingRows: [] });
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));
    const res = createMockResponse() as any;
    await compile(asyncReq(), res);
    expect(res.status).not.toHaveBeenCalledWith(202);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ projectIdent: UUID, programId: UUID, xmlBackbone: REAL_BACKBONE });
    expect(jobs).toEqual([]);
  });

  it('a tracking lookup failure refuses the request before a job or assembly starts', async () => {
    withJobTable({ trackingError: true });
    const res = createMockResponse() as any;
    await compile(asyncReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(202);
    expect(jobs).toEqual([]);
    expect(assembleSequenceMock).not.toHaveBeenCalled();
  });

  it('an admitted numeric project retains its synchronous draft backbone without a program-anchor lookup', async () => {
    const spine = poolQuery.getMockImplementation()!;
    poolQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/FROM projects p\s+LEFT JOIN regulatory_programs/i.test(sql)) {
        return { rows: params[0] === TRACKING_PROJECT && params[1] === ORG
          ? [{ regulatory_program_id: UUID, linked_program_id: UUID, program_type: 'ind', primary_agency: 'FDA' }] : [] };
      }
      return spine(sql, params);
    });
    const req = asyncReq();
    req.params.projectIdent = String(TRACKING_PROJECT);
    const res = createMockResponse() as any;
    await compile(req, res);
    expect(res.status).not.toHaveBeenCalledWith(202);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toMatchObject({ projectId: TRACKING_PROJECT, programId: null,
      projectIdent: String(TRACKING_PROJECT), leafFilesRendered: 0, submissionReady: false });
    expect(res.json.mock.calls[0][0].xmlBackbone).toContain('<?xml');
    expect(jobs).toEqual([]);
    expect(poolQuery.mock.calls.some(([sql]) => /FROM projects\s+WHERE regulatory_program_id/i.test(String(sql)))).toBe(false);
    expect(assembleSequenceMock).not.toHaveBeenCalled();
  });
});

describe('POST /compile without the preference', () => {
  it('answers synchronously with the result, as before, and records no job', async () => {
    const { zipPath } = await makeBundleZip(REAL_BACKBONE);
    assembleSequenceMock.mockResolvedValue(assembledResult(zipPath));
    const res = createMockResponse() as any;
    await compile(makeReq(), res);
    expect(res.status).not.toHaveBeenCalledWith(202);
    expect(res.json.mock.calls[0][0]).toMatchObject({ projectIdent: UUID, submissionId: 55, xmlBackbone: REAL_BACKBONE });
    expect(jobs).toEqual([]);
  });
});
