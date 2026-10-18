/**
 * A mission-control request body cannot re-home a record, re-attribute it, or
 * move it through a governed state its own route controls.
 *
 * Creates were built as { programId: <url>, organizationId: <session>,
 * ...req.body } and edits as { ...prev, ...req.body }, so a body named the
 * organisation, program, author, requester or decider of what it wrote; an
 * edit set an artifact "approved" or "locked" without /transition; a review
 * approved its artifact from any state; and a route plan, review or evidence
 * link for a parent that does not exist was filed under program 0. Only the
 * store is replaced, with an in-memory one keyed by organisation.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: number };
const h = vi.hoisted(() => ({
  rows: new Map<number, { org: number; sub: string; data: Record<string, unknown> }>(),
  writes: [] as Array<{ op: 'insert' | 'update'; org: number; sub?: string; data: Record<string, unknown> }>,
  next: 100,
}));
vi.mock('../../utils/feature-persistence', () => ({
  createFeatureStore: () => ({
    async query(org: number, sub?: string, filter?: (e: Row) => boolean) {
      const all = [...h.rows.entries()]
        .filter(([, r]) => r.org === org && (!sub || r.sub === sub))
        .map(([id, r]) => ({ ...r.data, id }) as Row);
      return filter ? all.filter(filter) : all;
    },
    async getById(id: number, org: number) {
      const r = h.rows.get(id);
      return r && r.org === org ? ({ ...r.data, id } as Row) : null;
    },
    async insert(org: number, sub: string, _title: string, data: Record<string, unknown>) {
      const id = h.next++;
      h.writes.push({ op: 'insert', org, sub, data });
      h.rows.set(id, { org, sub, data });
      return { ...data, id };
    },
    async update(id: number, org: number, data: Record<string, unknown>) {
      h.writes.push({ op: 'update', org, data });
      const r = h.rows.get(id)!;
      h.rows.set(id, { org, sub: r.sub, data });
      return { ...data, id };
    },
  }),
}));

import router from '../mission-control';

const ORG = 5, USER = 17;
function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: USER, organizationId: ORG };
    next();
  });
  a.use('/api/mission-control', router);
  return a;
}
const put = (path: string, body: object) => request(app()).put(`/api/mission-control${path}`).send(body);
const post = (path: string, body: object) => request(app()).post(`/api/mission-control${path}`).send(body);

/** Every identity, actor and governed field a body has tried to set. */
const HOSTILE = {
  id: 999, organizationId: 999, programId: 999, destinationId: 999, artifactId: 999,
  createdById: 666, ownerId: 666, authorId: 666, requestedById: 666, decisionOwnerId: 666,
  detectedById: 666, resolvedById: 666, approvedById: 666, lockedById: 666,
  decisionBy: 'mallory', decisionById: 666, createdAt: '2000-01-01T00:00:00Z',
  approvedAt: '2000-01-01T00:00:00Z', lockedAt: '2000-01-01T00:00:00Z',
};
const ACTOR_KEYS = ['createdById', 'ownerId', 'authorId', 'requestedById', 'decisionOwnerId', 'detectedById',
  'resolvedById', 'approvedById', 'lockedById', 'decisionById'];

function seed() {
  h.rows.clear();
  h.writes.length = 0;
  h.next = 100;
  const put1 = (id: number, sub: string, data: Record<string, unknown>) => h.rows.set(id, { org: ORG, sub, data });
  put1(1, 'program', { name: 'P', customerTrack: 'biotech', organizationId: ORG, createdById: USER, ownerId: USER });
  put1(2, 'artifact', { programId: 1, organizationId: ORG, title: 'A', lifecycleState: 'in-review', approvalState: 'none' });
  put1(3, 'review', { artifactId: 2, programId: 1, organizationId: ORG, status: 'open', requestedById: USER });
  put1(4, 'collaboration', { organizationId: ORG, authorId: USER, body: 'c', status: 'open', programId: 1 });
  put1(6, 'approval', { organizationId: ORG, programId: 1, requestedById: USER, status: 'pending', title: 'Ap' });
  put1(7, 'destination', { programId: 1, organizationId: ORG, destinationType: 'IND' });
  put1(8, 'artifact', { programId: 1, organizationId: ORG, title: 'Planned', lifecycleState: 'planned', approvalState: 'none' });
  put1(9, 'review', { artifactId: 8, programId: 1, organizationId: ORG, status: 'open', requestedById: USER });
  // Another organisation's program, which no body may file anything under.
  h.rows.set(999, { org: 42, sub: 'program', data: { name: 'Theirs', organizationId: 42 } });
}

beforeEach(seed);

describe('/api/mission-control writes', () => {
  it.each([
    ['post', '/programs/1/destinations', { destinationType: 'IND' }],
    ['post', '/destinations/7/routes', { name: 'R' }],
    ['post', '/programs/1/artifacts', { title: 'T' }],
    ['post', '/programs/1/evidence', { title: 'E' }],
    ['post', '/artifacts/2/evidence', { evidenceNodeId: 1 }],
    ['post', '/programs/1/dependencies', { sourceType: 'artifact', sourceId: 2 }],
    ['post', '/programs/1/decisions', { title: 'D' }],
    ['post', '/artifacts/2/reviews', {}],
    ['post', '/programs/1/risks', { title: 'R' }],
    // These two name their program in the body — there is none in the URL — so
    // it is a real one of the caller's here; a foreign one is the 404 case below.
    ['post', '/collaboration', { body: 'hello', programId: 1, artifactId: undefined }],
    ['post', '/approval-requests', { title: 'Ap', programId: 1, artifactId: undefined }],
    ['post', '/programs/1/authority-interactions', { title: 'AI' }],
    ['put', '/programs/1', { name: 'P2' }],
    ['put', '/artifacts/2', { title: 'A2' }],
    ['put', '/reviews/3', { dueDate: '2027-01-01' }],
    ['put', '/collaboration/4', { body: 'edited' }],
  ] as const)('%s %s takes tenant, program, actor and id from the session and the URL', async (method, path, body) => {
    const r = await (method === 'post' ? post : put)(path, { ...HOSTILE, ...body });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const written = h.writes.filter((w) => w.sub !== 'provenance');
    expect(written.length).toBeGreaterThan(0);
    for (const w of written) {
      expect(w.org).toBe(ORG);
      if ('organizationId' in w.data) expect(w.data.organizationId).toBe(ORG);
      if ('programId' in w.data && w.data.programId !== undefined) expect(w.data.programId).toBe(1);
      expect(w.data.id).toBeUndefined();
      for (const k of ACTOR_KEYS) if (w.data[k] !== undefined) expect(w.data[k], k).toBe(USER);
      expect(w.data.decisionBy).not.toBe('mallory');
      expect(w.data.createdAt).toBeUndefined();
      expect(w.data.approvedAt).toBeUndefined();
      expect(w.data.lockedAt).toBeUndefined();
    }
  });

  it('an edit cannot set an artifact approved or locked; /transition is the only way', async () => {
    await put('/artifacts/2', { lifecycleState: 'locked', approvalState: 'approved', exportReady: true });
    const art = h.rows.get(2)!.data;
    expect(art).toMatchObject({ lifecycleState: 'in-review', approvalState: 'none' });
    expect(art.exportReady).not.toBe(true);
  });

  it('an artifact is created planned or drafting, never already approved', async () => {
    const r = await post('/programs/1/artifacts', { title: 'T', lifecycleState: 'approved' });
    expect(r.status).toBe(400);
    expect(h.writes).toEqual([]);
    const ok = await post('/programs/1/artifacts', { title: 'T', lifecycleState: 'drafting', approvalState: 'approved' });
    expect(ok.status).toBe(201);
    expect(h.writes[0].data).toMatchObject({ lifecycleState: 'drafting', approvalState: 'none' });
  });

  it('a review approves its artifact only when the artifact is in review', async () => {
    const r = await put('/reviews/9', { status: 'approved' });
    expect(r.status).toBe(409);
    expect(h.rows.get(8)!.data.lifecycleState).toBe('planned');
    expect(h.rows.get(9)!.data.status).toBe('open');

    const ok = await put('/reviews/3', { status: 'approved' });
    expect(ok.status).toBe(200);
    expect(h.rows.get(2)!.data).toMatchObject({ lifecycleState: 'approved', approvalState: 'approved', approvedById: USER });
  });

  it('an approval is decided by the person deciding it, whatever the body says', async () => {
    const r = await post('/approval-requests/6/decide', { decision: 'approved', decisionBy: 'Dr. Mallory' });
    expect(r.status).toBe(200);
    const decided = h.rows.get(6)!.data;
    expect(decided.decisionById).toBe(USER);
    expect(JSON.stringify(h.writes)).not.toContain('Dr. Mallory');
  });

  it.each([
    ['/destinations/777/routes', { name: 'R' }],
    ['/artifacts/777/reviews', {}],
    ['/artifacts/777/evidence', { evidenceNodeId: 1 }],
    ['/approval-requests', { title: 'Ap', programId: 999 }],
    ['/collaboration', { body: 'x', programId: 999 }],
  ])('POST %s for a parent this organisation does not have is refused, not filed under program 0', async (path, body) => {
    const r = await post(path, body);
    expect(r.status).toBe(404);
    expect(h.writes).toEqual([]);
  });
});
