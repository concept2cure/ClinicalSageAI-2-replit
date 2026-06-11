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
