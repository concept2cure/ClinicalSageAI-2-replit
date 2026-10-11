/**
 * The structure of a tabular capture or a define.xml (D2, Data Room catalog S3;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * A CSV, TSV or workbook entered the Data Room as flat text, and a define.xml
 * as raw XML. So nothing could say "this is an SDTM AE listing with 23
 * variables and 340 records" or "this define.xml describes 14 datasets", which
 * is the first thing a reviewer, a statistician or AnA needs to know.
 *
 * The profile is STRUCTURE ONLY: table names, column names, inferred column
 * types, row counts, and the CDISC standard and domain the column signatures
 * show. No cell value is kept: a listing holds subject-level data, and a
 * catalog is not where it should be copied. Detection is by rule, and each
 * table names the rule that classified it.
 *
 * Not a conformance check (Pinnacle 21 and the FDA validator rules are not
 * reproduced here), and not a reader for SAS transport (.xpt), which the
 * platform does not admit (founder decision pending, see the design doc §6).
 */
import { cellValueToDisplay, loadWorkbook } from '../documentIntelligence/spreadsheetService.js';

export type ColumnType = 'number' | 'date' | 'text' | 'empty';

export interface ProfiledTable {
  name: string;
  columns: Array<{ name: string; type: ColumnType }>;
  /** Data rows (the header row is not counted). */
  rowCount: number;
  /** Columns beyond MAX_COLUMNS are counted, not listed. */
  columnCount: number;
  cdisc: { standard: 'SDTM' | 'ADaM' | null; domain: string | null; rule: string | null };
}

export interface DatasetProfile {
  format: 'csv' | 'tsv' | 'xlsx' | 'define-xml';
  tables: ProfiledTable[];
  /** Tables beyond MAX_TABLES are counted, not profiled. */
  tableCount: number;
  profiledBy: 'dataset-profile v1';
}

const MAX_TABLES = 25;
const MAX_COLUMNS = 300;
/** Rows read to infer a column's type; the row count covers every row. */
const TYPE_SAMPLE = 500;

/** Whether a capture is one this profiler reads. */
export function profileFormat(fileName: string, mimeType: string): DatasetProfile['format'] | null {
  const n = fileName.toLowerCase();
  const m = mimeType.toLowerCase();
  if (/define[^/]*\.xml$/.test(n)) return 'define-xml';
  if (n.endsWith('.tsv') || m === 'text/tab-separated-values') return 'tsv';
  if (n.endsWith('.csv') || m === 'text/csv') return 'csv';
  if (n.endsWith('.xlsx') || m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  return null;
}

const DATE_VALUE = /^(\d{4}-\d{2}-\d{2}(T[\d:.]+)?|\d{1,2}[A-Z]{3}\d{4})$/i;

function typeOf(values: Array<string | number | boolean | null>): ColumnType {
  const seen = values.filter(v => v !== null && String(v).trim() !== '');
  if (seen.length === 0) return 'empty';
  if (seen.every(v => typeof v === 'number' || /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(String(v).trim()))) return 'number';
  if (seen.every(v => DATE_VALUE.test(String(v).trim()))) return 'date';
  return 'text';
}

/**
 * The CDISC standard and domain a table's columns show. SDTM (or SEND, whose
 * tabulation domains share the shape) carries STUDYID, DOMAIN and USUBJID;
 * the domain is the prefix its own variables share (AETERM, AESTDTC → AE).
 * ADaM is recognised by its required variables: ADSL by USUBJID with
 * treatment and population flags, BDS by PARAMCD with AVAL or AVALC.
 */
export function detectCdisc(names: string[]): ProfiledTable['cdisc'] {
  const cols = new Set(names.map(n => n.trim().toUpperCase()));
  const has = (...c: string[]) => c.every(x => cols.has(x));
  if (has('USUBJID', 'PARAMCD') && (cols.has('AVAL') || cols.has('AVALC'))) {
    return { standard: 'ADaM', domain: 'BDS', rule: 'USUBJID + PARAMCD + AVAL/AVALC' };
  }
  if (has('USUBJID') && [...cols].some(c => /^TRT\d{2}[PA]$/.test(c)) && [...cols].some(c => /FL$/.test(c))) {
    return { standard: 'ADaM', domain: 'ADSL', rule: 'USUBJID + TRTxxP/A + population flags' };
  }
  if (has('STUDYID', 'DOMAIN', 'USUBJID')) {
    const prefixes = new Map<string, number>();
    for (const c of cols) {
      if (c.length > 4 && /^[A-Z]{2}[A-Z0-9]+$/.test(c) && !['STUDYID', 'DOMAIN', 'USUBJID'].includes(c)) {
        prefixes.set(c.slice(0, 2), (prefixes.get(c.slice(0, 2)) ?? 0) + 1);
      }
    }
    const top = [...prefixes.entries()].sort((a, b) => b[1] - a[1])[0];
    return { standard: 'SDTM', domain: top && top[1] >= 2 ? top[0] : null, rule: 'STUDYID + DOMAIN + USUBJID; domain from the shared variable prefix' };
  }
  return { standard: null, domain: null, rule: null };
}

/** One table from its header and its rows (rows as display values). */
function profileTable(name: string, header: string[], rows: Array<Array<string | number | boolean | null>>, rowCount: number): ProfiledTable {
  const listed = header.slice(0, MAX_COLUMNS);
  const sample = rows.slice(0, TYPE_SAMPLE);
  return {
    name,
    columns: listed.map((col, i) => ({ name: col, type: typeOf(sample.map(r => r[i] ?? null)) })),
    rowCount,
    columnCount: header.length,
    cdisc: detectCdisc(header),
  };
}

function profileTsv(bytes: Buffer, fileName: string): DatasetProfile {
  const lines = bytes.toString('utf8').split(/\r?\n/).filter(l => l.trim() !== '');
  const header = (lines[0] ?? '').split('\t').map(h => h.trim());
  const rows = lines.slice(1, 1 + TYPE_SAMPLE).map(l => l.split('\t'));
  return { format: 'tsv', tables: [profileTable(fileName, header, rows, Math.max(0, lines.length - 1))], tableCount: 1, profiledBy: 'dataset-profile v1' };
}

async function profileWorkbook(bytes: Buffer, fileName: string, mimeType: string): Promise<DatasetProfile> {
  const { workbook, format } = await loadWorkbook(bytes, fileName, mimeType);
  const tables: ProfiledTable[] = [];
  let tableCount = 0;
  workbook.eachSheet(ws => {
    tableCount += 1;
    if (tables.length >= MAX_TABLES) return;
    const header: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { header[col - 1] = String(cellValueToDisplay(cell.value) ?? '').trim(); });
    const rows: Array<Array<string | number | boolean | null>> = [];
    for (let r = 2; r <= Math.min(ws.actualRowCount, TYPE_SAMPLE + 1); r += 1) {
      const vals: Array<string | number | boolean | null> = [];
      ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = cellValueToDisplay(cell.value); });
      rows.push(vals);
    }
    tables.push(profileTable(format === 'csv' ? fileName : ws.name, header, rows, Math.max(0, ws.actualRowCount - 1)));
  });
  return { format, tables, tableCount, profiledBy: 'dataset-profile v1' };
}

type DefineElement = 'ItemGroupDef' | 'ItemRef';

/** Attribute values and body for the two define.xml element names this profiler reads. */
function elements(xml: string, tag: DefineElement): Array<{ attrs: Record<string, string>; body: string }> {
  const out: Array<{ attrs: Record<string, string>; body: string }> = [];
  const re = tag === 'ItemGroupDef'
    ? /<ItemGroupDef\b([^>]*?)(\/>|>([\s\S]*?)<\/ItemGroupDef>)/g
    : /<ItemRef\b([^>]*?)(\/>|>([\s\S]*?)<\/ItemRef>)/g;
  for (const m of xml.matchAll(re)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w:]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    out.push({ attrs, body: m[3] ?? '' });
  }
  return out;
}

/** The datasets a define.xml describes: name, domain, purpose and how many variables. */
function profileDefineXml(bytes: Buffer): DatasetProfile | null {
  const xml = bytes.toString('utf8');
  if (!/<ODM\b/.test(xml) || !/ItemGroupDef\b/.test(xml)) return null;
  const groups = elements(xml, 'ItemGroupDef');
  const tables = groups.slice(0, MAX_TABLES).map(g => {
    const refs = elements(g.body, 'ItemRef').length;
    const purpose = g.attrs.Purpose ?? '';
    const standard: ProfiledTable['cdisc']['standard'] = /analysis/i.test(purpose) ? 'ADaM' : /tabulation/i.test(purpose) ? 'SDTM' : null;
    return {
      name: g.attrs.Name ?? g.attrs.SASDatasetName ?? 'unnamed',
      columns: [],
      rowCount: 0,
      columnCount: refs,
      cdisc: { standard, domain: g.attrs.Domain ?? g.attrs.Name ?? null, rule: 'define.xml ItemGroupDef Purpose and Domain' },
    };
  });
  return { format: 'define-xml', tables, tableCount: groups.length, profiledBy: 'dataset-profile v1' };
}

/** The profile of a capture this profiler reads, or null. Never throws: a profile is derived data. */
export async function profileDataset(bytes: Buffer, fileName: string, mimeType: string): Promise<DatasetProfile | null> {
  const format = profileFormat(fileName, mimeType);
  if (!format) return null;
  try {
    if (format === 'define-xml') return profileDefineXml(bytes);
    if (format === 'tsv') return profileTsv(bytes, fileName);
    return await profileWorkbook(bytes, fileName, mimeType);
  } catch {
    return null;
  }
}
