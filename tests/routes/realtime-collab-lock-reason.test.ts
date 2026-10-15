/**
 * A section-lock event records the reason the person gave, or none (row D5,
 * 2026-10-01).
 *
 * POST /api/realtime-collab/locks writes a governed ledger row for every
 * acquire, takeover and release (auditLockEvent). With no reason given, it
 * recorded "Section lock acquired via realtime-collab API" as the reason, so a
 * reader of audit_logs.reason could not tell a person's reason from the
 * system's description of its own command. The command names what happened;
 * the reason is the person's.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const recorded = vi.hoisted(() => [] as Array<{ command: string; reason: string | null }>);

vi.mock('../../server/services/collab/collab-authorization', () => ({
  authorizeResource: async () => 'authorized',
}));
vi.mock('../../server/routes/c2c/actions.js', () => ({
  recordGovernedAction: async (_pool: unknown, row: { command: string; reason: string | null }) => {
    recorded.push({ command: row.command, reason: row.reason });
  },
}));
vi.mock('../../server/db.js', () => ({
  pool: { query: async () => ({ rows: [], rowCount: 0 }) },
}));

import realtimeCollabRouter from '../../server/routes/realtime-collab';

const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SECTION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function appAs(userId: number) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request).user = { userId, organizationId: 910, email: `u${userId}@acme.test` } as never;
    next();
  });
  app.use('/api/realtime-collab', realtimeCollabRouter);
  return app;
}

const ledgerFor = async (command: string) => {
  await vi.waitFor(() => expect(recorded.some((r) => r.command === command)).toBe(true));
  return recorded.filter((r) => r.command === command);
};

beforeEach(() => {
  recorded.length = 0;
});

describe('section-lock ledger rows', () => {
  it('an acquire and a release with no reason record none, not a sentence', async () => {
    const lock = await request(appAs(6001)).post('/api/realtime-collab/locks').send({ documentId: DOC, sectionId: SECTION });
    expect(lock.status).toBe(200);
    expect((await ledgerFor('collab.lock_acquire'))[0].reason).toBeNull();

    await request(appAs(6001)).delete(`/api/realtime-collab/locks/${DOC}`).send({ sectionId: SECTION });
    expect((await ledgerFor('collab.lock_release'))[0].reason).toBeNull();
  });

  it('a takeover records the reason the person gave, trimmed', async () => {
    await request(appAs(6002)).post('/api/realtime-collab/locks').send({ documentId: DOC, sectionId: SECTION });
    const takeover = await request(appAs(6003))
      .post('/api/realtime-collab/locks')
      .send({ documentId: DOC, sectionId: SECTION, takeover: true, reason: '  Author is on leave; the IND deadline is Friday.  ' });
    expect(takeover.status).toBe(200);
    expect((await ledgerFor('collab.lock_takeover'))[0].reason).toBe('Author is on leave; the IND deadline is Friday.');
  });
});
