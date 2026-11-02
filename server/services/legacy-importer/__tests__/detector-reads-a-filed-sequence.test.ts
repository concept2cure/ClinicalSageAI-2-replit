/**
 * The legacy importer maps an eCTD sequence's leaves from its backbones, both
 * of them, as a publisher writes them (MR-10 Stage 9 / CAT2-07, 2026-11-01).
 *
 * What it did until 2026-11-01: `parseBackboneLeaves` regex-read the regional
 * backbone only, and compared each href with the zip path as written. A regional
 * backbone's hrefs are relative to its own folder (m1/us/), so no Module 1 leaf
 * of a real sequence matched; index.xml was never read, so every Module 2-5
 * leaf was placed by filename pattern. Each Module 1 leaf was also reported as
 * a `missing_required_leaf` error, though the archive held it. Only a fixture
 * written in the parser's own shape (root-relative hrefs, no index.xml) was
 * ever mapped.
 *
 * The sequence here is built by the platform's own packager, which writes the
 * layout the ICH and FDA specifications define.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packageEctdSubmission, type EctdLeaf } from '../../submission-gateways/regional-packager';
import { goldenPdf } from '../../ectd/qualification/golden-fixtures';
import { detectArchive, type DetectedArchive } from '../detector';
import { handSequenceFiles, H, md5, zipBufferOf } from './support/conformant-sequence';

let work: string;
let detected: DetectedArchive;
let zipPath: string;

const SPEC: [string, string][] = [
  ['1.2', 'cover.pdf'],
  ['2.5', 'clinical-overview.pdf'],
  ['3.2.P', 'drug-product.pdf'],
  ['4.2.3', 'toxicology.pdf'],
  ['5.3.5', 'pivotal-study-report.pdf'],
];
/** Module 4/5 study reports carry their study, so the packager writes each study's STF (FDA validation 1789). */
const STUDY: Record<string, Partial<EctdLeaf>> = {
  'toxicology.pdf': { studyId: 'TOX-001', stfFileTag: 'study-report-body' },
  'pivotal-study-report.pdf': { studyId: 'STUDY-001', stfFileTag: 'study-report-body' },
};

beforeAll(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'detector-filed-sequence-'));
  const leaves: EctdLeaf[] = [];
  for (const [ctdSection, fileName] of SPEC) {
    const bytes = goldenPdf(fileName);
    const sourcePath = path.join(work, fileName);
    await fs.writeFile(sourcePath, bytes);
    leaves.push({ operation: 'new', ctdSection, fileName, title: fileName, md5: md5(bytes), sourcePath, ...STUDY[fileName] });
  }
  const bundle = await packageEctdSubmission({
    region: 'fda', applicationId: '654321', sequence: '0000', submissionType: 'original',
    sponsorId: '123456789', sponsorName: 'Acme Biologics Inc.', productName: 'Acmeximab',
    leaves, outputDir: path.join(work, 'out'), environment: 'staging', fda: { applicationType: 'ind' },
  });
  zipPath = bundle.path;
  detected = await detectArchive(zipPath);
}, 120_000);

afterAll(async () => {
  await fs.rm(work, { recursive: true, force: true });
});

describe('detectArchive on a sequence the packager wrote', () => {
  it('maps every leaf, Modules 1 to 5, from the backbone that declares it, at its heading', () => {
    const leaves = detected.files.filter((f) => SPEC.some(([, file]) => file === f.fileName));
    expect(leaves.map((f) => [f.fileName, f.mappingSource, f.reviewStatus, f.mappedCtdSection]).sort()).toEqual(
      SPEC.map(([section, file]) => [file, 'backbone_xml', 'mapped', section]).sort(),
    );
    // Each study's tagging file is a leaf index.xml declares, like any other.
    const stf = detected.files.filter((f) => /^stf-.*\.xml$/.test(f.fileName));
    expect(stf.map((f) => [f.mappingSource, f.reviewStatus, f.mappedCtdSection]).sort()).toEqual([
      ['backbone_xml', 'mapped', '4.2.3'],
      ['backbone_xml', 'mapped', '5.3.5'],
    ]);
  });

  it('reports no leaf missing that the archive holds, and no error at all', () => {
    expect(detected.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('reads the application, sequence and applicant from the regional backbone', () => {
    expect(detected).toMatchObject({ format: 'fda_ectd', region: 'fda', applicationId: '654321', sequence: '0000', sponsor: 'Acme Biologics Inc.' });
  });

  it('recognizes the sequence root\'s index-md5.txt as structure', () => {
    expect(detected.files.find((f) => f.relativePath === 'index-md5.txt')).toMatchObject({ mappingSource: 'structure_path', reviewStatus: 'skipped' });
  });
});

describe('detectArchive on a sequence the reader refuses part of', () => {
  it('does not map a leaf whose bytes are not the ones its backbone checksums, and says why', async () => {
    const file = path.join(work, 'tampered.zip');
    await fs.writeFile(file, await zipBufferOf(handSequenceFiles({
      ich: [
        { headings: [...H.clinicalOverview], href: 'm2/2-5/clinical-overview.pdf', id: 'ov', bytes: 'tampered', checksum: md5('%PDF-1.4 ov') },
        { headings: [...H.efficacySafety], href: 'm5/5-3-5/csr.pdf', id: 'csr' },
      ],
    })));
    const out = await detectArchive(file);
    const ov = out.files.find((f) => f.relativePath === 'm2/2-5/clinical-overview.pdf');
    expect(ov?.reviewStatus).not.toBe('mapped');
    expect(out.files.find((f) => f.relativePath === 'm5/5-3-5/csr.pdf')).toMatchObject({ reviewStatus: 'mapped', mappedCtdSection: '5.3.5' });
    expect(out.findings).toContainEqual(expect.objectContaining({ severity: 'error', code: 'leaf_checksum_mismatch', filePath: 'm2/2-5/clinical-overview.pdf' }));
  });
});

describe('detectArchive on what the reader cannot read (review round, 2026-11-02)', () => {
  it('stores a file whose leaf the reader refused as skipped, not as a filename suggestion, and the error names it', async () => {
    const file = path.join(work, 'refused-heading.zip');
    await fs.writeFile(file, await zipBufferOf(handSequenceFiles({
      ich: [{ headings: ['m3-quality', 'appendix-stuff'], href: 'm3/protocol.pdf', id: 'odd' }],
    })));
    const out = await detectArchive(file);
    expect(out.files.find((f) => f.relativePath === 'm3/protocol.pdf')).toMatchObject({ reviewStatus: 'skipped', mappingSource: 'fallback' });
    expect(out.findings).toContainEqual(expect.objectContaining({ severity: 'error', code: 'leaf_heading_unmapped', filePath: 'm3/protocol.pdf' }));
    expect(out.findings.find((f) => f.code === 'extra_files_not_in_backbone')).toBeUndefined();
  });

  it('stores the file of a leaf refused for having no ID as skipped, too', async () => {
    const file = path.join(work, 'refused-no-id.zip');
    await fs.writeFile(file, await zipBufferOf(handSequenceFiles({
      ich: [{ headings: [...H.efficacySafety], href: 'm5/5-3-5/protocol.pdf', id: '' }],
    })));
    const out = await detectArchive(file);
    expect(out.files.find((f) => f.relativePath === 'm5/5-3-5/protocol.pdf')).toMatchObject({ reviewStatus: 'skipped', mappingSource: 'fallback' });
    expect(out.findings).toContainEqual(expect.objectContaining({ code: 'leaf_id_missing', filePath: 'm5/5-3-5/protocol.pdf' }));
  });

  it('names each regional backbone no sequence was read for, and why', async () => {
    const file = path.join(work, 'unread.zip');
    const read = handSequenceFiles({ root: '0000/', m1: [{ headings: ['m1-2-cover-letters'], href: '1-2/cover.pdf', id: 'c' }] });
    const noIndex = { '0001/m1/us/us-regional.xml': '<fda-regional/>' };
    const wrongFolder = { 'archive-copy/index.xml': '<ectd/>', 'archive-copy/m1/us/us-regional.xml': '<fda-regional/>' };
    await fs.writeFile(file, await zipBufferOf({ ...read, ...noIndex, ...wrongFolder }));
    const missing = (await detectArchive(file)).findings.filter((f) => f.code === 'ich_backbone_missing');
    expect(missing.map((f) => [f.filePath, /no index\.xml/.test(f.message), /not read as a sequence/.test(f.message)])).toEqual([
      ['0001/m1/us/us-regional.xml', true, false],
      ['archive-copy/m1/us/us-regional.xml', false, true],
    ]);
  });

  it('stores a Health Canada regional backbone as structure, not as a Module 1 document', async () => {
    const file = path.join(work, 'hc.zip');
    await fs.writeFile(file, await zipBufferOf({ 'm1/ca/ca-regional.xml': '<ca-regional/>', 'm1/ca/10-cover/cover.pdf': 'c' }));
    const out = await detectArchive(file);
    expect(out.files.find((f) => f.relativePath === 'm1/ca/ca-regional.xml')).toMatchObject({ mappingSource: 'structure_path', reviewStatus: 'skipped' });
  });
});
