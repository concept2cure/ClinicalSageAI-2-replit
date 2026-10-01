/**
 * DELETE /api/device-projects/:id proves the caller owns the project before it
 * asks what the delete would destroy.
 *
 * projectDeletionHolds is deliberately unscoped: it judges every row the
 * cascade would remove, and its 409 names the anchored programs. This route
 * asked it first and scoped only the delete, so another organization's project
 * id could be answered with that organization's program ids before the
 * org-scoped delete said 404 — whenever RLS was not enforced. Its two sibling
 * deletes (projects-management, clients-routes) already proved ownership
 * first.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'device-projects-delete-ownership-32-chars';
});

const H = vi.hoisted(() => ({
  own: [] as unknown[],
  deleted: [] as unknown[],
  holds: vi.fn(async () => ({ anchoredPrograms: ['prog-of-another-org'], governedArtifacts: 0 })),
}));

vi.mock('../../db', () => {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => H.own }) }) }),
    delete: () => ({ where: () => ({ returning: async () => H.deleted }) }),
  };
  return { db: { transaction: async (fn: (t: unknown) => unknown) => fn(tx) } };
});
vi.mock('../../db/drizzle-queryable', () => ({ queryableFromDrizzle: () => ({}) }));
vi.mock('../../services/c2c/project-retention', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/c2c/project-retention')>()),
  projectDeletionHolds: (...a: unknown[]) => H.holds(...(a as [])),
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
  setAuditRowHeaders: () => undefined,
}));

import request from 'supertest';
import express from 'express';
import deviceProjectsRouter from '../device-projects';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 7, role: 'member', organizationId: 9 };
  req.tenantId = 9;
  next();
});
app.use('/api/device-projects', deviceProjectsRouter);

beforeEach(() => {
  H.holds.mockClear();
  H.own = [];
  H.deleted = [];
});

describe('DELETE /api/device-projects/:id — ownership before holds', () => {
  it("answers another organization's project with 404, and never asks what it holds", async () => {
    const res = await request(app).delete('/api/device-projects/41');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('prog-of-another-org');
    expect(H.holds).not.toHaveBeenCalled();
  });

  it('judges its own project before deleting it', async () => {
    H.own = [{ id: 5 }];
    H.holds.mockResolvedValueOnce({ anchoredPrograms: [], governedArtifacts: 0 });
    H.deleted = [{ id: 5, name: 'Infusion pump' }];
    const res = await request(app).delete('/api/device-projects/5');
    expect(res.status).toBe(200);
    expect(H.holds).toHaveBeenCalledTimes(1);
  });
});
