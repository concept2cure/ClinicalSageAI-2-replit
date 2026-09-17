/**
 * Reading an indirect object that lives inside a compressed object stream.
 *
 * The eSTAR catalog is a top-level object, but the thing an attachment has to
 * join — its `/Names` dictionary — is not. In both vendored templates it sits
 * inside an `ObjStm`, and it holds `/JavaScript`: the template's own scripts,
 * which is everything the form's behaviour is made of (the reveal guards, the
 * 510(k)-summary rebuilds, all of it measured in
 * `docs/reports/estar-acrobat-behaviour-2026-09-04.md`).
 *
 * So `/Names /EmbeddedFiles` cannot be added by writing a fresh names
 * dictionary over the old one — that would delete the scripts and leave a form
 * that opens and does nothing. It has to be MERGED, which means the existing
 * one has to be read first, out of a stream that is deflated and enciphered.
 *
 * Verified against the real templates, and the expectations below were measured
 * from them (pypdf, 2026-09-07): nIVD catalog 212 → `/Names 221 0 R`, which is
 * object-stream entry 1 of ObjStm 272 and holds `/JavaScript 222 0 R`; IVD
 * catalog 227 → `/Names 236 0 R` holding `/JavaScript 237 0 R`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

import { readIndirectObjectText, readXrefTable } from '../pdf-object-store';
import { appendIncrementalUpdate, readPdfSecurity } from '../fill-official-pdf';

const DIR = process.env.ESTAR_TEMPLATE_DIR ?? 'assets/estar-templates';
const TEMPLATES = [
  { label: 'nIVD', file: 'eSTAR-510k-non-ivd.pdf', catalog: 212, names: 221, objstm: 272, javascript: 222 },
  { label: 'IVD', file: 'eSTAR-510k-ivd.pdf', catalog: 227, names: 236, javascript: 237 },
].map((t) => ({ ...t, path: path.resolve(DIR, t.file), exists: fsSync.existsSync(path.resolve(DIR, t.file)) }));

for (const t of TEMPLATES) {
  describe.skipIf(!t.exists)(`pdf-object-store — ${t.label} eSTAR`, () => {
    let bytes: Buffer;
    let sec: ReturnType<typeof readPdfSecurity>;

    beforeAll(async () => {
      bytes = Buffer.from(await fs.readFile(t.path));
      sec = readPdfSecurity(bytes);
    });

    it('indexes every object in the cross-reference stream', () => {
      const table = readXrefTable(bytes);
      expect(table.size).toBeGreaterThan(200);
      expect(table.get(t.catalog)?.type).toBe(1);
      /* The names dictionary is COMPRESSED — that is the whole difficulty. */
      expect(table.get(t.names)?.type).toBe(2);
    });

    it('reads a top-level object — the catalog, with its /Names reference', () => {
      const text = readIndirectObjectText(bytes, sec, t.catalog);
      expect(text).toContain('/Type/Catalog');
      expect(text).toContain(`/Names ${t.names} 0 R`);
      expect(text).toContain('/NeedsRendering true');
    });

    it('reads a COMPRESSED object out of its stream, scripts intact', () => {
      const text = readIndirectObjectText(bytes, sec, t.names);
      expect(text).toBeTruthy();
      /* The reason a merge is a merge: this is what would be lost. */
      expect(text).toContain(`/JavaScript ${t.javascript} 0 R`);
    });

    it('answers null for an object the file does not have', () => {
      expect(readIndirectObjectText(bytes, sec, 999_999)).toBeNull();
    });

    it('reads the NEWEST revision after two chained incremental updates', () => {
      /* The tail of an updated file holds two `startxref` lines. Taking the
         first one in the window returns the OLDER section, so every object an
         update replaced reads back at its previous revision — nothing fails,
         the file just reports its old contents. Two updates is where it bites,
         which is exactly what attaching to a filled form does. */
      const one = appendIncrementalUpdate(bytes, [
        { num: t.catalog, gen: 0, dict: '<</Type/Catalog/Marker(first)>>' },
      ]);
      const two = appendIncrementalUpdate(one, [
        { num: t.catalog, gen: 0, dict: '<</Type/Catalog/Marker(second)>>' },
      ]);
      expect(readIndirectObjectText(one, sec, t.catalog)).toContain('(first)');
      expect(readIndirectObjectText(two, sec, t.catalog)).toContain('(second)');
      expect(readIndirectObjectText(two, sec, t.catalog)).not.toContain('(first)');
    });
  });
}

describe('pdf-object-store — a file with a classic cross-reference table', () => {
  it('says what it cannot read instead of guessing', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    const classic = Buffer.from(await doc.save({ useObjectStreams: false }));
    expect(() => readXrefTable(classic)).toThrow(/cross-reference table/i);
  });
});
