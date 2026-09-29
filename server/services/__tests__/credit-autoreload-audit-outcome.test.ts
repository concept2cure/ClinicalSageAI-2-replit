/**
 * `setAutoReload` — the governed billing rule change, and its §11.10(e) row.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The upsert committed, then `await logAuditEvent(...)` ran inside a try/catch
 * whose comment called it best-effort, and its resolved `AuditWriteResult` was
 * thrown away. `logAuditEvent` does not reject when the row fails to persist (it
 * resolves `persisted: false`), so the catch could only ever see a bug, and a
 * rule change with no audit row returned exactly what one with a row did. The
 * Billing surface (UsageBilling, PUT /api/billing/credits/auto-reload) then said
 * the change was saved, which it was — with no record of who made it.
 *
 * ── What these tests hold ────────────────────────────────────────────────────
 * The change still stands when the row is lost — an audit outage must not undo
 * an admin's edit — and the result now says which happened, in the canonical
 * `AuditRowOutcome` shape the client transport recognises.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const logAuditEventMock = vi.fn();

vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
vi.mock('../audit/auditLogger.js', () => ({ logAuditEvent: (...a: unknown[]) => logAuditEventMock(...a) }));

const ROW = {
  organization_id: 7,
  enabled: true,
  threshold_cents: 1000,
  topup_cents: 5000,
  updated_by: 3,
  reason: 'Keep the pilot running',
  updated_at: new Date('2026-09-24T00:00:00Z'),
};

let upserted = false;
beforeEach(() => {
  queryMock.mockReset();
  logAuditEventMock.mockReset();
  upserted = false;
  // Answered by statement, not by call order: the settings read returns nothing
  // before the upsert (platform defaults) and the saved row after it.
  queryMock.mockImplementation(async (sql: string) => {
    if (/INSERT INTO credit_autoreload_settings/.test(sql)) {
      upserted = true;
      return { rows: [] };
    }
    if (/FROM credit_autoreload_settings/.test(sql)) return { rows: upserted ? [ROW] : [] };
    return { rows: [] };
  });
});

async function change() {
  const { setAutoReload } = await import('../credit-ledger');
  return setAutoReload(7, { enabled: true, thresholdCents: 1000, topupCents: 5000 }, { userId: 3 }, 'Keep the pilot running');
}

describe('setAutoReload carries its audit-row outcome', () => {
  it('a lost row: the settings are saved and the result says the row is missing', async () => {
    logAuditEventMock.mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: 'connection refused' });

    const result = await change();

    expect(result.settings).toMatchObject({ organizationId: 7, enabled: true, thresholdCents: 1000, topupCents: 5000 });
    expect(result.auditTrail).toEqual({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: expect.any(String) });
    // The store's own text is logged, never carried toward the tenant.
    expect(JSON.stringify(result)).not.toContain('connection refused');
    // The write itself ran.
    expect(upserted).toBe(true);
  });

  it('a writer that throws is still reported as a lost row, not as success', async () => {
    logAuditEventMock.mockRejectedValueOnce(new Error('bug below the guard'));
    const result = await change();
    expect(result.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
  });

  it('a written row says so, with whether it is the chained row a reader can retrieve', async () => {
    logAuditEventMock.mockResolvedValueOnce({ persisted: true, chained: true, tamperProof: true });
    const result = await change();
    expect(result.auditTrail).toEqual({ persisted: true, chained: true });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'credit_autoreload.update', resourceType: 'credit_autoreload_settings' }),
    );
  });
});
