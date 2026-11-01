/**
 * Read eCTD v3.2.2 sequences another publisher filed into the leaf manifest
 * this platform records for the sequences it files itself.
 *
 * MR-10 Stage 9 (CAT2-07), slice 1, 2026-11-01. A sponsor whose IND's 0000-0002
 * were filed by another publisher cannot replace, append to or withdraw any of
 * those leaves here until the platform knows what is on file: each leaf's
 * section, file, checksum, act, the pointer its act carried, and the backbone
 * ID a later `modified-file` names. That is `SequenceLeafManifestEntry`
 * (ectd/sequence-manifest.ts), the record `packageEctdSubmission` makes of its
 * own sequences and `foldManifestRows` (ectd/prior-sequence-loader.ts) folds
 * into the filed state. This module produces the same record from an archive.
 * Recording it as filed state is a governed act and is not done here.
 *
 * It replaces the regex reader that was in detector.ts (`parseBackboneLeaves`).
 * That reader read the regional backbone only and compared hrefs with zip
 * paths. A regional backbone's hrefs are relative to its own folder, so it
 * matched no Module 1 leaf of a real sequence. It never read index.xml, so
 * every Module 2-5 leaf was placed by filename.
 *
 * What it reads, per sequence (a folder holding index.xml: the archive root,
 * or a four-digit sequence folder at any depth):
 *   - index.xml, checked against index-md5.txt at the sequence root;
 *   - the regional backbone index.xml points at, checked against the checksum
 *     that pointer carries;
 *   - every <leaf> in both. Each href is resolved against its backbone's
 *     folder and must stay inside the sequence. The file's MD5 must equal the
 *     leaf's md5 `checksum`. Every leaf needs an ID and a known operation. A
 *     replace, append or delete must carry a `modified-file` that leaves its
 *     own sequence and names a backbone and a leaf ID. It is re-expressed from
 *     the sequence root, as the packager records it.
 *
 * Whether a pointer names a leaf is decided by resolving it, not by its
 * spelling. A pointer into another sequence of the same archive must bind to a
 * leaf read from that backbone of an earlier sequence. A pointer to a sequence
 * the archive does not hold is listed (`outsideArchive`) for the recorded
 * filed state to bind. The fold binds with prior-sequence-loader's
 * MODIFIED_FILE; that file is held by the RIM lane for F1 slice 1
 * (.design/claude-convergence/COORDINATION.md), so it is not touched here.
 *
 * A leaf's section is the heading the backbone files it under, read from the
 * heading's element name (`headingSection`): an ICH or FDA heading's name
 * encodes its section, `m3-2-s-4-1-specification` → 3.2.S.4.1, which is what
 * the packager's forward maps rely on (`encodesSection` in
 * fda-regional-sections.ts). Every heading between the backbone root and the
 * leaf must decode, each inside the one holding it. A Modules 2-5 section must
 * resolve in this repository's ICH tree, and a Module 1 section must have at
 * least two segments. Anything else is refused by name, never guessed: no
 * section is taken from a folder or a filename. The reader does not check a
 * decoded section against a list of CTD sections. The ICH DTD that lists them
 * is not vendored (assets/ectd-dtd holds no DTD).
 *
 * Refusals are per leaf where the defect is the leaf's, and per sequence where
 * it is the backbone's. A refused leaf is not in `leaves`, so a sequence with
 * any refusal is not a complete record of what was filed (`isComplete`), and
 * nothing may record it as filed state.
 *
 * XML is parsed by @xmldom/xmldom, which fetches no external DTD and expands
 * no entity it was not given. A backbone that declares an entity or an
 * internal DTD subset is refused before it is parsed.
 *
 * @module server/services/legacy-importer/filed-sequence-reader
 */

import { createHash } from 'crypto';
import * as path from 'path';
import JSZip from 'jszip';
import { DOMParser, onErrorStopParsing, type Document, type Element } from '@xmldom/xmldom';
import { assertZipWithinLimits } from '../archive/safeZip';
import { headingPathFor } from '../submission-gateways/ectd-packager/ich-headings';
import { isContainedIn } from '../ectd/leaf-path-safety';
import type { SequenceLeafManifestEntry } from '../ectd/sequence-manifest';

/* ─── Types ─────────────────────────────────────────────────────────── */

export type FiledSequenceRefusalCode =
  | 'backbone_not_well_formed'
  | 'backbone_declares_entities'
  | 'index_md5_missing'
  | 'index_md5_mismatch'
  | 'regional_backbone_missing'
  | 'regional_backbone_checksum_mismatch'
  | 'regional_backbone_unreferenced'
  | 'leaf_id_missing'
  | 'leaf_id_duplicate'
  | 'leaf_operation_unknown'
  | 'leaf_heading_unmapped'
  | 'leaf_href_unsafe'
  | 'leaf_file_missing'
  | 'leaf_checksum_missing'
  | 'leaf_checksum_mismatch'
  | 'leaf_modified_file_missing'
  | 'leaf_modified_file_unresolved'
  | 'sequence_number_missing'
  | 'sequence_number_disagrees'
  | 'sequence_number_duplicate';

export interface FiledSequenceRefusal {
  code: FiledSequenceRefusalCode;
  message: string;
  /** The file concerned, from the sequence root. */
  path?: string;
  /** The leaf concerned, by its backbone ID. */
  leafId?: string;
}

/** One leaf as filed: the manifest entry, and where it was read from. */
export interface FiledSequenceLeaf extends SequenceLeafManifestEntry {
  operation: 'new' | 'replace' | 'append' | 'delete';
  leafId: string;
  backbone: string;
  /** Zip path of the leaf's file; '' for a delete, which ships none. */
  archivePath: string;
  /** The heading element the leaf is filed under (`form` for an FDA admin form). */
  heading: string;
}

export interface FiledSequence {
  /** The sequence's folder in the archive: '' or e.g. '0001/' or 'ind123456/0001/'. */
  root: string;
  /** The sequence number: its folder's name, else the regional backbone's. */
  sequence: string | null;
  /** The regional backbone, from the sequence root, as index.xml references it. */
  regionalBackbone: string | null;
  region: 'fda' | 'ema' | 'pmda' | null;
  application: {
    number: string | null;
    applicationType: string | null;
    submissionType: string | null;
    applicant: string | null;
  };
  leaves: FiledSequenceLeaf[];
  refusals: FiledSequenceRefusal[];
  /** Files in the sequence that neither backbone references (util/ and the backbones aside). */
  unreferenced: string[];
  /** IDs of leaves whose modified-file names a sequence this archive does not hold. */
  outsideArchive: string[];
}

export interface FiledArchive {
  /** Ascending by sequence number. */
  sequences: FiledSequence[];
  /** Defects of the archive as a whole (two folders with one sequence number). */
  refusals: FiledSequenceRefusal[];
}

/** A sequence is a complete record of what was filed only when nothing in it was refused. */
export function isComplete(sequence: FiledSequence): boolean {
  return sequence.refusals.length === 0;
}

/* ─── Headings ──────────────────────────────────────────────────────── */

/**
 * The CTD section an ICH or FDA heading element's name encodes, or null when
 * it encodes none: `m2-5-clinical-overview` → 2.5, `m3-2-s-drug-substance` →
 * 3.2.S, `m1-12-4-request-for-comments-and-advice` → 1.12.4. A letter segment
 * is read only where the CTD has one (3.2.S/P/A/R and 2.3.S/P/A/R).
 */
export function headingSection(element: string): string | null {
  const tokens = element.toLowerCase().split('-');
  if (!/^m\d+$/.test(tokens[0])) return null;
  const out = [tokens[0].slice(1)];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+$/.test(t)) {
      out.push(t);
    } else if (i === 2 && /^[spar]$/.test(t) && ['3.2', '2.3'].includes(out.join('.'))) {
      out.push(t.toUpperCase());
    } else {
      break;
    }
  }
  return out.join('.');
}

/** Is `inner` the same section as `outer`, or inside it? */
function sectionWithin(inner: string, outer: string): boolean {
  const i = inner.split('.');
  const o = outer.split('.');
  return o.length <= i.length && o.every((seg, n) => seg === i[n]);
}

/** Elements a leaf may sit in that are not headings, by backbone. */
const WRAPPERS_INDEX = new Set(['node-extension']);
const WRAPPERS_REGIONAL = new Set([
  'node-extension', 'specific',
  // FDA v3.3: a form's leaf is written in <form> in the application's admin block.
  'form', 'submission-information', 'application', 'application-set', 'admin',
]);

interface Placement { section: string; heading: string }
interface Refused { refusal: string }

/** The elements between the backbone root and a leaf, outermost first. */
function holdersOf(leaf: Element): Element[] {
  const holders: Element[] = [];
  for (let n = leaf.parentNode; n && n.nodeType === 1 && n !== n.ownerDocument?.documentElement; n = n.parentNode) {
    holders.unshift(n as Element);
  }
  return holders;
}

/** The deepest heading holding a leaf, every heading inside the one holding it; null when there is none. */
function deepestHeading(holders: Element[], wrappers: Set<string>): Placement | Refused | null {
  let found: Placement | null = null;
  for (const el of holders) {
    const name = el.localName ?? '';
    const section = headingSection(name);
    if (section === null) {
      if (!wrappers.has(name)) return { refusal: `<${name}> is not an eCTD heading, so it says no section` };
      continue;
    }
    if (found && !sectionWithin(section, found.section)) {
      return { refusal: `heading <${name}> (${section}) is not inside the heading that holds it (${found.section})` };
    }
    found = { section, heading: name };
  }
  return found;
}

function regionalPlacement(holders: Element[]): Placement | Refused {
  const found = deepestHeading(holders, WRAPPERS_REGIONAL);
  if (found && 'refusal' in found) return found;
  if (!found && holders.some((el) => el.localName === 'form')) return { section: '1.1', heading: 'form' };
  const parts = found?.section.split('.') ?? [];
  if (!found || parts[0] !== '1' || parts.length < 2) {
    return { refusal: `a Module 1 leaf must be filed under a Module 1 heading (1.x)${found ? `; <${found.heading}> is ${found.section}` : ''}` };
  }
  return found;
}

function ichPlacement(holders: Element[]): Placement | Refused {
  const found = deepestHeading(holders, WRAPPERS_INDEX);
  if (!found) return { refusal: 'it is filed under no heading' };
  if ('refusal' in found || found.section === '1') return found;
  if (!['2', '3', '4', '5'].includes(found.section.split('.')[0]) || !headingPathFor(found.section)) {
    return { refusal: `heading <${found.heading}> is ${found.section}, which is not in the ICH Module 2-5 tree` };
  }
  return found;
}

/** Where a leaf is filed, from the elements that hold it. */
function placementOf(leaf: Element, regional: boolean): Placement | Refused {
  const holders = holdersOf(leaf);
  return regional ? regionalPlacement(holders) : ichPlacement(holders);
}

/* ─── Backbones ─────────────────────────────────────────────────────── */

const md5Of = (b: Buffer) => createHash('md5').update(b).digest('hex');
const OPERATIONS = new Set(['new', 'replace', 'append', 'delete']);
const XLINK_NAMESPACES = new Set(['http://www.w3c.org/1999/xlink', 'http://www.w3.org/1999/xlink']);
const SEQUENCE_FOLDER = /^\d{4}$/;
const REGIONAL_PATH = /^m1\/[a-z]{2}\/[a-z]{2}-regional\.xml$/;
/** A path ending in a sequence folder and one of its backbones: `../0000/index.xml`, `0001/m1/us/us-regional.xml`. */
const SEQUENCE_BACKBONE = /(^|\/)\d{4}\/(index\.xml|m1\/[a-z]{2}\/[a-z]{2}-regional\.xml)$/;
const REGION_BY_FOLDER: Record<string, FiledSequence['region']> = { us: 'fda', eu: 'ema', jp: 'pmda' };

const refusal = (code: FiledSequenceRefusalCode, message: string, at: { path?: string; leafId?: string } = {}): FiledSequenceRefusal =>
  ({ code, message, ...at });
const isRefusal = (v: object): v is FiledSequenceRefusal => 'code' in v;

/** A leaf's xlink:href, whatever prefix or XLink namespace spelling the backbone uses. */
function xlinkHref(el: Element): string | null {
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes.item(i)!;
    if (a.localName === 'href' && (XLINK_NAMESPACES.has(a.namespaceURI ?? '') || a.name === 'xlink:href')) return a.value;
  }
  return null;
}

const attr = (el: Element, name: string) => (el.getAttribute(name) ?? '').trim();

function parseBackbone(xml: string): { doc: Document } | { code: FiledSequenceRefusalCode; message: string } {
  if (/<!ENTITY/i.test(xml) || /<!DOCTYPE[^>[]*\[/i.test(xml)) {
    return { code: 'backbone_declares_entities', message: 'declares entities or an internal DTD subset, which a backbone has no use for; it is not parsed' };
  }
  try {
    const doc = new DOMParser({ onError: onErrorStopParsing }).parseFromString(xml, 'text/xml');
    if (!doc?.documentElement) return { code: 'backbone_not_well_formed', message: 'has no root element' };
    return { doc };
  } catch (err) {
    return { code: 'backbone_not_well_formed', message: `is not well-formed XML (${err instanceof Error ? err.message.split('\n')[0] : String(err)})` };
  }
}

/** Every element of this local name, in document order. */
function elementsNamed(doc: Document, localName: string): Element[] {
  const out: Element[] = [];
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i);
    if (el?.localName === localName) out.push(el);
  }
  return out;
}

const firstNamed = (doc: Document, localName: string): Element | null => elementsNamed(doc, localName)[0] ?? null;
const textOf = (el: Element | null): string | null => el?.textContent?.trim() || null;

const titleOf = (leaf: Element): string | undefined => {
  for (let n = leaf.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).localName === 'title') return (n.textContent ?? '').trim() || undefined;
  }
  return undefined;
};

/** The path a href names inside the sequence, or why it names none. */
function resolveHref(href: string, backboneDir: string): { resolved: string } | Refused {
  if (!href || /[\\\0?#]/.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href) || path.posix.isAbsolute(href)) {
    return { refusal: `href "${href}" is not a relative path to a file` };
  }
  const resolved = path.posix.normalize(path.posix.join(backboneDir, href));
  if (!isContainedIn('/sequence', path.posix.join('/sequence', resolved)) || resolved.startsWith('../')) {
    return { refusal: `href "${href}" leads out of the sequence` };
  }
  return { resolved };
}

interface ReadContext {
  zip: JSZip;
  root: string;
  backbone: string;
  backboneDir: string;
  regional: boolean;
  refusals: FiledSequenceRefusal[];
  referenced: Set<string>;
}

interface LeafHead { id: string; label: string; operation: FiledSequenceLeaf['operation']; href: string | null }
interface RegionalPointer { href: string; checksum: string | null; leafId: string }

/** A leaf's ID (present, once per backbone) and operation (one of the four). */
function leafHead(el: Element, ids: Set<string>): LeafHead | FiledSequenceRefusal {
  const id = attr(el, 'ID');
  const href = xlinkHref(el);
  const label = id ? `leaf ${id}` : `a leaf${href ? ` for "${href}"` : ''}`;
  if (!id) return refusal('leaf_id_missing', `${label} carries no ID, so no later sequence could name it`);
  if (ids.has(id)) return refusal('leaf_id_duplicate', `ID ${id} is carried by more than one leaf`, { leafId: id });
  ids.add(id);
  const operation = attr(el, 'operation').toLowerCase();
  if (!OPERATIONS.has(operation)) {
    return refusal('leaf_operation_unknown', `${label} has operation "${operation}", which is not new, replace, append or delete`, { leafId: id });
  }
  return { id, label, operation: operation as FiledSequenceLeaf['operation'], href };
}

/** index.xml's Module 1 entry: the pointer at the regional backbone, which is structure, not a document. */
function regionalPointer(el: Element, head: LeafHead): RegionalPointer | FiledSequenceRefusal {
  const target = head.href ? resolveHref(head.href, '') : null;
  if (!target || 'refusal' in target || !REGIONAL_PATH.test(target.resolved)) {
    return refusal('leaf_heading_unmapped',
      `${head.label} is filed in Module 1 of index.xml, where only the pointer at the regional backbone belongs`, { leafId: head.id });
  }
  return { href: target.resolved, checksum: el.getAttribute('checksum'), leafId: head.id };
}

/** A replace, append or delete's modified-file, re-expressed from the sequence root as the packager records it. */
function leafAct(el: Element, head: LeafHead, backboneDir: string): { modifiedFile?: string } | FiledSequenceRefusal {
  if (head.operation === 'new') return {};
  const raw = attr(el, 'modified-file');
  if (!raw) {
    return refusal('leaf_modified_file_missing', `${head.label} is a ${head.operation} with no modified-file, so it names no filed leaf it acts on`, { leafId: head.id });
  }
  const [file, id, extra] = raw.split('#');
  const fromRoot = path.posix.normalize(path.posix.join(backboneDir, file));
  // What a pointer must be to name a leaf at all: out of this sequence, into a
  // backbone, with an ID. Whether it names one is decided by binding it.
  if (extra !== undefined || !id || !/\.xml$/.test(fromRoot) || !fromRoot.startsWith('../')) {
    return refusal('leaf_modified_file_unresolved',
      `${head.label}'s modified-file "${raw}" does not name a leaf in another sequence's backbone (../<sequence>/<backbone>#<ID>)`, { leafId: head.id });
  }
  return { modifiedFile: `${fromRoot}#${id}` };
}

/** A leaf's file: its href inside the sequence, held by the archive, with the bytes its md5 checksum names. */
async function leafFile(el: Element, head: LeafHead, ctx: ReadContext): Promise<{ href: string; archivePath: string; md5: string } | FiledSequenceRefusal> {
  const { id, label } = head;
  if (head.href === null) return refusal('leaf_file_missing', `${label} is a ${head.operation} with no xlink:href`, { leafId: id });
  const target = resolveHref(head.href, ctx.backboneDir);
  if ('refusal' in target) return refusal('leaf_href_unsafe', `${label}: ${target.refusal}; it is not read`, { leafId: id });
  const at = { leafId: id, path: target.resolved };
  const archivePath = `${ctx.root}${target.resolved}`;
  ctx.referenced.add(archivePath);
  const file = ctx.zip.file(archivePath);
  if (!file) return refusal('leaf_file_missing', `${label} references "${target.resolved}", which the archive does not hold`, at);
  const checksum = attr(el, 'checksum').toLowerCase();
  if (!checksum || attr(el, 'checksum-type').toLowerCase() !== 'md5') {
    return refusal('leaf_checksum_missing', `${label} carries no md5 checksum for "${target.resolved}"`, at);
  }
  const actual = md5Of(await file.async('nodebuffer'));
  if (actual !== checksum) {
    return refusal('leaf_checksum_mismatch', `${label} records md5 ${checksum} for "${target.resolved}", but the file's MD5 is ${actual}`, at);
  }
  return { href: target.resolved, archivePath, md5: actual };
}

type LeafOutcome = { leaf: FiledSequenceLeaf } | { pointer: RegionalPointer } | FiledSequenceRefusal;

/** One leaf, read and verified, or the reason it is refused. */
async function readLeaf(el: Element, ctx: ReadContext, ids: Set<string>): Promise<LeafOutcome> {
  const head = leafHead(el, ids);
  if (isRefusal(head)) return head;
  const placed = placementOf(el, ctx.regional);
  if ('refusal' in placed) return refusal('leaf_heading_unmapped', `${head.label}: ${placed.refusal}`, { leafId: head.id });
  if (!ctx.regional && placed.section === '1') {
    const pointer = regionalPointer(el, head);
    return isRefusal(pointer) ? pointer : { pointer };
  }
  const act = leafAct(el, head, ctx.backboneDir);
  if (isRefusal(act)) return act;
  const title = titleOf(el);
  const common = {
    ctdSection: placed.section, operation: head.operation, leafId: head.id, backbone: ctx.backbone, heading: placed.heading,
    ...(title ? { title } : {}), ...act,
  };
  if (head.operation === 'delete') {
    // A withdrawal ships no file; the packager records its pointer as its href.
    // Its file name and md5 are the withdrawn leaf's, bound in bindPointers.
    return { leaf: { ...common, fileName: '', href: act.modifiedFile!, md5: '', archivePath: '' } };
  }
  const file = await leafFile(el, head, ctx);
  if (isRefusal(file)) return file;
  return { leaf: { ...common, fileName: path.posix.basename(file.href), ...file } };
}

/** Every leaf of one backbone, verified; refusals recorded in `ctx`. */
async function readLeaves(doc: Document, ctx: ReadContext): Promise<{ leaves: FiledSequenceLeaf[]; pointer: RegionalPointer | null }> {
  const leaves: FiledSequenceLeaf[] = [];
  const ids = new Set<string>();
  let pointer: RegionalPointer | null = null;
  for (const el of elementsNamed(doc, 'leaf')) {
    const out = await readLeaf(el, ctx, ids);
    if (isRefusal(out)) {
      ctx.refusals.push({ ...out, message: `${ctx.backbone}: ${out.message}` });
    } else if ('pointer' in out) {
      if (pointer) {
        ctx.refusals.push(refusal('leaf_heading_unmapped',
          `${ctx.backbone}: leaf ${out.pointer.leafId} is a second pointer at a regional backbone; a sequence has one`, { leafId: out.pointer.leafId }));
      } else {
        pointer = out.pointer;
      }
    } else {
      leaves.push(out.leaf);
    }
  }
  return { leaves, pointer };
}

/* ─── One sequence ──────────────────────────────────────────────────── */

/** index-md5.txt at the sequence root must hold index.xml's MD5. */
async function indexChecksumRefusal(zip: JSZip, root: string, indexBytes: Buffer): Promise<FiledSequenceRefusal | null> {
  const md5File = zip.file(`${root}index-md5.txt`);
  if (!md5File) {
    return refusal('index_md5_missing', 'index-md5.txt is not at the sequence root, so index.xml cannot be shown to be the backbone that was filed', { path: 'index-md5.txt' });
  }
  const recorded = /^\s*([0-9a-f]{32})\b/i.exec(await md5File.async('string'))?.[1]?.toLowerCase();
  const actual = md5Of(indexBytes);
  return recorded === actual ? null
    : refusal('index_md5_mismatch', `index-md5.txt records ${recorded ?? 'no MD5'}, but the MD5 of index.xml is ${actual}`, { path: 'index-md5.txt' });
}

/** The application block of a regional backbone. */
function applicationOf(doc: Document): FiledSequence['application'] {
  const number = firstNamed(doc, 'application-number');
  return {
    number: textOf(number) ?? textOf(firstNamed(doc, 'procedure-number')),
    applicationType: number?.getAttribute('application-type') || null,
    submissionType: firstNamed(doc, 'submission-id')?.getAttribute('submission-type') || null,
    applicant: textOf(firstNamed(doc, 'company-name')),
  };
}

/** The regional backbone index.xml points at: present, the bytes its pointer checksums, and its leaves. */
async function readRegional(zip: JSZip, seq: FiledSequence, pointer: RegionalPointer, referenced: Set<string>): Promise<void> {
  const regionalPath = pointer.href;
  seq.regionalBackbone = regionalPath;
  seq.region = REGION_BY_FOLDER[regionalPath.split('/')[1]] ?? null;
  const at = { path: regionalPath };
  const file = zip.file(`${seq.root}${regionalPath}`);
  if (!file) {
    seq.refusals.push(refusal('regional_backbone_missing', `index.xml references ${regionalPath}, which the archive does not hold`, at));
    return;
  }
  const bytes = await file.async('nodebuffer');
  const actual = md5Of(bytes);
  if ((pointer.checksum ?? '').trim().toLowerCase() !== actual) {
    seq.refusals.push(refusal('regional_backbone_checksum_mismatch',
      `index.xml records md5 ${pointer.checksum ?? 'none'} for ${regionalPath}, but its MD5 is ${actual}; its leaves are not read`, at));
    return;
  }
  const regional = parseBackbone(bytes.toString('utf8'));
  if ('code' in regional) {
    seq.refusals.push(refusal(regional.code, `${regionalPath} ${regional.message}`, at));
    return;
  }
  const m1 = await readLeaves(regional.doc, {
    zip, root: seq.root, backbone: regionalPath, backboneDir: path.posix.dirname(regionalPath), regional: true, refusals: seq.refusals, referenced,
  });
  seq.leaves.push(...m1.leaves);
  seq.application = applicationOf(regional.doc);
  seq.sequence = textOf(firstNamed(regional.doc, 'sequence-number'));
}

/** The sequence's number: its folder's name when it has one, which the regional backbone must agree with. */
function numberSequence(seq: FiledSequence): void {
  const folder = seq.root.split('/').filter(Boolean).pop() ?? '';
  if (SEQUENCE_FOLDER.test(folder)) {
    if (seq.sequence !== null && seq.sequence !== folder) {
      seq.refusals.push(refusal('sequence_number_disagrees', `the sequence's folder is ${folder}, but its regional backbone numbers it ${seq.sequence}`));
    }
    seq.sequence = folder;
  }
  if (seq.sequence === null) {
    seq.refusals.push(refusal('sequence_number_missing', 'neither a sequence folder nor the regional backbone gives this sequence a number'));
  }
}

async function readSequence(zip: JSZip, root: string, names: string[]): Promise<FiledSequence> {
  const referenced = new Set<string>();
  const seq: FiledSequence = {
    root, sequence: null, regionalBackbone: null, region: null,
    application: { number: null, applicationType: null, submissionType: null, applicant: null },
    leaves: [], refusals: [], unreferenced: [], outsideArchive: [],
  };

  const indexBytes = await zip.file(`${root}index.xml`)!.async('nodebuffer');
  const checksum = await indexChecksumRefusal(zip, root, indexBytes);
  if (checksum) seq.refusals.push(checksum);
  const index = parseBackbone(indexBytes.toString('utf8'));
  if ('code' in index) {
    seq.refusals.push(refusal(index.code, `index.xml ${index.message}`, { path: 'index.xml' }));
    return seq;
  }
  const ich = await readLeaves(index.doc, { zip, root, backbone: 'index.xml', backboneDir: '', regional: false, refusals: seq.refusals, referenced });
  seq.leaves.push(...ich.leaves);

  if (ich.pointer) {
    await readRegional(zip, seq, ich.pointer, referenced);
  } else {
    for (const n of names.filter((n) => REGIONAL_PATH.test(n.slice(root.length)))) {
      seq.refusals.push(refusal('regional_backbone_unreferenced',
        `${n.slice(root.length)} is in the sequence, but index.xml does not reference it, so its leaves are not read`, { path: n.slice(root.length) }));
    }
  }
  numberSequence(seq);

  const structure = new Set([`${root}index.xml`, `${root}index-md5.txt`, ...(seq.regionalBackbone ? [`${root}${seq.regionalBackbone}`] : [])]);
  seq.unreferenced = names
    .filter((n) => !structure.has(n) && !referenced.has(n) && !n.slice(root.length).startsWith('util/'))
    .map((n) => n.slice(root.length));
  return seq;
}

/* ─── The archive ───────────────────────────────────────────────────── */

/**
 * Read every sequence in an archive: its root when index.xml is there, and
 * every four-digit folder holding one. Pointers between the archive's
 * sequences are bound here; a pointer at a sequence the archive does not hold
 * is left for the filed state to bind (`outsideArchive`).
 */
export async function readFiledSequences(zip: JSZip): Promise<FiledArchive> {
  const names = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
  const roots = names
    .filter((n) => n === 'index.xml' || (n.endsWith('/index.xml') && SEQUENCE_FOLDER.test(n.split('/').slice(-2)[0])))
    .map((n) => n.slice(0, -'index.xml'.length));
  // A root's files are its own: another sequence's folder beneath it is not.
  const own = (root: string) => names.filter((n) => n.startsWith(root) && !roots.some((r) => r !== root && r.startsWith(root) && n.startsWith(r)));

  const sequences: FiledSequence[] = [];
  for (const root of roots) sequences.push(await readSequence(zip, root, own(root)));
  sequences.sort((a, b) => (a.sequence ?? '￿').localeCompare(b.sequence ?? '￿') || a.root.localeCompare(b.root));

  const refusals: FiledSequenceRefusal[] = [];
  const seen = new Map<string, string>();
  for (const s of sequences) {
    if (s.sequence === null) continue;
    const other = seen.get(s.sequence);
    if (other !== undefined) {
      refusals.push({ code: 'sequence_number_duplicate', message: `sequence ${s.sequence} is in the archive twice (${other || '/'} and ${s.root || '/'})` });
    }
    seen.set(s.sequence, s.root);
  }

  bindPointers(sequences);
  return { sequences, refusals };
}

/**
 * Bind each modified-file to the leaf it names, where that sequence is in the
 * archive: the named leaf must have been read (not refused) from that backbone,
 * in an earlier sequence. A withdrawal takes the withdrawn leaf's file name and
 * md5, which is what the platform records for its own (computeLifecycleOperations).
 */
function bindPointers(sequences: FiledSequence[]): void {
  const folders = sequences.filter((s) => s.root !== '').sort((a, b) => b.root.length - a.root.length);
  for (const s of sequences) {
    s.leaves = s.leaves.filter((l) => {
      if (!l.modifiedFile) return true;
      const [file, id] = l.modifiedFile.split('#');
      const target = path.posix.normalize(path.posix.join(s.root, file));
      const prior = target.startsWith('../') ? undefined : folders.find((o) => target.startsWith(o.root));
      if (!prior) {
        // Another sequence's backbone that this archive does not hold: bound later, against the filed state.
        if (SEQUENCE_BACKBONE.test(target)) {
          s.outsideArchive.push(l.leafId);
          return true;
        }
        s.refusals.push({
          code: 'leaf_modified_file_unresolved', leafId: l.leafId,
          message: `${l.backbone}: leaf ${l.leafId}'s modified-file ${l.modifiedFile} names no sequence's backbone`,
        });
        return false;
      }
      const backbone = target.slice(prior.root.length);
      const named = prior.leaves.find((p) => p.backbone === backbone && p.leafId === id);
      const earlier = prior.sequence !== null && s.sequence !== null && prior.sequence < s.sequence;
      if (!named || !earlier) {
        s.refusals.push({
          code: 'leaf_modified_file_unresolved', leafId: l.leafId,
          message: `${l.backbone}: leaf ${l.leafId}'s modified-file ${l.modifiedFile} names ` +
            (named ? `a leaf of sequence ${prior.sequence ?? '?'}, which is not earlier than ${s.sequence ?? '?'}` : `no leaf read from ${backbone} in sequence ${prior.sequence ?? '?'}`),
        });
        return false;
      }
      if (l.operation === 'delete') {
        l.fileName = named.fileName;
        l.md5 = named.md5;
      }
      return true;
    });
  }
}

/** Read an uploaded archive: bounded before anything inflates (SEC-17), then every sequence in it. */
export async function readFiledSequenceArchive(buffer: Buffer): Promise<FiledArchive> {
  await assertZipWithinLimits(buffer);
  return readFiledSequences(await JSZip.loadAsync(buffer));
}
