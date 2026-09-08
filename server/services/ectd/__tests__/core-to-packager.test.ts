import { describe, it, expect } from 'vitest';
import {
  toPackagerRegion,
  mapCoreLeafToEctdLeaf,
  buildPackagerInputFromCore,
  type CoreLeaf,
  type ResolvedFile,
} from '../core-to-packager';

const leaf = (over: Partial<CoreLeaf> & { sectionCode: string }): CoreLeaf => ({
  title: over.title ?? over.sectionCode,
  lifecycleOp: over.lifecycleOp ?? 'new',
  ...over,
});

const file = (over: Partial<ResolvedFile> = {}): ResolvedFile => ({
  fileName: over.fileName ?? 'doc.pdf',
  sourcePath: over.sourcePath ?? '/tmp/doc.pdf',
  md5: over.md5,
});

describe('toPackagerRegion', () => {
  it('maps core regions to publisher regions', () => {
    expect(toPackagerRegion('fda')).toBe('fda');
    expect(toPackagerRegion('eu')).toBe('ema');
    expect(toPackagerRegion('jp')).toBe('pmda');
    expect(toPackagerRegion('EU')).toBe('ema'); // case-insensitive
  });
  it('throws on an unsupported region', () => {
    // 'cn' used to be the example here, and it stopped being unsupported: the
    // fix documented above REGION_MAP added cn/br/in/kr/sg (and ca/uk/ch/au)
    // because the spine could not build those submissions at all. The rule this
    // test exists for — an unrecognised region is refused, never silently
    // defaulted to fda — is unchanged, so it now uses a code that really is
    // outside the map.
    expect(() => toPackagerRegion('zz')).toThrow(/Unsupported region/);
    // And the region that prompted the change is genuinely supported now.
    expect(toPackagerRegion('cn')).toBe('cn');
  });
});

describe('mapCoreLeafToEctdLeaf', () => {
  it('maps fields and prefers the resolved md5 over the leaf checksum', () => {
    const out = mapCoreLeafToEctdLeaf(
      leaf({ sectionCode: '2.5', title: 'Clinical Overview', lifecycleOp: 'replace', checksum: 'corechk' }),
      file({ fileName: 'overview.pdf', sourcePath: '/s/overview.pdf', md5: 'filechk' })
    );
    expect(out).toMatchObject({
      ctdSection: '2.5',
      title: 'Clinical Overview',
      operation: 'replace',
      fileName: 'overview.pdf',
      sourcePath: '/s/overview.pdf',
      md5: 'filechk',
    });
  });

  it('never adopts the DB leaf.checksum as the manifest md5 — leaves it undefined for byte-hashing downstream', () => {
    // leaf.checksum is a caller-settable DB value with no tie to the file bytes;
    // it must NOT become the manifest checksum. When the resolver produced no
    // md5, md5 stays undefined so the packager hashes the real bytes.
    const out = mapCoreLeafToEctdLeaf(leaf({ sectionCode: '2.7', checksum: 'corechk' }), file({ md5: undefined }));
    expect(out.md5).toBeUndefined();
    expect(out.md5).not.toBe('corechk');
  });

  it('refuses an unrecognised lifecycle op instead of filing it as new', () => {
    // This asserted the default. lifecycle_op is free text on the write path,
    // so 'withdraw' or a typo became a brand-new leaf: the sequence re-filed
    // the document as if it had never been submitted, the prior version stayed
    // current at the agency, and no modified-file linked the two.
    expect(() =>
      mapCoreLeafToEctdLeaf(leaf({ sectionCode: '1.1', lifecycleOp: 'bogus' }), file()),
    ).toThrow(/Unrecognised eCTD lifecycle operation "bogus"/);
  });

  it('reads a differently-cased operation as itself', () => {
    // 'Replace' plainly means replace; refusing on casing alone would be
    // pedantry, and defaulting it to new is the defect above.
    for (const op of ['Replace', 'REPLACE', ' replace ']) {
      const out = mapCoreLeafToEctdLeaf(leaf({ sectionCode: '1.1', lifecycleOp: op }), file());
      expect(out.operation).toBe('replace');
    }
  });
});

describe('buildPackagerInputFromCore', () => {
  const baseArgs = {
    sequence: { sequenceNumber: '0000', region: 'eu' },
    submission: { applicationType: 'maa', productName: 'C2C-001' },
    applicationId: 'EMEA/H/C/0001',
    sponsorId: 'ORG-1',
    sponsorName: 'Concept2Cure',
    outputDir: '/out',
  };

  it('builds a PackagerInput from core rows, mapping region and metadata', () => {
    const res = buildPackagerInputFromCore({
      ...baseArgs,
      leaves: [leaf({ sectionCode: '2.5', title: 'Overview' })],
      resolveFile: () => file({ fileName: 'overview.pdf', sourcePath: '/s/overview.pdf' }),
    });
    expect(res.input).toMatchObject({
      region: 'ema',
      sequence: '0000',
      submissionType: 'maa',
      productName: 'C2C-001',
      applicationId: 'EMEA/H/C/0001',
      outputDir: '/out',
    });
    expect(res.input.leaves).toHaveLength(1);
    expect(res.skipped).toHaveLength(0);
  });

  it('skips leaves whose document does not resolve to a file, and reports them', () => {
    const res = buildPackagerInputFromCore({
      ...baseArgs,
      leaves: [
        leaf({ sectionCode: '2.5', title: 'Resolves' }),
        leaf({ sectionCode: 'm1.us.cover', title: 'No file' }),
      ],
      resolveFile: (l) => (l.sectionCode === '2.5' ? file() : null),
    });
    expect(res.input.leaves).toHaveLength(1);
    expect(res.input.leaves[0].ctdSection).toBe('2.5');
    expect(res.skipped).toEqual([{ sectionCode: 'm1.us.cover', reason: expect.stringMatching(/no resolvable source file/) }]);
  });

  it('handles an empty product name', () => {
    const res = buildPackagerInputFromCore({
      ...baseArgs,
      submission: { applicationType: 'ind' },
      leaves: [],
      resolveFile: () => file(),
    });
    expect(res.input.productName).toBe('');
    expect(res.input.leaves).toHaveLength(0);
  });
});
