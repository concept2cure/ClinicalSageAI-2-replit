import { describe, it, expect } from 'vitest';
import {
  computeLifecycleOperations,
  type PriorLeaf,
  type DesiredLeaf,
} from '../lifecycle-operator';

const desired = (over: Partial<DesiredLeaf> & { ctdSection: string; fileName: string; md5: string }): DesiredLeaf => ({
  title: over.title ?? over.fileName,
  sourcePath: over.sourcePath ?? `/tmp/${over.fileName}`,
  ...over,
});

const prior = (over: Partial<PriorLeaf> & { ctdSection: string; fileName: string; md5: string }): PriorLeaf => ({
  ...over,
});

describe('computeLifecycleOperations', () => {
  it('marks a leaf absent from prior as new', () => {
    const res = computeLifecycleOperations([], [desired({ ctdSection: '2.5', fileName: 'clinical-overview.pdf', md5: 'aaa' })]);
    expect(res.summary).toMatchObject({ new: 1, replace: 0, append: 0, delete: 0, unchanged: 0 });
    expect(res.leaves[0].operation).toBe('new');
  });

  it('marks a changed leaf (different checksum) as replace by default', () => {
    const p = [prior({ ctdSection: '2.5', fileName: 'clinical-overview.pdf', md5: 'aaa' })];
    const d = [desired({ ctdSection: '2.5', fileName: 'clinical-overview.pdf', md5: 'bbb' })];
    const res = computeLifecycleOperations(p, d);
    expect(res.summary).toMatchObject({ replace: 1, new: 0, delete: 0, unchanged: 0 });
    expect(res.leaves[0].operation).toBe('replace');
  });

  it('honors appendOnChange to emit append instead of replace', () => {
    const p = [prior({ ctdSection: '1.1', fileName: 'cover.pdf', md5: 'aaa' })];
    const d = [desired({ ctdSection: '1.1', fileName: 'cover.pdf', md5: 'bbb', appendOnChange: true })];
    const res = computeLifecycleOperations(p, d);
    expect(res.summary).toMatchObject({ append: 1, replace: 0 });
    expect(res.leaves[0].operation).toBe('append');
  });

  it('omits an unchanged leaf (same checksum) by default', () => {
    const p = [prior({ ctdSection: '3.2.S.1.1', fileName: 'general.pdf', md5: 'same' })];
    const d = [desired({ ctdSection: '3.2.S.1.1', fileName: 'general.pdf', md5: 'same' })];
    const res = computeLifecycleOperations(p, d);
    expect(res.summary).toMatchObject({ unchanged: 1, new: 0, replace: 0 });
    expect(res.leaves).toHaveLength(0);
  });

  it('surfaces unchanged as a no-op append when includeUnchanged is set', () => {
    const p = [prior({ ctdSection: '3.2.S.1.1', fileName: 'general.pdf', md5: 'same' })];
    const d = [desired({ ctdSection: '3.2.S.1.1', fileName: 'general.pdf', md5: 'same' })];
    const res = computeLifecycleOperations(p, d, { includeUnchanged: true });
    expect(res.summary.unchanged).toBe(1);
    expect(res.leaves).toHaveLength(1);
    expect(res.leaves[0].operation).toBe('append');
  });

  it('a prior leaf the new sequence does not mention is unchanged, NOT withdrawn', () => {
    // This asserted `delete`. A new sequence in this product holds only what
    // changed — it is created empty and the amendment planner plans leaves for
    // changed documents alone — so reading absence as withdrawal made a
    // two-document amendment delete the rest of the dossier at the agency.
    const p = [prior({ ctdSection: '5.3.5.1', fileName: 'old-study.pdf', md5: 'ccc', title: 'Old Study', sourcePath: '/archive/old.pdf' })];
    const res = computeLifecycleOperations(p, []);
    expect(res.summary).toMatchObject({ delete: 0, unchanged: 1, new: 0, replace: 0 });
    expect(res.leaves).toHaveLength(0);
  });

  it('a DECLARED withdrawal is a delete carrying the prior leaf\'s identity and checksum', () => {
    const p = [prior({ ctdSection: '5.3.5.1', fileName: 'old-study.pdf', md5: 'ccc', title: 'Old Study', sourcePath: '/archive/old.pdf' })];
    const d = [desired({ ctdSection: '5.3.5.1', fileName: 'old-study.pdf', md5: '', withdraw: true, title: '', sourcePath: '' })];
    const res = computeLifecycleOperations(p, d);
    expect(res.summary).toMatchObject({ delete: 1, unchanged: 0 });
    expect(res.leaves[0]).toMatchObject({
      operation: 'delete',
      ctdSection: '5.3.5.1',
      fileName: 'old-study.pdf',
      title: 'Old Study',
      sourcePath: '/archive/old.pdf',
      md5: 'ccc',
    });
  });

  it('refuses to withdraw a leaf that was never filed', () => {
    const d = [desired({ ctdSection: '5.3.5.1', fileName: 'never-filed.pdf', md5: '', withdraw: true })];
    expect(() => computeLifecycleOperations([], d)).toThrow(/nothing on file to delete/);
  });

  it('uses an explicit leafKey identity over ctdSection/fileName (rename within same leaf)', () => {
    // Same logical leaf, file renamed: identity by leafKey makes this a replace, not new+delete.
    const p = [prior({ leafKey: 'guid-1', ctdSection: '2.7', fileName: 'summary-v1.pdf', md5: 'aaa' })];
    const d = [desired({ leafKey: 'guid-1', ctdSection: '2.7', fileName: 'summary-v2.pdf', md5: 'bbb' })];
    const res = computeLifecycleOperations(p, d);
    expect(res.summary).toMatchObject({ replace: 1, new: 0, delete: 0 });
    expect(res.leaves[0].fileName).toBe('summary-v2.pdf');
  });

  it('handles a mixed sequence: new + replace + delete + unchanged together', () => {
    const p = [
      prior({ ctdSection: '2.5', fileName: 'overview.pdf', md5: 'o1' }), // -> replace
      prior({ ctdSection: '2.7', fileName: 'summary.pdf', md5: 's1' }), // -> unchanged
      prior({ ctdSection: '5.3.5.1', fileName: 'study-a.pdf', md5: 'a1' }), // -> delete
    ];
    const d = [
      desired({ ctdSection: '2.5', fileName: 'overview.pdf', md5: 'o2' }), // replace
      desired({ ctdSection: '2.7', fileName: 'summary.pdf', md5: 's1' }), // unchanged
      desired({ ctdSection: '3.2.P.1', fileName: 'composition.pdf', md5: 'c1' }), // new
      desired({ ctdSection: '5.3.5.1', fileName: 'study-a.pdf', md5: '', withdraw: true }), // delete (declared)
    ];
    const res = computeLifecycleOperations(p, d);
    expect(res.summary).toMatchObject({ new: 1, replace: 1, delete: 1, unchanged: 1, append: 0 });
    const byOp = Object.fromEntries(res.leaves.map(l => [l.operation, (res.leaves.filter(x => x.operation === l.operation).length)]));
    expect(byOp.new).toBe(1);
    expect(byOp.replace).toBe(1);
    expect(byOp.delete).toBe(1);
  });

  it('throws on ambiguous duplicate identity in the desired set', () => {
    const d = [
      desired({ ctdSection: '2.5', fileName: 'dup.pdf', md5: 'x' }),
      desired({ ctdSection: '2.5', fileName: 'dup.pdf', md5: 'y' }),
    ];
    expect(() => computeLifecycleOperations([], d)).toThrow(/Ambiguous lifecycle/);
  });

  describe('modified-file pointer (ICH lifecycle requirement)', () => {
    it('a new leaf carries NO modified-file', () => {
      const res = computeLifecycleOperations(
        [],
        [desired({ ctdSection: '2.5', fileName: 'overview.pdf', md5: 'a' })],
        { priorSequencePrefix: '../0000' },
      );
      expect(res.leaves[0].operation).toBe('new');
      expect(res.leaves[0].modifiedFile).toBeUndefined();
    });

    it('a replace points modified-file at the prior published href, prefixed to the prior sequence', () => {
      const p = [prior({
        ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'a',
        href: 'm3/32-body-data/32s-drug-sub/general.pdf',
      })];
      const d = [desired({ ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'b' })];
      const res = computeLifecycleOperations(p, d, { priorSequencePrefix: '../0000/' });
      expect(res.leaves[0].operation).toBe('replace');
      expect(res.leaves[0].modifiedFile).toBe('../0000/m3/32-body-data/32s-drug-sub/general.pdf');
    });

    it('an append also carries modified-file at the leaf it extends', () => {
      const p = [prior({ ctdSection: '1.1', fileName: 'cover.pdf', md5: 'a', href: 'm1/us/11-forms/cover.pdf' })];
      const d = [desired({ ctdSection: '1.1', fileName: 'cover.pdf', md5: 'b', appendOnChange: true })];
      const res = computeLifecycleOperations(p, d, { priorSequencePrefix: '../0000' });
      expect(res.leaves[0].operation).toBe('append');
      expect(res.leaves[0].modifiedFile).toBe('../0000/m1/us/11-forms/cover.pdf');
    });

    it('a delete points modified-file at the withdrawn prior leaf', () => {
      const p = [prior({ ctdSection: '5.3.5.1', fileName: 'old-study.pdf', md5: 'c', href: 'm5/53-clin-stud-rep/535/old-study.pdf' })];
      const d = [desired({ ctdSection: '5.3.5.1', fileName: 'old-study.pdf', md5: '', withdraw: true })];
      const res = computeLifecycleOperations(p, d, { priorSequencePrefix: '../0000' });
      expect(res.leaves[0].operation).toBe('delete');
      expect(res.leaves[0].modifiedFile).toBe('../0000/m5/53-clin-stud-rep/535/old-study.pdf');
    });

    it('preserves a #leafId fragment and normalizes a leading slash on the prior href', () => {
      const p = [prior({ ctdSection: '2.7', fileName: 's.pdf', md5: 'a', href: '/m2/27-clin-sum/s.pdf#node42' })];
      const d = [desired({ ctdSection: '2.7', fileName: 's.pdf', md5: 'b' })];
      const res = computeLifecycleOperations(p, d, { priorSequencePrefix: '../../0001/' });
      expect(res.leaves[0].modifiedFile).toBe('../../0001/m2/27-clin-sum/s.pdf#node42');
    });

    it('with no prefix, emits the bare prior href (ungrouped / same-root lifecycle)', () => {
      const p = [prior({ ctdSection: '2.5', fileName: 'o.pdf', md5: 'a', href: 'm2/25-clin-over/o.pdf' })];
      const d = [desired({ ctdSection: '2.5', fileName: 'o.pdf', md5: 'b' })];
      const res = computeLifecycleOperations(p, d);
      expect(res.leaves[0].modifiedFile).toBe('m2/25-clin-over/o.pdf');
    });

    it('omits modified-file (rather than guessing) when the prior href is unknown', () => {
      const p = [prior({ ctdSection: '2.5', fileName: 'o.pdf', md5: 'a' })]; // no href
      const d = [desired({ ctdSection: '2.5', fileName: 'o.pdf', md5: 'b' })];
      const res = computeLifecycleOperations(p, d, { priorSequencePrefix: '../0000' });
      expect(res.leaves[0].operation).toBe('replace');
      expect(res.leaves[0].modifiedFile).toBeUndefined();
    });
  });
});
