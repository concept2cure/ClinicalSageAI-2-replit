/**
 * Spreadsheet service — AnA's structured access to Excel (.xlsx) and CSV data.
 *
 * Activates the already-declared `exceljs` dependency (previously installed but
 * never wired into the intake path) so spreadsheets stop being opaque uploads:
 *   • workbookToText  → text rendering for the extraction pipeline / memory atoms
 *   • inspectWorkbook → sheet inventory (dimensions, formula counts) for triage
 *   • readWorksheet   → cell-level rows with formulas preserved, with paging
 *   • applyWorkbookEdits → cell value/formula edits, written to a NEW buffer
 *     (callers persist it as a new upload — originals are never mutated)
 *
 * exceljs is loaded lazily so servers that never touch a spreadsheet don't pay
 * for it at boot.
 */

import { Readable } from 'node:stream';
import type ExcelJSNS from 'exceljs';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('spreadsheet-service');

type Workbook = ExcelJSNS.Workbook;
type Worksheet = ExcelJSNS.Worksheet;
type CellValue = ExcelJSNS.CellValue;

export interface SheetInfo {
  name: string;
  /** 1-based position in the workbook. */
  index: number;
  rowCount: number;
  columnCount: number;
  hidden: boolean;
  formulaCells: number;
}

export interface WorkbookInventory {
  format: 'xlsx' | 'csv';
  sheetCount: number;
  sheets: SheetInfo[];
}

export interface WorksheetRow {
  /** 1-based row number in the sheet. */
  row: number;
  /** Display values, first array entry = column A. */
  values: (string | number | boolean | null)[];
}

export interface WorksheetFormula {
  address: string;
  formula: string;
  result: string | number | boolean | null;
}

export interface WorksheetReadResult {
  sheet: string;
  totalRows: number;
  totalColumns: number;
  startRow: number;
  endRow: number;
  truncated: boolean;
  rows: WorksheetRow[];
  formulas: WorksheetFormula[];
}

export interface SpreadsheetEdit {
  /** Sheet name. Defaults to the first sheet when omitted. */
  sheet?: string;
  /** A1-style cell address, e.g. "B7". */
  cell: string;
  /** New literal value. `null` clears the cell. Ignored when `formula` is set. */
  value?: string | number | boolean | null;
  /** Excel formula without the leading "=", e.g. "SUM(B2:B6)". */
  formula?: string;
}

export interface AppliedEditsResult {
  buffer: Buffer;
  applied: { sheet: string; cell: string; kind: 'value' | 'formula' | 'clear' }[];
  createdSheets: string[];
}

async function getExcelJS(): Promise<typeof ExcelJSNS> {
  const mod = (await import('exceljs')) as typeof ExcelJSNS & { default?: typeof ExcelJSNS };
  return mod.default ?? mod;
}

function isCsv(filename: string, mime?: string): boolean {
  return /\.csv$/i.test(filename) || (mime || '').toLowerCase() === 'text/csv';
}

export async function loadWorkbook(
  buffer: Buffer,
  filename = '',
  mime?: string,
): Promise<{ workbook: Workbook; format: 'xlsx' | 'csv' }> {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();
  if (isCsv(filename, mime)) {
    await workbook.csv.read(Readable.from(buffer));
    return { workbook, format: 'csv' };
  }
  await workbook.xlsx.load(buffer as unknown as ExcelJSNS.Buffer);
  return { workbook, format: 'xlsx' };
}

/** Render a single cell value for display — formulas yield their cached result. */
export function cellValueToDisplay(value: CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as unknown as Record<string, unknown>;
    if ('richText' in v && Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    }
    if ('formula' in v || 'sharedFormula' in v) {
      const result = (v as { result?: CellValue }).result;
      return result === undefined ? null : cellValueToDisplay(result);
    }
    if ('hyperlink' in v) {
      const text = (v as { text?: CellValue }).text;
      return text !== undefined ? cellValueToDisplay(text) : String(v.hyperlink);
    }
    if ('error' in v) return String(v.error);
    if ('text' in v) return cellValueToDisplay((v as { text: CellValue }).text);
  }
  return String(value);
}

function countFormulaCells(ws: Worksheet): number {
  let count = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.formula) count += 1;
    });
  });
  return count;
}

export async function inspectWorkbook(
  buffer: Buffer,
  filename = '',
  mime?: string,
): Promise<WorkbookInventory> {
  const { workbook, format } = await loadWorkbook(buffer, filename, mime);
  const sheets: SheetInfo[] = [];
  workbook.eachSheet((ws, id) => {
    sheets.push({
      name: ws.name,
      index: id,
      rowCount: ws.actualRowCount,
      columnCount: ws.actualColumnCount,
      hidden: ws.state !== 'visible',
      formulaCells: countFormulaCells(ws),
    });
  });
  return { format, sheetCount: sheets.length, sheets };
}

function resolveSheet(workbook: Workbook, sheet?: string): Worksheet {
  if (sheet === undefined || sheet === null || sheet === '') {
    const first = workbook.worksheets[0];
    if (!first) throw new Error('workbook contains no worksheets');
    return first;
  }
  const byName = workbook.getWorksheet(sheet);
  if (byName) return byName;
  const asIndex = Number(sheet);
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= workbook.worksheets.length) {
    return workbook.worksheets[asIndex - 1];
  }
  const names = workbook.worksheets.map((w) => w.name).join(', ');
  throw new Error(`sheet "${sheet}" not found. Available sheets: ${names}`);
}

export interface ReadWorksheetOptions {
  sheet?: string;
  /** 1-based inclusive. Defaults to 1. */
  startRow?: number;
  /** 1-based inclusive. Defaults to startRow + maxRows - 1. */
  endRow?: number;
  /** Row cap per call (default 100, hard max 1000). */
  maxRows?: number;
  includeFormulas?: boolean;
}

export async function readWorksheet(
  buffer: Buffer,
  filename = '',
  options: ReadWorksheetOptions = {},
  mime?: string,
): Promise<WorksheetReadResult> {
  const { workbook } = await loadWorkbook(buffer, filename, mime);
  const ws = resolveSheet(workbook, options.sheet);

  const totalRows = ws.actualRowCount;
  const totalColumns = ws.actualColumnCount;
  const maxRows = Math.min(Math.max(1, options.maxRows ?? 100), 1000);
  const startRow = Math.max(1, options.startRow ?? 1);
  const requestedEnd = options.endRow ?? startRow + maxRows - 1;
  const endRow = Math.min(requestedEnd, startRow + maxRows - 1, Math.max(totalRows, startRow));

  const rows: WorksheetRow[] = [];
  const formulas: WorksheetFormula[] = [];
  for (let r = startRow; r <= endRow && r <= totalRows; r++) {
    const row = ws.getRow(r);
    const values: (string | number | boolean | null)[] = [];
    for (let c = 1; c <= totalColumns; c++) {
      const cell = row.getCell(c);
      values.push(cellValueToDisplay(cell.value));
      if (options.includeFormulas !== false && cell.formula) {
        formulas.push({
          address: cell.address,
          formula: cell.formula,
          result: cellValueToDisplay(cell.value),
        });
      }
    }
    // Skip fully empty rows but keep numbering intact for the rest.
    if (values.some((v) => v !== null && v !== '')) {
      rows.push({ row: r, values });
    }
  }

  return {
    sheet: ws.name,
    totalRows,
    totalColumns,
    startRow,
    endRow: Math.min(endRow, totalRows),
    truncated: endRow < totalRows,
    rows,
    formulas,
  };
}

export interface WorkbookToTextOptions {
  /** Per-sheet row cap in the text rendering (default 300). */
  maxRowsPerSheet?: number;
}

/**
 * Render a whole workbook as readable text (one TSV block per sheet) — the
 * representation used by the upload extraction pipeline and memory embedding.
 */
export async function workbookToText(
  buffer: Buffer,
  filename = '',
  options: WorkbookToTextOptions = {},
  mime?: string,
): Promise<string> {
  const { workbook } = await loadWorkbook(buffer, filename, mime);
  const maxRows = Math.min(Math.max(1, options.maxRowsPerSheet ?? 300), 2000);
  const parts: string[] = [];

  workbook.eachSheet((ws) => {
    const rows = ws.actualRowCount;
    const cols = ws.actualColumnCount;
    const lines: string[] = [`## Sheet: ${ws.name} (${rows} rows × ${cols} columns)`];
    const limit = Math.min(rows, maxRows);
    for (let r = 1; r <= limit; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= cols; c++) {
        const v = cellValueToDisplay(row.getCell(c).value);
        cells.push(v === null ? '' : String(v));
      }
      // Drop trailing empties so wide-but-sparse sheets stay compact.
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (cells.length) lines.push(cells.join('\t'));
    }
    if (rows > limit) {
      lines.push(`… ${rows - limit} more rows not shown (use read_spreadsheet with start_row to page).`);
    }
    parts.push(lines.join('\n'));
  });

  const text = parts.join('\n\n').trim();
  logger.info('workbook rendered to text', { sheets: workbook.worksheets.length, chars: text.length });
  return text;
}

/**
 * Apply cell edits to a workbook and return the edited bytes as a NEW buffer.
 * CSV inputs are promoted to xlsx on save (formulas/multiple sheets need it).
 */
export async function applyWorkbookEdits(
  buffer: Buffer,
  filename = '',
  edits: SpreadsheetEdit[],
  options: { createMissingSheets?: boolean } = {},
  mime?: string,
): Promise<AppliedEditsResult> {
  if (!edits.length) throw new Error('no edits supplied');
  const { workbook } = await loadWorkbook(buffer, filename, mime);

  const applied: AppliedEditsResult['applied'] = [];
  const createdSheets: string[] = [];
  for (const edit of edits) {
    if (!edit.cell || !/^[A-Za-z]{1,3}\d{1,7}$/.test(edit.cell.trim())) {
      throw new Error(`invalid cell address "${edit.cell}" — use A1-style addresses like B7`);
    }
    let ws: Worksheet;
    try {
      ws = resolveSheet(workbook, edit.sheet);
    } catch (err) {
      if (options.createMissingSheets && edit.sheet) {
        ws = workbook.addWorksheet(edit.sheet);
        createdSheets.push(edit.sheet);
      } else {
        throw err;
      }
    }
    const cell = ws.getCell(edit.cell.trim().toUpperCase());
    if (edit.formula) {
      cell.value = { formula: edit.formula.replace(/^=/, '') } as CellValue;
      applied.push({ sheet: ws.name, cell: cell.address, kind: 'formula' });
    } else if (edit.value === null || edit.value === undefined) {
      cell.value = null;
      applied.push({ sheet: ws.name, cell: cell.address, kind: 'clear' });
    } else {
      cell.value = edit.value;
      applied.push({ sheet: ws.name, cell: cell.address, kind: 'value' });
    }
  }

  const out = await workbook.xlsx.writeBuffer();
  logger.info('workbook edits applied', { edits: applied.length, createdSheets: createdSheets.length });
  return { buffer: Buffer.from(out as ArrayBuffer), applied, createdSheets };
}
