/**
 * The connector's governed write records the reason it asks for.
 *
 * 2026-11-10. `c2c_file_draft_for_review` took a `reason` it described as
 * "recorded in the audit trail", and never gave it to upsertLeaf: the
 * placement's LEAF_CREATED row carried no reason, and the tool echoed the
 * caller's own words back as if it had. upsertLeaf has taken `reason` since the
 * human door (PUT /api/submissions/sequences/:seqId/leaves) began requiring one
 * through `requireGovernedReason`; this door now does the same, with the same
 * floor, and refuses without writing when the reason does not meet it.
 *
 * The service is stubbed: what it does with the reason is pinned in
 * server/routes/__tests__/submissions-leaf-reason.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GOVERNED_REASON_MIN } from '../../../shared/constants/governed-reason';

const { upsertLeaf, getSequence } = vi.hoisted(() => ({
  upsertLeaf: vi.fn(),
  getSequence: vi.fn(),
}));
vi.mock('../../services/submission-service/submission-service', () => ({ upsertLeaf, getSequence }));

import { fileDraftForReview } from '../tools/governed';

const CTX = { principal: { organizationId: 7, userId: 42 }, config: { appBaseUrl: 'https://app.example.invalid' } } as any;
const PLACEMENT = { sequence_id: 11, section_code: '2.5', title: 'Clinical Overview', lifecycle_op: 'new' as const };
const LEAF = { id: 301, sequenceId: 11, sectionCode: '2.5', title: 'Clinical Overview', lifecycleOp: 'new', documentTable: null, documentId: null };

const run = (reason: unknown) => fileDraftForReview.run({ ...PLACEMENT, reason } as any, CTX);

beforeEach(() => {
  vi.clearAllMocks();
  upsertLeaf.mockResolvedValue({ ...LEAF, auditTrail: { persisted: true, chained: true } });
  getSequence.mockResolvedValue({ id: 11, submissionId: 5, sequenceNumber: '0001', status: 'draft' });
});

describe('c2c_file_draft_for_review records its reason', () => {
  it('gives the stated reason to the placement, trimmed and otherwise as given', async () => {
    const outcome = await run('  Clinical overview is ready for medical review  ');
    expect(outcome.kind).toBe('ok');
    expect(upsertLeaf).toHaveBeenCalledTimes(1);
    expect(upsertLeaf.mock.calls[0][0]).toMatchObject({ sequenceId: 11, sectionCode: '2.5', reason: 'Clinical overview is ready for medical review' });
    expect(upsertLeaf.mock.calls[0][1]).toEqual({ organizationId: 7, userId: 42 });
    expect((outcome as any).data).toMatchObject({ reason: 'Clinical overview is ready for medical review', reasonRecorded: true });
  });

  it.each([
    ['one under the floor', 'x'.repeat(GOVERNED_REASON_MIN - 1)],
    ['spaces padded to the floor', `ok${' '.repeat(GOVERNED_REASON_MIN)}`],
    ['none', undefined],
  ])('refuses %s with the server’s sentence, and places nothing', async (_label, reason) => {
    const outcome = await run(reason);
    expect(outcome).toEqual({
      kind: 'refused',
      reason: `A reason for change of at least ${GOVERNED_REASON_MIN} characters is required. Nothing was filed.`,
    });
    expect(upsertLeaf).not.toHaveBeenCalled();
    expect(getSequence).not.toHaveBeenCalled();
  });

  it('does not say a reason was recorded when no audit row carries it', async () => {
    upsertLeaf.mockResolvedValueOnce({ ...LEAF, auditTrail: null, unchanged: true });
    expect(((await run('Clinical overview is ready for review')) as any).data).toMatchObject({ unchanged: true, reasonRecorded: false });

    upsertLeaf.mockResolvedValueOnce({ ...LEAF, auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'not written' } });
    expect(((await run('Clinical overview is ready for review')) as any).data).toMatchObject({ reasonRecorded: false });
  });

  it('declares the same floor in its input schema, and says where the reason goes', () => {
    const schema = z.object(fileDraftForReview.inputSchema);
    const input = { ...PLACEMENT, reason: 'x'.repeat(GOVERNED_REASON_MIN - 1) };
    expect(schema.safeParse(input).success).toBe(false);
    expect(schema.safeParse({ ...input, reason: 'x'.repeat(GOVERNED_REASON_MIN) }).success).toBe(true);
    expect(fileDraftForReview.inputSchema.reason.description).toMatch(/audit row/);
  });
});
