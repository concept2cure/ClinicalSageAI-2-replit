/**
 * A sequence filed elsewhere reads back as the leaf manifest this platform
 * records when it files one itself, and three of them fold into the same filed
 * state (MR-10 Stage 9, CAT2-07: an IND whose 0000-0002 were filed by another
 * publisher must be able to replace, append to and withdraw those leaves).
 *
 * The three sequences are built by the platform's own packager
 * (`packageEctdSubmission`), which records the manifest it filed; the archive
 * holds them as a publisher's export does, one folder per sequence. The reader
 * sees only the archive.
 *
 * What the backbone cannot carry is not compared: `sourceMd5` and
 * `originalPdfProof` (what the packager was handed before PDF/A), and
 * `leafKey`. A leaf's section is the heading the backbone files it under; a
 * 3.2.S.4.2 leaf this packager writes under <m3-2-s-drug-substance> reads back
 * as 3.2.S, because that is all its index.xml says.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { packageEctdSubmission, type EctdLeaf } from '../../submission-gateways/regional-packager';
import { goldenPdf } from '../../ectd/qualification/golden-fixtures';
import { loadFiledStateBySubmission } from '../../ectd/prior-sequence-loader';
import { readFiledSequenceArchive, type FiledSequence } from '../filed-sequence-reader';
import { filedStatePool, md5 } from './support/conformant-sequence';

type Manifest = Awaited<ReturnType<typeof packageEctdSubmission>>['leafManifest'];

let work: string;
const manifests = new Map<string, Manifest>();
let archive: Buffer;

/** One leaf the packager is handed, with bytes written to the work folder. */
async function leaf(seq: string, ctdSection: string, fileName: string, extra: Partial<EctdLeaf> = {}): Promise<EctdLeaf> {
  if (extra.operation === 'delete') {
    return { ctdSection, fileName, title: fileName, sourcePath: '', operation: 'delete', ...extra } as EctdLeaf;
  }
  const bytes = goldenPdf(`${seq}-${fileName}`);
  const sourcePath = path.join(work, `${seq}-${fileName}`);
  await fs.writeFile(sourcePath, bytes);
  return { operation: 'new', ctdSection, fileName, title: fileName, md5: md5(bytes), sourcePath, ...extra };
}

async function pack(sequence: string, leaves: EctdLeaf[]) {
  const bundle = await packageEctdSubmission({
    region: 'fda',
    applicationId: '123456',
    sequence,
    submissionType: 'original',
    sponsorId: '123456789',
    sponsorName: 'Acme Biologics Inc.',
    productName: 'Acmeximab',
    leaves,
    outputDir: path.join(work, `out-${sequence}`),
    environment: 'staging',
    fda: { applicationType: 'ind', submissionType: 'Original Application' },
  });
  manifests.set(sequence, bundle.leafManifest);
  return JSZip.loadAsync(await fs.readFile(bundle.path));
}

/** A Module 5 study report names its study, so the packager writes its Study Tagging File (FDA validation 1789). */
const STUDY: Partial<EctdLeaf> = { studyId: 'STUDY-001', stfFileTag: 'study-report-body' };

const idOf = (seq: string, fileName: string, backbone = 'index.xml') => {
  const e = manifests.get(seq)!.find((m) => m.fileName === fileName && m.backbone === backbone && m.operation !== 'delete');
  if (!e?.leafId) throw new Error(`no leaf ${fileName} in ${seq}`);
  return e.leafId;
};

beforeAll(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'filed-sequence-reader-'));
  const out = new JSZip();
  const into = async (seq: string, zip: JSZip) => {
    for (const [name, f] of Object.entries(zip.files)) if (!f.dir) out.file(`${seq}/${name}`, await f.async('nodebuffer'));
  };

  await into('0000', await pack('0000', [
    await leaf('0000', '1.2', 'cover-0000.pdf'),
    await leaf('0000', '2.5', 'clinical-overview.pdf'),
    await leaf('0000', '3.2.S', 'drug-substance.pdf'),
    await leaf('0000', '3.2.S.4.2', 'specification-justification.pdf'),
    await leaf('0000', '5.3.5', 'study-report.pdf', STUDY),
  ]));
  await into('0001', await pack('0001', [
    await leaf('0001', '1.2', 'cover-0001.pdf'),
    await leaf('0001', '2.5', 'clinical-overview.pdf', { operation: 'replace', modifiedFile: `../0000/index.xml#${idOf('0000', 'clinical-overview.pdf')}` }),
    await leaf('0001', '5.3.5', 'study-report-addendum.pdf', {
      ...STUDY, operation: 'append', modifiedFile: `../0000/index.xml#${idOf('0000', 'study-report.pdf')}`,
    }),
  ]));
  const withdrawn = manifests.get('0000')!.find((m) => m.fileName === 'drug-substance.pdf')!;
  await into('0002', await pack('0002', [
    await leaf('0002', '1.2', 'cover-0002.pdf', {
      operation: 'replace', modifiedFile: `../0001/m1/us/us-regional.xml#${idOf('0001', 'cover-0001.pdf', 'm1/us/us-regional.xml')}`,
    }),
    // What computeLifecycleOperations emits for a withdrawal: the filed leaf's
    // section, name and md5, no bytes, and the pointer at it.
    await leaf('0002', '3.2.S', 'drug-substance.pdf', {
      operation: 'delete', md5: withdrawn.md5, modifiedFile: `../0000/index.xml#${withdrawn.leafId}`,
    }),
  ]));
  archive = await out.generateAsync({ type: 'nodebuffer' });
}, 120_000);

afterAll(async () => {
  await fs.rm(work, { recursive: true, force: true });
});

/** The fields a backbone carries, in the shape both sides are compared in. */
const comparable = (e: { ctdSection: string; fileName: string; href: string; md5: string; operation?: string; modifiedFile?: string; title?: string; leafId?: string; backbone?: string }) => ({
  ctdSection: e.ctdSection, fileName: e.fileName, href: e.href, md5: e.md5, operation: e.operation,
  modifiedFile: e.modifiedFile, title: e.title, leafId: e.leafId, backbone: e.backbone,
});

/** What index.xml can say about a section: the heading the packager files it under. */
const HEADING_OF: Record<string, string> = { '3.2.S.4.2': '3.2.S' };

describe('a filed sequence reads back as the manifest its filing recorded', () => {
  let sequences: FiledSequence[];
  beforeAll(async () => {
    const read = await readFiledSequenceArchive(archive);
    expect(read.refusals).toEqual([]);
    sequences = read.sequences;
  });

  it('finds the three sequences, in order, each complete', () => {
    expect(sequences.map((s) => [s.sequence, s.root, s.regionalBackbone, s.region])).toEqual([
      ['0000', '0000/', 'm1/us/us-regional.xml', 'fda'],
      ['0001', '0001/', 'm1/us/us-regional.xml', 'fda'],
      ['0002', '0002/', 'm1/us/us-regional.xml', 'fda'],
    ]);
    for (const s of sequences) expect(s.refusals, `sequence ${s.sequence}`).toEqual([]);
    expect(sequences[0].application).toMatchObject({ number: '123456', applicationType: 'fdaat4', applicant: 'Acme Biologics Inc.' });
  });

  it.each(['0000', '0001', '0002'])('sequence %s: every leaf, with its section, file, href, md5, act, pointer, title and backbone ID', (seq) => {
    const recorded = manifests.get(seq)!.map((e) => comparable({ ...e, ctdSection: HEADING_OF[e.ctdSection] ?? e.ctdSection }));
    const read = sequences.find((s) => s.sequence === seq)!.leaves.map(comparable);
    const order = (a: { backbone?: string; leafId?: string }, b: { backbone?: string; leafId?: string }) =>
      `${a.backbone}#${a.leafId}`.localeCompare(`${b.backbone}#${b.leafId}`);
    expect(read.sort(order)).toEqual(recorded.sort(order));
  });

  it('says the 3.2.S.4.2 leaf reads back at its heading, 3.2.S, because that is all the backbone records', () => {
    const leaf = sequences[0].leaves.find((l) => l.fileName === 'specification-justification.pdf')!;
    expect(leaf).toMatchObject({ ctdSection: '3.2.S', heading: 'm3-2-s-drug-substance' });
  });

  it('folds into the same filed state as the sequences the platform filed itself', async () => {
    // The real fold, through its public reader: a pool that answers the filed
    // manifests query with these rows, oldest first, as ectd_compilations would.
    const state = async (rows: { sequence_number: string; leaf_manifest: unknown }[]) => {
      return (await loadFiledStateBySubmission(filedStatePool(rows), { organizationId: 1, submissionId: 1 })).leaves
        .map((l) => ({ seq: l.sequenceNumber, section: l.ctdSection, file: l.fileName, md5: l.md5, leafId: l.leafId, backbone: l.backbone }))
        .sort((a, b) => `${a.seq}${a.backbone}${a.leafId}`.localeCompare(`${b.seq}${b.backbone}${b.leafId}`));
    };
    const native = await state(['0000', '0001', '0002'].map((seq) => ({
      sequence_number: seq,
      leaf_manifest: manifests.get(seq)!.map((e) => ({ ...e, ctdSection: HEADING_OF[e.ctdSection] ?? e.ctdSection })),
    })));
    const imported = await state(sequences.map((s) => ({ sequence_number: s.sequence!, leaf_manifest: s.leaves })));
    expect(imported).toEqual(native);
    // The state itself: the 0000 overview replaced, the study report appended
    // to, the drug substance withdrawn, the 0001 cover replaced by 0002's.
    expect(imported.filter((l) => l.file.endsWith('.pdf')).map((l) => `${l.seq} ${l.file}`).sort()).toEqual([
      '0000 cover-0000.pdf',
      '0000 specification-justification.pdf',
      '0000 study-report.pdf',
      '0001 clinical-overview.pdf',
      '0001 study-report-addendum.pdf',
      '0002 cover-0002.pdf',
    ]);
  });

  it('a pointer into the regional backbone is read from the sequence root, as the packager records it', () => {
    const cover = sequences[2].leaves.find((l) => l.fileName === 'cover-0002.pdf')!;
    expect(cover.modifiedFile).toMatch(/^\.\.\/0001\/m1\/us\/us-regional\.xml#/);
    expect(cover.backbone).toBe('m1/us/us-regional.xml');
    expect(cover.href).toBe('m1/us/1-2/cover-0002.pdf');
  });
});
