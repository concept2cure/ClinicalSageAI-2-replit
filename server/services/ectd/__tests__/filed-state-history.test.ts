/**
 * Each document on file carries the acts that put it there (gap 6.2;
 * docs/design/ECTD_FILED_STATE_VIEW_2026-10-22.md).
 *
 * The fold of a submission's filed sequences kept only the last act on each
 * leaf, so the current view could say where a document is held but not how it
 * came to be there. The fold now keeps the acts, oldest first, carrying a
 * replaced leaf's acts into its replacement even under a new name. Compile and
 * transmit read the leaves only, unchanged.
 */
import { describe, expect, it } from 'vitest';
import { loadFiledStateBySubmission, loadLatestPriorManifestBySubmission, type PoolLike } from '../prior-sequence-loader';

const leaf = (ctdSection: string, fileName: string, md5: string, operation: string, extra: Record<string, unknown> = {}) => ({
  ctdSection, fileName, md5, operation, href: `m3/${fileName}`, leafId: `leaf-${fileName.replace(/\W/g, '-')}`, backbone: 'index.xml', ...extra,
});

function poolOf(rows: Array<{ sequence_number: string; leaf_manifest: unknown[] }>): PoolLike {
  return {
    async query(sql: string) {
      if (/FROM ectd_sequences\s+WHERE/i.test(sql)) {
        return { rows: rows.map((r) => ({ sequence_number: r.sequence_number, dispatch_status: 'sent' })) };
      }
      return { rows };
    },
  };
}

const SEQUENCES = [
  { sequence_number: '0000', leaf_manifest: [
    leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32), 'new'),
    leaf('2.5', 'overview.pdf', 'b'.repeat(32), 'new'),
    leaf('5.3.1', 'protocol.pdf', 'c'.repeat(32), 'new'),
  ] },
  { sequence_number: '0001', leaf_manifest: [
    // A replace under the same name, and a withdrawal.
    leaf('3.2.S.1', 'general.pdf', 'd'.repeat(32), 'replace', { modifiedFile: '../0000/index.xml#leaf-general-pdf' }),
    leaf('5.3.1', 'protocol.pdf', 'c'.repeat(32), 'delete', { modifiedFile: '../0000/index.xml#leaf-protocol-pdf' }),
  ] },
  { sequence_number: '0002', leaf_manifest: [
    // The withdrawn document filed again, and an addendum appended to the overview.
    leaf('5.3.1', 'protocol.pdf', 'e'.repeat(32), 'new'),
    leaf('2.5', 'overview-addendum.pdf', 'f'.repeat(32), 'append', { modifiedFile: '../0000/index.xml#leaf-overview-pdf' }),
  ] },
];

describe('the acts behind each document on file', () => {
  it('a replace under the same name keeps both acts, oldest first', async () => {
    const { leaves } = await loadFiledStateBySubmission(poolOf(SEQUENCES), { organizationId: 7, submissionId: 1 });
    const general = leaves.find((l) => l.fileName === 'general.pdf')!;
    expect(general.history.map((a) => [a.sequenceNumber, a.operation, a.md5[0]])).toEqual([['0000', 'new', 'a'], ['0001', 'replace', 'd']]);
  });

  it('a document withdrawn and filed again says so', async () => {
    const { leaves } = await loadFiledStateBySubmission(poolOf(SEQUENCES), { organizationId: 7, submissionId: 1 });
    const protocol = leaves.find((l) => l.fileName === 'protocol.pdf')!;
    expect(protocol.history.map((a) => [a.sequenceNumber, a.operation])).toEqual([['0000', 'new'], ['0001', 'delete'], ['0002', 'new']]);
  });

  it('an append is its own document on file; the one it adds to keeps its own history', async () => {
    const { leaves } = await loadFiledStateBySubmission(poolOf(SEQUENCES), { organizationId: 7, submissionId: 1 });
    expect(leaves.find((l) => l.fileName === 'overview.pdf')!.history.map((a) => a.operation)).toEqual(['new']);
    expect(leaves.find((l) => l.fileName === 'overview-addendum.pdf')!.history.map((a) => [a.sequenceNumber, a.operation])).toEqual([['0002', 'append']]);
  });

  it('a replacement under a new name takes the history with it; the old name filed again starts its own', async () => {
    const rows = [
      { sequence_number: '0000', leaf_manifest: [leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32), 'new')] },
      { sequence_number: '0001', leaf_manifest: [
        leaf('3.2.S.1', 'general-v2.pdf', 'b'.repeat(32), 'replace', { modifiedFile: '../0000/index.xml#leaf-general-pdf' })] },
      { sequence_number: '0002', leaf_manifest: [leaf('3.2.S.1', 'general.pdf', 'c'.repeat(32), 'new')] },
    ];
    const { leaves } = await loadFiledStateBySubmission(poolOf(rows), { organizationId: 7, submissionId: 1 });
    expect(leaves.find((l) => l.fileName === 'general-v2.pdf')!.history.map((a) => [a.sequenceNumber, a.operation, a.fileName]))
      .toEqual([['0000', 'new', 'general.pdf'], ['0001', 'replace', 'general-v2.pdf']]);
    expect(leaves.find((l) => l.fileName === 'general.pdf')!.history.map((a) => [a.sequenceNumber, a.operation])).toEqual([['0002', 'new']]);
  });

  it('the lifecycle read compile uses is the same fold, and carries no history', async () => {
    const prior = await loadLatestPriorManifestBySubmission(poolOf(SEQUENCES), { organizationId: 7, submissionId: 1, currentSequence: '0003' });
    expect(prior.leaves.map((l) => l.fileName).sort()).toEqual(['general.pdf', 'overview-addendum.pdf', 'overview.pdf', 'protocol.pdf']);
    expect(Object.keys(prior)).toEqual(['priorSequenceNumber', 'leaves']);
    expect(prior.leaves.every((l) => !('history' in l))).toBe(true);
  });
});
