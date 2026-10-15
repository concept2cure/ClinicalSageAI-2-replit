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

/** NDJSON (v1.1 streaming form): metadata on the first line, one row per further line. */
function readNdjson(text: string): DatasetJsonReadResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const meta = parse(lines[0] ?? '');
  if (!isObj(meta) || !('datasetJSONVersion' in meta)) return { ok: false, reason: 'NOT_DATASET_JSON' };
  const table = readV11(meta, lines.length - 1);
  return table ? { ok: true, version: str(meta.datasetJSONVersion), tables: [table] } : { ok: false, reason: 'MALFORMED' };
}

/** Read a Dataset-JSON file's structure. Never throws. */
export function readDatasetJsonStructure(bytes: Buffer, fileName: string): DatasetJsonReadResult {
  const text = bytes.toString('utf8');
  if (/\.ndjson$/i.test(fileName)) return readNdjson(text);
  const doc = parse(text);
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
