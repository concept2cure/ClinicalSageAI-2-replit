/**
 * Tenant-isolation contract test — post-market document family.
 *
 * Companion to tenant-isolation-q-sub.contract.test.ts and
 * tenant-isolation-evidence-sufficiency.contract.test.ts. Verifies the
 * `/api/post-market/...` and `/api/gspr/...` routes refuse cross-tenant
 * access on every verb that mutates state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const ORG_A = 31;
const ORG_B = 32;

const PROGRAM_ORG_A = '00000000-0000-0000-0000-0000000000a1';
const PROGRAM_ORG_B = '00000000-0000-0000-0000-0000000000b1';
const DOC_ORG_B = 'd-org-b';

const { authState } = vi.hoisted(() => ({
  authState: { user: { id: 1, organizationId: '31' } as Record<string, any> | null },
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  },
}));

// Mock the program-access JOIN: returns one row only when caller's org owns
// the program. The tests stash the expected (orgId, programId) before each
// call so the mock can simulate a real JOIN.
const programByOrg = new Map<string, number>([
  [PROGRAM_ORG_A, ORG_A],
  [PROGRAM_ORG_B, ORG_B],
]);

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const programId = (globalThis as any).__pmProgram;
            const orgId = (globalThis as any).__pmOrg;
            if (programByOrg.get(programId) === orgId) return [{ id: programId }];
            return [];
          },
        }),
      }),
    }),
  },
}));

vi.mock('../../services/gspr-postmarket/gspr.service', () => ({
  computeCoverage: vi.fn(),
  listCatalog: vi.fn(),
  listProgramMappings: vi.fn(async () => []),
  upsertMapping: vi.fn(async () => ({ id: 'm-1' })),
}));

vi.mock('../../services/gspr-postmarket/post-market.service', () => ({
  approveDocument: vi.fn(),
  createDocument: vi.fn(async () => ({ id: 'd-new' })),
  getDocument: vi.fn(async (orgId: number, id: string) => {
    if (id === DOC_ORG_B && orgId !== ORG_B) return null;
    return { id, organizationId: orgId };
  }),
  listProgramDocuments: vi.fn(async () => []),
  supersedeDocument: vi.fn(),
  updateDocument: vi.fn(),
  validateDocument: vi.fn(() => ({ valid: true, findings: [] })),
}));

vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue(undefined) },
}));

let app: express.Express;
let postMarketApp: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 1, organizationId: String(ORG_A) };
  vi.resetModules();
});

async function bootGspr(programId: string) {
  (globalThis as any).__pmProgram = programId;
  (globalThis as any).__pmOrg = ORG_A;
  const mod = await import('../../routes/gspr-postmarket');
  const a = express();
  a.use(express.json());
  a.use('/api/gspr', mod.default);
  return a;
}

async function bootPostMarket(programId: string) {
  (globalThis as any).__pmProgram = programId;
  (globalThis as any).__pmOrg = ORG_A;
  const mod = await import('../../routes/gspr-postmarket');
  const a = express();
  a.use(express.json());
  a.use('/api/post-market', (mod as any).postMarketRouter);
  return a;
}

describe('Tenant isolation — GSPR mappings', () => {
  it('POST /programs/:org-A/mappings succeeds', async () => {
    app = await bootGspr(PROGRAM_ORG_A);
    const res = await request(app)
      .post(`/api/gspr/programs/${PROGRAM_ORG_A}/mappings`)
      .send({ requirementId: 'r-1', applicability: 'applicable' });
    expect(res.status).toBe(200);
  });

  it('POST /programs/:org-B/mappings as org-A is refused', async () => {
    app = await bootGspr(PROGRAM_ORG_B);
    const res = await request(app)
      .post(`/api/gspr/programs/${PROGRAM_ORG_B}/mappings`)
      .send({ requirementId: 'r-1', applicability: 'applicable' });
    expect(res.status).toBe(403);
  });
});

describe('Tenant isolation — post-market documents', () => {
  it('GET /programs/:org-B/documents as org-A is refused', async () => {
    postMarketApp = await bootPostMarket(PROGRAM_ORG_B);
    const res = await request(postMarketApp).get(
      `/api/post-market/programs/${PROGRAM_ORG_B}/documents`,
    );
    expect(res.status).toBe(403);
  });

  it('GET /documents/:org-B-id as org-A returns 404', async () => {
    postMarketApp = await bootPostMarket(PROGRAM_ORG_A);
    const res = await request(postMarketApp).get(
      `/api/post-market/documents/${DOC_ORG_B}`,
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when no organization context', async () => {
    authState.user = null;
    postMarketApp = await bootPostMarket(PROGRAM_ORG_A);
    const res = await request(postMarketApp).get(
      `/api/post-market/documents/anything`,
    );
    expect(res.status).toBe(403);
  });
});
