/**
 * GET /api/mdx/vault/:artifactId/audit — one Vault artifact's own audit trail.
 *
 * The Vault drawer read GET /api/mdx/audit?record=<id>. Production refuses that
 * prefix (the org-wide audit log is not a launch surface), so on a deployed
 * Vault the drawer could only report a failed read; with nothing selected it
 * fetched the org's latest events with no record filter at all. This route is
 * under the Vault's own prefix and reads only the artifact's trail, after
 * checking that the artifact is the caller's organization's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import mdxVaultRouter from '../mdx-vault';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/mdx', mdxVaultRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/mdx/vault/:artifactId/audit', () => {
  it('403s without an organization, and reads nothing', async () => {
    const res = await request(appWith(null)).get('/api/mdx/vault/art-1/audit');
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("404s an artifact that is not this organization's, and reads no audit row", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get('/api/mdx/vault/art-9/audit');
    expect(res.status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, args] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/FROM concept2cure_artifacts\s+WHERE organization_id = \$1/);
    expect(args).toEqual([7, 'art-9']);
  });

  it("reads the trail recorded against either of the artifact's ids, in the caller's tenant", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, artifact_id: 'art-1' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 5, user_id: 12, actor_name: 'Ana Author', action: 'update', table_name: 'concept2cure_artifacts',
          record_id: 'art-1', new_values: {}, created_at: new Date('2026-09-30T10:00:00Z'),
          sha256_chain: 'a'.repeat(64), hmac_seal: null,
        }],
      });
    const res = await request(appWith(7)).get('/api/mdx/vault/art-1/audit?limit=3');
    expect(res.status).toBe(200);
    const [sql, args] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toMatch(/WHERE al\.tenant_id = \$1/);
    expect(sql).toMatch(/al\.record_id = ANY\(\$2::text\[\]\)/);
    expect(args).toEqual([7, ['1', 'art-1'], 3]);
    expect(res.body.data.events).toHaveLength(1);
    expect(res.body.data.events[0]).toMatchObject({ id: 'A-5', actorName: 'Ana Author', chain: 'chained' });
  });

  it('refuses a limit it will not serve', async () => {
    const res = await request(appWith(7)).get('/api/mdx/vault/art-1/audit?limit=500');
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('says the audit store is missing rather than showing an empty trail', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, artifact_id: 'art-1' }] })
      .mockRejectedValueOnce(Object.assign(new Error('relation "audit_logs" does not exist'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/mdx/vault/art-1/audit');
    expect(res.status).toBe(503);
  });
});
