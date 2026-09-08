/**
 * Joining embedded files to a document's `/Names /EmbeddedFiles` name tree.
 *
 * An `/EmbeddedFile` that nothing references is a stream sitting in a file: the
 * applicant's Acrobat will not list it and CDRH's ingestion will not find it.
 * The reference that makes it an attachment is an entry in the catalog's
 * embedded-files name tree.
 *
 * ── Why this is a MERGE ──
 * In both vendored eSTAR templates the catalog's `/Names` dictionary holds
 * exactly one key: `/JavaScript`. That is the form — the reveal guards, the
 * 510(k)-summary rebuilds, every behaviour measured in
 * `docs/reports/estar-acrobat-behaviour-2026-09-04.md`. Writing a fresh names
 * dictionary carrying `/EmbeddedFiles` would attach the files and hand the
 * applicant an eSTAR that opens and does nothing. So the existing dictionary is
 * read — out of the object stream it is compressed into — and rewritten with
 * one key added and everything else byte-identical.
 *
 * ── What it refuses ──
 * A document that ALREADY has an `/EmbeddedFiles` tree. Merging into an
 * arbitrary existing tree means handling the multi-level `/Kids` form and
 * re-balancing it, and neither vendored template has one, so there is nothing
 * to test such code against. An untested merge of a regulated submission's
 * attachment index is worse than a refusal that names the problem.
 *
 * @module server/services/forms/pdf-attach
 */

import {
  encryptObjectData,
  startxrefOffset,
  type PdfObjectWrite,
  type PdfSecurity,
} from './fill-official-pdf';
import { readIndirectObjectText, readXrefTable } from './pdf-object-store';

export interface EmbeddedFileEntry {
  /** The name the attachment is listed under. Also the name-tree key. */
  name: string;
  /** Object number of its `/Filespec` (from `buildEmbeddedFileObjects`). */
  filespecNum: number;
}

export interface EmbeddedFileJoin {
  /** Objects to write alongside the attachments themselves. */
  objects: PdfObjectWrite[];
  /** The object number the name tree was written into. */
  namesObjectNum: number;
}

/** The trailer's `/Root` object number, from the newest cross-reference section. */
function rootObjectNumber(buf: Buffer): number {
  const at = startxrefOffset(buf);
  const trailer = buf.toString('latin1', at, at + 4096);
  const root = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(trailer);
  if (!root) throw new Error('Malformed PDF trailer: no /Root');
  return parseInt(root[1], 10);
}

/**
 * Build the name-tree object(s) that reference `entries`.
 *
 * The tree is a single leaf: `<</Names[(key) ref (key) ref …]>>`, sorted by key,
 * which is what a reader binary-searches. Keys are PDF strings, so in an
 * encrypted document they are enciphered under the object that CONTAINS them —
 * the names dictionary — not under the `/Filespec` they point at.
 */
export function attachEmbeddedFiles(
  bytes: Uint8Array | Buffer,
  sec: PdfSecurity,
  entries: EmbeddedFileEntry[],
): EmbeddedFileJoin {
  if (entries.length === 0) throw new Error('Attaching needs at least one embedded file');

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const xref = readXrefTable(buf);
  const rootNum = rootObjectNumber(buf);
  const catalog = readIndirectObjectText(buf, sec, rootNum, xref);
  if (!catalog) throw new Error(`Malformed PDF: catalog object ${rootNum} is unreadable`);

  const namesRef = /\/Names\s+(\d+)\s+(\d+)\s+R/.exec(catalog);
  if (!namesRef) {
    throw new Error(
      'This PDF has no indirect /Names dictionary on its catalog. Both vendored FDA eSTAR ' +
        'templates do, so this is a document this writer has never been tested against.',
    );
  }
  const namesNum = parseInt(namesRef[1], 10);
  const names = readIndirectObjectText(buf, sec, namesNum, xref);
  if (!names) throw new Error(`Malformed PDF: names dictionary ${namesNum} is unreadable`);
  if (/\/EmbeddedFiles/.test(names)) {
    throw new Error(
      `The document already carries an /EmbeddedFiles name tree (object ${namesNum}); ` +
        'merging into an existing tree is not implemented, so nothing was attached.',
    );
  }

  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const pairs = sorted
    .map((e) => {
      const key = encryptObjectData(sec, namesNum, 0, Buffer.from(e.name, 'latin1'));
      return `<${key.toString('hex')}> ${e.filespecNum} 0 R`;
    })
    .join(' ');

  // The existing dictionary, with one key added. Everything else is carried
  // across verbatim — this is the difference between attaching a file and
  // deleting the form.
  const inner = names.trim().replace(/^<<|>>$/g, '');
  const merged = `<<${inner}/EmbeddedFiles<</Names[${pairs}]>>>>`;

  return {
    objects: [{ num: namesNum, gen: 0, dict: merged }],
    namesObjectNum: namesNum,
  };
}
