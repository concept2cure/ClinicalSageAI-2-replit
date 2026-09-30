/**
 * PATCH /api/mdx/industry-profile and PATCH /api/mdx/projects/:id/industry-profile
 * — changing what regulatory instruments a workspace is offered is an
 * administrator act (ported from #1136, b8e610b04).
 *
 * Both routes were reachable by any authenticated member of the organization.
 * The check is explicit and local — exact role-string match, no case folding —
 * rather than the shared requireRole middleware, whose .ts and .js twins take
 * incompatible signatures (varargs vs a single role), so which roles it checks
 * depends on which twin the import resolves to. An authorization decision must
 * not depend on the bundler.
 *
 * Pinned: a non-administrator gets 403 BEFORE validation or any database
 * access; an administrator (single `role` or expanded `roles` claim) reaches
 * the write; case variants are not admitted.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ dbTouched: 0, user: {} as Record<string, unknown> }));

function chain(result: unknown[]) {
  const c: any = {};
  for (const m of ['values', 'onConflictDoUpdate', 'from', 'where', 'limit', 'select']) {
    c[m] = () => c;
  }
  c.returning = async () => result;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock('../../db/requestDb', () => ({
  requestDb: () => {
    h.dbTouched += 1;
    return {
      insert: () => chain([{ organizationId: 7, programId: 'p' }]),
      select: () => chain([{ id: '11111111-2222-3333-4444-555555555555' }]),
    };
  },
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async () => ({ persisted: true, chained: true })),
}));
vi.mock('../../services/industry-context/resolver', () => ({ resolveEffectiveProjectContext: vi.fn() }));

let app: express.Express;
beforeEach(async () => {
  h.dbTouched = 0;
  const router = (await import('../mdx-industry-context')).default;
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 3, organizationId: 7, ...h.user };
    next();
  });
  app.use('/api/mdx', router);
});

const PROGRAM = '11111111-2222-3333-4444-555555555555';
const ORG_BODY = { primaryIndustry: 'biotech_pharma', reason: 'Client type corrected' };
const PROJ_BODY = { vertical: 'biopharma' };

describe('industry-profile PATCH routes are administrator-only', () => {
  for (const role of ['user', 'viewer', 'reviewer', 'ADMIN', 'Owner']) {
    it(`org PATCH refuses role "${role}" with 403 before touching the database`, async () => {
      h.user = { role, roles: [role] };
      const res = await request(app).patch('/api/mdx/industry-profile').send(ORG_BODY);
      expect(res.status).toBe(403);
      expect(h.dbTouched).toBe(0);
    });
  }

  it('org PATCH refuses a caller with no role claim at all', async () => {
    h.user = {};
    const res = await request(app).patch('/api/mdx/industry-profile').send(ORG_BODY);
    expect(res.status).toBe(403);
  });

  it('org PATCH refuses a non-admin even with an invalid body — the role check runs first', async () => {
    h.user = { role: 'user' };
    const res = await request(app).patch('/api/mdx/industry-profile').send({});
    expect(res.status).toBe(403);
  });

  it('project PATCH refuses a non-administrator with 403 before touching the database', async () => {
    h.user = { role: 'user', roles: ['user'] };
    const res = await request(app).patch(`/api/mdx/projects/${PROGRAM}/industry-profile`).send(PROJ_BODY);
    expect(res.status).toBe(403);
    expect(h.dbTouched).toBe(0);
  });

  for (const role of ['owner', 'admin', 'org_admin', 'super_admin']) {
    it(`org PATCH admits "${role}"`, async () => {
      h.user = { role };
      const res = await request(app).patch('/api/mdx/industry-profile').send(ORG_BODY);
      expect(res.status).toBe(200);
    });
  }

  it('admits an administrator named only in the expanded roles claim', async () => {
    h.user = { role: 'user', roles: ['user', 'org_admin'] };
    const res = await request(app).patch('/api/mdx/industry-profile').send(ORG_BODY);
    expect(res.status).toBe(200);
  });

  it('project PATCH admits an administrator', async () => {
    h.user = { role: 'admin' };
    const res = await request(app).patch(`/api/mdx/projects/${PROGRAM}/industry-profile`).send(PROJ_BODY);
    expect(res.status).toBe(200);
  });

  it('GET stays readable by any member', async () => {
    h.user = { role: 'user' };
    const res = await request(app).get('/api/mdx/industry-profile');
    expect(res.status).not.toBe(403);
  });
});
