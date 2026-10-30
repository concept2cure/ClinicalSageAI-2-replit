/**
 * A manifest for the Vault upload list: a spreadsheet that gives each file its
 * fields (gap 7 of docs/design/VEEVA_GAP_2026-10-22.md, "manifest/CSV mapping
 * into Vault").
 *
 * A team moving a library into the Vault has hundreds of files and a
 * spreadsheet that says what each one is. The upload list already carries,
 * per file, every field the ingest accepts (`VaultUploadStaging.tsx`). The
 * manifest fills those rows: download the list as a CSV, fill it in, apply it,
 * check the rows, upload. Nothing is sent by applying a manifest.
 *
 * Fail closed, line by line: a line with any value the Vault does not have
 * (a document type, classification, folder or evidence kind outside its
 * vocabulary) is not applied at all and says why, so no file is uploaded
 * half-described. A blank cell leaves the row's field as it is. A column the
 * manifest does not know refuses the whole manifest: a misspelt "Folder"
 * would otherwise be ignored, and every file would arrive Unfiled.
 *
 * @module client/src/concept2cure/v2/surfaces/vaultUploadManifest
 */
import { parse } from 'csv-parse/browser/esm/sync';
import {
  VAULT_CLASSIFICATIONS, VAULT_CLASSIFICATION_LABELS, VAULT_DOC_KINDS, VAULT_INGEST_DOCUMENT_TYPES, vaultIngestTypeLabel,
  type VaultClassification, type VaultIngestDocumentType,
} from '@shared/constants/domain/vault-taxonomy';
import type { StagedFile } from './VaultUploadStaging';

type Field = 'file' | 'title' | 'documentType' | 'classification' | 'folder' | 'evidenceKind' | 'ctdSection';

/** The manifest's columns, in the order a downloaded manifest writes them, with the headings each accepts. */
const COLUMNS: ReadonlyArray<{ field: Field; heading: string; accepts: string[] }> = [
  { field: 'file', heading: 'File', accepts: ['file', 'path', 'filename', 'filepath'] },
  { field: 'title', heading: 'Title', accepts: ['title'] },
  { field: 'documentType', heading: 'Document type', accepts: ['documenttype', 'type'] },
  { field: 'classification', heading: 'Classification', accepts: ['classification'] },
  { field: 'folder', heading: 'Folder', accepts: ['folder'] },
  { field: 'evidenceKind', heading: 'Evidence kind', accepts: ['evidencekind', 'kind'] },
  { field: 'ctdSection', heading: 'CTD section', accepts: ['ctdsection', 'section'] },
];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface ManifestLine { line: number; values: Partial<Record<Field, string>> }
export type ParsedManifest = { ok: true; lines: ManifestLine[] } | { ok: false; reason: string };

/** A cell as written: one leading apostrophe that guarded a formula character on download is removed. */
function cell(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

/** Read a manifest's text: a header row naming known columns, one of them File, then one line per file. */
export function parseManifest(text: string): ParsedManifest {
  let records: string[][];
  try {
    records = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true }) as string[][];
  } catch (e) {
    return { ok: false, reason: `It could not be read as CSV: ${e instanceof Error ? e.message : String(e)}` };
  }
  const [header, ...body] = records;
  if (!header) return { ok: false, reason: 'It is empty.' };
  const fields: Field[] = [];
  for (const h of header) {
    const col = COLUMNS.find((c) => c.accepts.includes(squash(String(h))));
    if (!col) return { ok: false, reason: `Its column "${String(h).trim()}" is not a column the Vault takes. The columns are ${COLUMNS.map((c) => c.heading).join(', ')}.` };
    if (fields.includes(col.field)) return { ok: false, reason: `It has two ${col.heading} columns.` };
    fields.push(col.field);
  }
  if (!fields.includes('file')) return { ok: false, reason: 'It has no File column, so no line can be matched to a file.' };
  const lines = body.map((r, i) => ({
    line: i + 2,
    values: Object.fromEntries(fields.map((f, c) => [f, cell(r[c])]).filter(([, v]) => v !== '')) as Partial<Record<Field, string>>,
  }));
  return { ok: true, lines: lines.filter((l) => Object.keys(l.values).length > 0) };
}

/** A value matched to a vocabulary by its code or by the name a reader sees, ignoring case. */
function inVocabulary<T extends string>(value: string, entries: ReadonlyArray<{ code: T; names: string[] }>): T | null {
  const v = value.trim().toLowerCase();
  return entries.find((e) => e.code.toLowerCase() === v || e.names.some((n) => n.toLowerCase() === v))?.code ?? null;
}

const TYPES = VAULT_INGEST_DOCUMENT_TYPES.map((code) => ({ code, names: [vaultIngestTypeLabel(code)] }));
const CLASSES = VAULT_CLASSIFICATIONS.map((code) => ({ code, names: [VAULT_CLASSIFICATION_LABELS[code]] }));
const KINDS = VAULT_DOC_KINDS.map((k) => ({ code: k.value, names: [k.one, k.label] }));

export interface ManifestOutcome {
  /** How many lines the CSV holds. */
  lines: number;
  /** The fields each matched row takes, by row key. */
  patches: Map<string, Partial<StagedFile>>;
  /** Lines not applied, and why. */
  refused: Array<{ line: number; file: string; reason: string }>;
  /** Files in the list that no line names; their fields are unchanged. */
  unnamed: string[];
}

/** Which row a line's File names: its path in the list, or its file name when only one row has it. */
function rowFor(rows: StagedFile[], file: string): StagedFile | string {
  const exact = rows.filter((r) => r.path === file);
  if (exact.length === 1) return exact[0];
  const named = rows.filter((r) => r.file.name === file || r.path.split('/').pop() === file);
  if (named.length === 1) return named[0];
  return named.length > 1
    ? `more than one file in the list is named ${file}; give its path as the list shows it`
    : `${file} is not in the list`;
}

/** Why a line's fields, taken together with its row, cannot be applied, or null. */
function wholeLineRefusal(patch: Partial<StagedFile>, row: StagedFile): string | null {
  if ((patch.evidenceKind || patch.ctdSection) && !(patch.folderId ?? row.folderId)) {
    return 'an evidence kind or CTD section is recorded only with a folder, and neither this line nor the row gives one';
  }
  return Object.keys(patch).length === 0 ? 'it gives no field to set' : null;
}

/** One line's fields, or why it cannot be applied. */
function patchOf(
  v: Partial<Record<Field, string>>, row: StagedFile, folders: ReadonlyArray<{ id: string; label: string }>,
): Partial<StagedFile> | string {
  const patch: Partial<StagedFile> = {};
  if (v.title) patch.title = v.title;
  if (v.documentType) {
    const t = inVocabulary<VaultIngestDocumentType>(v.documentType, TYPES);
    if (!t) return `"${v.documentType}" is not a Vault document type`;
    patch.documentType = t;
  }
  if (v.classification) {
    const c = inVocabulary<VaultClassification>(v.classification, CLASSES);
    if (!c) return `"${v.classification}" is not a classification (${VAULT_CLASSIFICATIONS.map((k) => VAULT_CLASSIFICATION_LABELS[k]).join(', ')})`;
    patch.classification = c;
  }
  if (v.folder) {
    const f = folders.find((x) => x.id.toLowerCase() === v.folder!.toLowerCase() || x.label.toLowerCase() === v.folder!.toLowerCase());
    if (!f) return `"${v.folder}" is not a folder in this project's Vault`;
    patch.folderId = f.id;
  }
  if (v.evidenceKind) {
    const k = inVocabulary<string>(v.evidenceKind, KINDS);
    if (!k) return `"${v.evidenceKind}" is not an evidence kind`;
    patch.evidenceKind = k;
  }
  if (v.ctdSection) patch.ctdSection = v.ctdSection;
  return wholeLineRefusal(patch, row) ?? patch;
}

/** What a manifest does to the list: the fields each named row takes, and every line it does not apply. */
export function applyManifest(
  rows: StagedFile[], lines: ManifestLine[], folders: ReadonlyArray<{ id: string; label: string }>,
): ManifestOutcome {
  const patches = new Map<string, Partial<StagedFile>>();
  const refused: ManifestOutcome['refused'] = [];
  const namedBy = new Map<string, number>();
  for (const { line, values } of lines) {
    const file = values.file ?? '';
    if (!file) { refused.push({ line, file: '', reason: 'it names no file' }); continue; }
    const row = rowFor(rows, file);
    if (typeof row === 'string') { refused.push({ line, file, reason: row }); continue; }
    if (row.status?.state === 'stored') { refused.push({ line, file, reason: 'it is already recorded; its fields are changed with Edit details or Move' }); continue; }
    const earlier = namedBy.get(row.key);
    if (earlier !== undefined) { refused.push({ line, file, reason: `line ${earlier} already names this file` }); continue; }
    namedBy.set(row.key, line);
    const patch = patchOf(values, row, folders);
    if (typeof patch === 'string') { refused.push({ line, file, reason: patch }); continue; }
    patches.set(row.key, patch);
  }
  const unnamed = rows.filter((r) => !namedBy.has(r.key) && r.status?.state !== 'stored').map((r) => r.path);
  return { lines: lines.length, patches, refused, unnamed };
}

/** A CSV cell: quoted when it must be, and a leading formula character guarded so a spreadsheet shows it as text. */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** The list as a manifest to fill in: one line per file not yet recorded, with the fields its row has now. */
export function manifestOf(rows: StagedFile[], folders: ReadonlyArray<{ id: string; label: string }>): string {
  const kindName = (v: string) => VAULT_DOC_KINDS.find((k) => k.value === v)?.one ?? v;
  const lines = rows.filter((r) => r.status?.state !== 'stored').map((r) => [
    r.path,
    r.title,
    vaultIngestTypeLabel(r.documentType),
    r.classification ? VAULT_CLASSIFICATION_LABELS[r.classification] : '',
    folders.find((f) => f.id === r.folderId)?.label ?? '',
    r.evidenceKind ? kindName(r.evidenceKind) : '',
    r.ctdSection,
  ]);
  // The byte-order mark makes a spreadsheet read the file as UTF-8, so "Module 3 · Quality" comes back as written.
  return '\uFEFF' + [COLUMNS.map((c) => c.heading), ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** The first few of a list, and how many more: a CSV of 300 files is not read out whole. */
function some(items: string[], separator: string, noun: string): string {
  const shown = items.slice(0, NAMED_AT_MOST);
  const more = items.length - shown.length;
  return shown.join(separator) + (more > 0 ? `${separator}and ${more} more ${noun}${more === 1 ? '' : 's'}` : '');
}
const NAMED_AT_MOST = 5;

/** What applying a CSV did, in one paragraph, naming the file it came from. */
export function manifestNote(outcome: ManifestOutcome, fileName: string): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  const refusals = outcome.refused.map((r) => `line ${r.line}${r.file ? ` (${r.file})` : ''}: ${r.reason}`);
  const notApplied = refusals.length ? ` ${n(refusals.length, 'line')} not applied: ${some(refusals, '; ', 'line')}.` : '';
  if (outcome.patches.size === 0) return `${fileName} was not applied: no line could be applied. Nothing in the list changed.${notApplied}`;
  const parts = [`${fileName}: ${outcome.patches.size} of ${n(outcome.lines, 'line')} applied. Nothing has been uploaded; check the rows, then upload.${notApplied}`];
  if (outcome.unnamed.length) {
    const one = outcome.unnamed.length === 1;
    parts.push(`${n(outcome.unnamed.length, 'file')} in the list ${one ? 'is' : 'are'} not in the CSV and ${one ? 'keeps its' : 'keep their'} fields: ${some(outcome.unnamed, ', ', 'file')}.`);
  }
  return parts.join(' ');
}
