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

  it('marks a leaf dropped from the new sequence as delete, carrying prior metadata', () => {
    const p = [prior({ ctdSection: '5.3.5.1', fileName: 'old-study.pdf', md5: 'ccc', title: 'Old Study', sourcePath: '/archive/old.pdf' })];
    const res = computeLifecycleOperations(p, []);
    expect(res.summary).toMatchObject({ delete: 1 });
    expect(res.leaves[0]).toMatchObject({
      operation: 'delete',
      ctdSection: '5.3.5.1',
      fileName: 'old-study.pdf',
      title: 'Old Study',
      sourcePath: '/archive/old.pdf',
      md5: 'ccc',
    });
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
});
