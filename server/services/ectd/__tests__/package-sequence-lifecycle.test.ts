/**
 * eCTD sequence lifecycle for a submission package.
 *
 * The engine could only ever build sequence 0000: it set no operation on any
 * leaf, so the packager refused every later sequence outright. These cases pin
 * the three things that make a follow-up sequence correct — the FILED history
 * (a bundle assembled and never transmitted is not on file), the fold of that
 * history into what is currently on file, and the refusals that are safer than
 * a guess.
 */
import { describe, it, expect } from 'vitest';
import {
  foldFiledState,
  planSequence,
  readFiledSequences,
  SequenceLifecycleRefusal,
  type FiledSequence,
} from '../package-sequence-lifecycle';
import { resolveSubmissionTypeCode, submissionTypeTerms } from '../controlled-vocab';

const leaf = (ctdSection: string, fileName: string, md5: string, extra: Record<string, unknown> = {}) =>
  ({ ctdSection, fileName, href: `m${ctdSection.charAt(0)}/${ctdSection}/${fileName}`, md5, ...extra }) as any;

const SEQ_0000: FiledSequence = {
  sequence: '0000', submissionType: 'original', sha256: 'a'.repeat(64), transmittalId: 1,
  filedAt: '2026-01-01T00:00:00.000Z',
  leaves: [leaf('2.5', 'clinical-overview.pdf', 'md5-co-v1'), leaf('3.2.P.1', 'description.pdf', 'md5-desc-v1')],
};
const desired = (rows: Array<[string, string, string]>) =>
  rows.map(([ctdSection, fileName, md5]) => ({ ctdSection, fileName, md5, title: fileName }));

/** The FDA vocabulary, reached through the same resolver the packager uses —
 *  a second, stricter copy here would refuse terms the backbone accepts. */
const FDA_VOCAB = {
  terms: submissionTypeTerms('fda')!,
  accepts: (v: string) => resolveSubmissionTypeCode(v) !== null,
};

describe('readFiledSequences', () => {
  it('reads a well-formed history oldest-first', () => {
    const later = { ...SEQ_0000, sequence: '0001' };
    expect(readFiledSequences({ filedSequences: [later, SEQ_0000] }).map((f) => f.sequence)).toEqual(['0000', '0001']);
  });

  it('DROPS an entry it cannot fully read, rather than reconstructing a partial prior state', () => {
    // A prior state missing a leaf computes `new` for something already on
    // file, so a half-readable inventory is no inventory.
    const partial = { ...SEQ_0000, sequence: '0002', leaves: [SEQ_0000.leaves[0], { ctdSection: '3.2.P.1' }] };
    const read = readFiledSequences({
      filedSequences: [SEQ_0000, partial, { sequence: 'nope', leaves: [] }, { sequence: '0003' }, null, 'x'],
    });
    expect(read.map((f) => f.sequence)).toEqual(['0000']);
  });

  it('is empty for a package that has filed nothing, or whose metadata is unreadable', () => {
    for (const md of [null, undefined, {}, { filedSequences: null }, { filedSequences: 'x' }]) {
      expect(readFiledSequences(md as any)).toEqual([]);
    }
  });
});

describe('foldFiledState', () => {
  it('is the fold of every sequence, not the last one: a later filing supersedes, an untouched leaf survives, and each carries the sequence that HOLDS it', () => {
    const seq1: FiledSequence = {
      ...SEQ_0000, sequence: '0001',
      leaves: [
        leaf('2.5', 'clinical-overview.pdf', 'md5-co-v2', { operation: 'replace' }),
        leaf('1.3.5.1', 'labeling.pdf', 'md5-lab-v1', { operation: 'new' }),
      ],
    };
    const fold = foldFiledState([SEQ_0000, seq1]);
    expect(fold).toHaveLength(3);
    const co = fold.find((f) => f.fileName === 'clinical-overview.pdf')!;
    expect(co.md5).toBe('md5-co-v2');
    expect(co.sequenceNumber).toBe('0001');           // the sequence that holds it now
    const desc = fold.find((f) => f.fileName === 'description.pdf')!;
    expect(desc.sequenceNumber).toBe('0000');          // untouched since the original
    expect(fold.some((f) => f.fileName === 'labeling.pdf')).toBe(true);
  });

  it('a withdrawn leaf drops out — it is no longer on file', () => {
    const withdrawal: FiledSequence = {
      ...SEQ_0000, sequence: '0001',
      leaves: [leaf('3.2.P.1', 'description.pdf', 'md5-desc-v1', { operation: 'delete' })],
    };
    const fold = foldFiledState([SEQ_0000, withdrawal]);
    expect(fold.map((f) => f.fileName)).toEqual(['clinical-overview.pdf']);
  });

  it('folds in sequence order however the history is ordered', () => {
    const seq1: FiledSequence = { ...SEQ_0000, sequence: '0001', leaves: [leaf('2.5', 'clinical-overview.pdf', 'md5-co-v2')] };
    expect(foldFiledState([seq1, SEQ_0000]).find((f) => f.fileName === 'clinical-overview.pdf')!.md5).toBe('md5-co-v2');
  });
});

describe('planSequence', () => {
  it('0000 is an original: every leaf is new, and no prior state is consulted', () => {
    const plan = planSequence({ sequence: '0000', filed: [], desired: desired([['2.5', 'a.pdf', 'm1'], ['3.2.P.1', 'b.pdf', 'm2']]) });
    expect(plan.summary).toMatchObject({ new: 2, replace: 0, unchanged: 0 });
    expect(plan.leaves.every((l) => l.operation === 'new')).toBe(true);
    expect(plan.omitted).toEqual([]);
  });

  it('a follow-up REPLACES what changed, keeps what is new as new, and OMITS what is byte-identical', () => {
    const plan = planSequence({
      sequence: '0001', submissionType: 'Efficacy Supplement', filed: [SEQ_0000],
      desired: desired([
        ['2.5', 'clinical-overview.pdf', 'md5-co-v2'],   // changed → replace
        ['3.2.P.1', 'description.pdf', 'md5-desc-v1'],   // identical → omitted
        ['1.3.5.1', 'labeling.pdf', 'md5-lab-v1'],       // never filed → new
      ]),
    });
    expect(plan.summary).toMatchObject({ new: 1, replace: 1, unchanged: 1 });
    const byName = Object.fromEntries(plan.leaves.map((l) => [l.fileName, l]));
    expect(byName['clinical-overview.pdf'].operation).toBe('replace');
    // The superseding leaf points at the sequence folder that actually holds
    // the version it replaces.
    expect(byName['clinical-overview.pdf'].modifiedFile).toContain('0000');
    expect(byName['labeling.pdf'].operation).toBe('new');
    expect(byName['description.pdf']).toBeUndefined();
    expect(plan.omitted).toEqual([{ ctdSection: '3.2.P.1', fileName: 'description.pdf' }]);
  });

  it('a leaf on file but absent from this assembly stays on file — absence is not withdrawal', () => {
    const plan = planSequence({
      sequence: '0001', submissionType: 'Efficacy Supplement', filed: [SEQ_0000],
      desired: desired([['2.5', 'clinical-overview.pdf', 'md5-co-v2']]),
    });
    expect(plan.leaves.map((l) => l.fileName)).toEqual(['clinical-overview.pdf']);
    expect(plan.summary.delete).toBe(0);
    expect(plan.summary.unchanged).toBe(1); // description.pdf, untouched and unmentioned
  });

  it('REFUSES a follow-up when nothing has been transmitted: an assembled-but-unsent 0000 is not on file', () => {
    expect(() => planSequence({ sequence: '0001', submissionType: 'Efficacy Supplement', filed: [], desired: desired([['2.5', 'a.pdf', 'm1']]) }))
      .toThrow(SequenceLifecycleRefusal);
    try {
      planSequence({ sequence: '0001', submissionType: 'Efficacy Supplement', filed: [], desired: desired([['2.5', 'a.pdf', 'm1']]) });
    } catch (e) {
      expect((e as SequenceLifecycleRefusal).code).toBe('NO_PRIOR_SEQUENCE');
      expect((e as Error).message).toMatch(/File sequence 0000 first/);
    }
  });

  it('REFUSES a sequence number already transmitted, for 0000 and for a follow-up alike', () => {
    const cases: Array<[string, FiledSequence[]]> = [
      ['0000', [SEQ_0000]],
      ['0001', [SEQ_0000, { ...SEQ_0000, sequence: '0001' }]],
    ];
    for (const [sequence, filed] of cases) {
      try {
        planSequence({ sequence, submissionType: 'Efficacy Supplement', filed, desired: desired([['2.5', 'a.pdf', 'm1']]) });
        throw new Error('expected a refusal');
      } catch (e) {
        expect((e as SequenceLifecycleRefusal).code, sequence).toBe('SEQUENCE_ALREADY_FILED');
      }
    }
  });

  it('REFUSES a follow-up that does not say what it is filing — only 0000 is an original by definition', () => {
    for (const submissionType of [undefined, null, '', '   ']) {
      try {
        planSequence({ sequence: '0001', submissionType, filed: [SEQ_0000], desired: desired([['2.5', 'a.pdf', 'm2']]) });
        throw new Error('expected a refusal');
      } catch (e) {
        expect((e as SequenceLifecycleRefusal).code, String(submissionType)).toBe('SUBMISSION_TYPE_REQUIRED');
      }
    }
  });

  it('REFUSES a term the region has no code for, and says which terms it does — an unfilable type is not a 500 out of the packager', () => {
    // 'amendment' is the ordinary English word for a follow-up filing and is
    // NOT an fdast term. It used to pass every check here and throw deep in
    // the FDA backbone builder, so the obvious value produced an unexplained
    // failure with no way back to one that works.
    try {
      planSequence({
        sequence: '0001', submissionType: 'amendment', filed: [SEQ_0000],
        desired: desired([['2.5', 'a.pdf', 'm2']]),
        submissionTypeVocabulary: FDA_VOCAB,
      });
      throw new Error('expected a refusal');
    } catch (e) {
      const r = e as SequenceLifecycleRefusal;
      expect(r.code).toBe('SUBMISSION_TYPE_UNKNOWN');
      expect(r.message).toContain('Efficacy Supplement');
      expect(r.acceptedSubmissionTypes).toContain('Annual Report');
    }
  });

  it('checks the vocabulary on 0000 too — a term the backbone cannot carry is unfilable whatever it diffs to', () => {
    expect(() => planSequence({
      sequence: '0000', submissionType: 'amendment', filed: [], desired: desired([['2.5', 'a.pdf', 'm1']]),
      submissionTypeVocabulary: FDA_VOCAB,
    })).toThrow(/not a submission type this region can file/);
  });

  it('accepts what the region accepts, and names its terms when it asks for one', () => {
    // The refusal has to point at values that resolve, or it sends the operator
    // back to guess again.
    for (const ok of ['Efficacy Supplement', 'supplement', 'Annual Report', 'original']) {
      expect(() => planSequence({
        sequence: '0001', submissionType: ok, filed: [SEQ_0000], desired: desired([['2.5', 'a.pdf', 'm2']]),
        submissionTypeVocabulary: FDA_VOCAB,
      }), ok).not.toThrow();
    }
    try {
      planSequence({ sequence: '0001', filed: [SEQ_0000], desired: desired([['2.5', 'a.pdf', 'm2']]), submissionTypeVocabulary: FDA_VOCAB });
      throw new Error('expected a refusal');
    } catch (e) {
      const r = e as SequenceLifecycleRefusal;
      expect(r.code).toBe('SUBMISSION_TYPE_REQUIRED');
      expect(r.message).not.toMatch(/amendment/);
      expect(r.message).toContain('Efficacy Supplement');
    }
  });

  it('a region with no vocabulary takes the operator at their word — the list is not invented', () => {
    // EMA, PMDA and Health Canada escape this value into the backbone as free
    // text; refusing a term against an FDA list would be wrong for them.
    expect(() => planSequence({
      sequence: '0001', submissionType: 'Type II variation', filed: [SEQ_0000],
      desired: desired([['2.5', 'a.pdf', 'm2']]), submissionTypeVocabulary: null,
    })).not.toThrow();
  });

  it('REFUSES a gap and a backfill alike — the only ordering this knows is the sequence number', () => {
    // With 0000 filed, 0002/0007/9999 were all accepted with identical plans, a
    // gap never named. Worse the other way: with 0000 and 0002 filed, a
    // backfilled 0001 was accepted and pointed modified-file at ../0002/ — a
    // sequence superseding one filed after it.
    for (const seq of ['0002', '0007', '9999']) {
      try {
        planSequence({ sequence: seq, submissionType: 'Efficacy Supplement', filed: [SEQ_0000], desired: desired([['2.5', 'a.pdf', 'm9']]) });
        throw new Error('expected a refusal');
      } catch (e) {
        expect((e as SequenceLifecycleRefusal).code, seq).toBe('SEQUENCE_OUT_OF_ORDER');
        expect((e as Error).message, seq).toContain('the next is 0001');
      }
    }
    const filed = [SEQ_0000, { ...SEQ_0000, sequence: '0002' }];
    try {
      planSequence({ sequence: '0001', submissionType: 'Efficacy Supplement', filed, desired: desired([['2.5', 'a.pdf', 'm9']]) });
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as SequenceLifecycleRefusal).code).toBe('SEQUENCE_OUT_OF_ORDER');
      expect((e as Error).message).toMatch(/diffed against filings made after it/);
    }
    // The next one is still fine.
    expect(() => planSequence({ sequence: '0003', submissionType: 'Efficacy Supplement', filed, desired: desired([['2.5', 'a.pdf', 'm9']]) })).not.toThrow();
  });

  it('REFUSES a sequence in which nothing changed — a filing that files nothing consumes a sequence number to say nothing', () => {
    // Every leaf byte-identical to what is on file: the zip would carry no leaf,
    // an <ectd:ectd/> with no module element and an empty regional backbone,
    // and it stored as a transmittable, error-free bundle.
    try {
      planSequence({
        sequence: '0001', submissionType: 'Efficacy Supplement', filed: [SEQ_0000],
        desired: desired([['2.5', 'clinical-overview.pdf', 'md5-co-v1'], ['3.2.P.1', 'description.pdf', 'md5-desc-v1']]),
      });
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as SequenceLifecycleRefusal).code).toBe('NOTHING_TO_FILE');
      expect((e as Error).message).toMatch(/all 2 of this package's leaves are already on file/);
    }
    // One changed leaf is a filing.
    expect(() => planSequence({
      sequence: '0001', submissionType: 'Efficacy Supplement', filed: [SEQ_0000],
      desired: desired([['2.5', 'clinical-overview.pdf', 'md5-co-v2'], ['3.2.P.1', 'description.pdf', 'md5-desc-v1']]),
    })).not.toThrow();
  });

  it('diffs against the FOLD, not the last sequence: a leaf untouched since 0000 is still compared to 0000', () => {
    const seq1: FiledSequence = { ...SEQ_0000, sequence: '0001', leaves: [leaf('2.5', 'clinical-overview.pdf', 'md5-co-v2')] };
    const plan = planSequence({
      sequence: '0002', submissionType: 'Efficacy Supplement', filed: [SEQ_0000, seq1],
      desired: desired([['3.2.P.1', 'description.pdf', 'md5-desc-v2']]),
    });
    expect(plan.summary).toMatchObject({ replace: 1, new: 0 });
    expect(plan.leaves[0].modifiedFile).toContain('0000'); // where that leaf still lives
  });
});
