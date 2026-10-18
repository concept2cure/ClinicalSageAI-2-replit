/**
 * PUT …/artifacts/:artifactId/placement says whether the governed decision it
 * names was written.
 *
 * What the code used to do (until 2026-10-15): the response's governedFabric
 * carried `decisionId` from the evaluator's hot path (recordGovernedDecisionSync),
 * which hands the reference out before its queued ledger insert runs — an
 * insert that can fail or be refused. Nothing told the caller, so a placement
 * showed a decision id that might name no row. governedDecisionPersisted
 * (governed-decision-ledger) answers it; the response now carries it.
 *
 * The harness is tests/artifact-routes-invalidate-bundles.test.ts's, with the
 * real ledger: the decision's write is registered exactly as the hot path
 * registers it (trackGovernedDecisionWrite).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import type { GovernedDecisionReference } from '../../../../shared/types/governed-document-fabric';

const { st } = vi.hoisted(() => ({
  st: {
    queue: [] as unknown[][],
    reference: {
      decisionId: 'dec-placement-1',
      projectId: '3',
      artifactId: 'artifact_abc',
      intent: 'relocate',
      outcome: 'allow',
      actorId: '777',
      timestamp: '2026-10-15T00:00:00.000Z',
    } as GovernedDecisionReference,
  },
}));

function chain(): any {
  const c: any = {};
  for (const m of ['select', 'selectDistinct', 'from', 'innerJoin', 'leftJoin', 'where', 'insert', 'values', 'update', 'set', 'delete']) c[m] = () => c;
  for (const m of ['orderBy', 'limit', 'returning', 'onConflictDoNothing']) c[m] = () => Promise.resolve(st.queue.shift() ?? []);
  c.then = (ok: any, ko: any) => Promise.resolve(st.queue.shift() ?? []).then(ok, ko);
  return c;
}

vi.mock('../../../services/cmc/resolve-cmc-artifact-project', () => ({
  resolveCmcArtifactProject: vi.fn(async (_org: number, raw: string) =>
    /^\d+$/.test(raw)
      ? { state: 'linked', artifactProjectId: Number(raw), via: 'numeric' }
      : { state: 'unaddressable', artifactProjectId: null, detail: 'not a project' },
  ),
}));
vi.mock('../../../db', () => ({
  get db() {
    return {
      select: () => chain(), selectDistinct: () => chain(), insert: () => chain(),
      update: () => chain(), delete: () => chain(),
      transaction: async (fn: (tx: unknown) => unknown) => fn(chain()),
    };
  },
  pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() },
}));
vi.mock('../../../services/ectd/package-content-change', () => ({
  markPackagesContentChangedForArtifact: vi.fn(async () => ({ packagesAffected: 0, bundlesInvalidated: 0, failed: false, ledgerWriteFailed: false })),
}));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../../../middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../project-access', () => ({ verifyProjectAccess: vi.fn(async () => true), getActorRole: () => 'admin' }));
vi.mock('../../../services/clinical-regulatory-evidence/lineage-gate', () => ({ enforceAuthorLineage: vi.fn(async () => undefined) }));
vi.mock('../../../services/concept2cure/governedDocumentContractService', () => ({
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
vi.mock('../../../services/intelligence/rim-interceptors.js', () => ({ interceptArtifactChange: vi.fn(), interceptFeedback: vi.fn() }));
vi.mock('../../../src/control-plane/governed-document-evaluator', () => ({
  evaluateAndInterceptGovernedDocument: () => ({
    decisionReference: st.reference,
    evaluation: {
      readiness: { level: 'ready', score: 1 },
      placement: { outcome: 'allowed' },
      decision: { blockerCount: 0, warningCount: 0, consequenceCount: 0 },
    },
  }),
}));
vi.mock('../../../services/generation-guard.js', () => ({ createTraceId: () => 't1', emitTraceEvent: vi.fn() }));
vi.mock('../../../db/drizzle-queryable', () => ({ queryableFromDrizzle: () => ({ query: vi.fn() }) }));

import artifactRouter from '../artifacts';
import { trackGovernedDecisionWrite } from '../../../services/governed-decision-ledger';

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

const ARTIFACT = {
  id: 4242, artifactId: 'artifact_abc', organizationId: 99, projectId: 3, type: 'document',
  category: 'document', title: 'T', content: 'c', contentHash: 'h0', version: 2,
  ctdSection: '3.2.S.1', status: 'draft', metadata: {}, conversationId: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const place = () =>
  request(app)
    .put('/api/c2c/projects/3/artifacts/artifact_abc/placement')
    .send({ operation: 'relocate', toSection: '3.2.P.1', reason: 'belongs in drug product' });

beforeEach(() => {
  st.reference = { ...st.reference }; // a fresh reference: the ledger keys writes by object
  st.queue = [[ARTIFACT], [{ ...ARTIFACT, ctdSection: '3.2.P.1' }], [], []];
});

describe('PUT placement — the governed decision it names', () => {
  it('says the decision was not recorded when its ledger write failed', async () => {
    trackGovernedDecisionWrite(st.reference, Promise.resolve({ persisted: false }));
    const res = await place();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.governedFabric.decisionId).toBe('dec-placement-1');
    expect(res.body.data.governedFabric.decisionPersisted).toBe(false);
  });

  it('says it was recorded when the write landed', async () => {
    trackGovernedDecisionWrite(st.reference, Promise.resolve({ persisted: true }));
    const res = await place();
    expect(res.body.data.governedFabric.decisionPersisted).toBe(true);
  });
});
