/**
 * The filed-sequence reader's pointers between sequences, and the identity the
 * fold gives a leaf. Split out of filed-sequence-reader.ts (RULE 6: split,
 * don't add) on 2026-11-02, with the review round's fixes:
 *   - A grouped-layout pointer (`../../app/0000/index.xml#ID`) was bound but
 *     recorded as written. The fold's MODIFIED_FILE reads it as sequence `app`,
 *     so the replaced leaf stayed on file. Every bound pointer is now recorded
 *     as `../<sequence>/<backbone>#<ID>`.
 *   - Four kinds of pointer were wrongly accepted, and are now refused:
 *     - one climbing past its own application, or into another application;
 *     - one naming its own or a later sequence the archive does not hold;
 *     - one naming a leaf already replaced or withdrawn, or a withdrawal;
 *     - a second leaf of one sequence acting on the leaf another already acts on.
 *   - A withdrawal took the withdrawn leaf's name and md5 but kept its own
 *     heading's section, so the fold also withdrew an unrelated leaf.
 *   - Two leaves of one sequence under one heading with one file name folded
 *     into one, so a filed document dropped off file.
 *   - In an archive zipped without its application folder, a grouped-form
 *     path climbed out and back in through a folder of any name. A pointer or
 *     reused file in another application (`../../nda999999/0000/…`, which FDA's
 *     grouped submissions write for a leaf filed under the application that
 *     carried the files) was bound to this application's sequence of that
 *     number. The folder must now be this application's own (climbRefusal).
 *
 * @module server/services/legacy-importer/filed-sequence-pointers
 */

import * as path from 'path';
import { fdaApplicationPrefix } from '../ectd/controlled-vocab';
import type { FiledSequence, FiledSequenceLeaf } from './filed-sequence-reader';
import type { PriorLeaf } from '../ectd/lifecycle-operator';
import { MODIFIED_FILE } from '../ectd/prior-sequence-loader';

/** A sequence's backbone, from the sequence root. */
const BACKBONE_PATH = /^(index\.xml|m1\/[a-z]{2}\/[a-z]{2}-regional\.xml)$/;

/** An ID a later modified-file can name in the form the fold parses (prior-sequence-loader's MODIFIED_FILE). */
export const LEAF_ID = /^[A-Za-z_][A-Za-z0-9._-]*$/;

/** The folder that holds a sequence's folder: 'app/' for 'app/0001/', '' for '0001/', '../' for the archive root. */
export const parentOf = (root: string): string => (root === '' ? '../' : root.replace(/[^/]+\/$/, ''));

/** Where a path lands among its application's sequences; `climbedThrough` is the folder a grouped-form path climbed out and back in through. */
export interface Sibling { parent: string; number: string; rest: string; climbedThrough?: string }

/**
 * Where a path, joined to a sequence's root, lands among the sequences of that
 * sequence's application: the sibling folder's number and the path inside it.
 * `parent` is where those siblings sit in the archive.
 *
 * An archive zipped without its application folder (sequence folders at the
 * top, or one sequence at the root) is read as that folder's contents. So a
 * grouped-form path that climbs out and back in through a folder
 * (`../../ind123456/0000/…` from `0001/`) lands on the sibling too, and names
 * the folder; whether it is this application's own is climbRefusal's to say.
 */
export function intoSibling(target: string, root: string): Sibling | null {
  const parent = parentOf(root);
  const inside = target.startsWith(parent) ? target.slice(parent.length) : null;
  const direct = inside === null ? null : /^(\d{4})\/(.+)$/.exec(inside);
  if (direct) return { parent, number: direct[1], rest: direct[2] };
  const climb = parent === '' ? /^\.\.\/([^/]+)\/(\d{4})\/(.+)$/ : parent === '../' ? /^\.\.\/\.\.\/([^/]+)\/(\d{4})\/(.+)$/ : null;
  const m = climb?.exec(target);
  return m ? { parent, number: m[2], rest: m[3], climbedThrough: m[1] } : null;
}

/** The folder FDA files an application's sequences in (`ind123456`), from its regional backbone; null when it does not say. */
export function applicationFolder(application: FiledSequence['application']): string | null {
  const prefix = application.applicationType ? fdaApplicationPrefix(application.applicationType) : null;
  return prefix && application.number ? `${prefix}${application.number}` : null;
}

/**
 * Why a grouped-form path may not stand: the folder it climbs through must be
 * this application's own, as its regional backbone names it. Another
 * application's sequence is not in this application's filed state, and binding
 * the pointer to this application's sequence of the same number would act on
 * the wrong leaf. Null when the path does not climb, or climbs through its own.
 */
export function climbRefusal(into: Pick<Sibling, 'climbedThrough'>, application: FiledSequence['application']): string | null {
  if (into.climbedThrough === undefined) return null;
  const own = applicationFolder(application);
  if (!own) return `climbs out through folder "${into.climbedThrough}", and this sequence's regional backbone names no FDA application whose folder that could be`;
  return into.climbedThrough === own ? null : `leads into application folder "${into.climbedThrough}", not this application's "${own}"`;
}

/**
 * Bind each modified-file to the leaf it names and record it as
 * `../<sequence>/<backbone>#<ID>`, the form the fold binds. The named leaf must
 * be in an earlier sequence of the same application and still on file.
 * Sequences are walked in order, and a replace or delete takes its named leaf
 * off file. A withdrawal takes the withdrawn leaf's section, file name and md5,
 * which is what the platform records for its own (computeLifecycleOperations).
 */
export function bindPointers(sequences: FiledSequence[]): void {
  const byRoot = new Map(sequences.map((s) => [s.root, s]));
  const onFile = new Set<string>();
  // The fold also takes a leaf off file when a later one of the same application
  // is filed under its section and file name; a pointer at it then binds nothing.
  const holderOfKey = new Map<string, string>();
  for (const s of sequences) {
    const takenOff = new Set<string>();
    s.leaves = s.leaves.filter((l) => keepBound(s, l, bindPointer(s, l, byRoot, onFile), takenOff));
    for (const k of takenOff) onFile.delete(k);
    for (const l of s.leaves) {
      if (l.operation === 'delete') continue;
      const key = `${s.root}${l.backbone}#${l.leafId}`;
      const identity = `${parentOf(s.root)}|${l.ctdSection}/${l.fileName}`;
      const superseded = holderOfKey.get(identity);
      if (superseded) onFile.delete(superseded);
      holderOfKey.set(identity, key);
      onFile.add(key);
    }
  }
}

const leafAt = (l: FiledSequenceLeaf) => ({ leafId: l.leafId, ...(l.archivePath ? { path: l.href } : {}) });

/** Record a leaf's bound pointer on it; false (and a refusal) when it may not stand. */
function keepBound(s: FiledSequence, l: FiledSequenceLeaf, bound: Bound | null, takenOff: Set<string>): boolean {
  if (!bound) return true;
  const unresolved = (why: string) => {
    s.refusals.push({ code: 'leaf_modified_file_unresolved', message: `${l.backbone}: leaf ${l.leafId}'s modified-file ${l.modifiedFile} ${why}`, ...leafAt(l) });
    return false;
  };
  if ('refusal' in bound) return unresolved(bound.refusal);
  const takesOff = bound.namedKey && l.operation !== 'append';
  if (takesOff && takenOff.has(bound.namedKey!)) return unresolved('names a leaf another leaf of this sequence already replaces or withdraws');
  if (takesOff) takenOff.add(bound.namedKey!);
  l.modifiedFile = bound.canonical;
  if (l.operation === 'delete') {
    l.href = bound.canonical;
    if (bound.named) Object.assign(l, { ctdSection: bound.named.ctdSection, fileName: bound.named.fileName, md5: bound.named.md5 });
  }
  return true;
}

type Bound = { canonical: string; named?: FiledSequenceLeaf; namedKey?: string } | { refusal: string };

function bindPointer(s: FiledSequence, l: FiledSequenceLeaf, byRoot: Map<string, FiledSequence>, onFile: Set<string>): Bound | null {
  if (!l.modifiedFile) return null;
  const [file, id] = l.modifiedFile.split('#');
  const target = path.posix.normalize(path.posix.join(s.root, file));
  const into = intoSibling(target, s.root);
  if (!into || !BACKBONE_PATH.test(into.rest)) {
    return { refusal: 'names no backbone of a sequence of its own application (another application, a path past its own, or no backbone at all)' };
  }
  const climbed = climbRefusal(into, s.application);
  if (climbed) return { refusal: climbed };
  const { parent, number, rest: backbone } = into;
  if (s.sequence === null || !(number < s.sequence)) return { refusal: `names sequence ${number}, which is not earlier than ${s.sequence ?? 'this one'}` };
  const canonical = `../${number}/${backbone}#${id}`;
  const prior = byRoot.get(`${parent}${number}/`);
  if (!prior) {
    s.outsideArchive.push(l.leafId);
    return { canonical };
  }
  const named = prior.leaves.find((p) => p.backbone === backbone && p.leafId === id);
  const namedKey = `${prior.root}${backbone}#${id}`;
  if (!named) return { refusal: `names no leaf read from ${backbone} in sequence ${number}` };
  if (!onFile.has(namedKey)) return { refusal: `names leaf ${id} of sequence ${number}, which is not on file: it is a withdrawal, or a later act replaced or withdrew it` };
  return { canonical, named, namedKey };
}

/**
 * The fold identifies a leaf by section and file name. Two leaves of one
 * sequence under one heading with one file name would fold into one, and one
 * filed document would drop off file. Each of them is refused instead.
 */
export function refuseAmbiguousIdentity(s: FiledSequence): void {
  const byKey = new Map<string, FiledSequenceLeaf[]>();
  for (const l of s.leaves) {
    if (l.operation === 'delete') continue;
    const key = `${l.ctdSection}/${l.fileName}`;
    const group = byKey.get(key);
    if (group) group.push(l);
    else byKey.set(key, [l]);
  }
  const ambiguous = new Set([...byKey.values()].filter((ls) => ls.length > 1).flat());
  if (!ambiguous.size) return;
  for (const l of ambiguous) {
    s.refusals.push({
      code: 'leaf_identity_ambiguous',
      message: `${l.backbone}: leaf ${l.leafId} is one of ${byKey.get(`${l.ctdSection}/${l.fileName}`)!.length} leaves of this sequence filed as ${l.ctdSection} "${l.fileName}"; the filed state could hold only one of them`,
      ...leafAt(l),
    });
  }
  s.leaves = s.leaves.filter((l) => !ambiguous.has(l));
}


/**
 * P-99 C2: bind what one read-back sequence points at outside its package against the recorded filed state, the
 * fold's prior leaves with their sequence numbers (`loadLatestPriorManifestBySubmission`). The reader binds pointers
 * between the sequences an archive holds (bindPointers); a sent package holds one sequence, so every act on an earlier
 * one is in `outsideArchive`, and only the filed state can say what it names.
 *   - A modified-file pointer must name exactly one leaf on file, by sequence, backbone and ID (MODIFIED_FILE, the
 *     fold's own rule). A withdrawal then takes that leaf's section, file name and md5, as bindPointers does.
 *   - A reused file must name a leaf on file with that path and that md5.
 * Binds in place and clears what it bound from `outsideArchive`. Returns why each leaf left could not be bound, by
 * its ID; nothing unbound is ever recorded.
 */
export function bindToFiledState(s: FiledSequence, priorLeaves: PriorLeaf[]): string[] {
  const pending = new Set(s.outsideArchive);
  const refusals: string[] = [];
  for (const l of s.leaves) {
    if (!pending.has(l.leafId)) continue;
    const why = bindOneToFiledState(l, priorLeaves);
    if (why) refusals.push(`${l.backbone}: leaf ${l.leafId} ${why}`);
    else pending.delete(l.leafId);
  }
  s.outsideArchive = s.outsideArchive.filter((id) => pending.has(id));
  return refusals;
}

function bindOneToFiledState(l: FiledSequenceLeaf, priorLeaves: PriorLeaf[]): string | null {
  if (l.modifiedFile) {
    const m = MODIFIED_FILE.exec(l.modifiedFile);
    if (!m) return `points at ${l.modifiedFile}, which names no filed leaf`;
    const [, sequence, backbone, leafId] = m;
    const named = priorLeaves.filter((p) => p.sequenceNumber === sequence && p.backbone === backbone && p.leafId === leafId);
    if (named.length === 0) return `names no leaf on file in sequence ${sequence} (${backbone}#${leafId})`;
    if (named.length > 1) return `names ${named.length} leaves on file in sequence ${sequence} (${backbone}#${leafId}), not one`;
    if (l.operation === 'delete') Object.assign(l, { ctdSection: named[0].ctdSection, fileName: named[0].fileName, md5: named[0].md5 });
    return null;
  }
  const reused = /^(?:\.\.\/)+(\d{4})\/(.+)$/.exec(l.href);
  if (!reused) return `reuses ${l.href}, which names no file of a filed sequence`;
  const [, sequence, inner] = reused;
  const named = priorLeaves.filter((p) => p.sequenceNumber === sequence && p.href === inner);
  if (named.length !== 1) return `reuses ${l.href}, which ${named.length ? 'more than one leaf' : 'no leaf'} on file in sequence ${sequence} filed`;
  return named[0].md5 === l.md5 ? null : `reuses ${l.href} with a checksum that is not the checksum filed for it`;
}
