import { describe, it, expect } from 'vitest';
import {
  buildLeafManifest,
  manifestToPriorLeaves,
  computeSequencePrefix,
  type SequenceLeafManifestEntry,
} from '../sequence-manifest';
import { computeLifecycleOperations } from '../lifecycle-operator';

describe('buildLeafManifest', () => {
  it('snapshots section, filename (from href), href, md5, operation', () => {
    const m = buildLeafManifest([
      { ctdSection: '3.2.S.4.2', href: 'm3/32-body-data/32s/impurities.pdf', md5: 'a1', operation: 'new', title: 'Impurities' },
    ]);
    expect(m).toEqual([
      { ctdSection: '3.2.S.4.2', fileName: 'impurities.pdf', href: 'm3/32-body-data/32s/impurities.pdf', md5: 'a1', operation: 'new', title: 'Impurities' },
    ]);
  });

  it('preserves an explicit filename and keeps precise sub-sections verbatim', () => {
    const m = buildLeafManifest([
      { ctdSection: '3.2.S.1', href: 'm3/x/gen.pdf', md5: 'a', fileName: 'general-information.pdf' },
      { ctdSection: '3.2.S.4.2', href: 'm3/x/imp.pdf', md5: 'b' },
    ]);
    expect(m.map((e) => e.ctdSection)).toEqual(['3.2.S.1', '3.2.S.4.2']); // NOT collapsed to 3.2.S
    expect(m[0].fileName).toBe('general-information.pdf');
  });

  it('keeps the backbone ID and the backbone that carries it — what a later modified-file names', () => {
    const m = buildLeafManifest([
      { ctdSection: '3.2.S.1', href: 'm3/x/gen.pdf', md5: 'a', leafId: 'leaf-3-2-S-1-gen', backbone: 'index.xml' },
      { ctdSection: '3.2.S.2', href: 'm3/x/man.pdf', md5: 'b', leafId: 'leaf-3-2-S-2-man' }, // no backbone: not recorded
    ]);
    expect(m[0]).toMatchObject({ leafId: 'leaf-3-2-S-1-gen', backbone: 'index.xml' });
    expect(m[1]).not.toHaveProperty('leafId');
    expect(m[1]).not.toHaveProperty('backbone');
  });

  it('skips leaves with no href or no checksum (nothing to diff against)', () => {
    const m = buildLeafManifest([
      { ctdSection: '2.5', href: '', md5: 'a' },
      { ctdSection: '2.5', href: 'm2/o.pdf', md5: '' },
      { ctdSection: '2.5', href: 'm2/o.pdf', md5: 'ok' },
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].href).toBe('m2/o.pdf');
  });
});

describe('manifestToPriorLeaves', () => {
  it('round-trips a manifest into PriorLeaf identity + href', () => {
    const manifest: SequenceLeafManifestEntry[] = [
      { ctdSection: '3.2.S.1', fileName: 'general.pdf', href: 'm3/32/general.pdf', md5: 'a', title: 'General' },
    ];
    expect(manifestToPriorLeaves(manifest)).toEqual([
      { ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'a', href: 'm3/32/general.pdf', title: 'General' },
    ]);
  });

  it('is defensive: a non-array or malformed entries yield a filtered list, never a throw', () => {
    expect(manifestToPriorLeaves(null)).toEqual([]);
    expect(manifestToPriorLeaves('not-json')).toEqual([]);
    expect(manifestToPriorLeaves([{ ctdSection: '2.5' }, { md5: 'x' }, 42, null])).toEqual([]);
  });

  it('carries the recorded backbone ID into the prior leaf', () => {
    const [leaf] = manifestToPriorLeaves([
      { ctdSection: '2.5', fileName: 'o.pdf', href: 'm2/25/o.pdf', md5: 'a', leafId: 'leaf-2-5-o', backbone: 'index.xml' },
    ]);
    expect(leaf).toMatchObject({ leafId: 'leaf-2-5-o', backbone: 'index.xml' });
  });

  it('derives fileName from href when the stored entry omits it', () => {
    const leaves = manifestToPriorLeaves([{ ctdSection: '2.5', href: 'm2/25/overview.pdf', md5: 'a' }]);
    expect(leaves[0].fileName).toBe('overview.pdf');
  });
});

describe('computeSequencePrefix', () => {
  it('builds the grouped sibling traversal from the new backbone to the prior sequence', () => {
    expect(computeSequencePrefix('0000')).toBe('../0000/');
    expect(computeSequencePrefix('0007')).toBe('../0007/');
  });
  it('rejects an empty/invalid sequence rather than emitting a same-sequence pointer', () => {
    expect(() => computeSequencePrefix('')).toThrow(/Invalid prior sequence/);
    expect(() => computeSequencePrefix('../evil')).toThrow(/Invalid prior sequence/);
  });
});

describe('manifest → lifecycle → modified-file (the full purpose)', () => {
  it('a prior manifest drives a correct replace pointer on the next sequence', () => {
    // Sequence 0000 published a drug-substance leaf; 0001 replaces it.
    const priorManifest = buildLeafManifest([
      {
        ctdSection: '3.2.S.1', href: 'm3/32-body-data/32s/general.pdf', md5: 'v1', operation: 'new',
        leafId: 'leaf-3-2-S-1-general', backbone: 'index.xml',
      },
    ]);
    const prior = manifestToPriorLeaves(priorManifest);
    const res = computeLifecycleOperations(
      prior,
      [{ ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'v2', title: 'General', sourcePath: '/tmp/general.pdf' }],
      { priorSequencePrefix: computeSequencePrefix('0000') },
    );
    expect(res.summary).toMatchObject({ replace: 1, new: 0, delete: 0 });
    expect(res.leaves[0]).toMatchObject({
      operation: 'replace',
      modifiedFile: '../0000/index.xml#leaf-3-2-S-1-general',
    });
  });

  it('precise sub-sections keep distinct identity (no false replace across 3.2.S.1 vs 3.2.S.4.2)', () => {
    const prior = manifestToPriorLeaves(buildLeafManifest([
      { ctdSection: '3.2.S.1', href: 'm3/a/general.pdf', md5: 'g1', leafId: 'leaf-3-2-S-1-general', backbone: 'index.xml' },
      { ctdSection: '3.2.S.4.2', href: 'm3/b/impurities.pdf', md5: 'i1', leafId: 'leaf-3-2-S-4-2-impurities', backbone: 'index.xml' },
    ]));
    // New sequence changes only impurities.
    const res = computeLifecycleOperations(
      prior,
      [
        { ctdSection: '3.2.S.1', fileName: 'general.pdf', md5: 'g1', title: 'g', sourcePath: '/tmp/g' },
        { ctdSection: '3.2.S.4.2', fileName: 'impurities.pdf', md5: 'i2', title: 'i', sourcePath: '/tmp/i' },
      ],
      { priorSequencePrefix: computeSequencePrefix('0000') },
    );
    // general unchanged (omitted), impurities replaced with the RIGHT pointer.
    expect(res.summary).toMatchObject({ unchanged: 1, replace: 1, delete: 0, new: 0 });
    const replaced = res.leaves.find((l) => l.operation === 'replace')!;
    expect(replaced.modifiedFile).toBe('../0000/index.xml#leaf-3-2-S-4-2-impurities');
  });
});
