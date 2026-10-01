/**
 * AnA tool policy admin route tests — admin gate, validation, audit emission,
 * round-trip read/update.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { authState, audit, dbState } = vi.hoisted(() => ({
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

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 1, organizationId: '7', role: 'admin' };
  dbState.settings = null;
  dbState.failWith = null;
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

  it('persists and emits audit on success', async () => {
    const res = await request(app)
      .put('/api/ana-tool-policy')
      .send({ deny: ['k510_workflow.transmit'] });
    expect(res.status).toBe(200);
    expect(res.body.policy.deny).toEqual(['k510_workflow.transmit']);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ana_tool_policy.update',
        tenantId: 7,
        details: expect.objectContaining({
          newPolicy: { deny: ['k510_workflow.transmit'] },
        }),
      }),
    );
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
