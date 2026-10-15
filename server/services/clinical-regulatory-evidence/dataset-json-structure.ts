/**
 * The structure of a CDISC Dataset-JSON file (D2, Data Room catalog; founder
 * decision 2026-10-15, "Do it all", on the design doc's §6). Dataset-JSON is
 * CDISC's successor exchange format to SAS transport, which FDA is piloting
 * for submissions.
 *
 * Read: the dataset's name and label, each column's name, label and declared
 * data type, and the record count. Never a row's values: like the .xpt and
 * CSV profiles, the catalog keeps structure only.
 *
 * Shapes:
 *   - v1.1 JSON: `datasetJSONVersion`, `name`, `label`, `columns[]`,
 *     `records` (the declared count) and `rows[]`;
 *   - v1.1 NDJSON: the first line is that metadata object without rows, and
 *     each further line is one row;
 *   - v1.0: `clinicalData` or `referenceData` → `itemGroupData` → one
 *     object per dataset with `name`, `label`, `records`, `items[]`.
 * A JSON that is none of these is declined, not guessed at: most .json
 * uploads are not datasets.
 */

export type DatasetJsonDataType = 'string' | 'integer' | 'decimal' | 'float' | 'double' | 'boolean' | 'datetime' | 'date' | 'time' | 'URI' | string;

export interface DatasetJsonColumn {
  name: string;
  label: string;
  dataType: DatasetJsonDataType;
}

export interface DatasetJsonTable {
  name: string;
  label: string;
  columns: DatasetJsonColumn[];
  /** The record count: the declared `records`, or the rows counted when none is declared. */
  rowCount: number;
}

export type DatasetJsonReadResult =
  | { ok: true; version: string; tables: DatasetJsonTable[] }
  | { ok: false; reason: 'NOT_DATASET_JSON' | 'MALFORMED' };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

function columnsOf(list: unknown): DatasetJsonColumn[] | null {
  if (!Array.isArray(list)) return null;
  const cols = list.filter(isObj).map((c) => ({ name: str(c.name), label: str(c.label), dataType: str(c.dataType) || str(c.type) }));
  return cols.length === list.length && cols.every((c) => c.name) ? cols : null;
}

/** v1.1: the metadata object, with its rows when the file carries them. */
function readV11(meta: Obj, rowsCounted: number | null): DatasetJsonTable | null {
  const columns = columnsOf(meta.columns);
  if (!columns) return null;
  const declared = count(meta.records);
  const rows = Array.isArray(meta.rows) ? meta.rows.length : rowsCounted;
  return { name: str(meta.name) || str(meta.itemGroupOID), label: str(meta.label), columns, rowCount: declared ?? rows ?? 0 };
}

/** v1.0: every item group under clinicalData / referenceData. */
function readV10(doc: Obj): DatasetJsonTable[] | null {
  const groups = [doc.clinicalData, doc.referenceData]
    .filter(isObj)
    .flatMap((d) => (isObj(d.itemGroupData) ? Object.entries(d.itemGroupData) : []));
  const tables = groups.map(([oid, g]) => {
    if (!isObj(g)) return null;
    const columns = columnsOf(g.items);
    if (!columns) return null;
    const rows = Array.isArray(g.itemData) ? g.itemData.length : 0;
    return { name: str(g.name) || oid, label: str(g.label), columns, rowCount: count(g.records) ?? rows };
  });
  return tables.length && tables.every(Boolean) ? (tables as DatasetJsonTable[]) : null;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Lines with anything but whitespace in bytes [from, end), counted without building them. */
function countRowLines(bytes: Buffer, from: number): number {
  let rows = 0;
  let content = false;
  for (let i = from; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x0a) { if (content) rows++; content = false; } else if (c !== 0x20 && c !== 0x09 && c !== 0x0d) content = true;
  }
  return content ? rows + 1 : rows;
}

/**
 * NDJSON (v1.1 streaming form): metadata on the first line, one row per further
 * line. Only the metadata line is parsed; the rows are counted by scanning the
 * bytes. Splitting the text built one string per line, about 2 GB for 50 MB of
 * blank lines (security review 2026-10-15, F1).
 */
function readNdjson(bytes: Buffer): DatasetJsonReadResult {
  let start = 0;
  while (start < bytes.length && (bytes[start] === 0x0a || bytes[start] === 0x0d || bytes[start] === 0x20 || bytes[start] === 0x09)) start++;
  const nl = bytes.indexOf(0x0a, start);
  const end = nl < 0 ? bytes.length : nl;
  if (end - start > META_MAX_BYTES) return { ok: false, reason: 'NOT_DATASET_JSON' };
  const meta = parse(bytes.toString('utf8', start, end));
  if (!isObj(meta) || !('datasetJSONVersion' in meta)) return { ok: false, reason: 'NOT_DATASET_JSON' };
  const table = readV11(meta, nl < 0 ? 0 : countRowLines(bytes, nl + 1));
  return table ? { ok: true, version: str(meta.datasetJSONVersion), tables: [table] } : { ok: false, reason: 'MALFORMED' };
}

/** A metadata line longer than this is not one: column definitions, not rows. */
const META_MAX_BYTES = 4 * 1024 * 1024;
/** How far into a .json the Dataset-JSON keys must appear before the whole file is parsed. */
const SNIFF_BYTES = 64 * 1024;
const DATASET_KEYS = /"(datasetJSONVersion|clinicalData|referenceData)"\s*:/;

/**
 * Whether a .json opens as a Dataset-JSON object. Most .json uploads are not
 * datasets, and parsing every one in full let 50 MB of '[' hold the event loop
 * for seconds (security review 2026-10-15, F1).
 */
function looksLikeDatasetJson(bytes: Buffer): boolean {
  const head = bytes.toString('utf8', 0, Math.min(bytes.length, SNIFF_BYTES)).trimStart().replace(/^\uFEFF/, '');
  return head.startsWith('{') && DATASET_KEYS.test(head);
}

/** Read a Dataset-JSON file's structure. Never throws. */
export function readDatasetJsonStructure(bytes: Buffer, fileName: string): DatasetJsonReadResult {
  if (/\.ndjson$/i.test(fileName)) return readNdjson(bytes);
  if (!looksLikeDatasetJson(bytes)) return { ok: false, reason: 'NOT_DATASET_JSON' };
  const doc = parse(bytes.toString('utf8'));
  if (!isObj(doc)) return { ok: false, reason: 'NOT_DATASET_JSON' };
  const version = str(doc.datasetJSONVersion);
  if (version && 'columns' in doc) {
    const table = readV11(doc, null);
    return table ? { ok: true, version, tables: [table] } : { ok: false, reason: 'MALFORMED' };
  }
  if (isObj(doc.clinicalData) || isObj(doc.referenceData)) {
    const tables = readV10(doc);
    return tables ? { ok: true, version: version || '1.0', tables } : { ok: false, reason: 'MALFORMED' };
  }
  return { ok: false, reason: 'NOT_DATASET_JSON' };
}
