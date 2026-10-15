/**
 * DP-77 (security review of 2026-10-01, evening): GET /api/decision-lineage/verify-chain
 * and /compliance-report, in server/routes/decision-lineage.ts, ran the estate-wide
 * verifier of the Part 11 store (auditService.verifyChain → TamperProofAuditLog.verifyChain:
 * SELECT * over every organisation's rows, and on a valid chain a platform row appended
 * to the one global chain) for any signed-in member. Every call loaded the whole store
 * into the API process and wrote a row; a break anywhere was reported, with its
 * sequence number, to every organisation.
 *
 * The rule is IAM-26's (GET /api/c2c/actions/verify-chain): a platform administrator
 * gets the estate verdict; everyone else gets their own organisation's chain verdict
 * (tenant-chain-verdict.ts), another organisation's break unnamed, and nothing written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  platformAdmin: false,
  verifyChain: vi.fn(),
  tenantVerdict: vi.fn(),
  queryDecisions: vi.fn(async () => [] as unknown[]),
}));

vi.mock('../../services/auditService', () => ({ default: { verifyChain: () => h.verifyChain() } }));
vi.mock('../../middleware/requirePlatformAdmin.js', () => ({ resolvePlatformAdmin: async () => h.platformAdmin }));
vi.mock('../../middleware/requirePlatformAdmin', () => ({ resolvePlatformAdmin: async () => h.platformAdmin }));
vi.mock('../../services/audit/tenant-chain-verdict.js', () => ({ verifyTenantChainOnAdminScope: (o: number) => h.tenantVerdict(o) }));
vi.mock('../../services/audit/tenant-chain-verdict', () => ({ verifyTenantChainOnAdminScope: (o: number) => h.tenantVerdict(o) }));
vi.mock('../../services/workflow/DecisionLineageService', () => ({
  decisionLineageService: { queryDecisions: (...a: unknown[]) => h.queryDecisions(...(a as [])) },
}));

import lineageRouter from '../decision-lineage';

const ESTATE = { ran: true, valid: true, entriesVerified: 90_000, verifiedAt: '2026-10-01T21:00:00.000Z' };
const HEAD = { verified: true, status: 'verified', anchorKey: null, anchoredAt: null, breaks: [] };

function appFor(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: org };
    next();
  });
  app.use('/api/decision-lineage', lineageRouter);
  return app;
}

beforeEach(() => {
  h.platformAdmin = false;
  h.verifyChain.mockReset().mockResolvedValue(ESTATE);
  h.tenantVerdict.mockReset().mockResolvedValue({ ok: true, rowsChecked: 12, legacyRows: 0, sequencedRows: 12, head: HEAD });
  h.queryDecisions.mockReset().mockResolvedValue([]);
});

describe('GET /api/decision-lineage/verify-chain (DP-77)', () => {
  it("a member gets their own organisation's chain verdict, and the estate verifier does not run", async () => {
    const res = await request(appFor(7)).get('/api/decision-lineage/verify-chain');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.verifyChain, 'the estate verifier ran for a member').not.toHaveBeenCalled();
    expect(h.tenantVerdict).toHaveBeenCalledWith(7);
    expect(res.body).toMatchObject({ scope: 'organization', chainIntegrity: 'VERIFIED', entriesVerified: 12 });
  });

  it("a break in the member's chain is reported, and another organisation's break is not named", async () => {
    h.tenantVerdict.mockResolvedValue({
      ok: false,
      rowsChecked: 12,
      legacyRows: 0,
      sequencedRows: 12,
      brokenAt: { id: 'row-9', tenantId: 8, reason: 'chain mismatch' },
      head: HEAD,
    });
    const res = await request(appFor(7)).get('/api/decision-lineage/verify-chain');
    expect(res.body.chainIntegrity).toBe('INTEGRITY_FAILURE');
    expect(JSON.stringify(res.body)).not.toContain('row-9');
  });

  it('an anchor that cannot be read is no verdict (503 UNVERIFIABLE)', async () => {
    h.tenantVerdict.mockResolvedValue({ ok: null, rowsChecked: 12, legacyRows: 0, sequencedRows: 12, head: { ...HEAD, status: 'unavailable', verified: false } });
    const res = await request(appFor(7)).get('/api/decision-lineage/verify-chain');
    expect(res.status).toBe(503);
    expect(res.body.chainIntegrity).toBe('UNVERIFIABLE');
  });

  it('a member with no organisation is refused, and nothing runs', async () => {
    const res = await request(appFor(null)).get('/api/decision-lineage/verify-chain');
    expect(res.status).toBe(403);
    expect(h.verifyChain).not.toHaveBeenCalled();
    expect(h.tenantVerdict).not.toHaveBeenCalled();
  });

  it('control: a platform administrator gets the estate verdict', async () => {
    h.platformAdmin = true;
    const res = await request(appFor(7)).get('/api/decision-lineage/verify-chain');
    expect(res.status).toBe(200);
    expect(h.verifyChain).toHaveBeenCalled();
    expect(res.body).toMatchObject({ scope: 'estate', chainIntegrity: 'VERIFIED', entriesVerified: 90_000 });
  });
});

describe('GET /api/decision-lineage/compliance-report (DP-77)', () => {
  it("a member's report states their organisation's chain, and the estate verifier does not run", async () => {
    const res = await request(appFor(7)).get('/api/decision-lineage/compliance-report');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.verifyChain).not.toHaveBeenCalled();
    expect(res.body.chainIntegrity).toMatchObject({ scope: 'organization', status: 'VERIFIED', entriesVerified: 12 });
    expect(res.body.organizationId).toBe(7);
  });

  it('a member with no organisation gets no report across every organisation', async () => {
    const res = await request(appFor(null)).get('/api/decision-lineage/compliance-report');
    expect(res.status).toBe(403);
    expect(h.queryDecisions).not.toHaveBeenCalled();
  });
});
