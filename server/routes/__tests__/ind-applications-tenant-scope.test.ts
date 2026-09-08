/**
 * IND applications — the tenant predicate was a default.
 *
 * `tenantHeaders` returned `organizationId: null` for a request with no tenant
 * on it, and every query appended its tenant clause only `if (organizationId)`.
 * Without a tenant, therefore:
 *
 *   GET    /applications      listed EVERY sponsor's IND applications — the
 *                             predicate stayed `WHERE 1=1`
 *   GET    /applications/:id  read any IND by id: drug name, indication, sponsor
 *   PUT    /applications/:id  updated any sponsor's IND
 *   DELETE /applications/:id  deleted any sponsor's draft IND
 *
 * The delete is the sharpest illustration: its removal is written into the
 * hash-chained audit_events table in the same transaction, fail-closed, citing
 * 21 CFR 11.10(e) — meticulously audited, and not scoped to a tenant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
const transaction = vi.fn();
vi.mock('../../db', () => ({
  query: (...a: unknown[]) => query(...a),
  transaction: (...a: unknown[]) => transaction(...a),
}));
vi.mock('../../services/indCopilot.js', () => ({ default: {} }));

import indRouter from '../ind';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).tenantId = org;
    next();
  });
  app.use('/api/ind', indRouter);
  return app;
}

const statements = () => query.mock.calls.map((c: unknown[]) => String(c[0]));

beforeEach(() => {
  query.mockReset();
  transaction.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe('the IND router refuses without organization context', () => {
  const cases: Array<[string, 'get' | 'put' | 'delete', string]> = [
    ['application list', 'get', '/api/ind/applications'],
    ['application read', 'get', '/api/ind/applications/42'],
    ['application update', 'put', '/api/ind/applications/42'],
    ['application delete', 'delete', '/api/ind/applications/42'],
  ];

  for (const [label, method, path] of cases) {
    it(`403s on the ${label} rather than reaching across tenants`, async () => {
      const res = await request(appWith(null))[method](path).send({ status: 'draft' });

      expect(res.status).toBe(403);
      expect(query).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });
  }
});

describe('every IND tenant predicate is unconditional', () => {
  it('scopes the list — never WHERE 1=1', async () => {
    await request(appWith(7)).get('/api/ind/applications');

    const list = statements().find((s) => s.includes('FROM ind_applications'));
    expect(list).toBeTruthy();
    expect(list).toContain('organization_id = $1');
    expect(list).not.toContain('WHERE 1=1');
    expect(query.mock.calls[0][1]).toContain(7);
  });

  it('scopes the read by id — an IND is not addressable across sponsors', async () => {
    await request(appWith(7)).get('/api/ind/applications/42');

    const read = statements().find((s) => s.includes('drug_name'));
    expect(read).toBeTruthy();
    expect(read).toMatch(/WHERE id = \$1 AND organization_id = \$2/);
    expect(query.mock.calls[0][1]).toEqual(['42', 7]);
  });

  it('scopes the update', async () => {
    await request(appWith(7)).put('/api/ind/applications/42').send({ status: 'submitted' });

    const update = statements().find((s) => s.startsWith('UPDATE ind_applications'));
    expect(update).toBeTruthy();
    expect(update).toMatch(/AND organization_id = \$\d+ RETURNING/);
  });

  it('scopes the delete pre-check, so a foreign draft is a 404 and never reaches the transaction', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(appWith(7)).delete('/api/ind/applications/42');

    const check = statements().find((s) => s.includes('SELECT id, status, organization_id'));
    expect(check).toMatch(/WHERE id = \$1 AND organization_id = \$2/);
    expect(query.mock.calls[0][1]).toEqual(['42', 7]);
    expect(res.status).toBe(404);
    expect(transaction).not.toHaveBeenCalled();
  });
});
