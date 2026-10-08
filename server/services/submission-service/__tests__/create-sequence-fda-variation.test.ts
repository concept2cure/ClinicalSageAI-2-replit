/**
 * An FDA sequence is never a 'variation' (F19b). createSequence refuses a
 * direct API caller before anything is written, so a post-approval change is
 * never recorded as a sequence the packager would code as an amendment to the
 * original application. The reason is the market verdict's
 * (market-support.ts sequenceTypeRefusal). An EU variation is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ insert: vi.fn(), primaryRegion: 'fda' }));
vi.mock('../../../db', () => {
  const chain = { values: () => chain, returning: async () => { h.insert(); return [{ id: 9, type: 'variation' }]; } };
  const select = () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 1, organizationId: 7, primaryRegion: h.primaryRegion }] }) }) });
  return { db: { insert: () => chain, select }, pool: {} };
});
vi.mock('../../audit/audit-write-outcome', () => ({ recordAuditRow: vi.fn(async () => ({ ok: true })) }));

import { createSequence, SubmissionError } from '../submission-service';

const ctx = { organizationId: 7, userId: 3 };
const REASON = /^'Variation' is the EU term\. An FDA post-approval change is a supplement \(PAS, CBE-30 or CBE-0\)/;

describe('createSequence refuses an FDA variation', () => {
  beforeEach(() => { h.insert.mockReset(); h.primaryRegion = 'fda'; });

  it('refuses type variation on an FDA submission, with the reason, and writes nothing', async () => {
    await expect(createSequence({ submissionId: 1, region: 'fda', sequenceNumber: '0003', type: 'variation' } as never, ctx))
      .rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(REASON) });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('refuses it when only the submission is FDA, whatever region the caller names', async () => {
    await expect(createSequence({ submissionId: 1, region: 'eu', sequenceNumber: '0003', type: 'variation' } as never, ctx))
      .rejects.toBeInstanceOf(SubmissionError);
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('still creates an EU variation, and an FDA amendment', async () => {
    h.primaryRegion = 'eu';
    await expect(createSequence({ submissionId: 1, region: 'eu', sequenceNumber: '0003', type: 'variation' } as never, ctx))
      .resolves.toMatchObject({ id: 9 });
    h.primaryRegion = 'fda';
    await expect(createSequence({ submissionId: 1, region: 'fda', sequenceNumber: '0004', type: 'amendment' } as never, ctx))
      .resolves.toMatchObject({ id: 9 });
    expect(h.insert).toHaveBeenCalledTimes(2);
  });
});
