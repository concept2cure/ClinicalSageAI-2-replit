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
  audit: { logAction: vi.fn().mockResolvedValue(undefined) },
  dbState: { settings: null as Record<string, unknown> | null },
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
