/**
 * GET + POST /api/reg-change — the converged regulatory-change read + write path.
 *
 * The route is thin: guard the org, delegate to the real reg_change_items
 * service, and shape rows to the display contract ({ id, src, kind, when, sev,
 * live, title, summary, affects, action, doc, owner, due }, with when_label →
 * when). Locks: 403 without org; GET returns the real-store rows shaped with
 * meta.source; GET fail-closed to an honest empty list on a missing store
 * (42P01); POST records a change (the real write path, audited) and returns the
 * shaped view; POST 400 on invalid input. (The full store round-trip is proven
 * in reg-change-service.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { createRegChange, listRegChanges, RegChangeValidationError, logAction } = vi.hoisted(() => {
  class RegChangeValidationError extends Error {}
  return { createRegChange: vi.fn(), listRegChanges: vi.fn(), RegChangeValidationError, logAction: vi.fn() };
});
vi.mock('../../services/reg-change/reg-change-service', () => ({ createRegChange, listRegChanges, RegChangeValidationError }));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));

import regChangeRouter from '../reg-change.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 55 };
    next();
  });
  app.use('/api/reg-change', regChangeRouter);
  return app;
}

function dbRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rc-1', organization_id: 7, title: 'QMSR — 21 CFR 820 harmonized to ISO 13485:2016',
    src: 'FDA · final rule', kind: 'regulation', when_label: 'Effective 2 Feb 2026',
    sev: 'high', live: true, summary: 'FDA replaces the QSR with the QMSR…',
    affects: [{ dev: 'BX-204 CGM', what: 'DHF terminology', sub: '510(k) OR-902' }],
    action: 'QMSR transition plan + gap analysis', doc: 'QMSR gap analysis & transition plan',
    owner: 'Quality', due: 'Effective now', created_by: 55,
    created_at: '2026-07-30T00:00:00Z', updated_at: '2026-07-30T00:00:00Z',
    ...over,
  };
}

beforeEach(() => { createRegChange.mockReset(); listRegChanges.mockReset(); logAction.mockReset(); });

describe('GET /api/reg-change', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/reg-change');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('returns real-store rows shaped to the display contract (when_label → when), source = reg_change_items', async () => {
    listRegChanges.mockResolvedValueOnce([dbRow(), dbRow({ id: 'rc-2', title: 'EU AI Act', sev: 'high' })]);
    const res = await request(appWith(7)).get('/api/reg-change');
    expect(res.status).toBe(200);
    expect(listRegChanges).toHaveBeenCalledWith(7);
    expect(res.body.data).toHaveLength(2);
    const first = res.body.data[0];
    for (const k of ['id', 'src', 'kind', 'when', 'sev', 'live', 'title', 'summary', 'affects', 'action', 'doc', 'owner', 'due']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.when).toBe('Effective 2 Feb 2026');
    expect(first).not.toHaveProperty('when_label');
    expect(first.affects[0]).toEqual({ dev: 'BX-204 CGM', what: 'DHF terminology', sub: '510(k) OR-902' });
    expect(res.body.meta.count).toBe(2);
    expect(res.body.meta.source).toBe('reg_change_items');
  });

  it('fails closed to an empty list when the store is missing (42P01)', async () => {
    listRegChanges.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/reg-change');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/reg-change', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/reg-change').send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(createRegChange).not.toHaveBeenCalled();
  });

  it('records a change and returns the shaped view (audited)', async () => {
    createRegChange.mockResolvedValueOnce(dbRow({ id: 'rc-9', title: 'EU AI Act', when_label: 'Aug 2026' }));
    const res = await request(appWith(7)).post('/api/reg-change').send({
      title: 'EU AI Act', kind: 'regulation', sev: 'high', when: 'Aug 2026', live: true,
      affects: [{ dev: 'BX-204 predictive-low algorithm', what: 'AI Act technical documentation', sub: 'EU MDR CE' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('rc-9');
    expect(res.body.data.title).toBe('EU AI Act');
    expect(res.body.data.when).toBe('Aug 2026');
    // Service called with parsed body (`when` → whenLabel) + acting user as createdBy; audited.
    expect(createRegChange).toHaveBeenCalledWith(7, expect.objectContaining({
      title: 'EU AI Act', kind: 'regulation', sev: 'high', whenLabel: 'Aug 2026', live: true, createdBy: 55,
    }));
    expect(logAction).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 7, userId: 55, action: 'REG_CHANGE_RECORDED', resourceType: 'reg_change_item', resourceId: 'rc-9',
    }));
  });

  it('400 on invalid input', async () => {
    createRegChange.mockRejectedValueOnce(new RegChangeValidationError('kind must be one of: …'));
    const res = await request(appWith(7)).post('/api/reg-change').send({ title: 'x', kind: 'nope', sev: 'high' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(logAction).not.toHaveBeenCalled();
  });
});
