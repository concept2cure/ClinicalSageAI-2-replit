/**
 * MDX context-snapshot endpoint tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { authState, audit, resolverMock } = vi.hoisted(() => ({
  authState: { user: null as Record<string, any> | null },
  audit: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
  resolverMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  },
}));

vi.mock('../../db', () => ({ pool: {} }));

vi.mock('../../services/auditService', () => ({ default: audit }));

vi.mock('../../services/ana-ri/mdx-context-resolver', () => ({
  buildMdxContextBlock: (...a: any[]) => resolverMock(...a),
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 1, organizationId: '7', role: 'member' };
  vi.resetModules();
  const mod = await import('../../routes/ana-mdx-context');
  app = express();
  app.use('/api/ana', mod.default);
});

describe('GET /api/ana/mdx-context-snapshot', () => {
  it('returns 403 when no organization context', async () => {
    authState.user = null;
    const res = await request(app).get('/api/ana/mdx-context-snapshot');
    expect(res.status).toBe(403);
  });

  it('returns the resolver payload (without the systemPromptBlock)', async () => {
    resolverMock.mockResolvedValue({
      systemPromptBlock: '## ...',
      payload: {
        surface: { key: 'pre-sub', label: 'Pre-Sub manager' },
        milestone: { id: 'authoring', label: 'authoring', nextStep: 'x', signals: {} },
        alerts: [{ id: 'a-1', kind: 'q_sub.target_date_approaching', severity: 'warn' }],
        workflowsRelevant: [],
        toolsRelevant: [],
        tenantExtraNotes: null,
      },
    });
    const res = await request(app)
      .get('/api/ana/mdx-context-snapshot?activeNav=pre-sub&activeProgramCode=OR-801');
    expect(res.status).toBe(200);
    expect(res.body.organizationId).toBe(7);
    expect(res.body.activeNav).toBe('pre-sub');
    expect(res.body.surface.key).toBe('pre-sub');
    expect(res.body.alerts).toHaveLength(1);
    // The systemPromptBlock should NOT be in the response (it's prompt-only).
    expect(res.body.systemPromptBlock).toBeUndefined();
  });

  it('emits an audit row for the snapshot read', async () => {
    resolverMock.mockResolvedValue({
      systemPromptBlock: '',
      payload: {
        surface: null,
        milestone: null,
        alerts: [],
        workflowsRelevant: [],
        toolsRelevant: [],
        tenantExtraNotes: null,
      },
    });
    await request(app).get('/api/ana/mdx-context-snapshot?activeNav=pre-sub');
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'mdx.context_snapshot.read',
        tenantId: 7,
        details: expect.objectContaining({ activeNav: 'pre-sub' }),
      }),
    );
  });

  it('honors includeProactive=false to skip the snapshot', async () => {
    resolverMock.mockResolvedValue({
      systemPromptBlock: '',
      payload: {
        surface: null, milestone: null, alerts: [],
        workflowsRelevant: [], toolsRelevant: [], tenantExtraNotes: null,
      },
    });
    await request(app).get('/api/ana/mdx-context-snapshot?includeProactive=false');
    expect(resolverMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includeProactive: false }),
    );
  });

  /* D6 / IAM-18 (1), P1-17 paydown 2. This case used to PIN the leak: it asserted
     that `detail` carried the thrower's text. A resolver failure is a driver
     error in practice, and its text is a relation name; the client gets the
     envelope and the request id, the text goes to the log. */
  it('a resolver failure answers 500 with the envelope, never the thrower\'s text', async () => {
    const boom = new Error('relation "mdx_context_snapshots" does not exist') as Error & { code: string };
    boom.code = '42P01';
    resolverMock.mockRejectedValue(boom);
    const withRequestId = express();
    withRequestId.use((_req, res, next) => {
      res.setHeader('X-Request-Id', 'req-p1-17-2');
      next();
    });
    withRequestId.use('/api/ana', (await import('../../routes/ana-mdx-context')).default);

    const res = await request(withRequestId).get('/api/ana/mdx-context-snapshot');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.correlationId).toBe('req-p1-17-2');
    expect(res.body.detail).toBeUndefined();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('mdx_context_snapshots');
    expect(body).not.toMatch(/relation |does not exist|42P01/i);
  });
});
