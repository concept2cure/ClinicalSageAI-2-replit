/**
 * What MCP says about a sequence that is no longer in use (P-86, founder
 * 2026-11-01; launch row D7).
 *
 * A retired sequence leaves the live set, so getSequence answers NOT_FOUND for
 * it. An MCP client asking about its id is told it was retired, when, by whom
 * and why (c2c_get_sequence_status), and the list says it shows the sequences
 * in use only. A removed row with no retirement record is reported as not in
 * use, with no reason invented for it. An id of another organisation keeps the
 * existing refusal. MCP names neither the act nor its door
 * (ana-cannot-retire-sequence.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  getSequence: vi.fn(), listLeaves: vi.fn(), listSequences: vi.fn(), readRetiredSequence: vi.fn(),
}));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    getSequence: (...a: unknown[]) => svc.getSequence(...a),
    listLeaves: (...a: unknown[]) => svc.listLeaves(...a),
    listSequences: (...a: unknown[]) => svc.listSequences(...a),
    readRetiredSequence: (...a: unknown[]) => svc.readRetiredSequence(...a),
  };
});

import { getSequenceStatus, listSequences } from '../tools/catalog';
import { SubmissionError } from '../../services/submission-service/submission-service';

const ctx = {
  principal: { userId: 3, organizationId: 7, organizationUuid: null, role: 'member', email: null, clientId: 'test', scopes: ['c2c:read'], tokenUse: 'platform' },
  ana: { organizationId: 7, userId: 3, organizationUuid: null },
} as any;
const NOT_FOUND = new SubmissionError('NOT_FOUND', 'Sequence not found for this organization.');

beforeEach(() => {
  for (const f of Object.values(svc)) f.mockReset();
});

describe('c2c_get_sequence_status on a sequence no longer in use', () => {
  it('a retired sequence: when, by whom, with what meaning and why; kept as history', async () => {
    svc.getSequence.mockRejectedValue(NOT_FOUND);
    svc.readRetiredSequence.mockResolvedValue({
      state: 'retired', sequenceId: 41, sequenceNumber: '0000', region: 'fda',
      retiredOn: '2026-11-08', retiredBy: 'Riley Retirer', meaning: 'responsibility', reason: 'The test send found a content defect in Module 3.',
    });
    const out = await getSequenceStatus.run({ sequence_id: 41 }, ctx);
    expect(out).toMatchObject({
      kind: 'ok',
      summary: 'Sequence 0000 (fda) was retired on 2026-11-08 UTC by Riley Retirer (responsibility). ' +
        'Reason: The test send found a content defect in Module 3. It is kept as history; it is not sent, filed or built on.',
      data: { sequence: { id: 41, sequenceNumber: '0000', region: 'fda', inUse: false, retired: true, retiredOn: '2026-11-08', retiredBy: 'Riley Retirer', meaning: 'responsibility', reason: 'The test send found a content defect in Module 3.' } },
    });
    expect(svc.readRetiredSequence).toHaveBeenCalledWith(41, { organizationId: 7 });
    expect(svc.listLeaves).not.toHaveBeenCalled();
  });

  it('a retirer the record no longer names is said so, not left blank', async () => {
    svc.getSequence.mockRejectedValue(NOT_FOUND);
    svc.readRetiredSequence.mockResolvedValue({
      state: 'retired', sequenceId: 41, sequenceNumber: '0001', region: 'fda', retiredOn: '2026-11-08', retiredBy: null, meaning: 'responsibility', reason: 'Wrong cover letter.',
    });
    const out = await getSequenceStatus.run({ sequence_id: 41 }, ctx);
    expect(out.kind === 'ok' && out.summary).toMatch(/^Sequence 0001 \(fda\) was retired on 2026-11-08 UTC by a person the record no longer names \(responsibility\)\./);
  });

  it('a removed sequence with no retirement record is not in use, and nothing more is claimed', async () => {
    svc.getSequence.mockRejectedValue(NOT_FOUND);
    svc.readRetiredSequence.mockResolvedValue({ state: 'removed', sequenceId: 42, sequenceNumber: '0000', region: 'fda' });
    const out = await getSequenceStatus.run({ sequence_id: 42 }, ctx);
    expect(out).toEqual({
      kind: 'ok',
      summary: 'Sequence 0000 (fda) is not in use; no retirement is recorded for it.',
      data: { sequence: { id: 42, sequenceNumber: '0000', region: 'fda', inUse: false, retired: false } },
    });
  });

  it("another organisation's id, or none at all, keeps the existing refusal", async () => {
    svc.getSequence.mockRejectedValue(NOT_FOUND);
    svc.readRetiredSequence.mockResolvedValue(null);
    expect(await getSequenceStatus.run({ sequence_id: 43 }, ctx)).toEqual({ kind: 'refused', reason: 'Sequence not found for this organization. (code NOT_FOUND)', data: undefined });
  });

  it('a refusal other than not-found is not looked up as a retirement', async () => {
    svc.getSequence.mockRejectedValue(new SubmissionError('INVALID_STATE', 'The submission is archived.'));
    expect(await getSequenceStatus.run({ sequence_id: 44 }, ctx)).toMatchObject({ kind: 'refused', reason: 'The submission is archived. (code INVALID_STATE)' });
    expect(svc.readRetiredSequence).not.toHaveBeenCalled();
  });

  it('a retirement record that cannot be read is a refusal, never "not in use"', async () => {
    svc.getSequence.mockRejectedValue(NOT_FOUND);
    svc.readRetiredSequence.mockRejectedValue(new Error('connection reset'));
    const out = await getSequenceStatus.run({ sequence_id: 45 }, ctx);
    expect(out).toMatchObject({ kind: 'refused', reason: expect.stringMatching(/^Sequence #45 is not in use in this organisation, and whether it was retired could not be read/) });
  });
});

describe('c2c_list_sequences lists the sequences in use', () => {
  it('says so when there is none, and points to the status tool for a retired one', async () => {
    svc.listSequences.mockResolvedValue([]);
    const out = await listSequences.run({ submission_id: 12 }, ctx);
    expect(out).toMatchObject({ kind: 'ok', summary: 'Submission #12 has no sequence in use.' });
    expect(listSequences.description).toContain('Sequences in use only; c2c_get_sequence_status reports a retired one.');
  });
});
