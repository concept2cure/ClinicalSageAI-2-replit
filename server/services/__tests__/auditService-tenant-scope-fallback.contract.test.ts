/**
 * auditService and the tamper-proof store: a tenant-scoped read is answered
 * with that tenant's rows only, and every write names its tenant.
 *
 * ── THE DEFECT FIRST PINNED HERE (2026-09-10) ───────────────────────────────
 * `getAuditLog` reads Drizzle `audit_logs` first, applying
 * `eq(auditLogs.tenantId, orgId)`. If that path is unavailable it fell through
 * to `TamperProofAuditLog.search`, passing userId / resourceType / fromDate /
 * toDate — and dropping `tenantId`, because `audit.tamper_proof_log` had no
 * tenant column to filter on. The caller asked for one tenant's Part 11 audit
 * trail and the fallback answered for EVERY tenant, as an array the caller
 * could not tell from a correct answer. With no column there was no correct
 * answer, so the fix then was a refusal.
 *
 * ── WHAT IS TRUE NOW (2026-10-01, DP-28 / plan P1-27) ───────────────────────
 * The store carries `organization_id`
 * (db/migrations/20260813_audit_tamper_proof_log.sql, amended), every writer
 * names its tenant, and `search` filters on it. So the fallback is no longer
 * refused: it is asked for the tenant's rows and nothing else. Rows written
 * before the column existed carry no tenant and are not returned to a
 * tenant-scoped read (the migration header records the cut-over).
 * docs/evidence/D6/2026-10-01-tranche-4/P1-7-P1-27-residuals/.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { searchSpy, logSpy, errorSpy } = vi.hoisted(() => ({
  searchSpy: vi.fn(),
  logSpy: vi.fn(),
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
 * failed to resolve. A pool whose connect() fails makes the chained
 * audit_logs write fail (non-fatally), so a logAction call is observed at the
 * tamper-proof writer alone.
 */
vi.mock('../../db', () => {
  const pool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockRejectedValue(new Error('no database in this test')),
  };
  return { pool, getPool: () => pool, db: null };
});

vi.mock('../../lib/tamper-proof-audit', () => ({
  TamperProofAuditLog: class {},
  AuditConfigurationError: class extends Error {},
  AuditEventType: {},
  getTamperProofAuditLog: () => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    search: searchSpy,
    log: logSpy,
  }),
}));

import auditService from '../auditService';

const TENANT_5_ROWS = [{ id: 'a', resource_type: 'ind_application', organization_id: 5 }];

beforeEach(() => {
  searchSpy.mockReset();
  searchSpy.mockResolvedValue(TENANT_5_ROWS);
  logSpy.mockReset();
  logSpy.mockResolvedValue('entry-id');
  errorSpy.mockClear();
});

describe('getAuditLog’s fallback answers a tenant-scoped read with that tenant’s rows', () => {
  it('passes the tenant to the store as the filter', async () => {
    const rows = await auditService.getAuditLog({ tenantId: 5 });
    expect(rows).toEqual(TENANT_5_ROWS);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy.mock.calls[0][0]).toMatchObject({ organizationId: 5 });
  });

  it('treats organizationId as the same scope request as tenantId', async () => {
    // getAuditLog accepts either name (`filters?.tenantId ?? filters?.organizationId`).
    // A filter that honoured only one of them would leave the other as a live
    // bypass, which is how the original defect survived.
    await auditService.getAuditLog({ organizationId: 99 });
    expect(searchSpy.mock.calls[0][0]).toMatchObject({ organizationId: 99 });
  });

  it('an UNSCOPED read names no tenant — the store applies the caller’s scope itself', async () => {
    await auditService.getAuditLog({ resourceType: 'ind_application' });
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy.mock.calls[0][0]).toMatchObject({ resourceType: 'ind_application' });
    expect(searchSpy.mock.calls[0][0].organizationId).toBeUndefined();
  });

  it('a store failure is an error, not an empty audit trail', async () => {
    searchSpy.mockRejectedValueOnce(new Error('store down'));
    await expect(auditService.getAuditLog({ tenantId: 5 })).rejects.toThrow();
    // The unscoped read too: this used to answer [] — "no audit events" — when
    // the store could not be read at all.
    searchSpy.mockRejectedValueOnce(new Error('store down'));
    await expect(auditService.getAuditLog({ resourceType: 'x' })).rejects.toThrow();
  });
});

describe('logAction names the tenant on the tamper-proof row', () => {
  it('writes the entry’s tenant as the row’s organisation', async () => {
    const out = await auditService.logAction({
      tenantId: 5,
      userId: 7,
      action: 'update',
      resourceType: 'ind_application',
      resourceId: '1',
    });
    expect(out.tamperProof).toBe(true);
    expect(logSpy.mock.calls[0][3]).toMatchObject({ organizationId: 5 });
  });

  it('a non-numeric or missing tenant is left to the store to resolve from the session', async () => {
    await auditService.logAction({ userId: 7, action: 'update', resourceType: 'x' });
    expect(logSpy.mock.calls[0][3].organizationId).toBeUndefined();
  });
});
