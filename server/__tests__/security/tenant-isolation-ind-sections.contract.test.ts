/**
 * Tenant-isolation contract test — IND Sections family.
 *
 * Regression guard for a cross-tenant IDOR: server/routes/ind-sections.ts
 * derived organizationId as
 *   parseInt(req.query.organization_id) || req.user.organizationId || ... || 0
 * so a query param took precedence over the JWT — an authed user could read
 * another org's IND section live statuses via ?organization_id=, or hit org 0
 * when none was supplied. Org scope must come from the authenticated JWT only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { ORG_A, ATTACKER_TARGET_ORG, calls, authState } = vi.hoisted(() => ({
  ORG_A: 7,
  ATTACKER_TARGET_ORG: 999,
  calls: [] as Array<{ sql: string; params: any[] }>,
  authState: { orgId: 7 as number | null },
}));

vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [] };
    }),
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  calls.length = 0;
  authState.orgId = ORG_A;

  const mod = await import('../../routes/ind-sections');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  app.use('/api/ind-sections', mod.default);
});

const liveStatusCalls = () => calls.filter(c => /organization_id = \$2/.test(c.sql));

describe('Tenant isolation — IND sections read', () => {
  it('uses the JWT org and ignores a spoofed ?organization_id', async () => {
    const res = await request(app).get(
      `/api/ind-sections?project_id=5&organization_id=${ATTACKER_TARGET_ORG}`
    );
    expect(res.status).toBe(200);
    const live = liveStatusCalls();
    expect(live.length).toBeGreaterThan(0);
    for (const c of live) {
      // params = [projectId, organizationId]
      expect(c.params[1]).toBe(ORG_A);
      expect(c.params).not.toContain(ATTACKER_TARGET_ORG);
    }
  });

  it('/progress is JWT-scoped too', async () => {
    const res = await request(app).get(
      `/api/ind-sections/progress?project_id=5&organization_id=${ATTACKER_TARGET_ORG}`
    );
    expect(res.status).toBe(200);
    for (const c of liveStatusCalls()) {
      expect(c.params[1]).toBe(ORG_A);
      expect(c.params).not.toContain(ATTACKER_TARGET_ORG);
    }
  });

  it('returns 403 when there is no authenticated org (no silent org-0 fallback)', async () => {
    authState.orgId = null;
    await request(app).get('/api/ind-sections?project_id=5').expect(403);
    await request(app).get('/api/ind-sections/progress?project_id=5').expect(403);
    expect(liveStatusCalls()).toHaveLength(0);
  });
});
