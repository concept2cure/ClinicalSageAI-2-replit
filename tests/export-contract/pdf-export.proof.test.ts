/**
 * Export-contract proof — PDF export → reopen (independent parser) → PDF/A
 * qualification.
 *
 * Proof hierarchy tiers 6-7 for the PDF path (docs/architecture/PROOF_HIERARCHY.md).
 * PDF is the platform's universal leaf/output format, but the generator was only
 * ever asserted on its own in-memory result. This proof takes the REAL renderer's
 * bytes and:
 *   - REOPEN: reopens them with `pdf-parse` (pdf.js under the hood) — an engine
 *     INDEPENDENT of the pdf-lib writer — proving the file is a valid PDF a third
 *     party can parse, not merely valid to the code that wrote it;
 *   - QUALIFICATION: runs the eCTD PDF/A acceptability classifier
 *     (`classifyPdfA`) over the same bytes — the gate that decides whether a leaf
 *     may enter a submission;
 *   - NON-VACUOUS: a non-PDF, an encrypted PDF (eCTD-prohibited), and a corrupted
 *     PDF are each caught — by the classifier, the independent parser, or both.
 *
 * HONEST SCOPE (recorded in limitations): `classifyPdfA` is DETECTION-only — it
 * answers "is this a PDF, which version, does it *declare* PDF/A, is it
 * encrypted." A true PDF/A-1b/2b verdict needs a full validator (veraPDF); that
 * drops in at the same call site. And `renderLeafPdf` is a faithful TEXT
 * rendering, not archival PDF/A-1b.
 *
 * No DB, no mocks: this exercises the pure generator + pure classifier directly.
 * Output: tests/export-contract/__reports__/pdf-export.{manifest.json,report.md}
 */

import { describe, it, expect, afterAll } from 'vitest';
import { renderLeafPdf } from '../../server/services/ectd/leaf-pdf-renderer';
import { classifyPdfA } from '../../server/services/ectd/pdfa-detect';
import { JourneyRecorder } from '../golden-journeys/harness';

const REPORT_DIR = 'tests/export-contract/__reports__';

// pdf-parse v2 exports a `PDFParse` class at runtime (its bundled .d.cts still
// describes the v1 default-function API, so narrow the shape we use here — the
// same interop the production reader uses in server/services/ocr/extractDocumentText.ts).
interface PdfTextResult {
  text?: string;
  total?: number;
  pages?: unknown[];
}
interface PdfParseInstance {
  getText(): Promise<PdfTextResult>;
}
interface PdfParseCtor {
  new (opts: { data: Buffer }): PdfParseInstance;
}

/** Reopen PDF bytes with pdf-parse (pdf.js) — an engine independent of pdf-lib. */
async function reopenPdf(data: Buffer): Promise<PdfTextResult> {
  const mod = (await import('pdf-parse')) as unknown as { PDFParse: PdfParseCtor };
  return new mod.PDFParse({ data }).getText();
}

// A distinctive single-word token survives glyph positioning in PDF text
// extraction (multi-word substrings can be split across text runs).
const TITLE = 'Clinical Overview';
const TOKEN = 'QUALIFYTOKEN7F3A';
const CONTENT = `Benefit-risk narrative for the investigational product.\n\n${TOKEN} marks the second paragraph so an independent reader can find it.`;

const R = new JourneyRecorder(
  'Export-contract proof — PDF export → reopen → PDF/A qualification',
  'Render a real PDF with the platform renderer, reopen it with an independent ' +
    'parser (pdf-parse / pdf.js), and qualify it with the eCTD PDF/A classifier.',
  ['(no DB — direct generator output)'],
);

afterAll(() => {
  R.write('pdf-export', REPORT_DIR);
});

/** Normalize extracted PDF text so a token match is robust to layout whitespace. */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

describe('PDF export → reopen → PDF/A qualification', () => {
  R.limitations.push(
    '`classifyPdfA` is detection-only (header/XMP/encryption inspection), not a ' +
      'full PDF/A-1b conformance verdict. veraPDF drops in at the same call site.',
  );
  R.limitations.push(
    '`renderLeafPdf` is a deterministic TEXT rendering (stable md5), not archival ' +
      'PDF/A-1b; PDF/A normalization is the Ghostscript pipeline (pdfa-pipeline.ts).',
  );

  it('renders, reopens with an independent parser, and qualifies the bytes', async () => {
    // ── Generate the real artifact ──────────────────────────────────────────
    const pdf = await R.step('render-real-pdf', async () => {
      const buf = await renderLeafPdf(CONTENT, { title: TITLE, sectionCode: '2.5' });
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      return { sizeBytes: buf.length, magic: '%PDF-' };
    });
    // Re-render once for reuse across steps (deterministic → identical bytes).
    const buffer = await renderLeafPdf(CONTENT, { title: TITLE, sectionCode: '2.5' });
    expect(buffer.length).toBe(pdf.sizeBytes);

    // ── REOPEN with an INDEPENDENT engine (pdf.js, not the pdf-lib writer) ───
    await R.step('reopen-with-independent-parser', async () => {
      const parsed = await reopenPdf(buffer);
      expect(parsed.total ?? 0).toBeGreaterThanOrEqual(1);
      const text = normalize(parsed.text ?? '');
      // The authored content is actually inside the rendered bytes.
      expect(text).toContain(TOKEN);
      return {
        parser: 'pdf-parse v2 (pdf.js)',
        numpages: parsed.total,
        tokenFound: true,
      };
    });

    // ── QUALIFICATION: the eCTD PDF/A acceptability classifier ───────────────
    const verdict = await R.step('pdfa-classification-qualifies-leaf', async () => {
      const c = classifyPdfA(buffer);
      expect(c.isPdf).toBe(true);
      expect(c.encrypted).toBe(false);
      expect(c.acceptableForEctd).toBe(true);
      // Honest: a plain rendered PDF does NOT claim PDF/A — the classifier says so.
      expect(c.pdfAClaimed).toBe(false);
      return {
        isPdf: c.isPdf,
        pdfVersion: c.pdfVersion,
        encrypted: c.encrypted,
        acceptableForEctd: c.acceptableForEctd,
        pdfAClaimed: c.pdfAClaimed,
        reason: c.reason,
      };
    });
    expect(verdict.acceptableForEctd).toBe(true);

    // ── Non-vacuous #1: a non-PDF is rejected by classifier AND parser ───────
    await R.expectBlocked('non-pdf-is-rejected', async () => {
      const notPdf = Buffer.from('this is plainly not a pdf document');
      const c = classifyPdfA(notPdf);
      let parserThrew = false;
      try {
        await reopenPdf(notPdf);
      } catch {
        parserThrew = true;
      }
      return { blocked: !c.isPdf && !c.acceptableForEctd && parserThrew, isPdf: c.isPdf, parserThrew };
    });

    // ── Non-vacuous #2: an encrypted PDF is eCTD-unacceptable ────────────────
    await R.expectBlocked('encrypted-pdf-is-unacceptable-for-ectd', async () => {
      // Minimal bytes carrying a %PDF header and an /Encrypt marker — exactly
      // what the eCTD PDF spec prohibits.
      const encrypted = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n%%EOF');
      const c = classifyPdfA(encrypted);
      return {
        blocked: c.isPdf && c.encrypted && !c.acceptableForEctd,
        encrypted: c.encrypted,
        acceptableForEctd: c.acceptableForEctd,
        reason: c.reason,
      };
    });

    // ── Non-vacuous #3: a corrupted PDF is caught by the independent parser ──
    await R.expectBlocked('corrupted-pdf-fails-independent-reopen', async () => {
      // Keep the header (so it still "looks" like a PDF) but destroy the body.
      const corrupt = Buffer.concat([Buffer.from('%PDF-1.7\n'), buffer.subarray(9, 40)]);
      let parserThrew = false;
      try {
        await reopenPdf(corrupt);
      } catch {
        parserThrew = true;
      }
      // The header-only classifier still calls it a PDF — which is exactly why an
      // independent REOPEN (not just header inspection) is a required tier.
      const c = classifyPdfA(corrupt);
      return { blocked: parserThrew, parserThrew, headerStillLooksPdf: c.isPdf };
    });

    R.observations.push(
      `Rendered a ${pdf.sizeBytes}-byte PDF; reopened by pdf.js (independent), ` +
        `classified acceptableForEctd=${verdict.acceptableForEctd}, pdfAClaimed=${verdict.pdfAClaimed}.`,
    );
  });
});
