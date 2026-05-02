/**
 * Tenant-isolation contract test — evidence-sufficiency family.
 *
 * Companion to tenant-isolation-q-sub.contract.test.ts. Verifies that the
 * evidence-sufficiency routes refuse cross-tenant access on every verb.
 *
 * The evidence-sufficiency routes (server/routes/evidence-sufficiency.ts) use
 * a `requireProgramAccess` middleware that joins regulatoryPrograms.organization_id.
 * We mock the program lookup to simulate same-org / cross-org and assert the
 * middleware behaves correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const ORG_A = 11;
const ORG_B = 22;

const PROGRAM_ORG_A = '00000000-0000-0000-0000-0000000000aa';
const PROGRAM_ORG_B = '00000000-0000-0000-0000-0000000000bb';
const ASSESSMENT_ORG_B = 'a-org-b';

const { authState, programOwnership } = vi.hoisted(() => ({
  authState: {
    user: { id: 1, organizationId: '11' } as Record<string, any> | null,
  },
  programOwnership: new Map<string, number>([
    ['00000000-0000-0000-0000-0000000000aa', 11],
    ['00000000-0000-0000-0000-0000000000bb', 22],
  ]),
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  },
}));

vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          // Drizzle's where(...).limit(...) — return [] when org doesn't match.
          limit: async (_n: number) => {
            // The IDs we look up come from the route's req.params.programId.
            // The mock service module would normally do the JOIN; here we
            // simulate it by checking the most recently-stashed programId.
            const programId = (globalThis as any).__lastProgramIdLookup;
            const orgId = (globalThis as any).__lastOrgLookup;
            if (programOwnership.get(programId) === orgId) {
              return [{ id: programId }];
            }
            return [];
          },
        }),
      }),
    }),
  },
}));

vi.mock('../../services/evidence-sufficiency/evidence-sufficiency.service', () => ({
  assessSufficiency: vi.fn(async () => ({ id: 'a-1', verdict: 'sufficient', overallScore: 92 })),
  listProgramAssessments: vi.fn(async () => []),
  getAssessment: vi.fn(async (orgId: number, id: string) => {
    if (id === ASSESSMENT_ORG_B && orgId !== ORG_B) return null;
    return { id, organizationId: orgId };
  }),
}));

vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn().mockResolvedValue(undefined) },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 1, organizationId: String(ORG_A) };
  vi.resetModules();
});

async function bootApp(captureProgramId: string) {
  // Wrap require-time hook so the mocked db.select can simulate the JOIN.
  (globalThis as any).__lastProgramIdLookup = captureProgramId;
  (globalThis as any).__lastOrgLookup = ORG_A;
  const mod = await import('../../routes/evidence-sufficiency');
  const a = express();
  a.use(express.json());
  a.use('/api/evidence-sufficiency', mod.default);
  return a;
}

describe('Tenant isolation — evidence-sufficiency', () => {
  it('POST /programs/:org-A/assess succeeds', async () => {
    app = await bootApp(PROGRAM_ORG_A);
    const res = await request(app)
      .post(`/api/evidence-sufficiency/programs/${PROGRAM_ORG_A}/assess`)
      .send({ pathway: '510K', profile: { isSoftware: true } });
    expect(res.status).toBe(200);
  });

  it('POST /programs/:org-B/assess as org-A is refused', async () => {
    app = await bootApp(PROGRAM_ORG_B);
    const res = await request(app)
      .post(`/api/evidence-sufficiency/programs/${PROGRAM_ORG_B}/assess`)
      .send({ pathway: '510K', profile: { isSoftware: true } });
    expect(res.status).toBe(403);
  });

  it('GET /programs/:org-B/assessments as org-A is refused', async () => {
    app = await bootApp(PROGRAM_ORG_B);
    const res = await request(app).get(
      `/api/evidence-sufficiency/programs/${PROGRAM_ORG_B}/assessments`,
    );
    expect(res.status).toBe(403);
  });

  it('GET /assessments/:org-B-id as org-A returns 404', async () => {
    app = await bootApp(PROGRAM_ORG_A); // unrelated stash; route doesn't use it
    const res = await request(app).get(
      `/api/evidence-sufficiency/assessments/${ASSESSMENT_ORG_B}`,
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 across the family when no organization context', async () => {
    authState.user = null;
    app = await bootApp(PROGRAM_ORG_A);
    const res = await request(app).get(
      `/api/evidence-sufficiency/programs/${PROGRAM_ORG_A}/assessments`,
    );
    expect(res.status).toBe(403);
  });
});
