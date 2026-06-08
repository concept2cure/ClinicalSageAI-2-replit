/**
 * Audit logger durability contract — the general-purpose audit logger now
 * persists to `application_audit_log` (durable + queryable) instead of only an
 * in-memory array, and reads DB-first with an in-memory fallback. Mocks the DB
 * seam; runs without a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../db', () => ({ query: queryMock }));

import { logAuditEvent, queryAuditEvents } from '../auditLogger';

// logAuditEvent invokes the persist query synchronously (before returning), so a
// single microtask tick is enough to let the mock settle.
const flush = () => Promise.resolve();

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockImplementation(async (sql: string) => {
    if (/INSERT INTO application_audit_log/i.test(sql)) return { rows: [] };
    if (/SELECT COUNT/i.test(sql)) return { rows: [{ total: 0 }] };
    if (/SELECT \* FROM application_audit_log/i.test(sql)) return { rows: [] };
    return { rows: [] };
  });
});

describe('auditLogger durability', () => {
  it('persists every event to application_audit_log with a faithful field mapping', async () => {
    await logAuditEvent({
      category: 'authentication',
      severity: 'info',
      action: 'login',
      userId: 'u1',
      organizationId: 'org9',
      metadata: { method: 'totp' },
      success: true,
    });
    await flush();

    const insert = queryMock.mock.calls.find(c => /INSERT INTO application_audit_log/i.test(c[0]));
    expect(insert).toBeTruthy();
    const params = insert![1] as unknown[];
    expect(params[1]).toBe('org9'); // organization_id
    expect(params[2]).toBe('u1'); // user_id
    expect(params[3]).toBe('authentication'); // category
    expect(params[4]).toBe('info'); // severity
    expect(params[5]).toBe('login'); // action
    expect(params[10]).toBe(JSON.stringify({ method: 'totp' })); // metadata
    expect(params[13]).toBe(true); // success
  });

  it('reads from the database first and maps rows back to AuditEvent', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/SELECT COUNT/i.test(sql)) return { rows: [{ total: 1 }] };
      if (/SELECT \* FROM application_audit_log/i.test(sql)) {
        return {
          rows: [
            {
              id: 'audit_db_1',
              organization_id: 'org9',
              user_id: 'u7',
              category: 'export',
              severity: 'info',
              action: 'export_ectd',
              resource_type: 'export',
              resource_id: null,
              previous_value: null,
              new_value: null,
              metadata: { count: 3 },
              ip_address: '10.0.0.1',
              user_agent: null,
              success: true,
              error_message: null,
              event_timestamp: '2026-06-08T00:00:00.000Z',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await queryAuditEvents({ organizationId: 'org9' });
    expect(res.total).toBe(1);
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({
      id: 'audit_db_1',
      organizationId: 'org9',
      action: 'export_ectd',
      category: 'export',
      success: true,
    });
    expect(res.events[0].timestamp).toBeInstanceOf(Date);
  });

  it('falls back to the in-memory cache when the database is unavailable', async () => {
    // Persist throws (swallowed); the event still lands in the in-memory cache.
    queryMock.mockImplementation(async () => {
      throw new Error('database unavailable');
    });
    await logAuditEvent({
      category: 'authorization',
      severity: 'warning',
      action: 'suspicious_login',
      userId: 'u2',
      organizationId: 'fallback-org',
      success: false,
    });
    await flush();

    // The DB read throws too → the wrapper serves from memory.
    const res = await queryAuditEvents({ organizationId: 'fallback-org' });
    expect(res.events.some(e => e.action === 'suspicious_login')).toBe(true);
  });
});
