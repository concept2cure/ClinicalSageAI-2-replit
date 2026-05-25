/**
 * Tenant-isolation contract test — Documents family.
 *
 * Proves org-A cannot read, mutate, or delete org-B documents through
 * server/routes/document-routes.ts. The route gates every id-scoped
 * operation behind requireAuthedOrgId + storage.getDocument(id, orgId);
 * a foreign-tenant id must come back as undefined from storage and surface
 * as 404 (existence not enumerable) — never 200 with another org's data.
 *
 * Part of the cross-cutting tenant-isolation contract suite. See
 * docs/reports/MDX_BETA_BACKEND_PROGRESS_2026-05-01.md (C8/B7.1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Constants live inside vi.hoisted so they exist before the hoisted mock
// factories run (vi.hoisted lifts above all top-level statements).
const { ORG_A, ORG_B, DOC_ORG_A, DOC_ORG_B, store, authState } = vi.hoisted(() => {
  const ORG_A = 11;
  const ORG_B = 22;
  const DOC_ORG_A = 'doc-owned-by-org-a';
  const DOC_ORG_B = 'doc-owned-by-org-b';
  return {
    ORG_A,
    ORG_B,
    DOC_ORG_A,
    DOC_ORG_B,
    // Mocked storage mirrors the real contract: getDocument(id, organizationId)
    // returns the row only when the caller's org owns it, otherwise undefined.
    store: {
      ownership: new Map<string, number>([
        [DOC_ORG_B, ORG_B],
        [DOC_ORG_A, ORG_A],
      ]),
    },
    authState: {
      user: { id: 1, organizationId: ORG_A } as Record<string, unknown> | null,
    },
  };
});

vi.mock('../../storage', () => ({
  storage: {
    getDocument: vi.fn(async (id: string, organizationId: number) => {
      if (store.ownership.get(id) !== organizationId) return undefined;
      return { id, title: 'doc', currentVersionId: null };
    }),
    updateDocument: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    deleteDocument: vi.fn(async () => true),
  },
}));

vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 1, organizationId: ORG_A };

  const mod = await import('../../routes/document-routes');
  app = express();
  app.use(express.json());
  // Inject the JWT-derived user the way the real auth middleware would.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  });
  app.use('/api/documents', mod.default);
});

describe('Tenant isolation — Documents read', () => {
  it('org-A reading an org-B document gets 404', async () => {
    const res = await request(app).get(`/api/documents/${DOC_ORG_B}`);
    expect(res.status).toBe(404);
  });

  it('org-A reading its own document succeeds', async () => {
    const res = await request(app).get(`/api/documents/${DOC_ORG_A}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(DOC_ORG_A);
  });
});

describe('Tenant isolation — Documents update', () => {
  it('org-A patching an org-B document gets 404, no update performed', async () => {
    const { storage } = await import('../../storage');
    const res = await request(app)
      .patch(`/api/documents/${DOC_ORG_B}`)
      .send({ title: 'cross-tenant overwrite' });
    expect(res.status).toBe(404);
    expect((storage.updateDocument as any)).not.toHaveBeenCalled();
  });
});

describe('Tenant isolation — Documents delete', () => {
  it('org-A deleting an org-B document gets 404, no delete performed', async () => {
    const { storage } = await import('../../storage');
    const res = await request(app).delete(`/api/documents/${DOC_ORG_B}`);
    expect(res.status).toBe(404);
    expect((storage.deleteDocument as any)).not.toHaveBeenCalled();
  });
});

describe('Tenant isolation — Documents auth missing', () => {
  it('returns 403 when no organization context is present', async () => {
    authState.user = null;
    for (const path of [`/api/documents/${DOC_ORG_A}`, `/api/documents/${DOC_ORG_B}`]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(403);
    }
  });
});
