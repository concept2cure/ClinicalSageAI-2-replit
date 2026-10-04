/**
 * Every artifact route acts only on its own project's artifact, and a v2
 * project reaches them all (PF-17, project first).
 *
 * The routes checked access on the URL's project and then loaded the artifact
 * by id and organization alone, so access to project 3 read or changed project
 * 5's artifact: the full content of its versions, its signatures and
 * provenance, a rollback, a review submission, a comment resolved, a reviewer
 * withdrawn or reminded. The access check parsed only an integer, so a program
 * UUID — the id every v2 surface holds — was refused by every one of them.
 * They now share one scope (server/routes/c2c/artifact-project-scope.ts).
 *
 * Table-driven over the real router: for each route, (a) every read returns
 * project 5's artifact while the URL names project 3 — the answer is 404 and
 * nothing is written; (b) the program UUID is resolved to project 3 — the
 * answer is whatever the route says, but never "Project not found".
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
  resolveCmcArtifactProject: vi.fn(async (_org: number, raw: string) => {
    // '13': a lookup that could not complete (the route asks strictly).
    if (raw === '13') throw new Error('connection reset');
    return raw === '3' || raw === PROGRAM
      ? { state: 'linked', artifactProjectId: 3, via: raw === '3' ? 'numeric' : 'program-anchor' }
      : { state: raw === UNANCHORED ? 'unanchored' : 'unaddressable', artifactProjectId: null, detail: 'no' };
  }),
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

const row = (projectId: number) => ({
  id: 4242, artifactId: 'artifact_abc', organizationId: 99, projectId,
  type: 'document', category: 'document', title: 'T', content: 'content', contentHash: 'h0',
  version: 2, ctdSection: '3.2.S.1', status: 'draft', approvedVersionId: null, publishedVersionId: null,
  metadata: {}, conversationId: null, createdAt: new Date(), updatedAt: new Date(),
  // Shapes other lookups in these routes read (a comment, an assignment).
  commentId: 'c1', assignmentId: 'as1', artifactIdRef: 4242, reviewerId: 778,
});

type Case = [method: 'get' | 'post' | 'put' | 'delete', suffix: string, body?: Record<string, unknown>];
const ROUTES: Case[] = [
  ['put', '', { content: 'edited', title: 'T' }],
  ['put', '/placement', { operation: 'place', toSection: '3.2.S.2', reason: 'Moved to the right section' }],
  ['get', '/signatures'],
  ['get', '/snapshots'],
  ['get', '/provenance'],
  ['get', '/versions'],
  ['get', '/audit-report'],
  ['post', '/audit-report/export', {}],
  ['put', '/ctd-section', { ctdSection: '3.2.S.2', reason: 'Moved to the right section' }],
  ['get', '/verify-integrity'],
  ['post', '/rollback', { targetVersion: 1, reason: 'Back to the reviewed text' }],
  ['post', '/comments', { comment: 'A comment on this section' }],
  ['get', '/comments'],
  ['put', '/comments/c1/resolve', {}],
  ['post', '/reviewers', { reviewerIds: [778] }],
  ['get', '/reviewers'],
  ['delete', '/reviewers/as1', { reason: 'Withdrawn for testing' }],
  ['post', '/reviewers/as1/remind', {}],
  ['post', '/reviews/submit', { decision: 'approve', comment: 'ok' }],
  ['get', '/reviews/status'],
  ['put', '/status', { status: 'review' }],
];

const send = (method: Case[0], project: string, suffix: string, body?: Record<string, unknown>) => {
  const r = request(makeApp())[method](`/api/c2c/projects/${project}/artifacts/artifact_abc${suffix}`);
  return body ? r.send(body) : r;
};

beforeEach(() => {
  st.queue = [];
  st.sets = [];
  st.inserts = [];
  vi.clearAllMocks();
  (pool.query as any).mockImplementation(async () => ({ rows: [] }));
});

describe('every artifact route acts only on its own project\'s artifact', () => {
  it.each(ROUTES)('%s …%s: another project\'s artifact through this project\'s URL is not found, and nothing is written', async (method, suffix, body) => {
    st.queue = Array.from({ length: 12 }, () => [row(5)]);
    const res = await send(method, '3', suffix, body);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(st.sets, 'no update').toEqual([]);
    expect(st.inserts, 'no insert').toEqual([]);
  });

  it.each(ROUTES)('%s …%s: a v2 project (program UUID) reaches the route', async (method, suffix, body) => {
    st.queue = Array.from({ length: 12 }, () => [row(3)]);
    const res = await send(method, PROGRAM, suffix, body);
    expect(JSON.stringify(res.body)).not.toMatch(/Project not found/);
  });
});
