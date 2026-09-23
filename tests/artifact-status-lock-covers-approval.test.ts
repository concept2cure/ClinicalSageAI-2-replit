/**
 * The status route (PUT /projects/:projectId/artifacts/:artifactId/status) and
 * the audit-report export, driven through express with the REAL
 * server/routes/c2c/artifacts.ts mounted, judged by the real filing rule
 * (artifactApproval, server/services/ectd/package-content-fingerprint.ts).
 *
 * 2026-09-23 (W5/D7, residual repair):
 * - approved → locked checked only status === 'approved' and stamped
 *   published_version_id = the CURRENT version, so approved v2 → PUT edit to
 *   v3 (status stays 'approved') → lock wrote "locked at v3" over content no
 *   one reviewed. The filing rule already refuses that artifact; the route now
 *   refuses the lock itself and asks for re-approval, so an unreviewed edit is
 *   never recorded as locked.
 * - The audit-report export inserts its report as 'locked' and recorded no
 *   published version. It now records the version it locked (v1), and records
 *   NO approved version, because nobody approved it — the filing rule refuses
 *   it as 'no-approved-version' rather than filing an unreviewed report.
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

import artifactRouter from '../server/routes/c2c/artifacts';
import { pool } from '../server/db';
import { artifactApproval } from '../server/services/ectd/package-content-fingerprint';

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

const ATTEST = { meaning: 'Released', attestationText: 'I release this' };
const putStatus = (status: string, extra: Record<string, unknown> = {}) =>
  request(makeApp())
    .put('/api/c2c/projects/3/artifacts/artifact_abc/status')
    .send({ status, reason: 'status change', attestation: ATTEST, ...extra });
const statusWrite = (status: string) => st.sets.find((v) => v && v.status === status);

beforeEach(() => {
  st.queue = [];
  st.sets = [];
  st.inserts = [];
  vi.clearAllMocks();
  (pool.query as any).mockImplementation(async () => ({ rows: [] }));
});

describe('PUT …/status: a lock must cover the approval', () => {
  it('approved v2 (approved at v2) → locked records published_version_id = 2, and the result is filable', async () => {
    st.queue = [[ARTIFACT]];
    await putStatus('locked');
    const write = statusWrite('locked');
    expect(write).toBeDefined();
    expect(write.publishedVersionId).toBe(2);
    expect(artifactApproval({ ...ARTIFACT, ...write })).toEqual({ filable: true });
  });

  it('approved at v2, edited to v3, then locked: REFUSED with 409, nothing written, and the message asks for re-approval', async () => {
    st.queue = [[{ ...ARTIFACT, version: 3, approvedVersionId: 2 }]];
    const res = await putStatus('locked');
    expect(res.status).toBe(409);
    expect(statusWrite('locked')).toBeUndefined();
    const msg = JSON.stringify(res.body);
    expect(msg).toMatch(/edited after approval/i);
    expect(msg).toMatch(/approve it again/i);
  });

  it('approved with no approved version recorded, then locked: REFUSED (fail closed)', async () => {
    st.queue = [[{ ...ARTIFACT, approvedVersionId: null }]];
    const res = await putStatus('locked');
    expect(res.status).toBe(409);
    expect(statusWrite('locked')).toBeUndefined();
  });

  it('review v3 → approved records approved_version_id = 3; an edit to v4 afterwards is not filable', async () => {
    st.queue = [[{ ...ARTIFACT, status: 'review', version: 3, approvedVersionId: 2 }]];
    await putStatus('approved', { attestation: { meaning: 'Approved', attestationText: 'I approve' } });
    const write = statusWrite('approved');
    expect(write?.approvedVersionId).toBe(3);
    const approvedRow = { ...ARTIFACT, version: 3, ...write };
    expect(artifactApproval(approvedRow)).toEqual({ filable: true });
    expect(artifactApproval({ ...approvedRow, version: 4 })).toMatchObject({
      filable: false,
      reason: 'edited-after-approval',
    });
  });
});

/**
 * 2026-09-23 (W5/D7, residual repair, round 3; amended final pass): the P12
 * review quorum is one implementation (reviewQuorumVerdict,
 * server/services/artifact-approval-act.ts), applied by the two governed
 * approval acts — this route and authoring-actions approve-artifact. (Round 3
 * also applied it in promote_artifact and update_artifact_status; the final
 * pass reverted those to record no approval, so they no longer consult it.)
 */
describe('PUT …/status review → approved applies the canonical P12 review quorum', () => {
  const quorumRows = (assignments: unknown[], decisions: unknown[] = []) =>
    (pool.query as any).mockImplementation(async (text: string) => ({
      rows: /concept2cure_review_assignments/.test(text)
        ? assignments
        : /concept2cure_review_decisions/.test(text)
          ? decisions
          : [],
    }));

  it('a reviewer still pending refuses the approval (400) and records no approved version', async () => {
    quorumRows([
      { review_round: 1, status: 'completed' },
      { review_round: 1, status: 'pending' },
    ]);
    st.queue = [[{ ...ARTIFACT, status: 'review', version: 3, approvedVersionId: 2 }]];
    const res = await putStatus('approved', { attestation: { meaning: 'Approved', attestationText: 'I approve' } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/1 of 2 reviewers have not yet submitted/);
    expect(statusWrite('approved')).toBeUndefined();
  });

  it('a reviewer who did not approve refuses the approval (400)', async () => {
    quorumRows([{ review_round: 1, status: 'completed' }], [{ decision: 'reject' }]);
    st.queue = [[{ ...ARTIFACT, status: 'review', version: 3, approvedVersionId: 2 }]];
    const res = await putStatus('approved', { attestation: { meaning: 'Approved', attestationText: 'I approve' } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/did not approve/);
    expect(statusWrite('approved')).toBeUndefined();
  });

  it('a quorum that cannot be read is not met: the approval is refused and records no approved version', async () => {
    (pool.query as any).mockImplementation(async (text: string) => {
      if (/concept2cure_review_(assignments|decisions)/.test(text)) throw new Error('relation unavailable');
      return { rows: [] };
    });
    st.queue = [[{ ...ARTIFACT, status: 'review', version: 3, approvedVersionId: null }]];
    const res = await putStatus('approved', { attestation: { meaning: 'Approved', attestationText: 'I approve' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(statusWrite('approved')).toBeUndefined();
    expect(st.sets).toEqual([]);
  });

  it('a decisions read that fails after the assignments read is not met either', async () => {
    (pool.query as any).mockImplementation(async (text: string) => {
      if (/concept2cure_review_assignments/.test(text)) return { rows: [{ review_round: 1, status: 'completed' }] };
      if (/concept2cure_review_decisions/.test(text)) throw new Error('relation unavailable');
      return { rows: [] };
    });
    st.queue = [[{ ...ARTIFACT, status: 'review', version: 3, approvedVersionId: null }]];
    const res = await putStatus('approved', { attestation: { meaning: 'Approved', attestationText: 'I approve' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(st.sets).toEqual([]);
  });
});

describe('PUT …/status: the role table decides who performs the approval act', () => {
  it.each(['manager', 'super_admin', 'author'])('a %s is refused review → approved (403) and nothing is written', async role => {
    st.queue = [[{ ...ARTIFACT, status: 'review', version: 3, approvedVersionId: null }]];
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.userId = 777;
      req.userEmail = 'a@b.c';
      req.userRole = role;
      req.tenantContext = { organizationId: 99 };
      req.tenantId = 99;
      next();
    });
    app.use('/api/c2c', artifactRouter);
    const res = await request(app)
      .put('/api/c2c/projects/3/artifacts/artifact_abc/status')
      .send({ status: 'approved', reason: 'status change', attestation: { meaning: 'Approved', attestationText: 'I approve' } });
    expect(res.status).toBe(403);
    expect(st.sets).toEqual([]);
  });
});

describe('POST …/audit-report/export: the locked report records its lock, and no approval nobody gave', () => {
  it('inserts status locked with published_version_id = version = 1, approved_version_id unset, so it is not filable', async () => {
    const source = { ...ARTIFACT };
    st.queue = [
      [source], // artifact lookup .limit(1)
      [],       // versions .orderBy
      [],       // signatures .orderBy
      [],       // provenance .orderBy
      [],       // project .limit(1)
      [{ id: 5555, title: 'Audit Report', status: 'locked' }], // insert .returning()
    ];
    await request(makeApp()).post('/api/c2c/projects/3/artifacts/artifact_abc/audit-report/export').send({});
    const inserted = st.inserts.find((v) => v && v.type === 'audit_report');
    expect(inserted).toBeDefined();
    expect(inserted.status).toBe('locked');
    expect(inserted.version).toBe(1);
    expect(inserted.publishedVersionId).toBe(1);
    expect(inserted.publishedAt).toBeInstanceOf(Date);
    expect(inserted.approvedVersionId ?? null).toBeNull();
    expect(artifactApproval(inserted)).toMatchObject({ filable: false, reason: 'no-approved-version' });
  });
});
