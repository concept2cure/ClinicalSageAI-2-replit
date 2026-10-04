/**
 * U16 — the presence roster's not-durable fallback says when it does not know
 * a room, instead of answering an empty roster with success.
 *
 * The durable roster (collab_presence) is proven against real PostgreSQL in
 * tests/db/collab-presence.dbtest.ts. This file pins the fallback that remains
 * for a database without the table, under the default (mocked-pg) project:
 * the mocked pool answers every statement with no rows, which real Postgres
 * never does for an upsert, so the router demotes to the per-process Map —
 * the same rule DurableLockManager applies.
 *
 * Before U16 the heartbeat for a room this process did not hold answered
 * `{success: true, connectedUsers: []}`, and the client adopted it as the
 * roster. It now adds `roomKnown: false`, which the client honours by keeping
 * its roster (client/src/concept2cure/v2/__tests__/authoringCollabRoomUnknown.test.tsx).
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const DOC_JOINED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const DOC_ELSEWHERE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const SECTION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORG = 930;

vi.mock('../../server/services/collab/collab-authorization', () => ({
  authorizeResource: async (_resource: unknown, tenantId: number) =>
    tenantId === ORG ? 'authorized' : 'denied',
}));

import realtimeCollabRouter from '../../server/routes/realtime-collab';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as express.Request).user = { userId: 6001, organizationId: ORG, email: 'p@acme.test' } as never;
    next();
  });
  a.use('/api/realtime-collab', realtimeCollabRouter);
  return a;
}

describe('presence fallback', () => {
  it('demotes to the per-process roster and says so on /health', async () => {
    const joined = await request(app())
      .post('/api/realtime-collab/rooms')
      .send({ documentId: DOC_JOINED, sectionId: SECTION, projectId: 1 });
    expect(joined.status).toBe(200);
    const health = await request(app()).get('/api/realtime-collab/health');
    expect(health.body.presenceStorage).toMatch(/in-memory fallback/);
  });

  it('answers a heartbeat for a room it does not hold with roomKnown: false', async () => {
    const res = await request(app())
      .put(`/api/realtime-collab/rooms/${DOC_ELSEWHERE}/awareness`)
      .send({ sectionId: SECTION, isTyping: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, connectedUsers: [], roomKnown: false });
  });

  it('answers a heartbeat for a room it holds with the roster and roomKnown: true', async () => {
    const res = await request(app())
      .put(`/api/realtime-collab/rooms/${DOC_JOINED}/awareness`)
      .send({ sectionId: SECTION, isTyping: false });
    expect(res.body.roomKnown).toBe(true);
    expect(res.body.connectedUsers.map((u: { email: string }) => u.email)).toEqual(['p@acme.test']);
  });

  it('refuses a malformed document id on the heartbeat, which can now join', async () => {
    const res = await request(app())
      .put(`/api/realtime-collab/rooms/not-a-uuid/awareness`)
      .send({ sectionId: SECTION });
    expect(res.status).toBe(400);
  });
});
