/**
 * recordIcsrAcknowledgment: an agency ACK closes a transmission only when it
 * names that transmission's message number, and `acknowledgedAt` is never the
 * platform's clock.
 *
 * Until 2026-10-15 (audit report_ind_ivd_irb finding 26):
 *  - an ACK whose message number could not be read skipped the mismatch check,
 *    so any pasted "AA" closed whichever transmitted row the operator chose;
 *  - `acknowledgedAt` was `new Date()` — the moment the platform recorded the
 *    ACK — stored in the column named for when the agency acknowledged it.
 *
 * Only the drizzle db (one in-memory row) and the audit writer are stubbed, as
 * in icsr-delivery-outcome.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { store, auditRows } = vi.hoisted(() => ({
  store: { row: null as Record<string, unknown> | null, updates: [] as Record<string, unknown>[] },
  auditRows: [] as Array<{ action: string; details?: Record<string, unknown> }>,
}));

vi.mock('../../../db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => Promise.resolve(store.row ? [{ ...store.row }] : []),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            store.updates.push(patch);
            store.row = { ...store.row, ...patch };
            return [{ ...store.row }];
          },
        }),
      }),
    }),
  };
  return { db: chain, pool: { query: async () => ({ rows: [], rowCount: 0 }) } };
});

vi.mock('../../audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async (row: { action: string; details?: Record<string, unknown> }) => {
    auditRows.push(row);
    return { persisted: true };
  }),
}));

import { recordIcsrAcknowledgment, IcsrTransmissionError } from '../ind-icsr-transmission-persistence';

const ctx = { organizationId: 7, userId: 11 };
const ACK = (body: string) => `<ichicsrAck>${body}<transmissionacknowledgmentcode>AA</transmissionacknowledgmentcode></ichicsrAck>`;

beforeEach(() => {
  store.row = {
    id: 'tx-1',
    organizationId: 7,
    submissionId: 3,
    gateway: 'FDA_FAERS',
    messageNumber: 'MSG-2026-0001',
    status: 'transmitted',
    transmittedAt: new Date('2026-06-15T00:00:00.000Z'),
    transportReceiptId: 'ESG-CORE-1',
    acknowledgedAt: null,
    ackCode: null,
    acknowledgedMessageNumber: null,
  };
  store.updates = [];
  auditRows.length = 0;
});

describe('recordIcsrAcknowledgment ties the ACK to this transmission', () => {
  it('refuses an ACK that names no message number, and records nothing', async () => {
    const err = await recordIcsrAcknowledgment('tx-1', ACK(''), ctx).catch((e: unknown) => e);
    expect(err, 'an ACK naming no message closed the transmission').toBeInstanceOf(IcsrTransmissionError);
    expect((err as IcsrTransmissionError).code).toBe('ACK_UNREADABLE');
    expect((err as Error).message).toMatch(/MSG-2026-0001/);
    expect(store.updates).toEqual([]);
    expect(store.row!.status).toBe('transmitted');
    expect(auditRows).toEqual([]);
  });

  it('refuses an ACK that names another message (unchanged behaviour)', async () => {
    const err = await recordIcsrAcknowledgment('tx-1', ACK('<messagenumb>MSG-2026-9999</messagenumb>'), ctx).catch((e: unknown) => e);
    expect((err as IcsrTransmissionError).code).toBe('ACK_MISMATCH');
    expect(store.updates).toEqual([]);
  });

  it("records an ACK naming this message, without writing the platform's clock as the agency's acknowledgement time", async () => {
    const row = await recordIcsrAcknowledgment('tx-1', ACK('<messagenumb>MSG-2026-0001</messagenumb>'), ctx);
    expect(row.status).toBe('acknowledged');
    expect(row.ackCode).toBe('AA');
    expect(row.acknowledgedMessageNumber).toBe('MSG-2026-0001');
    expect(row.acknowledgedAt, "acknowledgedAt was the platform's clock, not a time the agency stated").toBeNull();
    // When the platform recorded it is updatedAt, under its own name.
    expect(row.updatedAt).toBeInstanceOf(Date);
    expect(auditRows.map((a) => a.action)).toEqual(['IND_ICSR_ACKNOWLEDGED']);
  });
});
