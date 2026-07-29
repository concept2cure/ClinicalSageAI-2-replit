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
    expect(() => toPackagerRegion('cn')).toThrow(/Unsupported region/);
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

  it('falls back to the leaf checksum when the resolved file has no md5', () => {
    const out = mapCoreLeafToEctdLeaf(leaf({ sectionCode: '2.7', checksum: 'corechk' }), file({ md5: undefined }));
    expect(out.md5).toBe('corechk');
  });

  it('defaults an unknown lifecycle op to new', () => {
    const out = mapCoreLeafToEctdLeaf(leaf({ sectionCode: '1.1', lifecycleOp: 'bogus' }), file());
    expect(out.operation).toBe('new');
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
