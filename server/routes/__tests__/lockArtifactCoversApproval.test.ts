/**
 * POST /api/authoring-actions/lock-artifact (approved → locked) must lock only
 * the version that was approved.
 *
 * 2026-09-23 (W5/D7, residual repair): the handler checked status === 'approved'
 * and stamped published_version_id = the CURRENT version, so approved v1 →
 * edit to v2 (status stays 'approved') → lock wrote "locked at v2" over content
 * no one reviewed. It now refuses unless the current version is the approved
 * one — the same verdict the filing rule (artifactApproval,
 * server/services/ectd/package-content-fingerprint.ts) gives — and asks for
 * re-approval. approve-artifact records approved_version_id = the version it
 * approved (unchanged; pinned here with the filing rule).
 *
 * 2026-09-23 (W5/D7, final pass): approve-artifact is a governed approval act —
 * it records the version that makes an artifact filable — but it did not apply
 * the P12 review quorum the status route applies (review → approved with a
 * reviewer pending, or one who did not approve, was recorded as approved and
 * filable). It now applies the same implementation (reviewQuorumVerdict,
 * server/services/artifact-approval-act.ts), and a quorum it cannot read is not
 * met.
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
import { artifactApproval } from '../../services/ectd/package-content-fingerprint';

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
  status: 'approved', version: 1, approvedVersionId: 1, publishedVersionId: null,
};
const lock = () => request(makeApp()).post('/api/authoring-actions/lock-artifact').send({ projectId: 1, artifactId: 99 });
const lockWrite = () => st.sets.find((v) => v && v.status === 'locked');

beforeEach(() => {
  st.row = null;
  st.sets = [];
  st.execute = async () => ({ rows: [] });
});

describe('POST /lock-artifact: the lock must cover the approval', () => {
  it('approved at v1, current v1: locks, records published_version_id = 1, and the result is filable', async () => {
    st.row = { ...ROW };
    const res = await lock();
    expect(res.body.locked).toBe(true);
    const write = lockWrite();
    expect(write?.publishedVersionId).toBe(1);
    expect(artifactApproval({ ...ROW, ...write })).toEqual({ filable: true });
  });

  it('approved at v1, edited to v2: REFUSED with 409, nothing written, and the message asks for re-approval', async () => {
    st.row = { ...ROW, version: 2, approvedVersionId: 1 };
    const res = await lock();
    expect(res.status).toBe(409);
    expect(res.body.locked).toBe(false);
    expect(res.body.reason).toBe('edited-after-approval');
    expect(res.body.message).toMatch(/approve it again/i);
    expect(lockWrite()).toBeUndefined();
  });

  it('approved with no approved version recorded: REFUSED (fail closed)', async () => {
    st.row = { ...ROW, approvedVersionId: null };
    const res = await lock();
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('no-approved-version');
    expect(lockWrite()).toBeUndefined();
  });
});

describe('POST /approve-artifact records the version it approved', () => {
  it('review v3 → approved records approved_version_id = 3; an edit to v4 is not filable', async () => {
    st.row = { ...ROW, status: 'review', version: 3, approvedVersionId: null };
    await request(makeApp()).post('/api/authoring-actions/approve-artifact').send({ projectId: 1, artifactId: 99 });
    const write = st.sets.find((v) => v && v.status === 'approved');
    expect(write?.approvedVersionId).toBe(3);
    const approved = { ...ROW, version: 3, ...write };
    expect(artifactApproval(approved)).toEqual({ filable: true });
    expect(artifactApproval({ ...approved, version: 4 })).toMatchObject({ filable: false, reason: 'edited-after-approval' });
  });
});

describe('POST /approve-artifact applies the P12 review quorum', () => {
  const approve = () =>
    request(makeApp()).post('/api/authoring-actions/approve-artifact').send({ projectId: 1, artifactId: 99 });
  const approveWrite = () => st.sets.find((v) => v && v.status === 'approved');
  const REVIEW = { ...ROW, status: 'review', version: 3, approvedVersionId: null };

  it('a reviewer still pending refuses the approval and records nothing', async () => {
    st.row = { ...REVIEW };
    st.execute = async (text) => ({
      rows: /concept2cure_review_assignments/.test(text)
        ? [{ review_round: 1, status: 'completed' }, { review_round: 1, status: 'pending' }]
        : [],
    });
    const res = await approve();
    expect(res.body.approved).toBe(false);
    expect(res.body.message).toMatch(/1 of 2 reviewers have not yet submitted/);
    expect(approveWrite()).toBeUndefined();
  });

  it('a reviewer who did not approve refuses the approval and records nothing', async () => {
    st.row = { ...REVIEW };
    st.execute = async (text) => ({
      rows: /concept2cure_review_assignments/.test(text)
        ? [{ review_round: 1, status: 'completed' }]
        : /concept2cure_review_decisions/.test(text)
          ? [{ decision: 'reject' }]
          : [],
    });
    const res = await approve();
    expect(res.body.approved).toBe(false);
    expect(res.body.message).toMatch(/did not approve/);
    expect(approveWrite()).toBeUndefined();
  });

  it('a quorum that cannot be read is not met: refused, nothing recorded', async () => {
    st.row = { ...REVIEW };
    st.execute = async () => {
      throw new Error('relation unavailable');
    };
    const res = await approve();
    expect(res.body.approved).toBe(false);
    expect(approveWrite()).toBeUndefined();
    expect(st.sets).toEqual([]);
  });

  it('every assigned reviewer approving records the version (filable)', async () => {
    st.row = { ...REVIEW };
    st.execute = async (text) => ({
      rows: /concept2cure_review_assignments/.test(text)
        ? [{ review_round: 1, status: 'completed' }]
        : /concept2cure_review_decisions/.test(text)
          ? [{ decision: 'approve' }]
          : [],
    });
    const res = await approve();
    expect(res.body.approved).toBe(true);
    expect(approveWrite()?.approvedVersionId).toBe(3);
  });
});
