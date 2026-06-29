/**
 * CSR Jobs API routes — unit tests
 *
 * Exercises the HTTP surface in server/routes/csr-jobs.ts:
 *   POST   /api/csr/jobs                  — enqueue (auth happy + 401 missing org)
 *   GET    /api/csr/jobs/:jobId           — org-scoped status read (200 + 404 + 400)
 *   GET    /api/csr/jobs/:jobId/sections  — section listing
 *   POST   /api/csr/jobs/:jobId/cancel    — terminal-state guard + org-scoped UPDATE
 *
 * Strategy: mount the real router behind a thin supertest harness and mock its
 * three direct dependencies — launchCSRBuildAsync (csr-builder), the
 * getCSRBuildJobStatus / getCSRSectionOutputs reads (csr-job-runner), and the
 * Drizzle db client used by the cancel UPDATE. A small auth-injection middleware
 * stamps req.user / req.tenantContext per-test so we can drive the auth-resolved
 * organizationId path without touching the real auth stack.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ═══════════════════════════════════════════════════════════════════════════════
// HOISTED MOCK STATE (shared by mocks + assertions)
// ═══════════════════════════════════════════════════════════════════════════════

const hoisted = vi.hoisted(() => {
  return {
    launchCSRBuildAsync: vi.fn(),
    getCSRBuildJobStatus: vi.fn(),
    getCSRSectionOutputs: vi.fn(),
    // Captured arguments for the Drizzle update().set().where().returning() chain
    updateCalls: [] as Array<{
      table: unknown;
      patch: unknown;
      whereCalled: boolean;
      returningCalled: boolean;
    }>,
    // What returning() resolves with for the next update — default = one row.
    updateReturningRows: [{ id: 1 }] as Array<{ id: number }>,
    reset() {
      this.launchCSRBuildAsync.mockReset();
      this.getCSRBuildJobStatus.mockReset();
      this.getCSRSectionOutputs.mockReset();
      this.updateCalls = [];
      this.updateReturningRows = [{ id: 1 }];
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK csr-builder (launchCSRBuildAsync)
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/services/csr-builder.js', () => ({
  launchCSRBuildAsync: (...args: unknown[]) => hoisted.launchCSRBuildAsync(...args),
}));
// The router imports with the .js suffix; also stub the no-suffix specifier in
// case any transitive resolution lands here.
vi.mock('../../server/services/csr-builder', () => ({
  launchCSRBuildAsync: (...args: unknown[]) => hoisted.launchCSRBuildAsync(...args),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK csr-job-runner (status + section reads)
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/services/csr/csr-job-runner.js', () => ({
  getCSRBuildJobStatus: (...args: unknown[]) => hoisted.getCSRBuildJobStatus(...args),
  getCSRSectionOutputs: (...args: unknown[]) => hoisted.getCSRSectionOutputs(...args),
}));
vi.mock('../../server/services/csr/csr-job-runner', () => ({
  getCSRBuildJobStatus: (...args: unknown[]) => hoisted.getCSRBuildJobStatus(...args),
  getCSRSectionOutputs: (...args: unknown[]) => hoisted.getCSRSectionOutputs(...args),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK drizzle-orm — eq/and/notInArray return plain JSON descriptors
// (the router's cancel handler builds these into the UPDATE's WHERE clause;
//  we don't evaluate them against rows here, we just need them to not throw
//  and to surface in the captured call for the test that cares).
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (col: any, val: any) => ({
      __kind: 'eq',
      colName: col?.name ?? String(col),
      val,
    }),
    and: (...preds: any[]) => ({ __kind: 'and', preds }),
    notInArray: (col: any, vals: any[]) => ({
      __kind: 'notInArray',
      colName: col?.name ?? String(col),
      vals,
    }),
  };
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK Drizzle db client — only the update() fluent path used by /:jobId/cancel
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('../../server/db', () => {
  const db = {
    update(table: unknown) {
      const call: {
        table: unknown;
        patch: unknown;
        whereCalled: boolean;
        returningCalled: boolean;
      } = {
        table,
        patch: null,
        whereCalled: false,
        returningCalled: false,
      };
      hoisted.updateCalls.push(call);
      const builder: any = {
        set(p: unknown) {
          call.patch = p;
          return builder;
        },
        where(_pred: unknown) {
          call.whereCalled = true;
          return builder;
        },
        returning(_proj: unknown) {
          call.returningCalled = true;
          return Promise.resolve(hoisted.updateReturningRows);
        },
      };
      return builder;
    },
  };
  return { db, pool: null, getPool: () => null, getDb: () => db };
});

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT THE ROUTER (after mocks)
// ═══════════════════════════════════════════════════════════════════════════════

import csrJobsRouter from '../../server/routes/csr-jobs';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST APP — supertest harness with per-request auth injection
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthCtx {
  organizationId?: number | null;
  userId?: number | null;
}

/**
 * Build a fresh Express app whose middleware stamps req.user /
 * req.tenantContext from the provided ctx. Pass `null` for either field to
 * omit it (drives the 401 path).
 */
function makeApp(ctx: AuthCtx = { organizationId: 100, userId: 7 }) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as any;
    if (ctx.organizationId != null) {
      r.tenantContext = { organizationId: ctx.organizationId };
    }
    if (ctx.userId != null) {
      r.user = { id: ctx.userId, organizationId: ctx.organizationId ?? undefined };
    }
    next();
  });
  app.use('/api/csr/jobs', csrJobsRouter);
  return app;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  hoisted.reset();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/csr/jobs', () => {
  it('returns 202 with { jobId, status: "queued" } when authenticated', async () => {
    hoisted.launchCSRBuildAsync.mockResolvedValue({ jobId: 42, status: 'queued' });

    const res = await request(makeApp({ organizationId: 100, userId: 7 }))
      .post('/api/csr/jobs')
      .send({
        projectId: 9,
        studyInfo: {
          title: 'Test Study',
          protocolNumber: 'PROTO-001',
          phase: 'Phase 2',
          indication: 'Test',
          sponsor: 'Test',
          investigationalProduct: 'X',
          studyDesign: 'RCT',
          primaryEndpoint: 'OS',
        },
      });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: 42, status: 'queued' });

    // The route MUST pin organizationId + userId from the auth principal,
    // not from the body — verify both the build request and the ctx arg.
    expect(hoisted.launchCSRBuildAsync).toHaveBeenCalledTimes(1);
    const [buildReq, ctx] = hoisted.launchCSRBuildAsync.mock.calls[0];
    expect(buildReq.organizationId).toBe(100);
    expect(buildReq.userId).toBe(7);
    expect(ctx).toEqual({ organizationId: 100, projectId: 9, requestedBy: 7 });
  });

  it('returns 401 when organizationId is missing from req', async () => {
    // No tenantContext and no user → resolveOrganizationId returns null → 401.
    const res = await request(makeApp({ organizationId: null, userId: null }))
      .post('/api/csr/jobs')
      .send({ studyInfo: { protocolNumber: 'PROTO-001' } });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Organization context required' });
    expect(hoisted.launchCSRBuildAsync).not.toHaveBeenCalled();
  });
});

describe('GET /api/csr/jobs/:jobId', () => {
  it('returns the status object when found in the same org', async () => {
    const statusEnvelope = {
      status: 'drafting',
      progress: 42,
      sectionsComplete: 3,
      error: null,
    };
    hoisted.getCSRBuildJobStatus.mockResolvedValue(statusEnvelope);

    const res = await request(makeApp({ organizationId: 100, userId: 7 })).get(
      '/api/csr/jobs/42'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual(statusEnvelope);
    expect(hoisted.getCSRBuildJobStatus).toHaveBeenCalledWith(42, 100);
  });

  it('returns 404 when getCSRBuildJobStatus returns null', async () => {
    hoisted.getCSRBuildJobStatus.mockResolvedValue(null);

    const res = await request(makeApp({ organizationId: 100, userId: 7 })).get(
      '/api/csr/jobs/9999'
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Job not found' });
    expect(hoisted.getCSRBuildJobStatus).toHaveBeenCalledWith(9999, 100);
  });

  it('returns 400 when :jobId is non-numeric', async () => {
    const res = await request(makeApp({ organizationId: 100, userId: 7 })).get(
      '/api/csr/jobs/abc'
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Valid numeric job id required' });
    // We must not have flowed through to the DB read on a malformed id.
    expect(hoisted.getCSRBuildJobStatus).not.toHaveBeenCalled();
  });
});

describe('GET /api/csr/jobs/:jobId/sections', () => {
  it('returns the section array', async () => {
    // The sections route probes existence first, then loads sections.
    hoisted.getCSRBuildJobStatus.mockResolvedValue({
      status: 'complete',
      progress: 100,
      sectionsComplete: 2,
      error: null,
    });
    const sections = [
      { id: 1, jobId: 42, sectionNumber: '1', content: 'Section 1', organizationId: 100 },
      { id: 2, jobId: 42, sectionNumber: '2', content: 'Section 2', organizationId: 100 },
    ];
    hoisted.getCSRSectionOutputs.mockResolvedValue(sections);

    const res = await request(makeApp({ organizationId: 100, userId: 7 })).get(
      '/api/csr/jobs/42/sections'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sections });
    expect(hoisted.getCSRSectionOutputs).toHaveBeenCalledWith(42, 100);
  });
});

describe('POST /api/csr/jobs/:jobId/cancel', () => {
  it('transitions status to "cancelled" via the org-scoped Drizzle update', async () => {
    // Probe surfaces a still-running job → cancel is allowed.
    hoisted.getCSRBuildJobStatus.mockResolvedValue({
      status: 'drafting',
      progress: 50,
      sectionsComplete: 5,
      error: null,
    });
    // Default updateReturningRows = [{ id: 1 }] → atomic transition succeeds.

    const res = await request(makeApp({ organizationId: 100, userId: 7 })).post(
      '/api/csr/jobs/42/cancel'
    );

    expect(res.status).toBe(204);
    // No body on 204; supertest exposes it as the empty string / {}.
    expect(hoisted.updateCalls).toHaveLength(1);
    const call = hoisted.updateCalls[0];
    // The UPDATE went through .set().where().returning() — confirms the
    // org-scoped WHERE clause and returning() landed.
    expect(call.whereCalled).toBe(true);
    expect(call.returningCalled).toBe(true);
    // Patch must write the cancelled terminal status (plus updatedAt).
    const patch = call.patch as Record<string, unknown>;
    expect(patch.status).toBe('cancelled');
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('returns 409 when status is already "complete"', async () => {
    // Probe surfaces a terminal job → the route short-circuits with 409
    // BEFORE issuing the UPDATE. Verify the UPDATE never fired.
    hoisted.getCSRBuildJobStatus.mockResolvedValue({
      status: 'complete',
      progress: 100,
      sectionsComplete: 10,
      error: null,
    });

    const res = await request(makeApp({ organizationId: 100, userId: 7 })).post(
      '/api/csr/jobs/42/cancel'
    );

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'Job is in a terminal state and cannot be cancelled',
      status: 'complete',
    });
    expect(hoisted.updateCalls).toHaveLength(0);
  });
});
