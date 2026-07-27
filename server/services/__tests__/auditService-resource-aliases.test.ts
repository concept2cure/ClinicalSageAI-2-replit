/**
 * auditService.logAction — the audited object must survive whichever field name
 * the caller used.
 *
 * `AuditLogEntry` declared `resourceType` / `resourceId`. Sixteen call sites
 * across the routes pass `tableName` / `recordId` instead — a natural naming
 * for "this row of this table" — and logAction read neither. So on every one of
 * those calls the audit record stored resourceType 'unknown' and resourceId
 * 'unknown': the WHAT of a §11.10(e) record, silently dropped, while the call
 * site read correctly and compiled anywhere the object was widened to `any`.
 *
 * It surfaced as a type error in server/routes/onboarding-proposals.ts, which
 * is the only call site that passes a literal narrow enough for TypeScript to
 * check — the rest were invisible.
 *
 * Fixed at the service rather than at sixteen call sites across several
 * in-flight branches: the aliases are accepted and mapped, and `resourceType`
 * still wins when both are supplied.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { infoSpy } = vi.hoisted(() => ({ infoSpy: vi.fn() }));

vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({
    info: infoSpy,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// No database in this suite: what is under test is the resolution of the entry
// fields, which happens before any persistence path and is what the structured
// log line reports.
vi.mock('../../db', () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn() };
  return { pool, getPool: () => pool, db: null };
});

import auditService from '../auditService';

/** The `[AUDIT] <action> <resourceType>` line and its context. */
function lastAuditLog(): { message: string; context: Record<string, unknown> } | null {
  const call = [...infoSpy.mock.calls].reverse().find(([m]) => String(m).startsWith('[AUDIT]'));
  return call ? { message: String(call[0]), context: (call[1] ?? {}) as Record<string, unknown> } : null;
}

beforeEach(() => {
  infoSpy.mockClear();
});

describe('logAction resolves the audited object from either naming', () => {
  it('reads tableName / recordId, which sixteen call sites already use', async () => {
    await auditService.logAction({
      tenantId: '5',
      userId: '9',
      action: 'data_modify',
      tableName: 'organizations',
      recordId: '5',
      details: { reason: 'org admin renamed the organization' },
    });

    const log = lastAuditLog();
    expect(log, 'expected an [AUDIT] log line').not.toBeNull();
    // Pre-fix this read "[AUDIT] data_modify undefined" with resourceId 'unknown'.
    expect(log!.message).toBe('[AUDIT] data_modify organizations');
    expect(log!.context.resourceId).toBe('5');
  });

  it('still reads the canonical resourceType / resourceId', async () => {
    await auditService.logAction({
      tenantId: '5',
      userId: '9',
      action: 'data_access',
      resourceType: 'authoring_documents',
      resourceId: 'doc-1',
    });

    const log = lastAuditLog();
    expect(log!.message).toBe('[AUDIT] data_access authoring_documents');
    expect(log!.context.resourceId).toBe('doc-1');
  });

  it('prefers the canonical field when a caller supplies both', async () => {
    await auditService.logAction({
      tenantId: '5',
      userId: '9',
      action: 'data_modify',
      resourceType: 'canonical',
      tableName: 'alias',
      resourceId: 'canonical-id',
      recordId: 'alias-id',
    });

    const log = lastAuditLog();
    expect(log!.message).toBe('[AUDIT] data_modify canonical');
    expect(log!.context.resourceId).toBe('canonical-id');
  });

  it("records 'unknown' only when the caller genuinely named nothing", async () => {
    await auditService.logAction({ tenantId: '5', userId: '9', action: 'data_modify' });

    const log = lastAuditLog();
    expect(log!.message).toBe('[AUDIT] data_modify unknown');
    expect(log!.context.resourceId).toBe('unknown');
  });

  it('keeps working in the positional form', async () => {
    await auditService.logAction('5', '9', 'data_modify', 'organizations', '5');

    const log = lastAuditLog();
    expect(log!.message).toBe('[AUDIT] data_modify organizations');
    expect(log!.context.resourceId).toBe('5');
  });
});
