/**
 * Export-contract proof — DOCX export → reopen (OOXML parts) → independent-reader
 * qualification.
 *
 * Proof hierarchy tiers 6-7 for the DOCX path (docs/architecture/PROOF_HIERARCHY.md).
 * The document exporter produced .docx bytes that no test ever reopened. This
 * proof takes the REAL generator's output and:
 *   - REOPEN: unzips the OOXML package (adm-zip), asserts the required parts
 *     exist (`[Content_Types].xml`, `word/document.xml`), and parses
 *     `word/document.xml` as XML — proving the emitted bytes are a well-formed
 *     Open Packaging Conventions container, not just a blob we called ".docx";
 *   - QUALIFICATION: reopens the same bytes with `mammoth` — an OOXML reader
 *     INDEPENDENT of the `docx` writer library — and confirms the authored title
 *     and body survive the round trip (heading → <h1>, paragraph text present);
 *   - NON-VACUOUS: a corrupted container and a valid-zip-that-is-not-a-docx
 *     (no `word/document.xml`) are both caught — proving the reopen gate is not
 *     fooled by "it unzips."
 *
 * No DB, no mocks: this exercises the pure generator + independent readers.
 * Output: tests/export-contract/__reports__/docx-export.{manifest.json,report.md}
 */

import { describe, it, expect, afterAll } from 'vitest';
import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import { convertToHtml, extractRawText } from 'mammoth';
import { generateDocxBuffer } from '../../server/services/docxGenerator';
import { JourneyRecorder } from '../golden-journeys/harness';

const REPORT_DIR = 'tests/export-contract/__reports__';

const TITLE = 'IVDR Technical Documentation';
const BODY_TOKEN = 'ROUNDTRIPTOKEN9C2E';
const CONTENT = `Executive summary of the technical documentation.\n\n${BODY_TOKEN} appears in the second authored paragraph.`;

const R = new JourneyRecorder(
  'Export-contract proof — DOCX export → reopen → independent-reader qualification',
  'Generate a real .docx with the platform generator, reopen its OOXML parts, ' +
    'and qualify it with an independent reader (mammoth) — proving the authored ' +
    'content survives a round trip out of the writer that produced it.',
  ['(no DB — direct generator output)'],
);

afterAll(() => {
  R.write('docx-export', REPORT_DIR);
});

describe('DOCX export → reopen → independent-reader qualification', () => {
  R.limitations.push(
    '`generateDocxBuffer` is the generic exporter (title heading + body ' +
      'paragraphs). Richer structured documents (tables, headers/footers, ' +
      'integrity hashes) use `generateIvdrDocx`, which emits the same OOXML ' +
      'container contract this proof verifies.',
  );

  it('generates, reopens the OOXML parts, and qualifies with an independent reader', async () => {
    // ── Generate the real artifact ──────────────────────────────────────────
    const gen = await R.step('generate-real-docx', async () => {
      const buf = await generateDocxBuffer(TITLE, CONTENT);
      expect(buf.length).toBeGreaterThan(0);
      // OOXML is a ZIP: the local-file-header magic is PK\x03\x04.
      expect(buf.subarray(0, 4).toString('latin1')).toBe('PK');
      return { sizeBytes: buf.length, magic: 'PK\\x03\\x04' };
    });
    const buffer = await generateDocxBuffer(TITLE, CONTENT);

    // ── REOPEN: the emitted bytes are a well-formed OOXML package ────────────
    const documentXml = await R.step('reopen-ooxml-parts', async () => {
      const zip = new AdmZip(buffer);
      const names = zip.getEntries().map((e) => e.entryName);
      expect(names).toContain('[Content_Types].xml'); // OPC content-type map
      expect(names).toContain('word/document.xml'); // the main document part
      const xml = zip.getEntry('word/document.xml')!.getData().toString('utf8');
      // parseStringPromise REJECTS on malformed XML — a real reopen-parse.
      await parseStringPromise(xml);
      // The authored content is actually inside the document part.
      expect(xml).toContain(TITLE);
      expect(xml).toContain(BODY_TOKEN);
      return { entryCount: names.length, hasContentTypes: true, hasDocumentPart: true };
    });
    expect(documentXml.hasDocumentPart).toBe(true);

    // ── QUALIFICATION: an INDEPENDENT reader (mammoth) reopens the export ────
    await R.step('independent-reader-qualifies-docx', async () => {
      const raw = await extractRawText({ buffer });
      const rawText = raw.value.replace(/\s+/g, ' ');
      expect(rawText).toContain(TITLE);
      expect(rawText).toContain(BODY_TOKEN);
      // The title was authored as a heading — mammoth maps it to an <h1>.
      const html = await convertToHtml({ buffer });
      expect(html.value).toMatch(new RegExp(`<h1[^>]*>${TITLE}</h1>`));
      return {
        reader: 'mammoth (independent OOXML reader)',
        rawTextChars: raw.value.length,
        titleAsHeading: true,
        bodyTokenPresent: true,
      };
    });

    // ── Non-vacuous #1: a corrupted container is caught on reopen ────────────
    await R.expectBlocked('corrupted-docx-fails-reopen', async () => {
      // A valid ZIP header followed by garbage: unzip/central-directory read fails.
      const corrupt = Buffer.concat([buffer.subarray(0, 8), Buffer.from('CORRUPTEDPAYLOAD')]);
      let readerThrew = false;
      try {
        await extractRawText({ buffer: corrupt });
      } catch {
        readerThrew = true;
      }
      return { blocked: readerThrew, readerThrew };
    });

    // ── Non-vacuous #2: a valid ZIP that is NOT a docx is caught ─────────────
    await R.expectBlocked('valid-zip-without-document-part-is-caught', async () => {
      // A perfectly valid ZIP — but with no word/document.xml, it is not a docx.
      const fakeZip = new AdmZip();
      fakeZip.addFile('notes.txt', Buffer.from('I am a zip, not a Word document.'));
      const fakeBuf = fakeZip.toBuffer();

      // Structural reopen: the required OOXML part is absent.
      const names = new AdmZip(fakeBuf).getEntries().map((e) => e.entryName);
      const missingDocumentPart = !names.includes('word/document.xml');

      // And the independent reader refuses it too.
      let readerThrew = false;
      try {
        await extractRawText({ buffer: fakeBuf });
      } catch {
        readerThrew = true;
      }
      return { blocked: missingDocumentPart && readerThrew, missingDocumentPart, readerThrew };
    });

    R.observations.push(
      `Generated a ${gen.sizeBytes}-byte .docx (${documentXml.entryCount} OOXML parts); ` +
        `reopened and qualified by mammoth (independent reader).`,
    );
  });
});
