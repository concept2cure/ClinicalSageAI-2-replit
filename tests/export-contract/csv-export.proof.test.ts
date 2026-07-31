/**
 * Export-contract proof — CSV export → reopen (RFC-4180 parse) → round-trip
 * qualification.
 *
 * Proof hierarchy tiers 6-7 for the CSV path (docs/architecture/PROOF_HIERARCHY.md).
 * The universal packager emits real .csv bytes for tabular/analytics exports with
 * a HAND-ROLLED quoter (universal-packager.ts generateCsv: it wraps each cell in
 * double-quotes and doubles internal `"` to `""`). Hand-rolled quoting is exactly
 * where writer bugs live — a forgotten quote turns one value into two columns. So
 * this proof takes the REAL generator's output and:
 *   - REOPEN (independent of the writer): parses the bytes with `csv-parse`, a real
 *     RFC-4180 parser that has never seen the writer's code, into rows-of-cells;
 *   - ROUND-TRIP FIDELITY: a value that itself contains a comma and embedded
 *     double-quotes is read back BYTE-FOR-BYTE as a single cell — only possible if
 *     the writer quoted and escaped it correctly;
 *   - NON-VACUOUS: an unterminated quoted field makes the parser throw, and
 *     stripping the writer's quotes (simulating an unquoted-comma writer bug)
 *     mis-splits the comma value into two columns — the exact failure the quoting
 *     prevents.
 *
 * No DB, no mocks: the universal packager imports only docx/archiver/crypto.
 * Output: tests/export-contract/__reports__/csv-export.{manifest.json,report.md}
 */

import { describe, it, expect, afterAll } from 'vitest';
import { parse } from 'csv-parse/sync';
import { packageSingleFormat } from '../../server/services/universal-packager';
import { JourneyRecorder } from '../golden-journeys/harness';

const REPORT_DIR = 'tests/export-contract/__reports__';

const TITLE = 'Tabular Export Contract';
const TOKEN = 'ROUNDTRIPCSV7Q';
// A value with a comma AND embedded double-quotes AND no tab/pipe: the generator
// wraps the whole line in one quoted cell, escaping the quotes. An RFC-4180 parser
// must read this back as ONE cell, comma and quotes intact.
const HARD_CELL = `Value, with "quotes" and a comma — ${TOKEN}`;
// The generator splits each line on TABs into cells; every cell is quote-wrapped.
// A rectangular 2-column table keeps the reopen a proper table while the hard cell
// (comma + embedded quotes, no tab) rides in column 2.
const CONTENT = `Parameter\tResult\nAssay linearity\tPASS\nNote\t${HARD_CELL}`;

const R = new JourneyRecorder(
  'Export-contract proof — CSV export → reopen → round-trip qualification',
  'Generate a real .csv with the universal packager and reopen it with an ' +
    'independent RFC-4180 parser (csv-parse), proving the hand-rolled quoter ' +
    'produces bytes a real parser reads back losslessly.',
  ['(no DB — direct generator output)'],
);

afterAll(() => {
  R.write('csv-export', REPORT_DIR);
});

describe('CSV export → reopen → round-trip qualification', () => {
  R.limitations.push(
    'The CSV generator quotes every emitted cell (it never leaves a bare value), ' +
      'so this proof exercises the quote/escape path but not an unquoted-output path. ' +
      'The reader (csv-parse) is fully independent of the writer.',
  );

  it('generates, reopens with an RFC-4180 parser, and round-trips a hard cell', async () => {
    // ── Generate the real artifact ──────────────────────────────────────────
    const gen = await R.step('generate-real-csv', async () => {
      const output = await packageSingleFormat('csv', TITLE, CONTENT);
      expect(output).not.toBeNull();
      const buf = output!.buffer;
      expect(buf.length).toBeGreaterThan(0);
      expect(output!.format).toBe('csv');
      expect(output!.checksum).toMatch(/^[a-f0-9]{64}$/); // sha-256 the packager recorded
      return { sizeBytes: buf.length, format: output!.format, mimeType: output!.mimeType, fileName: output!.fileName };
    });
    const output = await packageSingleFormat('csv', TITLE, CONTENT);
    const buffer = output!.buffer;

    // ── REOPEN: parse with a real RFC-4180 parser, independent of the writer ──
    const rows = await R.step('reopen-rfc4180-parse', async () => {
      // csv-parse throws on malformed quoting; a clean parse is itself evidence
      // the emitted bytes are well-formed CSV, not a blob we called ".csv".
      // Default options enforce a consistent column count — a ragged table would
      // throw here, so a clean parse also proves the rows are rectangular.
      const records = parse(buffer, { skip_empty_lines: true }) as string[][];
      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBe(3); // three authored lines
      // Every tab-delimited row round-trips as two cells.
      expect(records[0]).toEqual(['Parameter', 'Result']);
      expect(records[1]).toEqual(['Assay linearity', 'PASS']);
      return { rowCount: records.length, headerCells: records[0].length };
    });
    expect(rows.rowCount).toBe(3);

    // ── ROUND-TRIP FIDELITY: the hard cell survives comma + quote escaping ────
    await R.step('roundtrip-hard-cell-lossless', async () => {
      const records = parse(buffer, { skip_empty_lines: true }) as string[][];
      const last = records[2];
      // Column 2 held the hard value: the comma did NOT split the cell and the
      // embedded quotes were unescaped back to their original form.
      expect(last.length).toBe(2);
      expect(last[0]).toBe('Note');
      expect(last[1]).toBe(HARD_CELL);
      expect(last[1]).toContain(TOKEN);
      return { cellCount: last.length, valueMatches: last[1] === HARD_CELL };
    });

    // ── Non-vacuous #1: an unterminated quoted field is caught on reopen ──────
    await R.expectBlocked('unterminated-quote-fails-parse', async () => {
      let parserThrew = false;
      try {
        parse(Buffer.from('"abc,def\n"another', 'utf-8'), { skip_empty_lines: true });
      } catch {
        parserThrew = true;
      }
      return { blocked: parserThrew, parserThrew };
    });

    // ── Non-vacuous #2: stripping the writer's quotes mis-splits the comma ────
    // This is the exact bug the quoting prevents: with the quotes gone, the
    // independent parser splits HARD_CELL on its comma into TWO columns. A writer
    // that forgot to quote would emit these un-quoted bytes and fail here.
    await R.expectBlocked('unquoted-comma-value-breaks-structure', async () => {
      const correct = parse(buffer, { skip_empty_lines: true }) as string[][];
      const correctLastCells = correct[2].length; // 2 — the quote held the comma in
      const stripped = Buffer.from(buffer.toString('utf-8').replace(/"/g, ''), 'utf-8');
      // With the quotes gone the comma inside the hard value now splits the row.
      // Depending on parser strictness that either THROWS (inconsistent column
      // count) or yields an extra column — both mean the table is corrupted.
      let parserThrew = false;
      let strippedLastCells = -1;
      try {
        const naive = parse(stripped, { skip_empty_lines: true }) as string[][];
        strippedLastCells = naive[naive.length - 1].length;
      } catch {
        parserThrew = true;
      }
      return {
        blocked: correctLastCells === 2 && (parserThrew || strippedLastCells > 2),
        correctLastCells,
        parserThrew,
        strippedLastCells,
      };
    });

    R.observations.push(
      `Generated a ${gen.sizeBytes}-byte .csv (${rows.rowCount} rows); an RFC-4180 ` +
        `parser round-tripped a comma+quote value as a single cell, and quote-stripping ` +
        `mis-split it — proving the hand-rolled quoter is load-bearing.`,
    );
  });
});
