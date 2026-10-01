/**
 * AnA tool policy admin route tests — admin gate, validation, audit emission,
 * round-trip read/update.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { authState, audit, dbState, writer } = vi.hoisted(() => ({
  /** The one settings writer (services/tenant/tenant-settings-writer.ts), over dbState. */
  writer: { calls: [] as Array<{ orgId: number; change: { action: string; sections: (a: any, b: any) => string[] } }> },
  authState: { user: null as Record<string, any> | null },
  audit: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
  dbState: {
    settings: null as Record<string, unknown> | null,
    /** When set, every pool.query rejects with it — a failed read or write. */
    failWith: null as Error | null,
  },
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  },
}));

vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (dbState.failWith) throw dbState.failWith;
      if (sql.startsWith('SELECT settings')) {
        return { rows: [{ settings: dbState.settings }] };
      }
      if (sql.startsWith('UPDATE organizations')) {
        dbState.settings = params[0] as Record<string, unknown>;
        return { rows: [] };
      }
      return { rows: [] };
    }),
  },
}));

vi.mock('../../services/auditService', () => ({ default: audit }));

/* R7 (2026-10-01): the PUT read the whole settings object and wrote it all back
   with no lock, so a change made between the two (the connector switch, a
   session limit) was silently reverted. It writes through the one settings
   writer now: a row lock, one transaction, the chained audit row. This fake
   applies the change to dbState as the writer would. */
vi.mock('../../services/tenant/tenant-settings-writer', () => ({
  writeTenantSettings: vi.fn(async (_req: unknown, orgId: number, change: any) => {
    if (dbState.failWith) throw dbState.failWith;
    writer.calls.push({ orgId, change });
    const current = (dbState.settings ?? {}) as Record<string, unknown>;
    dbState.settings = change.next(current, 'standard');
    return dbState.settings;
  }),
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 1, organizationId: '7', role: 'admin' };
  dbState.settings = null;
  dbState.failWith = null;
  writer.calls = [];
  vi.resetModules();
  const mod = await import('../../routes/ana-tool-policy');
  app = express();
  app.use(express.json());
  app.use('/api/ana-tool-policy', mod.default);
});

describe('GET /api/ana-tool-policy', () => {
  it('returns 403 when no organization context', async () => {
    authState.user = null;
    const res = await request(app).get('/api/ana-tool-policy');
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-admin', async () => {
    authState.user = { id: 1, organizationId: '7', role: 'member' };
    const res = await request(app).get('/api/ana-tool-policy');
    expect(res.status).toBe(403);
  });

  it('returns empty policy when none configured', async () => {
    const res = await request(app).get('/api/ana-tool-policy');
    expect(res.status).toBe(200);
    expect(res.body.policy).toEqual({});
  });

  it('returns existing policy when configured', async () => {
    dbState.settings = { anaToolPolicy: { deny: ['k510_workflow.transmit'] } };
    const res = await request(app).get('/api/ana-tool-policy');
    expect(res.status).toBe(200);
    expect(res.body.policy.deny).toEqual(['k510_workflow.transmit']);
  });
});

describe('PUT /api/ana-tool-policy', () => {
  it('rejects allow as non-array', async () => {
    const res = await request(app).put('/api/ana-tool-policy').send({ allow: 'not-array' });
    expect(res.status).toBe(422);
  });

  it('rejects deny with non-string entries', async () => {
    const res = await request(app)
      .put('/api/ana-tool-policy')
      .send({ deny: ['ok', 42] });
    expect(res.status).toBe(422);
  });

  it('rejects unknown keys (typo defense)', async () => {
    const res = await request(app)
      .put('/api/ana-tool-policy')
      .send({ allow: ['q_sub.create'], denylist: ['k510_workflow.transmit'] });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Unknown.*denylist/);
  });

  it('persists through the one settings writer, recorded as ana_tool_policy.update', async () => {
    const res = await request(app)
      .put('/api/ana-tool-policy')
      .send({ deny: ['k510_workflow.transmit'] });
    expect(res.status).toBe(200);
    expect(res.body.policy.deny).toEqual(['k510_workflow.transmit']);
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].orgId).toBe(7);
    expect(writer.calls[0].change.action).toBe('ana_tool_policy.update');
    expect(writer.calls[0].change.sections({}, {})).toEqual(['anaToolPolicy']);
  });

  it('keeps every other setting as the writer read it under its lock (R7)', async () => {
    dbState.settings = { claudeConnector: { enabled: false }, security: { maxConcurrentSessions: 3 } };
    const res = await request(app).put('/api/ana-tool-policy').send({ deny: ['x.y'] });
    expect(res.status).toBe(200);
    expect(dbState.settings).toEqual({
      claudeConnector: { enabled: false },
      security: { maxConcurrentSessions: 3 },
      anaToolPolicy: { deny: ['x.y'] },
    });
  });

  it('never writes organizations.settings itself', async () => {
    const { pool } = await import('../../db');
    await request(app).put('/api/ana-tool-policy').send({ deny: ['x.y'] });
    const sql = (pool.query as any).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(sql.filter((q: string) => /UPDATE organizations/i.test(q))).toEqual([]);
  });

  it('round-trips: PUT then GET returns the same shape', async () => {
    await request(app)
      .put('/api/ana-tool-policy')
      .send({ allow: ['q_sub.create', 'q_sub.commitment.set_rolled_in'] });
    const res = await request(app).get('/api/ana-tool-policy');
    expect(res.body.policy.allow).toEqual([
      'q_sub.create',
      'q_sub.commitment.set_rolled_in',
    ]);
  });
});

/* D6 / IAM-18 (1), P1-17 paydown 2. Both handlers used to answer a failed
   query with `{ error: 'Failed to … policy', detail: err.message }` — for a
   node-postgres failure that is the relation or column name. The client now
   gets the envelope and the request id; the text goes to the file's log. The
   403s above are the 4xx branches and are untouched. */
describe('a failed read or write answers 500 without naming what broke', () => {
  function undefinedTable(relation: string) {
    const e = new Error(`relation "${relation}" does not exist`) as Error & { code: string };
    e.code = '42P01';
    return e;
  }
  async function appWithRequestId() {
    const mod = await import('../../routes/ana-tool-policy');
    const a = express();
    a.use(express.json());
    a.use((_req, res, next) => {
      res.setHeader('X-Request-Id', 'req-p1-17-2');
      next();
    });
    a.use('/api/ana-tool-policy', mod.default);
    return a;
  }
  function expectContained(res: request.Response) {
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.correlationId).toBe('req-p1-17-2');
    expect(res.body.detail).toBeUndefined();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('organizations');
    expect(body).not.toMatch(/relation |does not exist|42P01/i);
  }

  /* GET reads through loadAnaToolPolicy, which is fail-soft BY DESIGN for
     read/display callers (services/ana-ri/mdx-tool-policy.ts): an unreadable
     settings row answers 200 with an empty policy, and the route's catch is
     never reached by a query failure. Pinned here so the next reader does not
     mistake it for a swallowed 500. */
  it('GET: a failed settings read is fail-soft — 200 and an empty policy, no error text', async () => {
    dbState.failWith = undefinedTable('organizations');
    const res = await request(await appWithRequestId()).get('/api/ana-tool-policy');
    expect(res.status).toBe(200);
    expect(res.body.policy).toEqual({});
    expect(JSON.stringify(res.body)).not.toMatch(/relation |does not exist|42P01/i);
  });

  it('GET: when the loader itself throws, the text stays in the log and the client gets the envelope', async () => {
    vi.doMock('../../services/ana-ri/mdx-tool-policy', () => ({
      loadAnaToolPolicy: async () => {
        throw undefinedTable('organizations');
      },
    }));
    try {
      vi.resetModules();
      expectContained(await request(await appWithRequestId()).get('/api/ana-tool-policy'));
    } finally {
      vi.doUnmock('../../services/ana-ri/mdx-tool-policy');
    }
  });

  it('PUT: the relation name stays in the log, the client gets the envelope', async () => {
    dbState.failWith = undefinedTable('organizations');
    expectContained(
      await request(await appWithRequestId())
        .put('/api/ana-tool-policy')
        .send({ deny: ['k510_workflow.transmit'] }),
    );
    expect(audit.logAction).not.toHaveBeenCalled();
  });
});
