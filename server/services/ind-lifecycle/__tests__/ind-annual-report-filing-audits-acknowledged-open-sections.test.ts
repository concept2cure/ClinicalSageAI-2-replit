/**
 * persistAnnualReport writes an audit row naming the actor, the acknowledged
 * open 312.33 section keys and the sequence they were filed in.
 *
 * What it used to do (until 2026-10-15): the acknowledgement existed only on the
 * HTTP response; the audit trail recorded the sequence's creation and nothing
 * about which open sections someone chose to file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  createSequence: vi.fn(async (input: Record<string, unknown>) => ({ id: 42, ...input })),
  upsertLeaf: vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input })),
  recordAuditRow: vi.fn(async () => ({ persisted: true, chained: true })),
}));
vi.mock('../../submission-service/submission-service', () => ({ createSequence: h.createSequence, upsertLeaf: h.upsertLeaf }));
vi.mock('../../audit/audit-write-outcome', () => ({ recordAuditRow: h.recordAuditRow }));

import { persistAnnualReport } from '../ind-lifecycle-persistence';

const ctx = { organizationId: 1, userId: 9 };

beforeEach(() => vi.clearAllMocks());

describe('the acknowledged open sections are on the audit trail', () => {
  it('records actor, section keys and sequence id, and returns the outcome', async () => {
    const out = await persistAnnualReport(31, '0003', ctx, undefined, { sectionKeys: ['ib_changes', 'outstanding_business'] });
    expect(h.recordAuditRow, 'no audit row recorded the acknowledgement').toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 1,
      userId: 9,
      resourceType: 'ectd_sequence',
      resourceId: 42,
      details: expect.objectContaining({ acknowledgedSectionKeys: ['ib_changes', 'outstanding_business'], sequenceNumber: '0003' }),
    }));
    expect(out.gapAcknowledgement).toEqual({
      sectionKeys: ['ib_changes', 'outstanding_business'],
      auditTrail: { persisted: true, chained: true },
    });
  });

  it('no acknowledgement, no row', async () => {
    const out = await persistAnnualReport(31, '0003', ctx);
    expect(h.recordAuditRow).not.toHaveBeenCalled();
    expect(out).not.toHaveProperty('gapAcknowledgement');
  });
});
