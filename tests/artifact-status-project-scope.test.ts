/**
 * PUT /projects/:projectId/artifacts/:artifactId/status acts on the artifact of
 * the project the URL names, and a v2 project reaches it (PF-17, project first).
 *
 * Two defects, one route:
 *   • Access was decided on the URL's project, and the artifact was then loaded
 *     by id and organization alone. A member of project 3 could route, approve
 *     or lock project 5's artifact through project 3's URL.
 *   • Every v2 surface holds the project as its program UUID, and the access
 *     check parses an integer, so "Route to review" (ConversationThread's
 *     ArtifactCard) answered 404 for every v2 project. The URL is now resolved
 *     through the one translation rule (resolveCmcArtifactProject: an integer
 *     id of this organization, or the program's anchored project), access is
 *     decided on THAT project, and the artifact must be one of its own.
 *
 * The real router, driven over express; the query builder is a queue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { st, PROGRAM, UNANCHORED } = vi.hoisted(() => ({
  PROGRAM: '0b9f6c2e-5d4a-4c3b-9a21-7e6f5d4c3b2a',
  UNANCHORED: '5e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b',
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
/* Access is decided on the INTEGER project, as the real verifyProjectAccess
   decides it (it parses the id as an integer; anything else is no access).
   The caller may act in project 3 and in no other. */
vi.mock('../server/routes/c2c/project-access', () => ({
  verifyProjectAccess: vi.fn(async (_req: unknown, id: unknown) => String(id) === '3'),
  getActorRole: () => 'admin',
}));
/* The one translation rule (its own suite proves it): the integer id of a
   project of this organization, or a program UUID through its anchor. */
vi.mock('../server/services/cmc/resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: vi.fn(async (_org: number, raw: string) =>
    raw === '3' || raw === PROGRAM
      ? { state: 'linked', artifactProjectId: 3, via: raw === '3' ? 'numeric' : 'program-anchor' }
      : { state: raw === UNANCHORED ? 'unanchored' : 'unaddressable', artifactProjectId: null, detail: 'no' },
  ),
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
import { contradictionEngineService } from '../server/services/contradiction-engine-service';

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
  id: 4242, artifactId: 'artifact_abc', organizationId: 99, projectId: 3,
  type: 'document', category: 'document', title: 'T', content: 'content', contentHash: 'h0',
  version: 2, ctdSection: '3.2.S.1', status: 'draft', approvedVersionId: null, publishedVersionId: null,
  metadata: {}, conversationId: null, createdAt: new Date(), updatedAt: new Date(),
};
const put = (project: string, status: string, extra: Record<string, unknown> = {}) =>
  request(makeApp()).put(`/api/c2c/projects/${project}/artifacts/artifact_abc/status`).send({ status, ...extra });
const statusWrite = (status: string) => st.sets.find((v) => v && v.status === status);

beforeEach(() => {
  st.queue = [];
  st.sets = [];
  st.inserts = [];
  vi.clearAllMocks();
  (pool.query as any).mockImplementation(async () => ({ rows: [] }));
});

describe('PUT …/status: the artifact of the project the URL names', () => {
  it('a v2 project’s program UUID reaches review — "Route to review" works', async () => {
    st.queue = [[ARTIFACT]];
    const res = await put(PROGRAM, 'review');
    expect(res.status, JSON.stringify(res.body)).not.toBe(404);
    expect(statusWrite('review')).toBeDefined();
  });

  it('refuses another project’s artifact through this project’s URL, and writes nothing', async () => {
    st.queue = [[{ ...ARTIFACT, projectId: 5 }]];
    const res = await put('3', 'review');
    expect(res.status).toBe(404);
    expect(statusWrite('review')).toBeUndefined();
  });

  it('the same through the program UUID: the anchored project is the one that counts', async () => {
    st.queue = [[{ ...ARTIFACT, projectId: 5 }]];
    const res = await put(PROGRAM, 'review');
    expect(res.status).toBe(404);
    expect(statusWrite('review')).toBeUndefined();
  });

  it('a program with no anchored project, or an id of no project, is not found', async () => {
    for (const project of [UNANCHORED, 'not-a-project', '5']) {
      st.queue = [[ARTIFACT]];
      const res = await put(project, 'review');
      expect(res.status, project).toBe(404);
    }
    expect(statusWrite('review')).toBeUndefined();
  });

  it('the promotion gate reads the resolved project, not the URL text', async () => {
    st.queue = [[{ ...ARTIFACT, status: 'approved', approvedVersionId: 2 }]];
    await put(PROGRAM, 'locked', { attestation: { meaning: 'Released', attestationText: 'I release this' } });
    expect(contradictionEngineService.checkPromotionBlocked).toHaveBeenCalledWith(99, 3, 4242);
  });
});
