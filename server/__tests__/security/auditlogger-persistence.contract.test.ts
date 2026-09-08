/**
 * Part 11 contract test — the audit/auditLogger surface persists, it is not
 * in-memory-only.
 *
 * `logAuditEvent` (and the convenience helpers + the `AuditLogger` class that
 * delegate to it) previously pushed events to a process-local array that was
 * lost on restart and was neither queryable across instances nor tamper-evident
 * (§11.10(e) gap, QA_REPORT #4). Every event is now ALSO forwarded to the
 * canonical `auditService` (audit_logs + tamper-proof hash-chain log). This test
 * locks that forwarding and its field mapping, and that the best-effort
 * persistence layer can never break a caller. Mocks the persistent store; no DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logAction } = vi.hoisted(() => ({
  // Typed param so `logAction.mock.calls[0][0]` is the forwarded entry (not an
  // empty-tuple element) — keeps the field-mapping assertions below type-safe.
  // Typed to the real AuditWriteResult shape — including the optional `error`
  // — so mockResolvedValueOnce can express a failed write below.
  logAction: vi.fn(
    async (
      _entry: Record<string, any>,
    ): Promise<{ persisted: boolean; chained: boolean; tamperProof: boolean; error?: string }> => ({
      persisted: true,
      chained: true,
      tamperProof: true,
    }),
  ),
}));

// auditLogger imports auditService via '../auditService'; intercept that module.
vi.mock('../../services/auditService', () => ({
  default: { logAction },
}));

/* The module builds its logger at import time with createScopedLogger('audit'),
   so the only way to observe the "record was lost" line is to own the factory. */
const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), error: logError, warn: vi.fn(), debug: vi.fn() }),
  createContextLogger: () => ({ info: vi.fn(), error: logError, warn: vi.fn(), debug: vi.fn() }),
}));

import {
  logAuditEvent,
  logDataChange,
  logExport,
  AuditLogger,
} from '../../services/audit/auditLogger';

beforeEach(() => {
  vi.clearAllMocks();
  logAction.mockImplementation(async () => ({ persisted: true, chained: true, tamperProof: true }));
});

describe('Part 11 — auditLogger forwards every event to the persistent store', () => {
  it('logAuditEvent persists through auditService with a mapped entry', async () => {
    const outcome = await logAuditEvent({
      category: 'document',
      severity: 'info',
      action: 'opened',
      userId: 'u1',
      organizationId: 'org7',
      resourceType: 'document',
      resourceId: 'doc42',
      metadata: { foo: 'bar' },
      success: true,
    });

    // The return is the persistence OUTCOME. It used to be `audit_<ts>_<rand>`,
    // an id that indexed nothing — not the audit_logs key, and never looked up
    // in the in-memory store either — so `typeof id === 'string'` was the only
    // assertion it could support.
    expect(outcome).toMatchObject({ persisted: true, chained: true });
    expect(logAction).toHaveBeenCalledTimes(1);
    const entry = logAction.mock.calls[0]![0];
    expect(entry).toMatchObject({
      action: 'document.opened',
      resourceType: 'document',
      resourceId: 'doc42',
      organizationId: 'org7',
      userId: 'u1',
    });
    // metadata + envelope fields are carried in details
    expect(entry.details).toMatchObject({
      foo: 'bar',
      category: 'document',
      severity: 'info',
      success: true,
    });
  });

  it('falls back to the category as resourceType when no resource is named', async () => {
    await logAuditEvent({
      category: 'authentication',
      severity: 'warning',
      action: 'login',
      userId: 'u1',
      organizationId: 'org7',
      success: false,
    });
    expect(logAction.mock.calls[0]![0]).toMatchObject({
      action: 'authentication.login',
      resourceType: 'authentication',
    });
  });

  it('carries previousValue/newValue for data-change events', async () => {
    await logDataChange('u1', 'org7', 'ind_section', 's1', 'update', { a: 1 }, { a: 2 });
    const entry = logAction.mock.calls[0]![0];
    expect(entry.action).toBe('data_change.ind_section_update');
    expect(entry.details).toMatchObject({ previousValue: { a: 1 }, newValue: { a: 2 } });
  });

  it('the AuditLogger class delegate also persists', async () => {
    await new AuditLogger().log({
      action: 'packet_built',
      userId: 'u1',
      organizationId: 'org7',
      resourceType: 'defense_packet',
      resourceId: 'p1',
    });
    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction.mock.calls[0]![0]).toMatchObject({
      action: 'system.packet_built',
      resourceType: 'defense_packet',
      resourceId: 'p1',
    });
  });

  /**
   * This asserted resilience to a REJECTION, which auditService.logAction cannot
   * produce. Every await inside it — the chained audit_logs transaction and the
   * tamper-proof log — sits in its own try/catch, and it ends in a plain
   * `return`; that is the documented contract the dead-audit-catch CI gate
   * enforces elsewhere, and it was re-verified against the source here rather
   * than assumed. Mocking a rejection therefore tested a state the system has no
   * way to reach, while the state it DOES reach — a write that resolves having
   * persisted nothing — went unasserted.
   */
  it('a lost audit record never breaks the caller, and is reported', async () => {
    logAction.mockResolvedValueOnce({
      persisted: false,
      chained: false,
      tamperProof: false,
      error: 'db down',
    });

    const outcome = await logExport('u1', 'org7', 'pdf', ['r1', 'r2']);

    // The export itself must survive — an audit outage may not destroy the user
    // action it exists to record.
    expect(outcome.persisted).toBe(false);
    expect(logAction).toHaveBeenCalledTimes(1);
    // …and the loss must be loud. A §11.10(e) record that vanished silently is
    // the failure this whole module was rewritten to prevent.
    expect(logError).toHaveBeenCalled();
    expect(String(logError.mock.calls[0]?.[0])).toMatch(/NOT persisted/i);
  });
});
