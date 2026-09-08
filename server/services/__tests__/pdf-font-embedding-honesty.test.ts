/**
 * The font-embedding check reports what is in the file, not what we hoped.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `documentExportService` pushed a constant into the validation report a user
 * reads to decide whether a submission is ready to file:
 *
 *     { check: 'font_embedding', status: 'pass',
 *       details: 'Standard fonts used (Helvetica)' }
 *
 * It reported PASS on the exact fact that constitutes the FAILURE. Helvetica is
 * one of the PDF standard-14 faces — referenced by name and supplied by
 * whichever reader opens the file, which is the one case where the font is
 * definitionally NOT embedded. The check named font embedding, observed that
 * nothing was embedded, and passed itself on those grounds.
 *
 * It was false on every PDF the platform has ever produced. This export writes
 * Helvetica and Helvetica-Bold and nothing else, and no export path in the
 * repository embeds a font at all — no .ttf, no .otf, no registerFont anywhere.
 *
 * ── Why these assertions are over real PDF bytes ─────────────────────────────
 * A unit test against a stub would prove only that the function returns what it
 * was told. Both cases here are produced by the SAME PDFKit the exporter uses:
 * one written in Helvetica, exactly as the exporter writes it, and one with a
 * real TrueType face registered — so the negative case is the product's actual
 * output and the positive case is a genuinely embedded font, not a string that
 * happens to contain "/FontFile".
 */
import { describe, it, expect } from 'vitest';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

import { assessFontEmbedding } from '../documentExportService';

/** Render a PDF to a buffer with the same library the exporter uses.
 *
 *  `doc` is typed from the constructor rather than through the `PDFKit`
 *  global namespace: that namespace is not in scope under this tsconfig, and
 *  `registerFont` is absent from the shipped `PDFDocumentOptions`/instance
 *  types even though the library implements it. */
async function pdfBytes(
  build: (doc: InstanceType<typeof PDFDocument> & {
    registerFont(name: string, src: string): unknown;
  }) => void,
): Promise<Buffer> {
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );
  build(doc as Parameters<typeof build>[0]);
  doc.end();
  return done;
}

/** A real TrueType face, for the case where a font IS embedded. */
const REAL_TTF = path.join(
  process.cwd(),
  'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf',
);

describe('font_embedding states what the file actually carries', () => {
  it('reports FAIL for the PDF this exporter actually produces', async () => {
    /* Helvetica and Helvetica-Bold — precisely what documentExportService
       writes. This is the product's real output, and the old check called it a
       pass. */
    const buf = await pdfBytes((doc) => {
      doc.fontSize(24).font('Helvetica-Bold').text('Clinical Overview');
      doc.fontSize(11).font('Helvetica').text('The device met the acceptance criterion.');
    });

    // Ground truth, independent of the function under test: the bytes hold no
    // font program at all.
    expect(buf.toString('latin1')).not.toContain('/FontFile');

    const result = assessFontEmbedding(buf);
    expect(result.check).toBe('font_embedding');
    expect(result.status, 'a PDF with no embedded font was reported as passing').toBe('fail');
    // And it says why, in terms a reader can act on.
    expect(result.details).toMatch(/not embedded|no font program/i);
    expect(result.details).not.toMatch(/^Standard fonts used/);
  });

  it('reports PASS when a font program really is embedded', async () => {
    /* The check must not be "always fail" — that is the same defect with the
       opposite constant, and it would hide the day someone does the embedding
       work properly. A real TrueType face is registered here, so PDFKit writes
       a /FontFile2 descriptor stream. */
    expect(fs.existsSync(REAL_TTF), `fixture font missing: ${REAL_TTF}`).toBe(true);
    const buf = await pdfBytes((doc) => {
      doc.registerFont('Embedded', REAL_TTF);
      doc.font('Embedded').fontSize(12).text('The device met the acceptance criterion.');
    });

    // Ground truth again: a font program is present.
    expect(buf.toString('latin1')).toMatch(/\/FontFile\d?/);

    const result = assessFontEmbedding(buf);
    expect(result.status, 'an embedded font was reported as failing').toBe('pass');
    expect(result.details).toMatch(/embedded/i);
  });

  it('does not assert an agency rule it has not checked', () => {
    /* The string is what a user reads to judge a filing. It may state what this
       function verified — what is in the bytes — and must not attach a
       conformance verdict to a specific regulation that nothing here tested.
       Naming the fact is honest; naming a rule is a second claim. */
    const details = assessFontEmbedding(Buffer.from('%PDF-1.7\n')).details;
    /* Word-anchored. Written without \b first, this failed on the honest
       string: "ICH" matched inside "wh-ich". A guard that fires on ordinary
       English is a guard that gets deleted rather than obeyed. */
    expect(details).not.toMatch(/\b(21 CFR|eCTD|PDF\/A|ICH|FDA|compliant|conformant)\b/i);
  });
});
