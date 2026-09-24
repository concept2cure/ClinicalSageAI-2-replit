/**
 * Spreadsheet service tests — exercise the exceljs-backed read/study/edit
 * surface end-to-end on in-memory workbooks (no DB, no filesystem).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import {
  inspectWorkbook,
  readWorksheet,
  workbookToText,
  applyWorkbookEdits,
  cellValueToDisplay,
} from '../spreadsheetService';

async function buildFixtureXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Budget');
  ws.getCell('A1').value = 'Item';
  ws.getCell('B1').value = 'Cost';
  ws.getCell('A2').value = 'CRO fees';
  ws.getCell('B2').value = 125000;
  ws.getCell('A3').value = 'Biostatistics';
  ws.getCell('B3').value = 40000;
  ws.getCell('A4').value = 'Total';
  ws.getCell('B4').value = { formula: 'SUM(B2:B3)', result: 165000 };
  const notes = wb.addWorksheet('Notes');
  notes.getCell('A1').value = 'Assumes Phase 2 protocol v3';
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/** A batch listing longer than any display page: 1,000 lots, one per row. */
async function buildLongXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lots');
  ws.getCell('A1').value = 'Lot';
  ws.getCell('B1').value = 'Assay %';
  for (let i = 1; i <= 1000; i++) {
    ws.getCell(`A${i + 1}`).value = `L${String(i).padStart(4, '0')}`;
    ws.getCell(`B${i + 1}`).value = 99 + (i % 10) / 10;
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/**
 * A sheet with a blank row and a blank column — the layout of almost every
 * real batch record or stability table (a spacer row under the header, an
 * empty column between groups). 3 rows and 2 columns hold values; the last
 * value sits at row 4, column C.
 */
async function buildGappedXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Stability');
  ws.getCell('A1').value = 'Timepoint';
  ws.getCell('C1').value = 'Impurity B %';
  ws.getCell('A2').value = 'T0';
  ws.getCell('C2').value = 0.05;
  ws.getCell('A4').value = 'T12';
  ws.getCell('C4').value = 0.31;
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

describe('spreadsheetService', () => {
  let xlsx: Buffer;

  beforeAll(async () => {
    xlsx = await buildFixtureXlsx();
  });

  it('inspectWorkbook inventories sheets with dimensions and formula counts', async () => {
    const inv = await inspectWorkbook(xlsx, 'budget.xlsx');
    expect(inv.format).toBe('xlsx');
    expect(inv.sheetCount).toBe(2);
    const budget = inv.sheets.find((s) => s.name === 'Budget');
    expect(budget).toBeDefined();
    expect(budget!.rowCount).toBe(4);
    expect(budget!.columnCount).toBe(2);
    expect(budget!.formulaCells).toBe(1);
  });

  it('readWorksheet returns rows with values and preserved formulas', async () => {
    const r = await readWorksheet(xlsx, 'budget.xlsx', { sheet: 'Budget' });
    expect(r.sheet).toBe('Budget');
    expect(r.totalRows).toBe(4);
    expect(r.rows[0].values).toEqual(['Item', 'Cost']);
    expect(r.rows[1].values).toEqual(['CRO fees', 125000]);
    const total = r.formulas.find((f) => f.address === 'B4');
    expect(total).toBeDefined();
    expect(total!.formula).toBe('SUM(B2:B3)');
    expect(total!.result).toBe(165000);
  });

  it('readWorksheet pages with startRow/maxRows and flags truncation', async () => {
    const r = await readWorksheet(xlsx, 'budget.xlsx', { sheet: 'Budget', startRow: 1, maxRows: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.truncated).toBe(true);
    expect(r.endRow).toBe(2);
  });

  it('readWorksheet resolves a sheet by 1-based index string', async () => {
    const r = await readWorksheet(xlsx, 'budget.xlsx', { sheet: '2' });
    expect(r.sheet).toBe('Notes');
  });

  it('readWorksheet names available sheets when the sheet is unknown', async () => {
    await expect(readWorksheet(xlsx, 'budget.xlsx', { sheet: 'Missing' })).rejects.toThrow(
      /Available sheets: Budget, Notes/,
    );
  });

  it('workbookToText renders every sheet as labelled TSV blocks', async () => {
    const text = await workbookToText(xlsx, 'budget.xlsx');
    expect(text).toContain('## Sheet: Budget (4 rows × 2 columns)');
    expect(text).toContain('CRO fees\t125000');
    // Formula cells render their cached result.
    expect(text).toContain('Total\t165000');
    expect(text).toContain('## Sheet: Notes');
  });

  it('applyWorkbookEdits sets values and formulas without touching the source buffer', async () => {
    const before = Buffer.from(xlsx);
    const result = await applyWorkbookEdits(xlsx, 'budget.xlsx', [
      { sheet: 'Budget', cell: 'B2', value: 130000 },
      { sheet: 'Budget', cell: 'C1', value: 'Notes' },
      { sheet: 'Budget', cell: 'B5', formula: 'B4*1.1' },
    ]);
    expect(xlsx.equals(before)).toBe(true);
    expect(result.applied).toEqual([
      { sheet: 'Budget', cell: 'B2', kind: 'value' },
      { sheet: 'Budget', cell: 'C1', kind: 'value' },
      { sheet: 'Budget', cell: 'B5', kind: 'formula' },
    ]);

    const reread = await readWorksheet(result.buffer, 'edited.xlsx', { sheet: 'Budget' });
    expect(reread.rows[1].values[1]).toBe(130000);
    const f = reread.formulas.find((x) => x.address === 'B5');
    expect(f?.formula).toBe('B4*1.1');
  });

  it('applyWorkbookEdits can create missing sheets when asked', async () => {
    const result = await applyWorkbookEdits(
      xlsx,
      'budget.xlsx',
      [{ sheet: 'Scenarios', cell: 'A1', value: 'base case' }],
      { createMissingSheets: true },
    );
    expect(result.createdSheets).toEqual(['Scenarios']);
    const reread = await readWorksheet(result.buffer, 'edited.xlsx', { sheet: 'Scenarios' });
    expect(reread.rows[0].values[0]).toBe('base case');
  });

  it('applyWorkbookEdits rejects sheets that do not exist by default', async () => {
    await expect(
      applyWorkbookEdits(xlsx, 'budget.xlsx', [{ sheet: 'Nope', cell: 'A1', value: 1 }]),
    ).rejects.toThrow(/not found/);
  });

  it('applyWorkbookEdits rejects malformed cell addresses', async () => {
    await expect(
      applyWorkbookEdits(xlsx, 'budget.xlsx', [{ sheet: 'Budget', cell: 'banana', value: 1 }]),
    ).rejects.toThrow(/invalid cell address/);
  });

  it('reads CSV input through the same surface', async () => {
    const csv = Buffer.from('drug,dose_mg\nsemaglutide,2.4\ntirzepatide,15\n', 'utf8');
    const inv = await inspectWorkbook(csv, 'doses.csv', 'text/csv');
    expect(inv.format).toBe('csv');
    expect(inv.sheetCount).toBe(1);
    const r = await readWorksheet(csv, 'doses.csv');
    expect(r.rows[0].values).toEqual(['drug', 'dose_mg']);
    expect(r.rows[1].values).toEqual(['semaglutide', 2.4]);
  });

  it('cellValueToDisplay handles rich text, formulas, hyperlinks and errors', () => {
    expect(cellValueToDisplay(null)).toBeNull();
    expect(cellValueToDisplay('x')).toBe('x');
    expect(cellValueToDisplay(3)).toBe(3);
    expect(cellValueToDisplay({ richText: [{ text: 'a' }, { text: 'b' }] } as never)).toBe('ab');
    expect(cellValueToDisplay({ formula: 'A1+A2', result: 7 } as never)).toBe(7);
    expect(
      cellValueToDisplay({ hyperlink: 'https://fda.gov', text: 'FDA' } as never),
    ).toBe('FDA');
    expect(cellValueToDisplay({ error: '#DIV/0!' } as never)).toBe('#DIV/0!');
  });
});

/* ── The whole sheet, or say it is not the whole sheet ─────────────────────────
   workbookToText is the text the extraction pipeline stores for an .xlsx: the
   Vault's extracted_text, the passage index built from it, and the text whose
   every character AnA must be served before the catalog records the document
   as 'cataloged' — read in full. It rendered at most 300 rows per sheet, so a
   1,000-lot listing was cataloged, indexed and searched as its first 299 lots.
   And it bounded its loops by exceljs's actualRowCount / actualColumnCount,
   which COUNT the rows and columns holding values — they are not positions —
   so one blank spacer row cost the sheet its last row, and one blank column
   its last column, with nothing to say so. readWorksheet (read_spreadsheet)
   shared the bound, and reported truncated: false with the tail unreachable. */
describe('a spreadsheet is read to its last value', () => {
  let long: Buffer;
  let gapped: Buffer;

  beforeAll(async () => {
    long = await buildLongXlsx();
    gapped = await buildGappedXlsx();
  });

  it('workbookToText renders every row of a long sheet', async () => {
    const text = await workbookToText(long, 'lots.xlsx');
    expect(text).toContain('L0300');
    expect(text).toContain('L1000');
    expect(text).not.toMatch(/more rows not shown/);
  });

  it('workbookToText keeps the row after a blank row and the column after a blank column', async () => {
    const text = await workbookToText(gapped, 'stability.xlsx');
    expect(text).toContain('Impurity B %');
    expect(text).toContain('T12');
    expect(text).toContain('0.31');
  });

  it('the extraction pipeline stores the whole workbook', async () => {
    const { extractDocumentText } = await import('../../ocr/extractDocumentText');
    const extracted = await extractDocumentText(
      long,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'lots.xlsx',
    );
    expect(extracted.method).toBe('xlsx');
    expect(extracted.text).toContain('L1000');
  });

  it('readWorksheet reaches the last row of a sheet with a blank row in it', async () => {
    const r = await readWorksheet(gapped, 'stability.xlsx', { maxRows: 100 });
    expect(r.rows.map((row) => row.row)).toEqual([1, 2, 4]);
    expect(r.rows[2].values).toEqual(['T12', null, 0.31]);
    expect(r.truncated).toBe(false);
  });

  it('readWorksheet reports a page that stops before the last row as truncated', async () => {
    const r = await readWorksheet(gapped, 'stability.xlsx', { startRow: 1, maxRows: 3 });
    expect(r.endRow).toBe(3);
    expect(r.truncated).toBe(true);
    expect(r.lastRow).toBe(4);
  });
});

