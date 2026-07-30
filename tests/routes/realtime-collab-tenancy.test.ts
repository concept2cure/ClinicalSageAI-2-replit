/**
 * Realtime collaboration REST — tenancy and identity.
 *
 * The router was auth-gated at mount and then took the actor from
 * `req.body.userId`, keying rooms and locks on `documentId` alone in
 * process-global Maps. These tests drive the REAL handlers and pin the two
 * things that combination made possible:
 *
 *   1. LOCK THEFT. `releaseLock` compared the stored holder against a
 *      request-supplied userId, so naming the holder released their lock.
 *   2. CROSS-TENANT READ. Joining by document id returned `connectedUsers` —
 *      display names and email addresses of another customer's authors — and
 *      `GET /locks/:documentId` returned their locks.
 *
 * Document ownership is stubbed at the authorizer rather than mocked at the
 * pool, so the assertions are about the router's use of the answer, not about
 * SQL. The authorizer itself is proven against real migration DDL in
 * server/services/collab/__tests__/collab-governance.pglite.integration.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/** documentId → the tenant that owns it. Anything else is not authorized. */
const documentOwner = new Map<string, number>();

vi.mock('../../server/services/collab/collab-authorization', () => ({
  authorizeResource: async (resource: { documentId: string }, tenantId: number) =>
    documentOwner.get(resource.documentId) === tenantId ? 'authorized' : 'denied',
}));

import realtimeCollabRouter from '../../server/routes/realtime-collab';

const ORG_A = 900;
const ORG_B = 901;
const USER_A = 5001;
const USER_B = 5002;

const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECTION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/**
 * Mount the router behind a stub that injects whichever principal the test
 * names — standing in for authenticateToken, which is applied at the real
 * mount site (register-advanced-platform-routes.ts).
 */
function appAs(user: { userId: number; organizationId: number; email: string } | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) (req as express.Request).user = user;
    next();
  });
  app.use('/api/realtime-collab', realtimeCollabRouter);
  return app;
}

const asA = () => appAs({ userId: USER_A, organizationId: ORG_A, email: 'a@acme.test' });
const asB = () => appAs({ userId: USER_B, organizationId: ORG_B, email: 'b@rival.test' });

beforeEach(() => {
  documentOwner.clear();
  documentOwner.set(DOC_A, ORG_A);
  documentOwner.set(DOC_B, ORG_B);
});

describe('identity comes from the principal, never the body', () => {
  it('refuses a request with no authenticated principal', async () => {
    const res = await request(appAs(null))
      .post('/api/realtime-collab/rooms')
      .send({ documentId: DOC_A, projectId: 1 });
    expect(res.status).toBe(401);
  });

  it('refuses a principal with no organization', async () => {
    const app = appAs({ userId: USER_A, organizationId: NaN as unknown as number, email: '' });
    const res = await request(app).post('/api/realtime-collab/rooms').send({ documentId: DOC_A, projectId: 1 });
    expect(res.status).toBe(401);
  });

  it('ignores a body userId and joins as the authenticated principal', async () => {
    const res = await request(asA())
      .post('/api/realtime-collab/rooms')
      .send({ documentId: DOC_A, projectId: 1, userId: 'someone-else', email: 'victim@acme.test' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.userId).toBe(String(USER_A));
    expect(res.body.data.user.email).toBe('a@acme.test');
  });

  it('rejects a non-UUID documentId before it reaches the authorizer', async () => {
    const res = await request(asA())
      .post('/api/realtime-collab/rooms')
      .send({ documentId: "' OR 1=1 --", projectId: 1 });
    expect(res.status).toBe(400);
  });
});

describe('cross-tenant isolation', () => {
  it("refuses to join another tenant's room", async () => {
    const res = await request(asA())
      .post('/api/realtime-collab/rooms')
      .send({ documentId: DOC_B, projectId: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('COLLAB_FORBIDDEN');
  });

  it("does not leak another tenant's roster through a shared document id", async () => {
    // Both tenants join their own document; each roster must contain only its
    // own member. Before the fix a single global room keyed on documentId
    // meant one tenant read the other's display names and email addresses.
    await request(asA()).post('/api/realtime-collab/rooms').send({ documentId: DOC_A, projectId: 1 });
    const b = await request(asB()).post('/api/realtime-collab/rooms').send({ documentId: DOC_B, projectId: 1 });
    expect(b.status).toBe(200);
    const emails = (b.body.data.room.connectedUsers as Array<{ email: string }>).map(u => u.email);
    expect(emails).toEqual(['b@rival.test']);
  });

  it("does not list another tenant's rooms", async () => {
    // The room manager is a process singleton, so B may legitimately hold rooms
    // opened by an earlier case in this file. What must be true regardless of
    // order is that none of A's documents appear in B's listing — the previous
    // `GET /rooms` returned every room across every customer.
    await request(asA()).post('/api/realtime-collab/rooms').send({ documentId: DOC_A, projectId: 1 });
    const rooms = await request(asB()).get('/api/realtime-collab/rooms');
    expect(rooms.status).toBe(200);
    const listed = (rooms.body.data.rooms as Array<{ documentId: string }>).map(r => r.documentId);
    expect(listed).not.toContain(DOC_A);

    // And A does see its own, so the filter is scoping rather than emptying.
    const own = await request(asA()).get('/api/realtime-collab/rooms');
    expect((own.body.data.rooms as Array<{ documentId: string }>).map(r => r.documentId)).toContain(DOC_A);
  });

  it("does not return another tenant's locks", async () => {
    await request(asA())
      .post('/api/realtime-collab/locks')
      .send({ documentId: DOC_A, sectionId: SECTION });
    // Tenant B asks for locks on tenant A's document id.
    const res = await request(asB()).get(`/api/realtime-collab/locks/${DOC_A}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('section locking', () => {
  it('acquires a lock and reports it as the caller’s own', async () => {
    const res = await request(asA())
      .post('/api/realtime-collab/locks')
      .send({ documentId: DOC_A, sectionId: SECTION, reason: 'Editing' });
    expect(res.status).toBe(200);
    expect(res.body.data.mine).toBe(true);
    expect(res.body.data.lockedBy).toBe(String(USER_A));
    expect(res.body.data.lockedByLabel).toBe('a@acme.test');
  });

  it('refuses to lock a document belonging to another tenant', async () => {
    const res = await request(asA())
      .post('/api/realtime-collab/locks')
      .send({ documentId: DOC_B, sectionId: SECTION });
    expect(res.status).toBe(403);
  });

  it('409s a second holder rather than silently reassigning the lock', async () => {
    documentOwner.set(DOC_A, ORG_A);
    await request(asA()).post('/api/realtime-collab/locks').send({ documentId: DOC_A, sectionId: SECTION });
    // A second member of the SAME tenant.
    const other = appAs({ userId: 5999, organizationId: ORG_A, email: 'c@acme.test' });
    const res = await request(other)
      .post('/api/realtime-collab/locks')
      .send({ documentId: DOC_A, sectionId: SECTION });
    expect(res.status).toBe(409);
  });

  it('cannot release a lock held by someone else, even by naming them', async () => {
    // The headline. `{userId: <holder>}` in the body was previously sufficient.
    await request(asA()).post('/api/realtime-collab/locks').send({ documentId: DOC_A, sectionId: SECTION });
    const thief = appAs({ userId: 5999, organizationId: ORG_A, email: 'c@acme.test' });
    const res = await request(thief)
      .delete(`/api/realtime-collab/locks/${DOC_A}`)
      .send({ sectionId: SECTION, userId: String(USER_A) });
    expect(res.status).toBe(200);
    expect(res.body.released).toBe(false);

    // And the lock is still there, still held by its owner.
    const locks = await request(asA()).get(`/api/realtime-collab/locks/${DOC_A}`);
    expect(locks.body.data).toHaveLength(1);
    expect(locks.body.data[0].lockedBy).toBe(String(USER_A));
  });

  it('releases the caller’s own lock', async () => {
    await request(asA()).post('/api/realtime-collab/locks').send({ documentId: DOC_A, sectionId: SECTION });
    const res = await request(asA())
      .delete(`/api/realtime-collab/locks/${DOC_A}`)
      .send({ sectionId: SECTION });
    expect(res.body.released).toBe(true);
    const locks = await request(asA()).get(`/api/realtime-collab/locks/${DOC_A}`);
    expect(locks.body.data).toEqual([]);
  });

  it('marks a co-worker’s lock as not mine, with a readable holder label', async () => {
    await request(asA()).post('/api/realtime-collab/locks').send({ documentId: DOC_A, sectionId: SECTION });
    const other = appAs({ userId: 5999, organizationId: ORG_A, email: 'c@acme.test' });
    const res = await request(other).get(`/api/realtime-collab/locks/${DOC_A}`);
    expect(res.body.data[0].mine).toBe(false);
    expect(res.body.data[0].lockedByLabel).toBe('a@acme.test');
  });
});

describe('what the service says about itself', () => {
  it('does not advertise durability or a Part 11 audit trail it does not have', async () => {
    // /health used to report part11AuditTrail: true, offlineSync: true and
    // conflictResolution: 'automatic-crdt' from a router backed by in-memory
    // Maps with no audit writes.
    const res = await request(asA()).get('/api/realtime-collab/health');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/part11/i);
    expect(body).not.toMatch(/offlineSync/i);
    expect(res.body.storage).toMatch(/in-memory/);
  });

  it('no longer exposes the endpoints that claimed to persist CRDT state', async () => {
    // POST /rooms/:roomKey/yjs-state answered "CRDT state persisted" after
    // writing to a Map. Durable CRDT state is collab_document_state, written
    // by the collaboration socket.
    const post = await request(asA())
      .post('/api/realtime-collab/rooms/anything/yjs-state')
      .send({ stateVector: 'AA==', document: 'AA==' });
    expect(post.status).toBe(404);
    const conflict = await request(asA())
      .post('/api/realtime-collab/conflicts/resolve')
      .send({ conflictId: 'x', resolution: 'accept_local', resolvedBy: 'x' });
    expect(conflict.status).toBe(404);
  });
});
