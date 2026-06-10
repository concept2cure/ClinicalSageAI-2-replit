import { describe, it, expect } from 'vitest';
import { resolveCrossReferences } from '../cross-reference-resolver';
import type { EctdLeaf } from '../../submission-gateways/regional-packager';

const leaf = (over: Partial<EctdLeaf> & { ctdSection: string; fileName: string }): EctdLeaf => ({
  operation: 'new',
  sourcePath: `/tmp/${over.fileName}`,
  title: over.title ?? over.fileName,
  ...over,
});

const leaves: Array<EctdLeaf & { leafKey?: string }> = [
  leaf({ ctdSection: '2.7.3', fileName: 'clinical-summary.pdf' }),
  leaf({ ctdSection: '5.3.5.1', fileName: 'study-a.pdf' }),
  leaf({ ctdSection: '3.2.S.1.1', fileName: 'general.pdf', operation: 'delete' }),
];

describe('resolveCrossReferences', () => {
  it('resolves a reference by CTD section code', () => {
    const res = resolveCrossReferences(leaves, [{ source: '2.7.3', target: '5.3.5.1' }]);
    expect(res.ok).toBe(true);
    expect(res.resolved[0]).toMatchObject({ resolvedSection: '5.3.5.1', resolvedFileName: 'study-a.pdf' });
  });

  it('resolves a reference by filename', () => {
    const res = resolveCrossReferences(leaves, [{ source: '2.7.3', target: 'study-a.pdf' }]);
    expect(res.ok).toBe(true);
    expect(res.resolved).toHaveLength(1);
  });

  it('resolves a reference by relative href tail', () => {
    const res = resolveCrossReferences(leaves, [
      { source: '2.7.3', target: 'm5/53-clin-stud-rep/535-rep-effic-safety-stud/study-a.pdf' },
    ]);
    expect(res.ok).toBe(true);
    expect(res.resolved[0].resolvedFileName).toBe('study-a.pdf');
  });

  it('flags a missing target as TARGET_NOT_FOUND', () => {
    const res = resolveCrossReferences(leaves, [{ source: '2.7.3', target: '5.3.5.99' }]);
    expect(res.ok).toBe(false);
    expect(res.broken[0].reason).toBe('TARGET_NOT_FOUND');
  });

  it('flags a link to a deleted leaf as TARGET_DELETED', () => {
    const res = resolveCrossReferences(leaves, [{ source: '2.3', target: '3.2.S.1.1' }]);
    expect(res.ok).toBe(false);
    expect(res.broken[0].reason).toBe('TARGET_DELETED');
  });

  it('resolves by explicit leafKey identity', () => {
    const withKey: Array<EctdLeaf & { leafKey?: string }> = [
      { ...leaf({ ctdSection: '2.5', fileName: 'overview.pdf' }), leafKey: 'guid-9' },
    ];
    const res = resolveCrossReferences(withKey, [{ source: '1.1', target: 'guid-9' }]);
    expect(res.ok).toBe(true);
    expect(res.resolved[0].resolvedSection).toBe('2.5');
  });

  it('partitions a mixed batch into resolved + broken and echoes ref ids', () => {
    const res = resolveCrossReferences(leaves, [
      { id: 'r1', source: '2.7.3', target: '5.3.5.1' }, // resolved
      { id: 'r2', source: '2.7.3', target: 'nope.pdf' }, // broken
      { id: 'r3', source: '2.3', target: '3.2.S.1.1' }, // deleted
    ]);
    expect(res.resolved.map(r => r.id)).toEqual(['r1']);
    expect(res.broken.map(r => r.id).sort()).toEqual(['r2', 'r3']);
    expect(res.ok).toBe(false);
  });

  it('treats an empty reference set as ok', () => {
    expect(resolveCrossReferences(leaves, []).ok).toBe(true);
  });
});
