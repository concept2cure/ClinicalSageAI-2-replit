/**
 * Audit & compliance reports — what a run's `export` says, read strictly.
 *
 * The run's `data` and `manifest` are the server's sealed statement. This module
 * turns them into what the screen shows and nothing more: sections, the chain
 * statement, the seal's facts. It is pure, so every rule below is a function of
 * a body and is tested without a DOM.
 *
 * Strictness is the point. A section whose rows are missing, or whose row count
 * disagrees with its rows, is UNREADABLE — never "no records in this period",
 * which would state an absence nobody observed. A chain statement says only
 * what was checked: the integrity attestation's checks, or that this report
 * does not check the chain at all.
 */
import { redactInternals } from '@/lib/queryClient';

/* ── Small guards, shared with the catalog model ─────────────────────────── */

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
export const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => Boolean(str(s))) : []);
export const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => Boolean(str(s)));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const SCREEN_ROW_LIMIT = 200;

/* ── Store names are not copy ────────────────────────────────────────────── */

const STORE_WORDS: Record<string, string> = { audit_logs: 'Audit ledger', audit_events: 'Event chain' };

/** The two audit stores in words, wherever their table names appear in text. */
export function storeWords(text: string): string {
  if (STORE_WORDS[text]) return STORE_WORDS[text];
  const out = text.replace(/\baudit_logs\b/g, 'audit ledger').replace(/\baudit_events\b/g, 'event chain');
  return out !== text && /^(audit ledger|event chain)/.test(out) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

/** A reason the server gave, only if it is copy once the store names are words. */
export const reasonText = (v: unknown): string | null =>
  typeof v === 'string' ? redactInternals(storeWords(v), '') || null : null;

/* ── Time ────────────────────────────────────────────────────────────────── */

const ISO_INSTANT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/** An ISO instant as "YYYY-MM-DD HH:MM:SS UTC"; null for anything that is not one. */
export function utcInstant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = ISO_INSTANT.exec(value);
  if (!m) return null;
  if (m[3] === 'Z' || /^[+-]00:?00$/.test(m[3])) return `${m[1]} ${m[2]} UTC`;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

/* ── Sections ────────────────────────────────────────────────────────────── */

/** A run's `export`: the sealed data string, its manifest, and the seal. */
export interface ReportExport {
  data: string;
  manifest: Record<string, unknown>;
  signature: string;
  verification: Record<string, unknown> | null;
}

export interface Column {
  key: string;
  label: string;
}

export interface Section {
  key: string;
  title: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  notes: string[];
  /** False when the rows are missing or their count disagrees with `rowCount`. */
  readable: boolean;
}

export interface Checks {
  total: number;
  intact: number;
  broken: number;
  notVerified: number;
}

/** `data.chain` / `manifest.chainAtGeneration`, as the server states it. */
export interface ChainStatement {
  scope: 'integrity-checks' | 'not-checked' | 'unknown';
  ok: boolean | null;
  rowsChecked: number | null;
  reason: string | null;
  checks: Checks | null;
}

export type ReportData =
  | { kind: 'sections'; sections: Section[]; notRecorded: string[]; chain: ChainStatement; generatedAt: string | null }
  | { kind: 'rows'; rows: Record<string, unknown>[]; readable: boolean };

function toColumns(raw: unknown, rows: Record<string, unknown>[]): Column[] {
  const given = (Array.isArray(raw) ? raw.filter(isRecord) : [])
    .map((c) => ({ key: str(c.key) ?? '', label: str(c.label) ?? str(c.key) ?? '' }))
    .filter((c) => c.key);
  return given.length ? given : columnsFor(rows);
}

function toSection(raw: unknown, i: number): Section {
  const fallback = { key: `section-${i + 1}`, title: `Section ${i + 1}` };
  if (!isRecord(raw)) return { ...fallback, columns: [], rows: [], rowCount: 0, truncated: false, notes: [], readable: false };
  const rowsOk = Array.isArray(raw.rows) && raw.rows.every(isRecord);
  const rows = rowsOk ? (raw.rows as Record<string, unknown>[]) : [];
  const rowCount = typeof raw.rowCount === 'number' && Number.isInteger(raw.rowCount) ? raw.rowCount : null;
  return {
    key: str(raw.key) ?? fallback.key,
    title: str(raw.title) ?? fallback.title,
    columns: toColumns(raw.columns, rows),
    rows,
    rowCount: rowCount ?? rows.length,
    truncated: raw.truncated === true,
    notes: strings(raw.notes),
    readable: rowsOk && rowCount !== null && rowCount === rows.length,
  };
}

function toChecks(raw: unknown): Checks | null {
  if (!isRecord(raw)) return null;
  const [total, intact, broken, notVerified] = [raw.total, raw.intact, raw.broken, raw.notVerified].map(num);
  if (total === null || intact === null || broken === null || notVerified === null) return null;
  return intact + broken + notVerified === total ? { total, intact, broken, notVerified } : null;
}

function toChain(raw: unknown): ChainStatement {
  if (!isRecord(raw)) return { scope: 'unknown', ok: null, rowsChecked: null, reason: null, checks: null };
  const scope = raw.scope === 'integrity-checks' || raw.scope === 'not-checked' ? raw.scope : 'unknown';
  return {
    scope,
    ok: typeof raw.ok === 'boolean' ? raw.ok : null,
    rowsChecked: num(raw.rowsChecked),
    reason: reasonText(raw.reason),
    checks: toChecks(raw.checks),
  };
}

/** `export.data` parsed: the sectioned report, or the audit trail's rows. */
export function parseReportData(data: string): ReportData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return { kind: 'rows', rows: parsed.filter(isRecord), readable: parsed.every(isRecord) };
  if (!isRecord(parsed)) return null;
  if (Array.isArray(parsed.sections)) {
    return {
      kind: 'sections',
      sections: parsed.sections.map(toSection),
      notRecorded: strings(parsed.notRecorded),
      chain: toChain(parsed.chain),
      generatedAt: str(parsed.generatedAt),
    };
  }
  return Array.isArray(parsed.rows)
    ? { kind: 'rows', rows: parsed.rows.filter(isRecord), readable: parsed.rows.every(isRecord) }
    : null;
}

/* ── The chain statement, in words ───────────────────────────────────────── */

export type Tone = 'ok' | 'error' | 'muted' | 'neutral';
export interface StatementLine {
  tone: Tone;
  text: string;
  reason: string | null;
}

const sameSentence = (a: string, b: string) => a.replace(/\.$/, '').trim() === b.replace(/\.$/, '').trim();
const line = (tone: Tone, text: string, reason: string | null): StatementLine => ({
  tone, text, reason: reason && !sameSentence(reason, text) ? reason : null,
});

/** What a sectioned report says about the chain. Only its checks earn "passed". */
export function chainLine(c: ChainStatement): StatementLine {
  if (c.scope === 'not-checked') return line('neutral', 'This report does not verify the audit chain.', null);
  if (c.scope === 'unknown') return line('muted', 'This report does not state whether the audit chain was verified.', c.reason);
  if (c.ok === false) return line('error', 'A break was found at generation', c.reason);
  if (c.ok === true && c.rowsChecked === 0) {
    return line('muted', 'No chained rows were checked, so nothing was verified at generation', c.reason);
  }
  if (c.ok === true && c.checks && c.checks.total > 0 && c.checks.intact === c.checks.total) {
    return line('ok', `All ${c.checks.total} integrity checks passed at generation`, null);
  }
  if (c.ok === null && c.checks) return line('muted', `${c.checks.notVerified} of ${c.checks.total} checks could not verify`, c.reason);
  return line('muted', 'The integrity checks could not be read', c.reason);
}

function storeLine(name: string, raw: unknown, rowsOf: (c: Record<string, unknown>) => number | null): StatementLine {
  if (!isRecord(raw) || typeof raw.status !== 'string') return line('muted', `${name}: not stated in this export`, null);
  const rows = rowsOf(raw);
  const count = rows === null ? '' : `, ${rows} ${rows === 1 ? 'row' : 'rows'} checked`;
  const reason = reasonText(raw.reason);
  if (raw.status === 'broken') return line('error', `${name}: break found${count}`, reason);
  if (raw.status === 'intact' && rows !== 0) return line('ok', `${name}: intact${count}`, reason);
  if (raw.status === 'intact') return line('muted', `${name}: not verified, no rows checked`, reason);
  return line('muted', `${name}: not verified${count}`, reason);
}

/** The signed audit export states one verdict per store; they are never merged. */
export function storeLines(manifest: Record<string, unknown>): StatementLine[] {
  return [
    storeLine('Event chain', manifest.chainIntegrity, (c) => num(c.hashedEntries) ?? num(c.totalEntries)),
    storeLine('Audit ledger', manifest.auditLogsChain, (c) => num(c.rowsChecked)),
  ];
}

/* ── Tables ──────────────────────────────────────────────────────────────── */

/** The audit trail's readable columns, in reading order. The download keeps all of them. */
const AUDIT_TRAIL_COLUMNS: Column[] = [
  { key: 'timestamp', label: 'When' },
  { key: 'event_type', label: 'Event' },
  { key: 'entity_type', label: 'Record type' },
  { key: 'entity_id', label: 'Record' },
  { key: 'user_name', label: 'Who' },
  { key: 'user_role', label: 'Role' },
  { key: 'reason', label: 'Reason' },
  { key: 'source', label: 'Recorded in' },
];
const USER_ID: Column = { key: 'user_id', label: 'User id' };
const blank = (v: unknown) => v === null || v === undefined || v === '';

const humanise = (key: string) => {
  const words = key.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
};

/**
 * Columns for rows that came without a column list. On the audit trail a row
 * whose user name is blank would show no actor at all, so the user id is shown
 * beside the name whenever any row lacks one.
 */
export function columnsFor(rows: Record<string, unknown>[]): Column[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 50)) for (const k of Object.keys(row)) keys.add(k);
  const known = AUDIT_TRAIL_COLUMNS.filter((c) => keys.has(c.key));
  if (known.length < 2) return [...keys].map((key) => ({ key, label: humanise(key) }));
  if (!keys.has(USER_ID.key) || !rows.some((r) => blank(r.user_name))) return known;
  const at = known.findIndex((c) => c.key === 'user_name');
  return at < 0 ? [...known, USER_ID] : [...known.slice(0, at + 1), USER_ID, ...known.slice(at + 1)];
}

/** A column of instants says so in its header. */
export function columnLabel(column: Column, rows: Record<string, unknown>[]): string {
  const timed = /(^|_)at$|^timestamp$/.test(column.key) || rows.some((r) => utcInstant(r[column.key]) !== null);
  return timed && !/UTC/.test(column.label) ? `${column.label} (UTC)` : column.label;
}

const CELL_MAX = 160;

/** A cell's whole value as text — what a shortened cell carries as its title. */
export function cellFull(value: unknown): string {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
}

/** One cell as text. Nothing is rendered as the words "null" or "undefined". */
export function cellText(value: unknown): string {
  if (blank(value)) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const instant = utcInstant(value);
  if (instant) return instant;
  const text = storeWords(cellFull(value));
  return text.length > CELL_MAX ? `${text.slice(0, CELL_MAX)}…` : text;
}

/** The integrity attestation's verdict cells carry their tone; the word is always shown. */
export function verdictTone(key: string, value: unknown): Tone | null {
  // A review record's status (P1-25, P1-43): the word is in the cell; the tone only repeats it.
  if (key === 'review_status') return value === 'Overdue' ? 'error' : value === 'Current' ? 'ok' : 'muted';
  if (key !== 'verdict') return null;
  return value === 'broken' ? 'error' : value === 'not verified' ? 'muted' : value === 'intact' ? 'ok' : null;
}

/* ── The manifest and the seal ───────────────────────────────────────────── */

export interface ManifestFacts {
  generatedAt: string | null;
  generatedBy: string | null;
  generatedByRole: string | null;
  rows: { key: string; rowCount: number; truncated: boolean }[];
  dataHash: string | null;
  signingKeyId: string | null;
  exportId: string | null;
}

/** ISO instant → "2026-10-01 09:00:00 UTC"; anything unparseable is not shown. */
export function utcStamp(value: unknown): string | null {
  const direct = utcInstant(value);
  if (direct) return direct;
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? utcInstant(new Date(ms).toISOString()) : null;
}

/** Report manifests say generatedAt/By; the signed audit export says exportedAt/By. */
export function manifestFacts(manifest: Record<string, unknown>): ManifestFacts {
  const perSection = (Array.isArray(manifest.sections) ? manifest.sections.filter(isRecord) : [])
    .filter((s) => str(s.key) && typeof s.rowCount === 'number')
    .map((s) => ({ key: String(s.key), rowCount: Number(s.rowCount), truncated: s.truncated === true }));
  const whole =
    typeof manifest.rowCount === 'number'
      ? [{ key: 'rows', rowCount: manifest.rowCount, truncated: manifest.truncated === true }]
      : [];
  return {
    generatedAt: utcStamp(manifest.generatedAt ?? manifest.exportedAt),
    generatedBy: str(manifest.generatedBy) ?? str(manifest.exportedBy),
    generatedByRole: str(manifest.generatedByRole) ?? str(manifest.exportedByRole),
    rows: perSection.length ? perSection : whole,
    dataHash: str(manifest.dataHash),
    signingKeyId: str(manifest.signingKeyId),
    exportId: str(manifest.exportId),
  };
}

/** Where a second run's row counts differ from the report on screen. */
export function countDifferences(shown: ReportData, manifest: Record<string, unknown>): string[] {
  const second = manifestFacts(manifest).rows;
  if (shown.kind === 'rows') {
    const whole = second.find((r) => r.key === 'rows');
    return whole && whole.rowCount !== shown.rows.length
      ? [`All rows: ${whole.rowCount} in the CSV, ${shown.rows.length} on screen`]
      : [];
  }
  return second.flatMap((r) => {
    const s = shown.sections.find((x) => x.key === r.key);
    return s && s.readable && s.rowCount !== r.rowCount ? [`${s.title}: ${r.rowCount} in the CSV, ${s.rowCount} on screen`] : [];
  });
}
