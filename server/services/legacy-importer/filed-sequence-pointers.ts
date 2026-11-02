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
 *
 * @module server/services/legacy-importer/filed-sequence-pointers
 */

import * as path from 'path';
import type { FiledSequence, FiledSequenceLeaf } from './filed-sequence-reader';

/** A path ending in a sequence folder and one of its backbones, with what comes before the folder. */
const SEQUENCE_BACKBONE = /^((?:[^/]+\/)*?)(\d{4})\/(index\.xml|m1\/[a-z]{2}\/[a-z]{2}-regional\.xml)$/;

/** The folder that holds a sequence's folder: 'app/' for 'app/0001/', '' for '0001/', '../' for the archive root. */
export const parentOf = (root: string): string => (root === '' ? '../' : root.replace(/[^/]+\/$/, ''));

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
  for (const s of sequences) {
    const takenOff = new Set<string>();
    s.leaves = s.leaves.filter((l) => keepBound(s, l, bindPointer(s, l, byRoot, onFile), takenOff));
    for (const k of takenOff) onFile.delete(k);
    for (const l of s.leaves) if (l.operation !== 'delete') onFile.add(`${s.root}${l.backbone}#${l.leafId}`);
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
  const m = SEQUENCE_BACKBONE.exec(target);
  if (!m) return { refusal: 'names no sequence\'s backbone' };
  const [, parent, number, backbone] = m;
  if (parent !== parentOf(s.root)) return { refusal: 'names a sequence of another application, or climbs past its own' };
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
    byKey.set(key, [...(byKey.get(key) ?? []), l]);
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

