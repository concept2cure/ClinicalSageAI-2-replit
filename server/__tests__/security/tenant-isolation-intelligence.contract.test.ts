/**
 * Tenant-isolation contract test — Intelligence router fail-open guard.
 *
 * server/routes/intelligence.ts derived its org via a getOrgId(req) helper
 * that returned `user.organizationId ?? user.orgId ?? 0` — so a request with
 * no authenticated org context was silently scoped to organization 0 across
 * all 14 handlers. getOrgId now rejects (403) when no valid org is present.
 * This guards a representative sample of the routes against regressing to the
 * fail-open-to-org-0 behaviour.
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

const { authState } = vi.hoisted(() => ({ authState: { orgId: null as number | null } }));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.orgId = null;
  const mod = await import('../../routes/intelligence');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  app.use('/api/intelligence', (mod as any).default);
});

describe('Tenant isolation — Intelligence fail-open guard', () => {
  it('403s instead of falling back to org 0 when no org context is present', async () => {
    const paths = [
      '/api/intelligence/projects/1/recommendations',
      '/api/intelligence/projects/1/readiness',
    ];
    for (const p of paths) {
      const res = await request(app).get(p);
      // The point: it must NOT 200 with org-0 data. 403 (guard) is expected;
      // a 404 (no such route) would mean the sample path drifted — fail loudly.
      expect(res.status, `${p} should be guarded, got ${res.status}`).toBe(403);
    }
  });
});
