/**
 * `modified-file` names the leaf an act supersedes the way ICH eCTD v3.2.2
 * requires: the backbone of the sequence that filed it, '#', and that leaf's
 * ID. From index.xml at a sequence root that is `../0000/index.xml#leaf-…`; from
 * the FDA regional backbone two folders down it is
 * `../../../0000/m1/us/us-regional.xml#leaf-…`, the shape of FDA's own Module 1
 * examples (controlled-vocab/cv-v3-data.ts quotes the grouped form,
 * `../../../../nda456789/0001/m1/us/us-regional.xml#id21342`).
 *
 * 2026-09-29 (W5/D7, WO-9 Click 6). The chain wrote the superseded FILE's path
 * instead (`../0000/m3/…/x.pdf`), which names no leaf, so an agency validator
 * cannot resolve any replace, append or delete. It also put a checksum and an
 * xlink:href on a delete, which ships no file; FDA's validation criteria say a
 * delete carries no checksum.
 *
 * Every assertion here is read from real packages built by the canonical
 * packager: sequence 0000 is packaged, its recorded leaf manifest is the prior
 * state, and 0001 is packaged from the operator's result. A pointer is correct
 * only if the ID it names is on the leaf 0000 actually filed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import JSZip from 'jszip';
import { packageEctdSubmission, type EctdLeaf } from '../regional-packager';
import { computeLifecycleOperations, type DesiredLeaf } from '../../ectd/lifecycle-operator';
import { buildLeafManifest, manifestToPriorLeaves, computeSequencePrefix } from '../../ectd/sequence-manifest';

const REGIONAL = 'm1/us/us-regional.xml';
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`, 'utf8');

let work: string;
beforeEach(async () => { work = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-mf-')); });
afterEach(async () => { await fs.rm(work, { recursive: true, force: true }); });

async function onDisk(name: string, label: string): Promise<string> {
  const p = path.join(work, name);
  await fs.writeFile(p, pdf(label));
  return p;
}

async function pack(sequence: string, leaves: EctdLeaf[]) {
  const bundle = await packageEctdSubmission({
    region: 'fda', applicationId: '000512', sequence,
    submissionType: sequence === '0000' ? 'original' : 'amendment',
    // An IND amendment: the IND's own submission type, sub-type amendment.
    fda: {
      applicationType: 'ind',
      ...(sequence === '0000' ? {} : { submissionType: 'Original Application', submissionSubType: 'amendment' }),
    },
    sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, `out-${sequence}`),
    environment: 'staging', leaves,
  });
  const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
  const read = async (rel: string) => (await zip.file(rel)?.async('string')) ?? '';
  return { bundle, index: await read('index.xml'), regional: await read(REGIONAL) };
}

/** The <leaf …> start tag in `xml` whose attributes match `attr`. */
function leafTag(xml: string, attr: RegExp): string {
  const tag = (xml.match(/<leaf\b[^>]*>/g) ?? []).find((t) => attr.test(t));
  if (!tag) throw new Error(`no leaf matching ${attr} in:\n${xml}`);
  return tag;
}
const attrOf = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** 0000: two Module 3 documents and a Module 1 cover letter; 0001 replaces one of each module and withdraws the other. */
async function originalThenFollowUp() {
  const s0 = await pack('0000', [
    { ctdSection: '3.2.S.1', fileName: 'general.pdf', title: 'General', operation: 'new', sourcePath: await onDisk('g1.pdf', 'general v1') },
    { ctdSection: '3.2.S.2', fileName: 'manufacture.pdf', title: 'Manufacture', operation: 'new', sourcePath: await onDisk('m1.pdf', 'manufacture v1') },
    { ctdSection: '1.2', fileName: 'cover.pdf', title: 'Cover letter', operation: 'new', sourcePath: await onDisk('c1.pdf', 'cover v1') },
  ]);
  const prior = manifestToPriorLeaves(buildLeafManifest(s0.bundle.leafManifest ?? []));
  const g2 = await onDisk('g2.pdf', 'general v2');
  const c2 = await onDisk('c2.pdf', 'cover v2');
  const { createHash } = await import('crypto');
  const md5 = async (p: string) => createHash('md5').update(await fs.readFile(p)).digest('hex');
  const desired: DesiredLeaf[] = [
    { ctdSection: '3.2.S.1', fileName: 'general.pdf', title: 'General', sourcePath: g2, md5: await md5(g2) },
    { ctdSection: '1.2', fileName: 'cover.pdf', title: 'Cover letter', sourcePath: c2, md5: await md5(c2) },
    { ctdSection: '3.2.S.2', fileName: 'manufacture.pdf', title: 'Manufacture', sourcePath: '', md5: '', withdraw: true },
  ];
  const life = computeLifecycleOperations(prior, desired, { priorSequencePrefix: computeSequencePrefix('0000') });
  const s1 = await pack('0001', life.leaves as EctdLeaf[]);
  return { s0, s1, life };
}

describe('modified-file names the superseded leaf by backbone and ID', () => {
  it('a Module 3 replace points at the ID 0000 filed that document under, in 0000/index.xml', async () => {
    const { s0, s1 } = await originalThenFollowUp();
    const filedId = attrOf(leafTag(s0.index, /xlink:href="m3\/3-2-s-1\/general\.pdf"/), 'ID');
    const replace = leafTag(s1.index, /operation="replace"/);
    expect(filedId).toBeTruthy();
    expect(attrOf(replace, 'modified-file')).toBe(`../0000/index.xml#${filedId}`);
  });

  it('a Module 1 replace, carried by the regional backbone two folders down, climbs out to 0000/m1/us/us-regional.xml', async () => {
    const { s0, s1 } = await originalThenFollowUp();
    const filedId = attrOf(leafTag(s0.regional, /xlink:href="[^"]*cover\.pdf"/), 'ID');
    const replace = leafTag(s1.regional, /operation="replace"/);
    expect(filedId).toBeTruthy();
    expect(attrOf(replace, 'modified-file')).toBe(`../../../0000/${REGIONAL}#${filedId}`);
  });

  it('a delete names the withdrawn leaf the same way, and carries no checksum and no href: it ships no file', async () => {
    const { s0, s1 } = await originalThenFollowUp();
    const filedId = attrOf(leafTag(s0.index, /xlink:href="m3\/3-2-s-2\/manufacture\.pdf"/), 'ID');
    const del = leafTag(s1.index, /operation="delete"/);
    expect(attrOf(del, 'modified-file')).toBe(`../0000/index.xml#${filedId}`);
    expect(del).not.toMatch(/\bchecksum=/);
    expect(del).not.toMatch(/\bchecksum-type=/);
    expect(del).not.toMatch(/\bxlink:href=/);
  });

  it('the recorded manifest names, for every leaf, the backbone that carries it and the ID it carries there', async () => {
    const { s0 } = await originalThenFollowUp();
    const manifest = buildLeafManifest(s0.bundle.leafManifest ?? []);
    expect(manifest).toHaveLength(3);
    for (const e of manifest) {
      const xml = e.backbone === 'index.xml' ? s0.index : e.backbone === REGIONAL ? s0.regional : null;
      expect(xml, `${e.fileName} names a backbone this package has: ${e.backbone}`).not.toBeNull();
      const tag = leafTag(xml!, new RegExp(`\\bID="${e.leafId}"`));
      expect(tag, `${e.fileName}'s recorded ID is on the leaf that carries it`).toContain(e.fileName);
    }
  });

  it('a withdrawal is recorded with the pointer it filed, so a later sequence still folds it out', async () => {
    const { s0, s1 } = await originalThenFollowUp();
    const filedId = attrOf(leafTag(s0.index, /xlink:href="m3\/3-2-s-2\/manufacture\.pdf"/), 'ID');
    const recorded = buildLeafManifest(s1.bundle.leafManifest ?? []).find((e) => e.operation === 'delete');
    expect(recorded).toMatchObject({ ctdSection: '3.2.S.2', fileName: 'manufacture.pdf', modifiedFile: `../0000/index.xml#${filedId}` });
  });

  it('a prior leaf recorded without its backbone ID gets no modified-file at all — never a file path', () => {
    const prior = manifestToPriorLeaves([
      { ctdSection: '3.2.S.1', fileName: 'general.pdf', href: 'm3/3-2-s-1/general.pdf', md5: 'a'.repeat(32) },
    ]);
    const life = computeLifecycleOperations(
      prior,
      [{ ctdSection: '3.2.S.1', fileName: 'general.pdf', title: 'General', sourcePath: '/x', md5: 'b'.repeat(32) }],
      { priorSequencePrefix: '../0000/' },
    );
    expect(life.leaves[0].operation).toBe('replace');
    expect(life.leaves[0].modifiedFile).toBeUndefined();
  });

  it('the packager refuses a follow-up replace that names no superseded leaf, as it refuses such a delete', async () => {
    await expect(pack('0001', [
      { ctdSection: '3.2.S.1', fileName: 'general.pdf', title: 'General', operation: 'replace', sourcePath: await onDisk('g.pdf', 'g') },
    ])).rejects.toThrow(/replace[\s\S]*modified-file/i);
  });
});

describe('the packager refuses a modified-file that names no leaf', () => {
  it.each([
    ['a file path', '../0000/m3/3-2-s-1/general.pdf'],
    ['a file path with a fragment', '../0000/m3/3-2-s-1/general.pdf#leaf-3-2-S-1-general'],
    ['a same-root pointer', 'index.xml#leaf-3-2-S-1-general'],
    ['a pointer that climbs back out mid-path', '../0000/../x/index.xml#leaf-3-2-S-1-general'],
  ])('%s', async (_what, modifiedFile) => {
    await expect(pack('0001', [
      { ctdSection: '3.2.S.1', fileName: 'general.pdf', title: 'General', operation: 'replace', modifiedFile, sourcePath: await onDisk('g.pdf', 'g') },
    ])).rejects.toThrow(/names no filed leaf/);
  });
});
