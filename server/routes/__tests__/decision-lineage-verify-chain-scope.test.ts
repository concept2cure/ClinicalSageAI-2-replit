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
  logError: vi.fn(),
}));

vi.mock('../../services/auditService', () => ({ default: { verifyChain: () => h.verifyChain() } }));
vi.mock('../../middleware/requirePlatformAdmin.js', () => ({ resolvePlatformAdmin: async () => h.platformAdmin }));
vi.mock('../../middleware/requirePlatformAdmin', () => ({ resolvePlatformAdmin: async () => h.platformAdmin }));
vi.mock('../../services/audit/tenant-chain-verdict.js', () => ({ verifyTenantChainOnAdminScope: (o: number) => h.tenantVerdict(o) }));
vi.mock('../../services/audit/tenant-chain-verdict', () => ({ verifyTenantChainOnAdminScope: (o: number) => h.tenantVerdict(o) }));
// What the route logs as the reason a verdict could not be given (P-72 slice 1b): it never reaches the body.
vi.mock('../../utils/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createScopedLogger: (scope: string) => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: (m: string, c?: unknown) => h.logError(scope, m, c) }),
}));
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
  h.logError.mockReset();
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

/*
 * P-72 slice 1b (docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/). The tenant walk runs on the admin scope,
 * which sees the organisation's rows only through the policies' platform arm. With that arm removed, on a
 * production-shaped database, it read none of 3 chained rows: the verifier now says so (ok null, with a reason),
 * and a walk over no chained row checked nothing. Neither is "VERIFIED", and the report attests to neither.
 */
describe('P-72 slice 1b: a verdict over rows the walk did not read, or over none, is not VERIFIED', () => {
  const NOT_READ = "The verifier could read 0 of this organisation's 3 chained audit_logs rows, so the chain is not verified.";

  it("a walk that could not read every chained row is no verdict, and the walk's own reason is the one logged", async () => {
    h.tenantVerdict.mockResolvedValue({
      ok: null, rowsChecked: 0, legacyRows: 0, sequencedRows: 0, reason: NOT_READ,
      head: { ...HEAD, status: 'unavailable', verified: false, reason: 'head not verified against the anchor: not checked' },
    });
    const res = await request(appFor(7)).get('/api/decision-lineage/verify-chain');
    expect([res.status, res.body.chainIntegrity, res.body.entriesVerified]).toEqual([503, 'UNVERIFIABLE', 0]);
    expect(h.logError).toHaveBeenCalledWith('decision-lineage-api', 'chain verification could not run', { scope: 'organization', reason: NOT_READ });
  });

  it('an organisation with no chained row is not VERIFIED over nothing, and its report attests to nothing', async () => {
    h.tenantVerdict.mockResolvedValue({ ok: true, rowsChecked: 0, legacyRows: 0, sequencedRows: 0, head: HEAD });
    const res = await request(appFor(7)).get('/api/decision-lineage/verify-chain');
    expect([res.status, res.body.chainIntegrity, res.body.complianceStatus]).toEqual([503, 'UNVERIFIABLE', 'UNVERIFIABLE']);
    expect(h.logError).toHaveBeenCalledWith('decision-lineage-api', 'chain verification could not run', {
      scope: 'organization', reason: expect.stringMatching(/^No chained rows exist for this organisation/),
    });
    const report = await request(appFor(7)).get('/api/decision-lineage/compliance-report');
    expect(report.body.chainIntegrity).toMatchObject({ scope: 'organization', status: 'UNVERIFIABLE', entriesVerified: 0 });
    expect(report.body.complianceFrameworks.find((f: { framework: string }) => f.framework === 'FDA 21 CFR Part 11').status).toBe('UNVERIFIABLE');
    expect(report.body.attestation).toBeNull();
  });
});
