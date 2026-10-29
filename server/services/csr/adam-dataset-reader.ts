/**
 * Read one CDISC ADaM dataset's rows for CSR tabulation (CSR slice 6,
 * 2026-10-29). The Data Room catalog already recognises both formats and reads
 * their structure (clinical-regulatory-evidence/dataset-json-structure.ts and
 * xpt-structure.ts); those readers keep structure only, by design. This module
 * reuses them as the format gate and decodes the observations, which only a
 * governed CSR source load may do.
 *
 *   - Dataset-JSON v1.1 (JSON, or NDJSON: metadata line, then one row per line),
 *     and v1.0 (`clinicalData.itemGroupData`) with exactly one dataset;
 *   - SAS transport v5 (.xpt), one member: character values as latin-1 text,
 *     numerics from IBM System/370 double precision, SAS missing values as null.
 *
 * Never throws: a malformed file is a typed reason. Variable names are
 * upper-cased, as ADaM names them. No value is defaulted or guessed.
 */
import { readDatasetJsonStructure } from '../clinical-regulatory-evidence/dataset-json-structure.js';
import { isXport, readXptStructure, type XptVariable } from '../clinical-regulatory-evidence/xpt-structure.js';

export type AdamValue = string | number | boolean | null;
export type AdamRow = Record<string, AdamValue>;
export interface AdamDataset { name: string; format: 'dataset-json' | 'xpt'; columns: string[]; rows: AdamRow[] }
export type AdamReadFailure = 'NOT_A_DATASET' | 'MALFORMED' | 'ONE_DATASET_PER_FILE' | 'ROW_SHAPE_INVALID' | 'XPORT_V8_NOT_SUPPORTED';
export type AdamReadResult = { ok: true; dataset: AdamDataset } | { ok: false; reason: AdamReadFailure };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const cell = (v: unknown): AdamValue | undefined =>
  v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) ? v : undefined;

function toRows(columns: string[], raw: unknown[]): AdamRow[] | null {
  const rows: AdamRow[] = [];
  for (const values of raw) {
    if (!Array.isArray(values) || values.length !== columns.length) return null;
    const row: AdamRow = {};
    for (let i = 0; i < columns.length; i++) {
      const value = cell(values[i]);
      if (value === undefined) return null;
      row[columns[i]] = value;
    }
    rows.push(row);
  }
  return rows;
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

/** The single dataset's column names and raw rows, in any Dataset-JSON shape. */
function datasetJsonRows(bytes: Buffer, fileName: string): { columns: unknown; rows: unknown } | null {
  if (/\.ndjson$/i.test(fileName)) {
    const lines = bytes.toString('utf8').split('\n').map(l => l.trim()).filter(Boolean);
    const meta = parseJson(lines[0] ?? '');
    return isObj(meta) ? { columns: meta.columns, rows: lines.slice(1).map(parseJson) } : null;
  }
  const doc = parseJson(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (!isObj(doc)) return null;
  if ('columns' in doc) return { columns: doc.columns, rows: doc.rows ?? [] };
  const group = [doc.clinicalData, doc.referenceData].filter(isObj)
    .flatMap(d => (isObj(d.itemGroupData) ? Object.values(d.itemGroupData) : []))[0];
  return isObj(group) ? { columns: group.items, rows: group.itemData ?? [] } : null;
}

function readDatasetJson(bytes: Buffer, fileName: string): AdamReadResult {
  const structure = readDatasetJsonStructure(bytes, fileName);
  if (!structure.ok) return { ok: false, reason: structure.reason === 'MALFORMED' ? 'MALFORMED' : 'NOT_A_DATASET' };
  if (structure.tables.length !== 1) return { ok: false, reason: 'ONE_DATASET_PER_FILE' };
  const table = structure.tables[0];
  const raw = datasetJsonRows(bytes, fileName);
  if (!raw || !Array.isArray(raw.rows)) return { ok: false, reason: 'MALFORMED' };
  const columns = table.columns.map(c => c.name.toUpperCase());
  if (new Set(columns).size !== columns.length) return { ok: false, reason: 'MALFORMED' };
  const rows = toRows(columns, raw.rows);
  if (!rows) return { ok: false, reason: 'ROW_SHAPE_INVALID' };
  return { ok: true, dataset: { name: table.name.toUpperCase(), format: 'dataset-json', columns, rows } };
}

// ── SAS transport v5 observations ───────────────────────────────────────────

const REC = 80;
const OBS = 'HEADER RECORD*******OBS     HEADER RECORD!!!!!!!';

/** A SAS missing value: '.', '._' or '.A'–'.Z' in the first byte, zeros after it. */
function isSasMissing(b: Buffer, at: number, length: number): boolean {
  const first = b[at];
  if (!(first === 0x2e || first === 0x5f || (first >= 0x41 && first <= 0x5a))) return false;
  for (let i = 1; i < length; i++) if (b[at + i] !== 0) return false;
  return true;
}

/**
 * IBM System/370 floating point (sign bit, base-16 excess-64 exponent, 56-bit
 * fraction), truncated to `length` bytes as SAS stores it. The fraction is
 * rounded to a double once, then scaled by an exact power of two.
 */
export function ibmFloatToNumber(b: Buffer, at: number, length: number): number | null {
  if (isSasMissing(b, at, length)) return null;
  const bytes = Buffer.alloc(8);
  b.copy(bytes, 0, at, at + length);
  const fraction = (BigInt(bytes.readUInt32BE(0) & 0x00ffffff) << 32n) | BigInt(bytes.readUInt32BE(4));
  if (fraction === 0n) return 0;
  const exponent = (bytes[0] & 0x7f) - 64;
  const magnitude = Number(fraction) * 2 ** (4 * exponent - 56);
  return bytes[0] & 0x80 ? -magnitude : magnitude;
}

function decodeVariable(b: Buffer, at: number, v: XptVariable): AdamValue {
  if (v.type === 'numeric') return ibmFloatToNumber(b, at, v.length);
  const text = b.toString('latin1', at, at + v.length).replace(/\s+$/, '');
  return text;
}

function readXpt(bytes: Buffer): AdamReadResult {
  const structure = readXptStructure(bytes);
  if (!structure.ok) return { ok: false, reason: structure.reason === 'XPORT_V8_NOT_SUPPORTED' ? 'XPORT_V8_NOT_SUPPORTED' : 'MALFORMED' };
  if (structure.members.length !== 1) return { ok: false, reason: 'ONE_DATASET_PER_FILE' };
  const member = structure.members[0];
  let obsAt = -1;
  for (let at = 0; at + REC <= bytes.length; at += REC) {
    if (bytes.toString('latin1', at, at + OBS.length) === OBS) { obsAt = at; break; }
  }
  const obsLength = member.variables.reduce((n, v) => n + v.length, 0);
  const from = obsAt + REC;
  if (obsAt < 0 || from + member.rowCount * obsLength > bytes.length) return { ok: false, reason: 'MALFORMED' };
  const columns = member.variables.map(v => v.name.toUpperCase());
  const rows: AdamRow[] = [];
  for (let r = 0; r < member.rowCount; r++) {
    const row: AdamRow = {};
    let at = from + r * obsLength;
    for (const v of member.variables) { row[v.name.toUpperCase()] = decodeVariable(bytes, at, v); at += v.length; }
    rows.push(row);
  }
  return { ok: true, dataset: { name: member.name.toUpperCase(), format: 'xpt', columns, rows } };
}

/** Read one ADaM dataset file by its bytes and name. Never throws. */
export function readAdamDataset(bytes: Buffer, fileName: string): AdamReadResult {
  try {
    if (/\.xpt$/i.test(fileName) || isXport(bytes)) return readXpt(bytes);
    if (/\.(nd)?json$/i.test(fileName)) return readDatasetJson(bytes, fileName);
    return { ok: false, reason: 'NOT_A_DATASET' };
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
}
