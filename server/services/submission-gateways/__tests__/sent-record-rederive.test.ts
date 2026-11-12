/**
 * P-99 C2 (F1, rows D7 and D2): a sent sequence's record is read back from the package it sent.
 * Design: docs/evidence/RIM/2026-11-08-designs/p99-restore-unrecorded-sequence.design.md §3.1.2, re-cut 2026-11-09.
 *
 * A send made before the platform kept what each send carried has no record of its leaves, so the filed state cannot
 * be read and the next sequence cannot be built against it. Where the platform kept the exact bytes it sent, the
 * record is read back from them: the reader's leaves, each one's precise section recovered from two encodings that
 * must agree (its backbone ID and its folder), what points outside the package bound against the filed state, and
 * the stored shape built by buildLeafManifest, the function the guard runs.
 *
 * The test that matters is T1: two real sequences, packaged by the canonical packager and sent through the real
 * guard, each read back from the bytes the guard kept, give exactly the record the guard stamped. The package does
 * not keep the order the packager was handed the leaves in, so the derivation records them by backbone and ID, and
 * the stamp is compared in that order.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';

const h = vi.hoisted(() => ({ kept: [] as Buffer[] }));

// The guard keeps the bytes it sends (sent-package-archive.ts); kept in memory here so each can be read back.
vi.mock('../../storage', () => ({
  getStorageProvider: () => ({
    name: 'test',
    put: async (o: { bytes: Buffer }) => {
      h.kept.push(Buffer.from(o.bytes));
      return { vaultFileId: 'vault://7/sent-packages/x', vaultVersionId: `v-${h.kept.length}`, sizeBytes: o.bytes.length,
        sha256: createHash('sha256').update(o.bytes).digest('hex'), provider: 'test' };
    },
  }),
}));
vi.mock('../../../db', () => ({
  db: {},
  pool: { query: async (text: string) => (/INSERT INTO submission_transmittals/.test(text) ? { rowCount: 1, rows: [{ id: 41 }] } : { rowCount: 0, rows: [] }) },
}));

import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';
import { getGateway } from '../index';
import { FdaEsgGateway } from '../fda-esg';
import type { GatewayTransmitRequest } from '../types';
import { deriveSentLeafManifest, SentRecordNotDerivable, SENT_RECORD_NOT_RECOVERABLE } from '../sent-package-read';
import { bindToFiledState } from '../../legacy-importer/filed-sequence-pointers';
import { readFiledSequenceArchive, type FiledSequence } from '../../legacy-importer/filed-sequence-reader';
import { computeLifecycleOperations, type DesiredLeaf, type PriorLeaf } from '../../ectd/lifecycle-operator';
import { manifestToPriorLeaves, computeSequencePrefix, type SequenceLeafManifestEntry } from '../../ectd/sequence-manifest';
import { plainPdfFixture as pdf } from '../../ectd/__tests__/support/signed-pdf-fixture';

let work: string;
const operatorFdaEnv: Record<string, string> = {};
const clearFdaEnv = () => { for (const k of Object.keys(process.env)) if (k.startsWith('FDA_ESG_')) delete process.env[k]; };
beforeAll(async () => {
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('FDA_ESG_') && v !== undefined) operatorFdaEnv[k] = v;
  clearFdaEnv();
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'sent-record-'));
});
afterAll(async () => { clearFdaEnv(); Object.assign(process.env, operatorFdaEnv); await fs.rm(work, { recursive: true, force: true }); });
beforeEach(() => { h.kept.length = 0; vi.restoreAllMocks(); });

const onDisk = async (name: string, label: string) => { const p = path.join(work, name); await fs.writeFile(p, await pdf(label)); return p; };
const md5Of = async (p: string) => createHash('md5').update(await fs.readFile(p)).digest('hex');

async function pack(sequence: string, leaves: EctdLeaf[]) {
  return packageEctdSubmission({
    region: 'fda', applicationId: '000512', sequence, submissionType: sequence === '0000' ? 'original' : 'amendment',
    fda: { applicationType: 'ind', ...(sequence === '0000' ? {} : { submissionType: 'Original Application', submissionSubType: 'amendment' }) },
    sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, `out-${sequence}-${Math.random()}`),
    environment: 'staging', leaves,
  } as Parameters<typeof packageEctdSubmission>[0]);
}

/** Send a packaged sequence through the real guard (FDA ESG's wire stubbed): what it stamped, and the bytes it kept. */
async function sendThroughGuard(bundle: Awaited<ReturnType<typeof pack>>, sequence: string) {
  const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({ transmittalId: 41, transmissionId: 'm-1', status: 'submitted', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'ok' } as never);
  const before = h.kept.length;
  await getGateway('fda', 'esg').transmit({
    organizationId: 7, userId: 11, programId: null, packageId: null, bundle, environment: 'staging', submissionType: 'original',
    metadata: { applicationId: 'IND000512', sequence, environment: 'staging' },
    authorization: { kind: 'governed-signature', signatureActionId: `sig-${sequence}`, actorUserId: 11 },
    dispatchBinding: { attemptId: `a0000000-0000-4000-8000-00000000${sequence}`, organizationId: 7, sequenceId: Number(sequence) + 1, signatureActionId: `sig-${sequence}`, bundleSha256: bundle.sha256 },
  } as GatewayTransmitRequest);
  // The latest call: a second spyOn on the same method returns the same spy, whose first call is the earlier send.
  const stamp = (wire.mock.calls.at(-1)![0] as GatewayTransmitRequest).metadata!.leafManifest as SequenceLeafManifestEntry[];
  expect(h.kept.length, 'the guard kept the bytes it sent').toBe(before + 1);
  return { stamp, bytes: h.kept[before] };
}

const byBackboneAndId = (a: SequenceLeafManifestEntry, b: SequenceLeafManifestEntry) =>
  `${a.backbone}#${a.leafId}`.localeCompare(`${b.backbone}#${b.leafId}`);
const ordered = (m: SequenceLeafManifestEntry[]) => [...m].sort(byBackboneAndId);
const withSequence = (stamp: SequenceLeafManifestEntry[], sequenceNumber: string): PriorLeaf[] =>
  manifestToPriorLeaves(stamp).map((l) => ({ ...l, sequenceNumber }));

/** 0000: Module 1 (as the row spells it), 2.5, 3.2.S, 3.2.S.4.2 and a 5.3.5.1 study report with its STF.
 *  0001: Module 1 and 2.5 replaced, 3.2.S.4.2 withdrawn, a new 3.2.S append. */
async function twoSends() {
  const b0 = await pack('0000', [
    { ctdSection: 'm1.2', fileName: 'cover.pdf', title: 'Cover letter', operation: 'new', sourcePath: await onDisk('c1.pdf', 'cover v1') },
    { ctdSection: '2.5', fileName: 'clinical-overview.pdf', title: 'Clinical overview', operation: 'new', sourcePath: await onDisk('co1.pdf', 'co v1') },
    { ctdSection: '3.2.S', fileName: 'substance.pdf', title: 'Drug substance', operation: 'new', sourcePath: await onDisk('s1.pdf', 's v1') },
    { ctdSection: '3.2.S.4.2', fileName: 'analytical-procedures.pdf', title: 'Analytical procedures', operation: 'new', sourcePath: await onDisk('ap1.pdf', 'ap v1') },
    { ctdSection: '5.3.5.1', fileName: 'report-2.pdf', title: 'Study report', operation: 'new', studyId: 'STUDY-001', stfFileTag: 'study-report-body', sourcePath: await onDisk('r1.pdf', 'r v1') },
  ] as EctdLeaf[]);
  const s0 = await sendThroughGuard(b0, '0000');
  const c2 = await onDisk('c2.pdf', 'cover v2');
  const co2 = await onDisk('co2.pdf', 'co v2');
  const desired: DesiredLeaf[] = [
    { ctdSection: 'm1.2', fileName: 'cover.pdf', title: 'Cover letter', sourcePath: c2, md5: await md5Of(c2) },
    { ctdSection: '2.5', fileName: 'clinical-overview.pdf', title: 'Clinical overview', sourcePath: co2, md5: await md5Of(co2) },
    { ctdSection: '3.2.S.4.2', fileName: 'analytical-procedures.pdf', title: 'Analytical procedures', sourcePath: '', md5: '', withdraw: true },
  ] as DesiredLeaf[];
  const life = computeLifecycleOperations(withSequence(s0.stamp, '0000'), desired, { priorSequencePrefix: computeSequencePrefix('0000') });
  const b1 = await pack('0001', life.leaves as EctdLeaf[]);
  const s1 = await sendThroughGuard(b1, '0001');
  return { s0, s1 };
}

/** The zip with one text entry changed, and index-md5.txt kept true to index.xml. */
async function edited(bytes: Buffer, entry: string, edit: (s: string) => string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(bytes);
  const prefix = Object.keys(zip.files).find((n) => n.endsWith(entry))!.slice(0, -entry.length);
  const xml = edit(await zip.file(prefix + entry)!.async('string'));
  zip.file(prefix + entry, xml);
  if (entry === 'index.xml' && zip.file(`${prefix}index-md5.txt`)) zip.file(`${prefix}index-md5.txt`, createHash('md5').update(xml).digest('hex'));
  return zip.generateAsync({ type: 'nodebuffer' });
}
const refusalOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('P-99 C2: a sent sequence’s record is read back from the package it sent', () => {
  it('T1 two sequences sent through the real guard each read back to exactly what the guard stamped', async () => {
    const { s0, s1 } = await twoSends();
    const d0 = await deriveSentLeafManifest(s0.bytes, { sequenceNumber: '0000', region: 'fda' }, []);
    expect(JSON.stringify(d0.leaves)).toBe(JSON.stringify(ordered(s0.stamp)));
    const d1 = await deriveSentLeafManifest(s1.bytes, { sequenceNumber: '0001', region: 'fda' }, withSequence(s0.stamp, '0000'));
    // Key order included: the derivation's last step is buildLeafManifest, as the guard's is.
    expect(JSON.stringify(d1.leaves)).toBe(JSON.stringify(ordered(s1.stamp)));
    expect(d1.leafCount).toBe(s1.stamp.length);
    expect(d1.leaves.find((l) => l.operation === 'delete')).toMatchObject({ ctdSection: '3.2.S.4.2', fileName: 'analytical-procedures.pdf' });
  }, 120_000);

  it('T2 what a package cannot hold is not recorded, and is named', async () => {
    const { s0 } = await twoSends();
    const d0 = await deriveSentLeafManifest(s0.bytes, { sequenceNumber: '0000', region: 'fda' }, []);
    expect([...d0.notRecoverable]).toEqual(['sourceMd5', 'originalPdfProof']);
    expect([...SENT_RECORD_NOT_RECOVERABLE]).toEqual(['sourceMd5', 'originalPdfProof']);
    // A stamp made where the host converted to PDF/A carries both; the read-back equals it on every other field.
    const converted = ordered(s0.stamp).map((l, i) => (i === 0 ? { ...l, sourceMd5: 'e'.repeat(32), originalPdfProof: { sha256: 'f'.repeat(64) } as never } : l));
    const strip = (m: SequenceLeafManifestEntry[]) => m.map(({ sourceMd5: _s, originalPdfProof: _o, ...rest }) => rest);
    expect(d0.leaves.every((l) => !('sourceMd5' in l) && !('originalPdfProof' in l))).toBe(true);
    expect(strip(d0.leaves)).toEqual(strip(converted));
  }, 120_000);

  it('T3 each leaf’s precise section is read back from its ID and folder, and two that disagree refuse it by name', async () => {
    const { s0 } = await twoSends();
    const read = (await readFiledSequenceArchive(s0.bytes)).sequences[0];
    const sectionOf = (m: Array<{ fileName: string; ctdSection: string }>, f: string) => m.find((l) => l.fileName === f)?.ctdSection;
    expect([sectionOf(read.leaves, 'analytical-procedures.pdf'), sectionOf(read.leaves, 'cover.pdf')]).toEqual(['3.2.S', '1.2']);
    const d0 = await deriveSentLeafManifest(s0.bytes, { sequenceNumber: '0000', region: 'fda' }, []);
    expect([sectionOf(d0.leaves, 'analytical-procedures.pdf'), sectionOf(d0.leaves, 'cover.pdf'), sectionOf(d0.leaves, 'report-2.pdf')])
      .toEqual(['3.2.S.4.2', 'm1.2', '5.3.5.1']);
    // One byte of the ID changed: the ID says 3.2.S.4.3, the folder 3.2.S.4.2.
    const idChanged = await edited(s0.bytes, 'index.xml', (x) => x.replace(/leaf-3-2-S-4-2-analytical-procedures/g, 'leaf-3-2-S-4-3-analytical-procedures'));
    const e1 = await refusalOf(deriveSentLeafManifest(idChanged, { sequenceNumber: '0000', region: 'fda' }, []));
    expect(e1).toBeInstanceOf(SentRecordNotDerivable);
    expect((e1 as SentRecordNotDerivable).reasons.join(' ')).toMatch(/analytical-procedures\.pdf: its section could not be read back from the package/);
    // An ID whose suffix is not the file's slug (with or without a collision number).
    const slugChanged = await edited(s0.bytes, 'index.xml', (x) => x.replace(/leaf-3-2-S-substance"/g, 'leaf-3-2-S-substanc-2"'));
    const e2 = await refusalOf(deriveSentLeafManifest(slugChanged, { sequenceNumber: '0000', region: 'fda' }, []));
    expect((e2 as SentRecordNotDerivable).reasons.join(' ')).toMatch(/substance\.pdf: its section could not be read back from the package/);
  }, 120_000);

  it('T4 what points outside the package is bound against the filed state, or refused', async () => {
    const { s0, s1 } = await twoSends();
    const prior = withSequence(s0.stamp, '0000');
    // The withdrawn leaf is no longer on file: its pointer names nothing.
    const withoutAp = prior.filter((l) => l.fileName !== 'analytical-procedures.pdf');
    const e = await refusalOf(deriveSentLeafManifest(s1.bytes, { sequenceNumber: '0001', region: 'fda' }, withoutAp));
    expect((e as SentRecordNotDerivable).reasons.join(' ')).toMatch(/leaf-3-2-S-4-2-analytical-procedures.*names no leaf on file in sequence 0000/);
    // A withdrawal takes the withdrawn leaf's section, name and checksum from the filed state.
    const read = (await readFiledSequenceArchive(s1.bytes)).sequences[0];
    const refusals = bindToFiledState(read, prior);
    expect(refusals).toEqual([]);
    const ap = prior.find((l) => l.fileName === 'analytical-procedures.pdf')!;
    expect(read.leaves.find((l) => l.operation === 'delete')).toMatchObject({ ctdSection: '3.2.S.4.2', fileName: 'analytical-procedures.pdf', md5: ap.md5 });
    expect(read.outsideArchive).toEqual([]);
    // A reused file must name a filed leaf with that href and that checksum.
    const reused: FiledSequence = { ...read, outsideArchive: ['leaf-x'], refusals: [], leaves: [{ ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: '../0000/m2/2-5/clinical-overview.pdf', md5: '0'.repeat(32), operation: 'new', leafId: 'leaf-x', backbone: 'index.xml', archivePath: '', heading: 'm2-5-clinical-overview' }] };
    expect(bindToFiledState(reused, prior).join(' ')).toMatch(/leaf-x.*reuses .*clinical-overview\.pdf.*not the checksum filed/);
  }, 120_000);

  it('T5 the same bytes and the same filed state always give the same record', async () => {
    const { s0, s1 } = await twoSends();
    const prior = withSequence(s0.stamp, '0000');
    const a = await deriveSentLeafManifest(s1.bytes, { sequenceNumber: '0001', region: 'fda' }, prior);
    const b = await deriveSentLeafManifest(s1.bytes, { sequenceNumber: '0001', region: 'fda' }, prior);
    expect(a.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(b.manifestSha256).toBe(a.manifestSha256);
    // Another sequence number or agency than the package's is refused, not read as another sequence.
    const e = await refusalOf(deriveSentLeafManifest(s1.bytes, { sequenceNumber: '0002', region: 'fda' }, prior));
    expect((e as SentRecordNotDerivable).reasons.join(' ')).toMatch(/sequence 0002/);
  }, 120_000);
});
