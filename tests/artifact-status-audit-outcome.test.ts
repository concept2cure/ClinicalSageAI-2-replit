/**
 * PUT /projects/:projectId/artifacts/:artifactId/status — the status change
 * AnA's conversation thread makes (a launch-shell surface) — and its audit row.
 *
 * `logAuditEntry` resolves `{ written, attributed }`. The route awaited it at
 * statement position and discarded the result, so a status change whose
 * regulatory_audit_logs row was lost answered exactly like one whose row was
 * written. The change stands either way; the response now carries
 * `auditTrail` in the canonical wire shape the client transport reads.
 *
 * Harness copied from tests/artifact-status-lock-covers-approval.test.ts, plus
 * a partial mock of routes/c2c/shared so the audit write's result is set per
 * case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { st } = vi.hoisted(() => ({
  st: {
    /** Queue of results for each awaited drizzle chain, in order. */
    queue: [] as any[][],
    /** Every .set(...) payload the route wrote. */
    sets: [] as any[],
    /** Every .values(...) payload the route inserted. */
    inserts: [] as any[],
  },
}));

function chain(): any {
  const c: any = {
    select: () => c,
    selectDistinct: () => c,
    from: () => c,
    innerJoin: () => c,
    leftJoin: () => c,
    where: () => c,
    orderBy: () => pull(),
    limit: () => pull(),
    returning: () => pull(),
    insert: () => c,
    values: (v: any) => { st.inserts.push(v); return c; },
    update: () => c,
    set: (v: any) => { st.sets.push(v); return c; },
    delete: () => c,
    onConflictDoNothing: () => pull(),
    then: (res: any, rej: any) => pull().then(res, rej),
  };
  return c;
}
function pull() {
  return Promise.resolve(st.queue.shift() ?? []);
}
function getDbMock(): any {
  return {
    select: (...a: any[]) => chain().select(...a),
    selectDistinct: (...a: any[]) => chain().selectDistinct(...a),
    insert: (...a: any[]) => chain().insert(...a),
    update: (...a: any[]) => chain().update(...a),
    delete: (...a: any[]) => chain().delete(...a),
    transaction: async (fn: any) => fn(chain()),
  };
}

vi.mock('../server/db', () => ({
  get db() { return getDbMock(); },
  pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() },
}));
vi.mock('../server/services/ectd/package-content-change', () => ({
  markPackagesContentChangedForArtifact: vi.fn(async () => ({
    packagesAffected: 0, bundlesInvalidated: 0, failed: false, ledgerWriteFailed: false,
  })),
}));
vi.mock('../server/services/contradiction-engine-service', () => ({
  contradictionEngineService: {
    checkPromotionBlocked: vi.fn(async () => ({ blocked: false, blockingFindings: [], warningFindings: [] })),
  },
}));
vi.mock('../server/auth', () => ({ authMiddleware: (_q: any, _s: any, n: any) => n() }));
vi.mock('../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: any, _s: any, n: any) => n(),
  requireOrganizationContext: (_q: any, _s: any, n: any) => n(),
}));
vi.mock('../server/middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_q: any, _s: any, n: any) => n(),
}));
vi.mock('../server/routes/c2c/project-access', () => ({
  verifyProjectAccess: vi.fn(async () => true),
  getActorRole: () => 'admin',
}));
vi.mock('../server/services/concept2cure/governedDocumentContractService', () => ({
  resolveGovernedContext: () => ({
    validation: { valid: true, errors: [], warnings: [] },
    resolved: {},
    contract: {
      clientTrack: 'x', submissionProgram: 'x', persona: 'x', regulatorScope: 'x',
      documentClass: 'x', readinessGate: 'x', workspaceTarget: 'x', originSurface: 'x',
      recommendationSource: 'x', regulatorIntent: 'x',
      exportEligibility: { gateChecks: [], blockingReasons: [], readinessOutcome: 'ok' },
    },
  }),
}));
vi.mock('../server/services/intelligence/rim-interceptors.js', () => ({
  interceptArtifactChange: vi.fn(),
  interceptFeedback: vi.fn(),
}));
vi.mock('../server/src/control-plane/governed-document-evaluator', () => ({
  evaluateAndInterceptGovernedDocument: () => ({
    decisionReference: { decisionId: 'd1', outcome: 'ok' },
    evaluation: {
      readiness: { level: 'ready', score: 1 },
      placement: { outcome: 'ok' },
      decision: { blockerCount: 0, warningCount: 0, consequenceCount: 0 },
    },
  }),
}));
vi.mock('../server/services/generation-guard.js', () => ({
  createTraceId: () => 't1', emitTraceEvent: vi.fn(),
}));
vi.mock('../server/db/drizzle-queryable', () => ({ queryableFromDrizzle: () => ({ query: vi.fn() }) }));
const { entry } = vi.hoisted(() => ({ entry: { outcome: { written: true, attributed: true } as { written: boolean; attributed: boolean } } }));
vi.mock('../server/routes/c2c/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/routes/c2c/shared')>();
  return { ...actual, logAuditEntry: vi.fn(async () => entry.outcome) };
});


import artifactRouter from '../server/routes/c2c/artifacts';
import { pool } from '../server/db';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.userId = 777;
    req.userEmail = 'a@b.c';
    req.userRole = 'admin';
    req.tenantContext = { organizationId: 99 };
    req.tenantId = 99;
    next();
  });
  app.use('/api/c2c', artifactRouter);
  return app;
}

const ARTIFACT = {
  id: 4242,
  artifactId: 'artifact_abc',
  organizationId: 99,
  projectId: 3,
  type: 'document',
  category: 'document',
  title: 'T',
  content: 'content',
  contentHash: 'h0',
  version: 2,
  ctdSection: '3.2.S.1',
  status: 'approved',
  approvedVersionId: 2,
  publishedVersionId: null,
  metadata: {},
  conversationId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const statusWrite = (status: string) => st.sets.find((v) => v && v.status === status);


beforeEach(() => {
  st.queue = [];
  st.sets = [];
  st.inserts = [];
  vi.clearAllMocks();
  (pool.query as any).mockImplementation(async () => ({ rows: [] }));
});

describe('PUT …/status carries its audit-row outcome', () => {
  const DRAFT = { ...ARTIFACT, status: 'draft', approvedVersionId: null };

  it('a status change whose row was lost still changes the status, and says the row is missing', async () => {
    entry.outcome = { written: false, attributed: true };
    st.queue = [[DRAFT], [{ ...DRAFT, status: 'review' }]];
    const res = await request(makeApp())
      .put('/api/c2c/projects/3/artifacts/artifact_abc/status')
      .send({ status: 'review', reason: 'ready for review' });
    expect(res.status).toBe(200);
    expect(statusWrite('review')).toBeDefined();
    expect(JSON.stringify(res.body)).toContain('AUDIT_ROW_NOT_PERSISTED');
    const auditTrail = res.body.data?.auditTrail ?? res.body.auditTrail;
    expect(auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
  });

  it('a written row says so, and says it is not the chained audit_logs row', async () => {
    entry.outcome = { written: true, attributed: true };
    st.queue = [[DRAFT], [{ ...DRAFT, status: 'review' }]];
    const res = await request(makeApp())
      .put('/api/c2c/projects/3/artifacts/artifact_abc/status')
      .send({ status: 'review', reason: 'ready for review' });
    expect(res.status).toBe(200);
    const auditTrail = res.body.data?.auditTrail ?? res.body.auditTrail;
    // logAuditEntry writes regulatory_audit_logs, not the chained audit_logs.
    expect(auditTrail).toEqual({ persisted: true, chained: false });
  });
});
