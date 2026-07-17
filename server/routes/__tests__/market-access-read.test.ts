/**
 * GET /api/market-access — market-access read contract.
 *
 * The v2 MarketAccess surface adopts these records only when each carries the
 * full display shape. Locks: 403 without org, the { data } envelope with the
 * three nested lists shaped to their display keys (coverage → CoverageRow,
 * dossier → DossierSection, coding → CodingRow, rehydrated from JSONB), and
 * 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import marketAccessRouter from '../market-access.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/market-access', marketAccessRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/market-access', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/market-access');
    expect(res.status).toBe(403);
  });

  it('returns program records shaped to the display contract (nested lists from JSONB)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          program: 'BX-204',
          coverage: [
            { region: 'United States', payer: 'CMS -- Medicare', basis: 'NCD / LCD', code: 'HCPCS E2103', status: 'covered', note: 'Therapeutic CGM covered.' },
          ],
          dossier: [
            { n: '4', label: 'Economic model -- budget impact', owner: 'HEOR', st: 'draft', pct: 55, blocker: true },
          ],
          coding: [
            { code: 'HCPCS E2103', desc: 'Non-adjunctive CGM receiver/monitor', kind: 'Existing', status: 'mapped', note: 'Therapeutic CGM DME code applies.' },
          ],
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/market-access');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);

    const rec = res.body.data[0];
    expect(rec).toHaveProperty('program', 'BX-204');
    expect(Array.isArray(rec.coverage)).toBe(true);
    expect(Array.isArray(rec.dossier)).toBe(true);
    expect(Array.isArray(rec.coding)).toBe(true);

    for (const k of ['region', 'payer', 'basis', 'code', 'status', 'note']) {
      expect(rec.coverage[0]).toHaveProperty(k);
    }
    for (const k of ['n', 'label', 'owner', 'st', 'pct']) {
      expect(rec.dossier[0]).toHaveProperty(k);
    }
    expect(rec.dossier[0].blocker).toBe(true);
    for (const k of ['code', 'desc', 'kind', 'status', 'note']) {
      expect(rec.coding[0]).toHaveProperty(k);
    }
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/market-access');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
