/**
 * POST /api/authoring-actions/approve-artifact and /lock-artifact are not
 * served (2026-10-01, D5; hand-on item 6 of 2026-09-28).
 *
 * They recorded an artifact approved or locked with no signature at all: no
 * re-authentication, no meaning, no signature row. No client called them
 * (docs/reports/orphan-endpoints-latest.json), and they were the one API path
 * around the electronic signature approve and lock now are. The same outcomes,
 * signed, are the status route (artifact-approval-ceremony.pglite) and AnA's
 * update_artifact_status through GovernedActionSignoff
 * (governedActionArtifactSignature, ana-signed-artifact-act.pglite).
 *
 * The harness is the removed routes' own suite's, so on trunk these requests
 * reach the handlers and lock or approve: that is the red.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { st } = vi.hoisted(() => ({
  st: {
    row: null as any,
    sets: [] as any[],
    /** Answers the raw quorum reads (db.execute); default: no reviewers assigned. */
    execute: (async () => ({ rows: [] })) as (text: string) => Promise<{ rows: unknown[] }>,
  },
}));

function chain(result: () => unknown): any {
  const p: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve(result());
        if (prop === 'set') return (v: unknown) => { st.sets.push(v); return p; };
        return () => p;
      },
    },
  );
  return p;
}
/** The statement text of a drizzle SQL object (string chunks only, params skipped). */
function sqlText(q: any): string {
  return (q?.queryChunks ?? [])
    .map((c: any) => (c?.queryChunks ? sqlText(c) : Array.isArray(c?.value) ? c.value.join('') : ''))
    .join('');
}
const dbStub = () => ({
  select: () => chain(() => (st.row ? [st.row] : [])),
  update: () => chain(() => []),
  insert: () => chain(() => []),
  execute: async (q: unknown) => st.execute(sqlText(q)),
  query: new Proxy({}, { get: () => ({ findFirst: async () => st.row ?? undefined, findMany: async () => [] }) }),
});
vi.mock('../../db.js', () => ({ get db() { return dbStub(); } }));
vi.mock('../../db', () => ({ get db() { return dbStub(); } }));

vi.mock('../../services/governance-boundary-service.js', () => ({
  GovernanceBoundaryService: {
    getInstance: () => ({
      evaluateTransition: async () => ({ allowed: true, blockedReasons: [] as string[], transition: { id: 'gbt' } }),
    }),
  },
}));
vi.mock('../../services/decision-lifecycle-service.js', () => ({
  decisionLifecycleService: {
    checkAuthority: () => ({ allowed: true, authority: { level: 'x' }, reason: '' }),
    recordGovernedActionDecision: () => null,
    transitionDecision: () => undefined,
    createReceipt: () => null,
  },
}));
vi.mock('../../services/concept2cure/governedDocumentContractService.js', () => ({
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

import router from '../authoring-actions';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).tenantId = 7;
    (req as any).userId = 42;
    (req as any).userRole = 'submission_lead';
    next();
  });
  app.use('/api/authoring-actions', router);
  return app;
}

const ROW = {
  id: 99, artifactId: 'artifact_x', projectId: 1, organizationId: 7, type: 'document',
  title: 'Clinical Overview', content: 'body', ctdSection: '2.5', metadata: {},
  version: 1, approvedVersionId: 1, publishedVersionId: null,
};

beforeEach(() => {
  st.row = null;
  st.sets = [];
  st.execute = async () => ({ rows: [] });
});

describe('the unsigned approve and lock routes are gone', () => {
  it.each([
    ['approve-artifact', 'review', 'approved'],
    ['lock-artifact', 'approved', 'locked'],
  ])('POST /%s on a %s artifact: not served, and nothing is written', async (path, from, to) => {
    st.row = { ...ROW, status: from };
    const res = await request(makeApp()).post(`/api/authoring-actions/${path}`).send({ projectId: 1, artifactId: 99 });

    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(st.sets.find(v => v && v.status === to), `the artifact was set ${to} with no signature`).toBeUndefined();
  });
});
