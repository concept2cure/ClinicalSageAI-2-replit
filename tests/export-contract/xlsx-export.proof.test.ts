/**
 * Export-contract proof — XLSX export → reopen (OOXML parts) → round-trip
 * qualification.
 *
 * Proof hierarchy tiers 6-7 for the XLSX path (docs/architecture/PROOF_HIERARCHY.md).
 * The universal packager emits real .xlsx bytes for analytics/tabular exports,
 * but nothing reopened them. This proof takes the REAL generator's output and:
 *   - REOPEN (independent of the writer's object model): unzips the OOXML package
 *     with `adm-zip`, asserts the required parts exist (`[Content_Types].xml`,
 *     `xl/workbook.xml`, a worksheet), parses the workbook + sheet XML as XML,
 *     and confirms the authored cell text is present in the raw `xl/` bytes —
 *     proving the emitted file is a well-formed SpreadsheetML container, not a
 *     blob we called ".xlsx";
 *   - ROUND-TRIP: reloads the same bytes through ExcelJS and reads the authored
 *     rows back cell-by-cell — proving the tabular data is retrievable from the
 *     emitted file;
 *   - NON-VACUOUS: a corrupted container and a valid-zip-that-is-not-a-workbook
 *     (no `xl/workbook.xml`) are both caught.
 *
 * HONEST SCOPE (recorded in limitations): no XLSX engine independent of the
 * writer (e.g. SheetJS) is vendored, so the object-model round-trip uses ExcelJS
 * (the writer). The independence in this proof comes from the raw-OOXML reopen
 * (`adm-zip` + XML parse), which never touches the ExcelJS object model.
 *
 * No DB, no mocks: the universal packager imports only docx/archiver/crypto.
 * Output: tests/export-contract/__reports__/xlsx-export.{manifest.json,report.md}
 */

import { describe, it, expect, afterAll } from 'vitest';
import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import ExcelJS from 'exceljs';
import { packageSingleFormat } from '../../server/services/universal-packager';
import { JourneyRecorder } from '../golden-journeys/harness';

const REPORT_DIR = 'tests/export-contract/__reports__';

const TITLE = 'Analytical Validation Summary';
const TOKEN = 'ROUNDTRIPXLSX9Z';
// The XLSX generator splits content into rows on newlines and into cells on tabs.
const CONTENT = `Parameter\tResult\nAssay linearity\tPASS\n${TOKEN}\tvalue-42`;

const R = new JourneyRecorder(
  'Export-contract proof — XLSX export → reopen → round-trip qualification',
  'Generate a real .xlsx with the universal packager, reopen its OOXML parts ' +
    'independently of the writer object model, and round-trip the tabular data ' +
    'back through ExcelJS.',
  ['(no DB — direct generator output)'],
);

afterAll(() => {
  R.write('xlsx-export', REPORT_DIR);
});

describe('XLSX export → reopen → round-trip qualification', () => {
  R.limitations.push(
    'No XLSX engine independent of the writer (e.g. SheetJS) is vendored, so the ' +
      'object-model round-trip uses ExcelJS (the writer). Independence comes from ' +
      'the raw-OOXML reopen (adm-zip + XML parse), which never uses ExcelJS.',
  );

  it('generates, reopens the OOXML parts, and round-trips the rows', async () => {
    // ── Generate the real artifact ──────────────────────────────────────────
    const gen = await R.step('generate-real-xlsx', async () => {
      const output = await packageSingleFormat('xlsx', TITLE, CONTENT);
      expect(output).not.toBeNull();
      const buf = output!.buffer;
      expect(buf.length).toBeGreaterThan(0);
      expect(output!.format).toBe('xlsx');
      // OOXML is a ZIP: local-file-header magic PK\x03\x04.
      expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
      expect(output!.checksum).toMatch(/^[a-f0-9]{64}$/); // sha-256 the packager recorded
      return { sizeBytes: buf.length, format: output!.format, mimeType: output!.mimeType, fileName: output!.fileName };
    });
    const output = await packageSingleFormat('xlsx', TITLE, CONTENT);
    const buffer = output!.buffer;

    // ── REOPEN: well-formed SpreadsheetML, independent of the ExcelJS model ──
    const parts = await R.step('reopen-ooxml-parts', async () => {
      const zip = new AdmZip(buffer);
      const names = zip.getEntries().map((e) => e.entryName);
      expect(names).toContain('[Content_Types].xml'); // OPC content-type map
      expect(names).toContain('xl/workbook.xml'); // the workbook part
      const sheetName = names.find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
      expect(sheetName, 'no worksheet part in the package').toBeTruthy();

      // parseStringPromise REJECTS on malformed XML — a real reopen-parse.
      await parseStringPromise(zip.getEntry('xl/workbook.xml')!.getData().toString('utf8'));
      await parseStringPromise(zip.getEntry(sheetName!)!.getData().toString('utf8'));

      // The authored cell text is actually inside the raw xl/ bytes (ExcelJS
      // writes strings into xl/sharedStrings.xml; fall back to scanning all xl/).
      const xlXml = names
        .filter((n) => n.startsWith('xl/') && n.endsWith('.xml'))
        .map((n) => zip.getEntry(n)!.getData().toString('utf8'))
        .join('\n');
      expect(xlXml).toContain(TOKEN);
      expect(xlXml).toContain('Assay linearity');
      return { entryCount: names.length, worksheet: sheetName, hasWorkbookPart: true };
    });
    expect(parts.hasWorkbookPart).toBe(true);

    // ── ROUND-TRIP: reload the bytes and read the authored rows back ─────────
    await R.step('roundtrip-read-authored-rows', async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = wb.worksheets[0];
      expect(sheet).toBeTruthy();
      // Collect every cell's text.
      const cells: string[] = [];
      sheet.eachRow((row) => {
        row.eachCell((cell) => cells.push(String(cell.value ?? '')));
      });
      expect(cells).toContain('Parameter');
      expect(cells).toContain('PASS');
      expect(cells).toContain(TOKEN);
      return { rowsRead: sheet.rowCount, tokenFound: true };
    });

    // ── Non-vacuous #1: a corrupted container is caught on reopen ────────────
    await R.expectBlocked('corrupted-xlsx-fails-reopen', async () => {
      const corrupt = Buffer.concat([buffer.subarray(0, 8), Buffer.from('CORRUPTEDPAYLOAD')]);
      let readerThrew = false;
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(corrupt as unknown as ArrayBuffer);
      } catch {
        readerThrew = true;
      }
      return { blocked: readerThrew, readerThrew };
    });

    // ── Non-vacuous #2: a valid ZIP that is NOT a workbook is caught ─────────
    await R.expectBlocked('valid-zip-without-workbook-part-is-caught', async () => {
      const fakeZip = new AdmZip();
      fakeZip.addFile('notes.txt', Buffer.from('I am a zip, not a spreadsheet.'));
      const fakeBuf = fakeZip.toBuffer();
      const names = new AdmZip(fakeBuf).getEntries().map((e) => e.entryName);
      const missingWorkbook = !names.includes('xl/workbook.xml');
      let readerThrew = false;
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(fakeBuf as unknown as ArrayBuffer);
        // ExcelJS may load an empty book; a missing workbook part still means "not a workbook".
        if (wb.worksheets.length === 0) readerThrew = true;
      } catch {
        readerThrew = true;
      }
      return { blocked: missingWorkbook && readerThrew, missingWorkbook, readerThrew };
    });

    R.observations.push(
      `Generated a ${gen.sizeBytes}-byte .xlsx (${parts.entryCount} OOXML parts); ` +
        `reopened raw ${parts.worksheet}, round-tripped rows through ExcelJS.`,
    );
  });
});
