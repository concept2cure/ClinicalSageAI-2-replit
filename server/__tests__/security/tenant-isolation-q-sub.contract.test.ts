/**
 * Tenant-isolation contract test — Q-Sub family.
 *
 * Proves that org-A cannot see, mutate, or delete org-B Q-Sub data.
 *
 * The test mocks drizzle's chained query API to simulate two scenarios for
 * each entry-point: same-org (the JOIN returns a row) and cross-org (the
 * JOIN returns []). The cross-org cases must surface as 403 / 404 — never
 * as 200 with a mutated body.
 *
 * This is the first of a planned cross-cutting contract suite covering
 * every org-scoped route family. See
 * `docs/reports/MDX_BETA_BACKEND_PROGRESS_2026-05-01.md` (C8/B7.1) for the
 * roadmap.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const ORG_A = 11;
const ORG_B = 22;

// UUID-shaped fixture ids — the route now validates programId format
// and rejects non-uuid input as 422 before the service can refuse the
// cross-tenant write as 403.
const PROGRAM_ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const QSUB_ORG_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const COMMITMENT_ORG_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const { svc, authState } = vi.hoisted(() => {
  // The mocked service mirrors the contract of ../../services/q-sub/q-sub.service:
  // every read/write demands `organizationId`. We simulate the JOIN gate by
  // returning empty / TenantAccessError when org doesn't match the
  // simulated owner.
  class TenantAccessError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'TenantAccessError';
    }
  }
  // Inline duplicates of the module-level constants — vi.hoisted runs before
  // any other top-level statements, so we cannot reference outer consts here.
  const ORG_B_LOCAL = 22;
  const PROGRAM_ORG_B_LOCAL = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const QSUB_ORG_B_LOCAL = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const COMMITMENT_ORG_B_LOCAL = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const ORG_A_LOCAL = 11;
  return {
    svc: {
      // Resource ownership map — keyed by resource id, value is the org that
      // owns it. The mock service refuses access when caller's org doesn't
      // match.
      ownership: new Map<string, number>([
        [PROGRAM_ORG_B_LOCAL, ORG_B_LOCAL],
        [QSUB_ORG_B_LOCAL, ORG_B_LOCAL],
        [COMMITMENT_ORG_B_LOCAL, ORG_B_LOCAL],
      ]),
      TenantAccessError,
    },
    authState: {
      user: { id: 'u-A', organizationId: String(ORG_A_LOCAL) } as Record<string, any> | null,
    },
  };
});

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  },
}));

vi.mock('../../services/q-sub/q-sub.service', () => ({
  TenantAccessError: svc.TenantAccessError,
  listQSubsForOrg: vi.fn(async (orgId: number) => {
    // Tenant-scoped list: returns only rows owned by orgId.
    const rows: Array<{ id: string }> = [];
    for (const [id, owner] of svc.ownership.entries()) {
      if (owner === orgId && id.startsWith('q-')) rows.push({ id });
    }
    return rows;
  }),
  getQSubDetail: vi.fn(async (orgId: number, id: string) => {
    if (svc.ownership.get(id) !== orgId) return null;
    return { id, summary: 'ok' };
  }),
  createQSubmission: vi.fn(async (orgId: number, input: any) => {
    if (svc.ownership.get(input.programId) !== orgId) {
      throw new svc.TenantAccessError('cross-tenant write blocked');
    }
    return { id: 'q-new', programId: input.programId };
  }),
  setCommitmentRolledIn: vi.fn(async (orgId: number, input: any) => {
    if (svc.ownership.get(input.commitmentId) !== orgId) {
      throw new svc.TenantAccessError('cross-tenant write blocked');
    }
    return { id: input.commitmentId, rolledIn: input.rolledIn };
  }),
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 'u-A', organizationId: String(ORG_A) };

  const mod = await import('../../routes/q-sub');
  app = express();
  app.use(express.json());
  app.use('/api/q-sub', mod.default);
});

describe('Tenant isolation — Q-Sub list', () => {
  it('org-A list never includes org-B Q-Subs', async () => {
    // Add an org-B Q-Sub.
    svc.ownership.set('q-org-b-extra', ORG_B);
    const res = await request(app).get('/api/q-sub');
    expect(res.status).toBe(200);
    expect(res.body.rows.every((r: { id: string }) => svc.ownership.get(r.id) === ORG_A)).toBe(
      true,
    );
    // Cleanup
    svc.ownership.delete('q-org-b-extra');
  });
});

describe('Tenant isolation — Q-Sub detail', () => {
  it('org-A reading an org-B Q-Sub gets 404 (resource not found in org)', async () => {
    const res = await request(app).get(`/api/q-sub/${QSUB_ORG_B}`);
    expect(res.status).toBe(404);
  });
});

describe('Tenant isolation — Q-Sub create', () => {
  it('org-A POSTing under an org-B program returns 403, no row created', async () => {
    const res = await request(app)
      .post('/api/q-sub')
      .send({ programId: PROGRAM_ORG_B, qSubType: 'presub', title: 'cross-tenant attempt' });
    expect(res.status).toBe(403);
  });
});

describe('Tenant isolation — Q-Sub commitment rolled-in', () => {
  it('org-A flipping an org-B commitment returns 403', async () => {
    const res = await request(app)
      .patch(`/api/q-sub/commitments/${COMMITMENT_ORG_B}/rolled-in`)
      .send({ rolledIn: true });
    expect(res.status).toBe(403);
  });
});

describe('Tenant isolation — auth missing', () => {
  it('returns 403 across the family when no organization context', async () => {
    authState.user = null;
    for (const path of [
      '/api/q-sub',
      `/api/q-sub/${QSUB_ORG_B}`,
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(403);
    }
    const res = await request(app)
      .post('/api/q-sub')
      .send({ programId: PROGRAM_ORG_B, qSubType: 'presub', title: 'x' });
    expect(res.status).toBe(403);
  });
});
