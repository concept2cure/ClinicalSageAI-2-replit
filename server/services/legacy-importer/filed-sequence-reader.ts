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
 * What it reads, per sequence: a folder holding index.xml, which is the
 * archive root, a four-digit folder at any depth, or any folder that also
 * holds index-md5.txt.
 *   - index.xml, checked against index-md5.txt at the sequence root. If the
 *     check fails, no leaf is read from either backbone.
 *   - The regional backbone index.xml points at, checked against the checksum
 *     that pointer carries.
 *   - Every <leaf> in both:
 *     - Its href is resolved against its backbone's folder. It may name a
 *       file of its own sequence, or a file already filed in an earlier
 *       sequence of the same application (ICH file reuse), never anything
 *       else.
 *     - The file's MD5 must equal the leaf's md5 `checksum`.
 *     - It needs an ID and a known operation.
 *     - A replace, append or delete must carry a `modified-file` that names
 *       a leaf of an earlier sequence of the same application.
 *     - Its pointer is recorded as `../<sequence>/<backbone>#<ID>`, the form
 *       the packager records and the fold binds.
 *
 * Whether a pointer names a leaf is decided by resolving it, not by its
 * spelling:
 *   - A pointer into another sequence of the archive must bind to a leaf still
 *     on file, read from that backbone. That excludes a leaf already replaced
 *     or withdrawn, and a withdrawal.
 *   - A pointer, or a reused file, in a sequence the archive does not hold is
 *     listed in `outsideArchive`, for the recorded filed state to bind. Until
 *     it is bound, the sequence is not complete.
 *   - Anything else is refused.
 * The fold binds with prior-sequence-loader's MODIFIED_FILE. That file is held
 * by the RIM lane for F1 slice 1 (.design/claude-convergence/COORDINATION.md),
 * so it is not touched here.
 *
 * A leaf's section is the heading the backbone files it under
 * (filed-sequence-xml.ts). The fold identifies a leaf by section and file
 * name, so two leaves of one sequence under one heading with one file name
 * would fold into one. Each such leaf is refused (`leaf_identity_ambiguous`),
 * never folded.
 *
 * Refusals are per leaf where the defect is the leaf's, and per sequence where
 * it is the backbone's. A leaf refusal names the file wherever the leaf has
 * one. A refused leaf is not in `leaves`. A sequence is a complete record of
 * what was filed (`isComplete`) only when nothing in it was refused and nothing
 * in it waits on the filed state. Only then may anything record it.
 *
 * Every file is inflated and hashed at most once per archive, whatever number
 * of leaves name it.
 *
 * @module server/services/legacy-importer/filed-sequence-reader
 */

import { createHash } from 'crypto';
import * as path from 'path';
import JSZip from 'jszip';
import type { Document, Element } from '@xmldom/xmldom';
import { assertZipWithinLimits } from '../archive/safeZip';
import type { SequenceLeafManifestEntry } from '../ectd/sequence-manifest';
import {
  elementsNamed, firstNamed, parseBackbone, placementOf, textOf,
  type BackboneProblemCode,
} from './filed-sequence-xml';
import { LEAF_ID, bindPointers, climbRefusal, intoSibling, parentOf, refuseAmbiguousIdentity } from './filed-sequence-pointers';

export { headingSection } from './filed-sequence-xml';

/* ─── Types ─────────────────────────────────────────────────────────── */

export type FiledSequenceRefusalCode =
  | BackboneProblemCode
  | 'index_md5_missing'
  | 'index_md5_mismatch'
  | 'regional_backbone_missing'
  | 'regional_backbone_checksum_mismatch'
  | 'regional_backbone_unreferenced'
  | 'leaf_id_missing'
  | 'leaf_id_malformed'
  | 'leaf_id_duplicate'
  | 'leaf_operation_unknown'
  | 'leaf_heading_unmapped'
  | 'leaf_href_unsafe'
  | 'leaf_file_missing'
  | 'leaf_checksum_missing'
  | 'leaf_checksum_mismatch'
  | 'leaf_modified_file_missing'
  | 'leaf_modified_file_unresolved'
  | 'leaf_identity_ambiguous'
  | 'sequence_number_missing'
  | 'sequence_number_malformed'
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
  /** Zip path of the leaf's file; '' for a delete, and for a reused file the archive does not hold. */
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
  /**
   * IDs of leaves that name something in a sequence this archive does not hold:
   * the leaf a modified-file points at, or a reused file. Only the recorded
   * filed state can bind them.
   */
  outsideArchive: string[];
}

export interface FiledArchive {
  /** Ascending by sequence number. */
  sequences: FiledSequence[];
  /** Defects of the archive as a whole (two folders with one sequence number). */
  refusals: FiledSequenceRefusal[];
}

/**
 * A sequence is a complete record of what was filed only when nothing in it was
 * refused and nothing in it waits on the recorded filed state.
 */
export function isComplete(sequence: FiledSequence): boolean {
  return sequence.refusals.length === 0 && sequence.outsideArchive.length === 0;
}

/* ─── The archive's layout ──────────────────────────────────────────── */

const md5Of = (b: Buffer) => createHash('md5').update(b).digest('hex');
const OPERATIONS = new Set(['new', 'replace', 'append', 'delete']);
const XLINK_NAMESPACES = new Set(['http://www.w3c.org/1999/xlink', 'http://www.w3.org/1999/xlink']);
const SEQUENCE_FOLDER = /^\d{4}$/;
const REGIONAL_PATH = /^m1\/[a-z]{2}\/[a-z]{2}-regional\.xml$/;
const REGION_BY_FOLDER: Record<string, FiledSequence['region']> = { us: 'fda', eu: 'ema', jp: 'pmda' };


/** What every sequence of one archive shares: the zip, its sequence roots, and each file's MD5 once. */
interface ArchiveContext {
  zip: JSZip;
  roots: Set<string>;
  md5s: Map<string, Promise<string>>;
}

/** Zip paths longer or deeper than this belong to no sequence: an eCTD path is at most a few hundred characters. */
const NAME_MAX = 1024;
const DEPTH_MAX = 32;

/**
 * The sequence root a zip path belongs to: the longest root that is a folder
 * prefix of it. The walk ends at the archive root, after at most DEPTH_MAX
 * folders, and never starts on an absolute name. 2026-11-02: an entry named
 * '/x' made this loop forever. It came past safeZip in a local header that
 * disagreed with the zip's directory, the name JSZip reads.
 */
function ownerOf(name: string, roots: Set<string>): string | null {
  if (name.startsWith('/') || name.length > NAME_MAX) return null;
  let cut = name.lastIndexOf('/');
  for (let depth = 0; cut >= 0 && depth < DEPTH_MAX; depth++) {
    const prefix = name.slice(0, cut + 1);
    if (roots.has(prefix)) return prefix;
    cut = cut > 0 ? name.lastIndexOf('/', cut - 1) : -1;
  }
  return cut < 0 && roots.has('') ? '' : null;
}

/** A file's MD5, inflating and hashing it at most once per archive. */
function md5Once(arc: ArchiveContext, archivePath: string, file: JSZip.JSZipObject): Promise<string> {
  let p = arc.md5s.get(archivePath);
  if (!p) {
    p = file.async('nodebuffer').then(md5Of);
    arc.md5s.set(archivePath, p);
  }
  return p;
}

/* ─── Leaves ────────────────────────────────────────────────────────── */

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

const titleOf = (leaf: Element): string | undefined => {
  for (let n = leaf.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).localName === 'title') return (n.textContent ?? '').trim() || undefined;
  }
  return undefined;
};

/** A leaf whose file is in another sequence of its application. */
interface Reuse { leafId: string; backbone: string; number: string; targetRoot: string; archivePath: string | null; climbedThrough?: string }

interface ReadContext {
  arc: ArchiveContext;
  /** This sequence's root in the archive. */
  root: string;
  backbone: string;
  backboneDir: string;
  regional: boolean;
  refusals: FiledSequenceRefusal[];
  referenced: Set<string>;
  outsideArchive: string[];
  /** Leaves whose file is reused from another sequence, bound once every sequence is read (bindReuses). */
  reuses: Reuse[];
}

/**
 * Where a href lands, from the sequence root and in the archive. Percent-encoding
 * is decoded when the literal path is not in the archive and the decoded one is.
 */
interface Located { fromRoot: string; archivePath: string | null; escapes: boolean }

function unsafeHref(href: string): boolean {
  return !href || /[\\\0?#]/.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href) || path.posix.isAbsolute(href);
}

function locate(href: string, ctx: ReadContext): Located | { refusal: string } {
  const candidates = [href];
  if (href.includes('%')) {
    try {
      const decoded = decodeURIComponent(href);
      if (decoded !== href) candidates.push(decoded);
    } catch { /* not percent-encoding: the literal path only */ }
  }
  const located: Located[] = [];
  for (const c of candidates) {
    if (unsafeHref(c)) return { refusal: `href "${href}" is not a relative path to a file` };
    const fromRoot = path.posix.normalize(path.posix.join(ctx.backboneDir, c));
    if (located.length && fromRoot.startsWith('../') && !located[0].fromRoot.startsWith('../')) {
      return { refusal: `href "${href}" decodes to a path out of the sequence` };
    }
    const inArchive = path.posix.normalize(path.posix.join(ctx.root, fromRoot));
    const escapes = inArchive === '..' || inArchive.startsWith('../');
    located.push({ fromRoot, archivePath: escapes ? null : inArchive, escapes });
  }
  return located.find((l) => l.archivePath && ctx.arc.zip.file(l.archivePath)) ?? located[0];
}

/**
 * A href may name a file of its own sequence, or a file filed in another
 * sequence of the same application (ICH file reuse). Whether that sequence is
 * the earlier one, and filed that file, is bound once every sequence is read
 * (bindReuses). Returns the zip path to verify (null when that sequence is not
 * in the archive, so the filed state binds it), or why the href may not lead there.
 */
function hrefTarget(loc: Located, ctx: ReadContext): { archivePath: string | null; reuse?: Omit<Reuse, 'leafId' | 'backbone'> } | { refusal: string } {
  if (loc.archivePath !== null && !loc.fromRoot.startsWith('../') && ownerOf(loc.archivePath, ctx.arc.roots) === ctx.root) {
    return { archivePath: loc.archivePath };
  }
  const target = loc.archivePath ?? path.posix.normalize(path.posix.join(ctx.root, loc.fromRoot));
  const into = intoSibling(target, ctx.root);
  const targetRoot = into ? `${into.parent}${into.number}/` : null;
  if (!into || targetRoot === ctx.root) {
    return { refusal: `href "${loc.fromRoot}" leads out of the sequence, and not into another sequence of the same application` };
  }
  const archivePath = ctx.arc.roots.has(targetRoot!) ? `${targetRoot}${into.rest}` : null;
  return { archivePath, reuse: { number: into.number, targetRoot: targetRoot!, archivePath, ...(into.climbedThrough !== undefined ? { climbedThrough: into.climbedThrough } : {}) } };
}

interface LeafHead { id: string; label: string; operation: FiledSequenceLeaf['operation']; href: string | null; at: { path?: string; leafId?: string } }
interface RegionalPointer { href: string; checksum: string | null; leafId: string }

/** The file a leaf's href names, from the sequence root, counted as referenced: what every refusal of the leaf cites. */
function citeFile(href: string | null, ctx: ReadContext): string | undefined {
  const loc = href ? locate(href, ctx) : null;
  if (!loc || 'refusal' in loc) return undefined;
  if (loc.archivePath) ctx.referenced.add(loc.archivePath);
  return loc.escapes ? undefined : loc.fromRoot;
}

/** A leaf's ID (present, once per backbone), operation (one of the four) and the file it names, for every refusal to cite. */
function leafHead(el: Element, ids: Set<string>, ctx: ReadContext): LeafHead | FiledSequenceRefusal {
  const id = attr(el, 'ID');
  const href = xlinkHref(el);
  const filePath = citeFile(href, ctx);
  const at = { ...(filePath ? { path: filePath } : {}), ...(id ? { leafId: id } : {}) };
  const label = id ? `leaf ${id}` : `a leaf${href ? ` for "${href}"` : ''}`;
  if (!id) return refusal('leaf_id_missing', `${label} carries no ID, so no later sequence could name it`, at);
  if (!LEAF_ID.test(id)) {
    return refusal('leaf_id_malformed', `${label} carries the ID "${id}", which no later modified-file could name in the form the filed state binds`, at);
  }
  if (ids.has(id)) return refusal('leaf_id_duplicate', `ID ${id} is carried by more than one leaf`, at);
  ids.add(id);
  const operation = attr(el, 'operation').toLowerCase();
  if (!OPERATIONS.has(operation)) {
    return refusal('leaf_operation_unknown', `${label} has operation "${operation}", which is not new, replace, append or delete`, at);
  }
  return { id, label, operation: operation as FiledSequenceLeaf['operation'], href, at };
}

/** index.xml's Module 1 entry: the pointer at the regional backbone, which is structure, not a document. */
function regionalPointer(el: Element, head: LeafHead): RegionalPointer | FiledSequenceRefusal {
  const target = head.href && !unsafeHref(head.href) ? path.posix.normalize(head.href) : null;
  if (!target || !REGIONAL_PATH.test(target)) {
    return refusal('leaf_heading_unmapped',
      `${head.label} is filed in Module 1 of index.xml, where only the pointer at the regional backbone belongs`, head.at);
  }
  return { href: target, checksum: el.getAttribute('checksum'), leafId: head.id };
}

/** A replace, append or delete's modified-file, re-expressed from the sequence root; bound in bindPointers. */
function leafAct(el: Element, head: LeafHead, backboneDir: string): { modifiedFile?: string } | FiledSequenceRefusal {
  if (head.operation === 'new') return {};
  const raw = attr(el, 'modified-file');
  if (!raw) {
    return refusal('leaf_modified_file_missing', `${head.label} is a ${head.operation} with no modified-file, so it names no filed leaf it acts on`, head.at);
  }
  const [file, id, extra] = raw.split('#');
  const fromRoot = path.posix.normalize(path.posix.join(backboneDir, file));
  // What a pointer must be to name a leaf at all: out of this sequence, into a
  // backbone, with an ID. Whether it names one is decided by binding it.
  if (extra !== undefined || !id || !LEAF_ID.test(id) || !/\.xml$/.test(fromRoot) || !fromRoot.startsWith('../')) {
    return refusal('leaf_modified_file_unresolved',
      `${head.label}'s modified-file "${raw}" does not name a leaf in another sequence's backbone (../<sequence>/<backbone>#<ID>)`, head.at);
  }
  return { modifiedFile: `${fromRoot}#${id}` };
}

/** A leaf's file: inside its sequence or an earlier one of the application, with the bytes its md5 checksum names. */
async function leafFile(el: Element, head: LeafHead, ctx: ReadContext): Promise<{ href: string; archivePath: string; md5: string } | FiledSequenceRefusal> {
  const { label, at } = head;
  if (head.href === null) return refusal('leaf_file_missing', `${label} is a ${head.operation} with no xlink:href`, at);
  const loc = locate(head.href, ctx);
  if ('refusal' in loc) return refusal('leaf_href_unsafe', `${label}: ${loc.refusal}; it is not read`, at);
  const target = hrefTarget(loc, ctx);
  if ('refusal' in target) return refusal('leaf_href_unsafe', `${label}: ${target.refusal}; it is not read`, at);
  const checksum = attr(el, 'checksum').toLowerCase();
  if (!checksum || attr(el, 'checksum-type').toLowerCase() !== 'md5') {
    return refusal('leaf_checksum_missing', `${label} carries no md5 checksum for "${loc.fromRoot}"`, at);
  }
  if (target.reuse) ctx.reuses.push({ leafId: head.id, backbone: ctx.backbone, ...target.reuse });
  if (target.archivePath === null) {
    // A file filed in a sequence this archive does not hold: its checksum is
    // checked when the leaf is bound against the recorded filed state.
    ctx.outsideArchive.push(head.id);
    return { href: loc.fromRoot, archivePath: '', md5: checksum };
  }
  const file = ctx.arc.zip.file(target.archivePath);
  if (!file) return refusal('leaf_file_missing', `${label} references "${loc.fromRoot}", which the archive does not hold`, at);
  const actual = await md5Once(ctx.arc, target.archivePath, file);
  if (actual !== checksum) {
    return refusal('leaf_checksum_mismatch', `${label} records md5 ${checksum} for "${loc.fromRoot}", but the file's MD5 is ${actual}`, at);
  }
  return { href: loc.fromRoot, archivePath: target.archivePath, md5: actual };
}

type LeafOutcome = { leaf: FiledSequenceLeaf } | { pointer: RegionalPointer } | FiledSequenceRefusal;

/** One leaf, read and verified, or the reason it is refused. */
async function readLeaf(el: Element, ctx: ReadContext, ids: Set<string>): Promise<LeafOutcome> {
  const head = leafHead(el, ids, ctx);
  if (isRefusal(head)) return head;
  const placed = placementOf(el, ctx.regional);
  if ('refusal' in placed) return refusal('leaf_heading_unmapped', `${head.label}: ${placed.refusal}`, head.at);
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
    // Its section, file name and md5 are the withdrawn leaf's, bound in bindPointers.
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
    return refusal('index_md5_missing', 'index-md5.txt is not at the sequence root, so index.xml cannot be shown to be the backbone that was filed; no leaf is read', { path: 'index-md5.txt' });
  }
  const recorded = /^\s*([0-9a-f]{32})\b/i.exec((await md5File.async('string')).replace(/^\uFEFF/, ''))?.[1]?.toLowerCase();
  const actual = md5Of(indexBytes);
  return recorded === actual ? null
    : refusal('index_md5_mismatch', `index-md5.txt records ${recorded ?? 'no MD5'}, but the MD5 of index.xml is ${actual}; no leaf is read`, { path: 'index-md5.txt' });
}

/**
 * The application whose files this backbone carries: in an FDA grouped
 * submission, the <application> marked application-containing-files="true",
 * else the only one, else the whole document.
 */
function applicationElement(doc: Document): Document | Element | null {
  const apps = elementsNamed(doc, 'application');
  const marked = apps.find((a) => a.getAttribute('application-containing-files') === 'true');
  if (marked) return marked;
  if (apps.length === 1) return apps[0];
  // Several applications, none marked as carrying the files: which one is this
  // sequence's is not said, so none is taken.
  return apps.length ? null : doc;
}

/** The application block and sequence number of a regional backbone, by region. */
function applicationOf(doc: Document, region: FiledSequence['region']): { application: FiledSequence['application']; sequence: string | null } {
  if (region === 'ema') {
    // The EU envelope: <applicant>, <procedure-tracking> numbers, <sequence>.
    return {
      application: {
        number: textOf(firstNamed(firstNamed(doc, 'procedure-tracking') ?? doc, 'number')),
        applicationType: null, submissionType: null, applicant: textOf(firstNamed(doc, 'applicant')),
      },
      sequence: textOf(firstNamed(doc, 'sequence')),
    };
  }
  const app = applicationElement(doc);
  if (!app) return { application: { number: null, applicationType: null, submissionType: null, applicant: textOf(firstNamed(doc, 'company-name')) }, sequence: null };
  const number = firstNamed(app, 'application-number');
  return {
    application: {
      number: textOf(number) ?? textOf(firstNamed(app, 'procedure-number')),
      applicationType: number?.getAttribute('application-type') || null,
      submissionType: firstNamed(app, 'submission-id')?.getAttribute('submission-type') || null,
      applicant: textOf(firstNamed(doc, 'company-name')),
    },
    sequence: textOf(firstNamed(app, 'sequence-number')),
  };
}

/** The regional backbone index.xml points at: present, the bytes its pointer checksums, and its leaves. */
async function readRegional(seq: FiledSequence, pointer: RegionalPointer, base: Omit<ReadContext, 'backbone' | 'backboneDir' | 'regional'>): Promise<boolean> {
  const regionalPath = pointer.href;
  seq.regionalBackbone = regionalPath;
  seq.region = REGION_BY_FOLDER[regionalPath.split('/')[1]] ?? null;
  const at = { path: regionalPath };
  const file = base.arc.zip.file(`${seq.root}${regionalPath}`);
  if (!file) {
    seq.refusals.push(refusal('regional_backbone_missing', `index.xml references ${regionalPath}, which the archive does not hold`, at));
    return false;
  }
  const bytes = await file.async('nodebuffer');
  const actual = md5Of(bytes);
  if ((pointer.checksum ?? '').trim().toLowerCase() !== actual) {
    seq.refusals.push(refusal('regional_backbone_checksum_mismatch',
      `index.xml records md5 ${pointer.checksum ?? 'none'} for ${regionalPath}, but its MD5 is ${actual}; its leaves are not read`, at));
    return false;
  }
  const regional = parseBackbone(bytes);
  if ('code' in regional) {
    seq.refusals.push(refusal(regional.code, `${regionalPath} ${regional.message}`, at));
    return false;
  }
  const m1 = await readLeaves(regional.doc, { ...base, backbone: regionalPath, backboneDir: path.posix.dirname(regionalPath), regional: true });
  seq.leaves.push(...m1.leaves);
  const admin = applicationOf(regional.doc, seq.region);
  seq.application = admin.application;
  seq.sequence = admin.sequence;
  return true;
}

/** The sequence's number: its folder's name when it has one, which the regional backbone must agree with; four digits. */
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
  } else if (!SEQUENCE_FOLDER.test(seq.sequence)) {
    seq.refusals.push(refusal('sequence_number_malformed', `the regional backbone numbers this sequence "${seq.sequence}", which is not four digits`));
  }
}

async function readSequence(arc: ArchiveContext, root: string, names: string[]): Promise<{ seq: FiledSequence; reuses: Reuse[] }> {
  const referenced = new Set<string>();
  const seq: FiledSequence = {
    root, sequence: null, regionalBackbone: null, region: null,
    application: { number: null, applicationType: null, submissionType: null, applicant: null },
    leaves: [], refusals: [], unreferenced: [], outsideArchive: [],
  };
  const base = {
    arc, root,
    refusals: seq.refusals, referenced, outsideArchive: seq.outsideArchive,
    reuses: [] as ReadContext['reuses'],
  };
  // What was not read is not reported as unreferenced: nothing says whether it is.
  const unread: string[] = [];

  const indexBytes = await arc.zip.file(`${root}index.xml`)!.async('nodebuffer');
  const checksum = await indexChecksumRefusal(arc.zip, root, indexBytes);
  const index = checksum ? null : parseBackbone(indexBytes);
  if (checksum || !index || 'code' in index) {
    if (checksum) seq.refusals.push(checksum);
    else if (index && 'code' in index) seq.refusals.push(refusal(index.code, `index.xml ${index.message}`, { path: 'index.xml' }));
    // Nothing was read, so only a sequence folder can number it; that it has no
    // other number is no further defect.
    const folder = root.split('/').filter(Boolean).pop() ?? '';
    if (SEQUENCE_FOLDER.test(folder)) seq.sequence = folder;
    return { seq, reuses: [] };
  }
  const ich = await readLeaves(index.doc, { ...base, backbone: 'index.xml', backboneDir: '', regional: false });
  seq.leaves.push(...ich.leaves);

  if (ich.pointer) {
    if (!(await readRegional(seq, ich.pointer, base))) unread.push(`${root}${path.posix.dirname(ich.pointer.href)}/`);
  } else {
    for (const n of names.filter((n) => REGIONAL_PATH.test(n.slice(root.length)))) {
      seq.refusals.push(refusal('regional_backbone_unreferenced',
        `${n.slice(root.length)} is in the sequence, but index.xml does not reference it, so its leaves are not read`, { path: n.slice(root.length) }));
      unread.push(`${root}${path.posix.dirname(n.slice(root.length))}/`);
    }
  }
  numberSequence(seq);

  const structure = new Set([`${root}index.xml`, `${root}index-md5.txt`, ...(seq.regionalBackbone ? [`${root}${seq.regionalBackbone}`] : [])]);
  seq.unreferenced = names
    .filter((n) => !structure.has(n) && !referenced.has(n) && !n.slice(root.length).startsWith('util/') && !unread.some((u) => n.startsWith(u)))
    .map((n) => n.slice(root.length));
  return { seq, reuses: base.reuses };
}

/**
 * Bind each reused file: it must come from an earlier sequence of the same
 * application, and, when the archive holds that sequence, be a file one of its
 * leaves filed (read and kept). A file it refused, never named, or could not
 * read is not one it filed.
 */
function bindReuses(sequences: FiledSequence[], reuses: Map<FiledSequence, Reuse[]>): void {
  const filedBy = new Map(sequences.map((s) => [s.root, new Set(s.leaves.filter((l) => l.operation !== 'delete').map((l) => l.archivePath))]));
  const why = (s: FiledSequence, r: Reuse): string | null => {
    const climbed = climbRefusal(r, s.application);
    if (climbed) return climbed;
    if (s.sequence === null || !(r.number < s.sequence)) return `leads into sequence ${r.number}, which is not earlier than ${s.sequence ?? 'this one'}`;
    if (r.archivePath !== null && !filedBy.get(r.targetRoot)?.has(r.archivePath)) return `names ${r.archivePath}, which sequence ${r.number} did not file`;
    return null;
  };
  for (const s of sequences) {
    const refused = new Set<string>();
    for (const r of reuses.get(s) ?? []) {
      const reason = why(s, r);
      if (!reason) continue;
      s.refusals.push(refusal('leaf_href_unsafe', `${r.backbone}: leaf ${r.leafId}'s href ${reason}; it is not read`, { leafId: r.leafId }));
      refused.add(`${r.backbone}#${r.leafId}`);
    }
    if (!refused.size) continue;
    s.leaves = s.leaves.filter((l) => !refused.has(`${l.backbone}#${l.leafId}`));
    const ids = new Set([...refused].map((k) => k.slice(k.lastIndexOf('#') + 1)));
    s.outsideArchive = s.outsideArchive.filter((id) => !ids.has(id));
  }
}

/* ─── The archive ───────────────────────────────────────────────────── */

/**
 * The archive's sequence roots: the root when it holds index.xml, and every
 * folder holding index.xml that is named with four digits or also holds
 * index-md5.txt. Each zip path belongs to the deepest root above it.
 */
function sequenceRoots(names: string[]): { roots: Set<string>; owned: Map<string, string[]> } {
  const has = new Set(names);
  const roots = new Set(names
    .filter((n) => n === 'index.xml' || n.endsWith('/index.xml'))
    .map((n) => n.slice(0, -'index.xml'.length))
    .filter((r) => r === '' || SEQUENCE_FOLDER.test(r.split('/').slice(-2)[0]) || has.has(`${r}index-md5.txt`)));
  const owned = new Map<string, string[]>([...roots].map((r) => [r, []]));
  for (const n of names) {
    const owner = ownerOf(n, roots);
    if (owner !== null) owned.get(owner)!.push(n);
  }
  return { roots, owned };
}

/**
 * Read every sequence in an archive. Pointers between the archive's sequences
 * are bound here; what names a sequence the archive does not hold is left for
 * the filed state to bind (`outsideArchive`).
 */
export async function readFiledSequences(zip: JSZip): Promise<FiledArchive> {
  const names = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
  const { roots, owned } = sequenceRoots(names);
  const arc: ArchiveContext = { zip, roots, md5s: new Map() };

  const sequences: FiledSequence[] = [];
  const reuses = new Map<FiledSequence, Reuse[]>();
  for (const root of roots) {
    const read = await readSequence(arc, root, owned.get(root) ?? []);
    sequences.push(read.seq);
    reuses.set(read.seq, read.reuses);
  }
  sequences.sort((a, b) => (a.sequence ?? '\uFFFF').localeCompare(b.sequence ?? '\uFFFF') || a.root.localeCompare(b.root));

  const refusals = duplicateNumbers(sequences);
  // Identity first, so nothing binds to a leaf refused as ambiguous; then the
  // files and leaves later sequences name.
  for (const s of sequences) refuseAmbiguousIdentity(s);
  bindReuses(sequences, reuses);
  bindPointers(sequences);
  return { sequences, refusals };
}

/**
 * One sequence number twice in one application: two sibling folders, or a
 * sequence folder inside another sequence of that number.
 */
function duplicateNumbers(sequences: FiledSequence[]): FiledSequenceRefusal[] {
  const byNumber = new Map<string, FiledSequence[]>();
  for (const s of sequences) {
    if (s.sequence === null) continue;
    const group = byNumber.get(s.sequence);
    if (group) group.push(s);
    else byNumber.set(s.sequence, [s]);
  }
  const out: FiledSequenceRefusal[] = [];
  for (const [number, group] of byNumber) {
    const seen = new Map<string, string>();
    for (const s of group) {
      const other = seen.get(parentOf(s.root)) ?? group.find((o) => o !== s && s.root.startsWith(o.root))?.root;
      if (other !== undefined) out.push(refusal('sequence_number_duplicate', `sequence ${number} is in the archive twice (${other || '/'} and ${s.root || '/'})`));
      seen.set(parentOf(s.root), s.root);
    }
  }
  return out;
}

/** Read an uploaded archive: bounded before anything inflates (SEC-17), then every sequence in it. */
export async function readFiledSequenceArchive(buffer: Buffer): Promise<FiledArchive> {
  await assertZipWithinLimits(buffer);
  return readFiledSequences(await JSZip.loadAsync(buffer));
}
