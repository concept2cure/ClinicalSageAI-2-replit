/**
 * GET /api/design-controls — DHF design-input traceability read contract.
 *
 * The v2 DesignControls traceability matrix adopts this list and derives the
 * 820.30 completeness roll-up from it. Locks: 403 without org, the { data }
 * envelope with the display keys ({ id, cat, req, riskRef, outputs, ver,
 * verRef, val, valRef }, with risk_ref/ver_ref/val_ref → camelCase), and 42P01
 * fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import designControlsRouter from '../design-controls.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/design-controls', designControlsRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/design-controls', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/design-controls');
    expect(res.status).toBe(403);
  });

  it('returns design inputs shaped to the display contract', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'DI-01', cat: 'intended_use', req: 'Continuously measure interstitial glucose.',
          risk_ref: 'HZ-01', outputs: [{ id: 'DO-01', desc: 'Sensor + algorithm spec' }],
          ver: 'pass', ver_ref: 'V&V-114 accuracy', val: 'pass', val_ref: 'HF summative',
        },
        {
          id: 'DI-07', cat: 'functional', req: 'Report a reading every 5 minutes.',
          risk_ref: null, outputs: [], ver: null, ver_ref: null, val: null, val_ref: null,
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/design-controls');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['id', 'cat', 'req', 'riskRef', 'outputs', 'ver', 'verRef', 'val', 'valRef']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.riskRef).toBe('HZ-01');
    expect(first.verRef).toBe('V&V-114 accuracy');
    expect(first.outputs[0].id).toBe('DO-01');
    const second = res.body.data[1];
    expect(second.riskRef).toBeNull();
    expect(second.outputs).toEqual([]);
    expect(second.ver).toBeNull();
    expect(res.body.meta.count).toBe(2);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/design-controls');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
