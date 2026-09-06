/**
 * The four mutating artifact routes, driven through express with the REAL
 * server/routes/c2c/artifacts.ts mounted.
 *
 * The sibling contract test pins that each route MENTIONS the canonical
 * invalidation; that is not enough, and three regressions proved it — passing
 * the text `artifact_xxx` id instead of the numeric row id (a silent no-op,
 * since c2c_artifact_section_map.artifact_id is an integer), moving the call
 * ABOVE the row write (clearing bundles for an edit that then rolls back), and
 * discarding the outcome so a failed invalidation reads as a clean edit. This
 * suite is what discriminates: it observes the arguments the route actually
 * passes, the order of the row write and the invalidation, and the parsed
 * response body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { st } = vi.hoisted(() => ({
  st: {
    /** Ordered trace of everything the route did that we care about. */
    trace: [] as string[],
    /** Queue of results for each awaited drizzle chain, in order. */
    queue: [] as any[][],
    /** Artifact row served for the lookup. */
    artifact: null as any,
    /** Recorded invalidation calls. */
    inval: [] as Array<{ artifactDbId: unknown; orgId: unknown; opts: any }>,
    /** Make enforceAuthorLineage throw (rolls the transaction back). */
    lineageThrows: false,
    /** Make the invalidation throw (it claims it never does). */
    invalThrows: false,
    /** Make the tx.update return no row. */
    updateReturnsNothing: false,
    /** Governed-contract validation result. */
    governedValid: true,
  },
}));

function chain(label: string): any {
  const c: any = {
    select: () => c,
    selectDistinct: () => c,
    from: () => c,
    innerJoin: () => c,
    leftJoin: () => c,
    where: () => c,
    orderBy: () => pull(label),
    limit: () => pull(label),
    returning: () => pull(label),
    insert: () => c,
    values: (v: any) => { st.trace.push(`${label}:insert`); return c; },
    update: () => c,
    set: (v: any) => { st.trace.push(`${label}:update-set`); return c; },
    delete: () => c,
    onConflictDoNothing: () => pull(label),
    then: (res: any, rej: any) => pull(label).then(res, rej),
  };
  return c;
}
function pull(label: string) {
  const next = st.queue.shift();
  return Promise.resolve(next ?? []);
}

function makeTx() {
  const tx: any = chain('tx');
  return tx;
}

function getDbMock(): any { return {
  select: (...a: any[]) => chain('db').select(...a),
  selectDistinct: (...a: any[]) => chain('db').selectDistinct(...a),
  insert: (...a: any[]) => chain('db').insert(...a),
  update: (...a: any[]) => chain('db').update(...a),
  delete: (...a: any[]) => chain('db').delete(...a),
  transaction: async (fn: any) => {
    st.trace.push('tx:begin');
    try {
      const out = await fn(makeTx());
      st.trace.push('tx:commit');
      return out;
    } catch (e) {
      st.trace.push('tx:rollback');
      throw e;
    }
  },
}; }

vi.mock('../server/db', () => ({
  get db() { return getDbMock(); },
  pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() },
}));

vi.mock('../server/services/ectd/package-content-change', () => ({
  markPackagesContentChangedForArtifact: vi.fn(async (artifactDbId: any, orgId: any, opts: any) => {
    st.trace.push(`INVALIDATE(${JSON.stringify(artifactDbId)},${JSON.stringify(orgId)},${opts?.cause})`);
    st.inval.push({ artifactDbId, orgId, opts });
    if (st.invalThrows) throw new Error('invalidation blew up');
    return { packagesAffected: 2, bundlesInvalidated: 1, failed: false, ledgerWriteFailed: false };
  }),
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
vi.mock('../server/services/clinical-regulatory-evidence/lineage-gate', () => ({
  enforceAuthorLineage: vi.fn(async () => {
    st.trace.push('lineage');
    if (st.lineageThrows) throw new Error('LINEAGE_GAP: unattributed clause');
  }),
}));
vi.mock('../server/services/concept2cure/governedDocumentContractService', () => ({
  resolveGovernedContext: () => ({
    validation: st.governedValid
      ? { valid: true, errors: [], warnings: [] }
      : { valid: false, errors: ['nope'], warnings: [] },
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
  interceptArtifactChange: vi.fn(() => { st.trace.push('interceptArtifactChange'); }),
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

import artifactRouter from '../server/routes/c2c/artifacts';

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
  content: 'old content',
  contentHash: 'h0',
  version: 2,
  ctdSection: '3.2.S.1',
  status: 'draft',
  metadata: {},
  conversationId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  st.trace = [];
  st.queue = [];
  st.inval = [];
  st.lineageThrows = false;
  st.invalThrows = false;
  st.governedValid = true;
  vi.clearAllMocks();
});

describe('the four mutating artifact routes reach the invalidation with the right arguments', () => {
  it('PUT artifact: reached with the NUMERIC row id, after the tx commits, and reported in the response', async () => {
    st.queue = [
      [ARTIFACT],                                  // artifact lookup .limit(1)
      [],                                          // tx insert version (awaited)
      [{ ...ARTIFACT, version: 3, content: 'new content' }], // tx update .returning()
      [],                                          // versions list .orderBy()
      [],                                          // logAuditEntry insert
      [],                                          // provenance insert
    ];
    const res = await request(makeApp())
      .put('/api/c2c/projects/3/artifacts/artifact_abc')
      .send({ content: 'new content' });
    expect(res.status).toBe(200);
    expect(st.inval).toHaveLength(1);
    expect(st.inval[0].artifactDbId).toBe(4242);
    expect(st.inval[0].orgId).toBe(99);
    expect(st.inval[0].opts).toMatchObject({ cause: 'content', userId: 777 });
    expect(res.body.data.bundleInvalidation).toBeDefined();
    // ordering: the transaction must have committed BEFORE the invalidation
    const iTx = st.trace.indexOf('tx:commit');
    const iInv = st.trace.findIndex((t) => t.startsWith('INVALIDATE('));
    expect(iTx).toBeGreaterThan(-1);
    expect(iInv).toBeGreaterThan(iTx);
  });

  it('PUT placement: reached with the numeric id, and the outcome reaches the RESPONSE (the audit log is best-effort and swallows its own failures)', async () => {
    st.queue = [
      [ARTIFACT],                                     // artifact lookup
      [{ ...ARTIFACT, ctdSection: '3.2.P.1' }],       // update .returning()
      [],                                             // audit insert
      [],                                             // provenance insert
    ];
    const res = await request(makeApp())
      .put('/api/c2c/projects/3/artifacts/artifact_abc/placement')
      .send({ operation: 'relocate', toSection: '3.2.P.1', reason: 'belongs in drug product' });
    expect(res.status).toBe(200);
    expect(st.inval[0]?.artifactDbId).toBe(4242);
    expect(st.inval[0]?.opts?.cause).toBe('placement');
    expect(res.body.data.bundleInvalidation).toBeDefined();
  });

  it('PUT ctd-section: reached with the numeric id and reported', async () => {
    st.queue = [
      [ARTIFACT],
      [{ ...ARTIFACT, ctdSection: '3.2.P.2' }],
      [],
    ];
    const res = await request(makeApp())
      .put('/api/c2c/projects/3/artifacts/artifact_abc/ctd-section')
      .send({ ctdSection: '3.2.P.2' });
    expect(res.status).toBe(200);
    expect(st.inval[0]?.artifactDbId).toBe(4242);
    expect(st.inval[0]?.opts?.cause).toBe('placement');
    expect(res.body.data.bundleInvalidation).toBeDefined();
  });

  it('POST rollback: reached with the numeric id, after the tx, and reported', async () => {
    st.queue = [
      [ARTIFACT],                                   // artifact lookup
      [{ version: 1, content: 'v1 text', artifactId: 4242 }], // target version lookup
      [],                                           // tx insert version
      [{ ...ARTIFACT, version: 3, content: 'v1 text' }],      // tx update returning
      [],                                           // provenance insert
      [],                                           // audit insert
    ];
    const res = await request(makeApp())
      .post('/api/c2c/projects/3/artifacts/artifact_abc/rollback')
      .send({ targetVersion: 1 });
    expect(res.status).toBe(200);
    expect(st.inval[0]?.artifactDbId).toBe(4242);
    expect(st.inval[0]?.opts?.cause).toBe('rollback');
    expect(res.body.data.bundleInvalidation).toBeDefined();
    const iTx = st.trace.indexOf('tx:commit');
    const iInv = st.trace.findIndex((t) => t.startsWith('INVALIDATE('));
    expect(iInv).toBeGreaterThan(iTx);
  });
});

describe('an edit that never committed must not invalidate', () => {
  it('PUT artifact: enforceAuthorLineage throws inside the tx -> rollback, and the invalidation must NOT run', async () => {
    st.lineageThrows = true;
    st.queue = [
      [ARTIFACT],
      [],
      [{ ...ARTIFACT, version: 3 }],
    ];
    const res = await request(makeApp())
      .put('/api/c2c/projects/3/artifacts/artifact_abc')
      .send({ content: 'new content' });
    expect(st.trace).toContain('tx:rollback');
    expect(st.inval).toHaveLength(0);
  });

  it('POST rollback: lineage throws -> rollback, no invalidation', async () => {
    st.lineageThrows = true;
    st.queue = [
      [ARTIFACT],
      [{ version: 1, content: 'v1 text' }],
      [],
      [{ ...ARTIFACT, version: 3 }],
    ];
    const res = await request(makeApp())
      .post('/api/c2c/projects/3/artifacts/artifact_abc/rollback')
      .send({ targetVersion: 1 });
    expect(st.trace).toContain('tx:rollback');
    expect(st.inval).toHaveLength(0);
  });
});