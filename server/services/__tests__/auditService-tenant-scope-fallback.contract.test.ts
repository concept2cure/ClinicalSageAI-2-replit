/**
 * auditService.getAuditLog — a tenant-scoped read must never be answered by a
 * store that cannot be tenant-scoped.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `getAuditLog` reads Drizzle `audit_logs` first, applying
 * `eq(auditLogs.tenantId, orgId)`. If that path is unavailable it fell through
 * to `TamperProofAuditLog.search`, passing userId / resourceType / fromDate /
 * toDate — and dropping `tenantId`, because that search has no tenant parameter
 * to accept. It has none because `audit.tamper_proof_log` HAS NO TENANT COLUMN
 * (db/migrations/20260813_audit_tamper_proof_log.sql:64). Its query is
 * `SELECT * FROM audit.tamper_proof_log WHERE 1=1` plus optional filters, and
 * the table lives in schema `audit`, which both tenant sweeps skip — they filter
 * `WHERE c.table_schema = 'public'` — so no RLS policy covers it either.
 *
 * So the caller asked for one tenant's Part 11 audit trail, the primary path
 * threw, and the fallback answered for EVERY tenant — as an array, which the
 * caller could not distinguish from a correct answer. An error that WIDENS a
 * result set is worse than one that surfaces, and it is the inverse of this
 * repo's "an error is never rendered as an empty result" rule.
 *
 * Nothing reaches it today (`queryAuditEvents` in services/audit/auditLogger.ts
 * is the only caller, and nothing imports that). This test exists so the first
 * route that DOES wire it up cannot inherit the behaviour silently.
 *
 * The fix is a refusal, not a filter: with no tenant column there is no correct
 * answer to give. Giving the table a tenant column and a policy is WO-13.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { searchSpy, errorSpy } = vi.hoisted(() => ({
  searchSpy: vi.fn(),
  errorSpy: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: errorSpy,
    debug: vi.fn(),
  }),
}));

/**
 * `db: null` is what forces the fallback. `getDrizzle()` imports '../db' and
 * returns `db ?? null`, so a null db skips the tenant-scoped primary path
 * entirely — the same state as a database that is up but whose Drizzle handle
 * failed to resolve.
 */
vi.mock('../../db', () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn() };
  return { pool, getPool: () => pool, db: null };
});

/**
 * The fallback store, standing in for audit.tamper_proof_log. It returns rows
 * belonging to two different tenants — which is not a contrivance, it is what
 * an unfiltered `SELECT * FROM audit.tamper_proof_log` returns on any estate
 * with more than one customer.
 */
vi.mock('../../lib/tamper-proof-audit', () => ({
  TamperProofAuditLog: class {},
  AuditEventType: {},
  getTamperProofAuditLog: () => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    search: searchSpy,
  }),
}));

import auditService from '../auditService';

const CROSS_TENANT_ROWS = [
  { id: 'a', resource_type: 'ind_application', resource_id: '1', details: { tenant: 5 } },
  { id: 'b', resource_type: 'ind_application', resource_id: '2', details: { tenant: 99 } },
];

beforeEach(() => {
  searchSpy.mockReset();
  searchSpy.mockResolvedValue(CROSS_TENANT_ROWS);
  errorSpy.mockClear();
});

describe('getAuditLog refuses a tenant-scoped read the fallback cannot honour', () => {
  it('throws rather than returning another tenant’s audit rows', async () => {
    await expect(auditService.getAuditLog({ tenantId: 5 })).rejects.toThrow(
      'AUDIT_LOG_TENANT_SCOPE_UNAVAILABLE',
    );

    // The point is not only that it throws — it is that the unscoped query was
    // never issued. A refusal that still ran the query would have leaked the
    // rows into logs, metrics, or a later cache.
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('treats organizationId as the same scope request as tenantId', async () => {
    // getAuditLog accepts either name (`filters?.tenantId ?? filters?.organizationId`).
    // A refusal that honoured only one of them would leave the other as a live
    // bypass, which is how the original defect survived: the primary path reads
    // both, the fallback read neither.
    await expect(auditService.getAuditLog({ organizationId: 99 })).rejects.toThrow(
      'AUDIT_LOG_TENANT_SCOPE_UNAVAILABLE',
    );
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('says why it refused, naming the tenant, so the failure is diagnosable', async () => {
    await expect(auditService.getAuditLog({ tenantId: 5 })).rejects.toThrow();

    const said = errorSpy.mock.calls.some(
      ([msg, ctx]) =>
        String(msg).includes('cannot be tenant-scoped') &&
        (ctx as { tenantId?: number })?.tenantId === 5,
    );
    expect(said).toBe(true);
  });

  /**
   * The other half of "verify by making the check fail": prove the refusal is
   * scoped to the case it exists for. If this test went red, the fix would have
   * broken every unscoped audit read — a refusal that refuses everything is not
   * a smaller bug than the leak, just a louder one.
   */
  it('still serves an UNSCOPED read from the fallback — no tenant asked, none owed', async () => {
    const rows = await auditService.getAuditLog({ resourceType: 'ind_application' });

    expect(rows).toEqual(CROSS_TENANT_ROWS);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy.mock.calls[0][0]).toMatchObject({ resourceType: 'ind_application' });
  });
});
