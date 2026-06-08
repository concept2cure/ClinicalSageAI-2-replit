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
  logAction: vi.fn(async (_entry: Record<string, any>) => {}),
}));

// auditLogger imports auditService via '../auditService'; intercept that module.
vi.mock('../../services/auditService', () => ({
  default: { logAction },
}));

import {
  logAuditEvent,
  logDataChange,
  logExport,
  AuditLogger,
} from '../../services/audit/auditLogger';

beforeEach(() => {
  vi.clearAllMocks();
  logAction.mockImplementation(async () => {});
});

describe('Part 11 — auditLogger forwards every event to the persistent store', () => {
  it('logAuditEvent persists through auditService with a mapped entry', async () => {
    const id = await logAuditEvent({
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

    expect(typeof id).toBe('string');
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

  it('a persistence failure never breaks the caller (best-effort)', async () => {
    logAction.mockRejectedValueOnce(new Error('db down'));
    // logExport must still resolve with an id even if the persistent write rejects.
    const id = await logExport('u1', 'org7', 'pdf', ['r1', 'r2']);
    expect(typeof id).toBe('string');
    expect(logAction).toHaveBeenCalledTimes(1);
  });
});
