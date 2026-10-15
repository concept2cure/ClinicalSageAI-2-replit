/**
 * Compare two versions of a Vault document (critique 15 of the Vault parity
 * plan, row D2): what changed between them, in the document's text and in its
 * recorded details.
 *
 * A reviewer comparing v1.0 and v2.0 had to download both and compare them by
 * eye. Veeva shows the difference. Here the server reads both versions'
 * extracted text and their recorded details, from the same family (the
 * VR-08 link rule, readVersionFamily), and returns a line diff from the
 * `diff` package: deterministic, no model involved. Unchanged runs are
 * collapsed to their count. The read is capped, and says so when it is:
 * a diff that silently stopped part-way would read as "nothing else changed".
 *
 * It never claims more than it read:
 *   - identical bytes are reported from the recorded SHA-256s, not inferred
 *     from the text;
 *   - a version with no extracted text (a scan, a failed read) has no text
 *     comparison, and the answer says which and why;
 *   - two texts too different to align within the edit budget are reported
 *     as such, with their line counts, rather than as a misleading diff.
 */
import { diffArrays } from 'diff';
import { readVersionFamily } from './vault-version-family.js';

/** Lines read from each version. Past this the comparison is marked truncated. */
export const COMPARE_LINE_CAP = 20_000;
/** Lines of difference returned. Past this the comparison is marked truncated. */
export const COMPARE_OUTPUT_CAP = 2_000;
/** Insertions plus deletions the aligner may explore before giving up (the protocol redline's budget). */
export const COMPARE_EDIT_BUDGET = 2_000;
/** Milliseconds the aligner may run on the request before giving up. */
export const COMPARE_TIMEOUT_MS = 500;
/** Unchanged lines kept on each side of a change. */
export const COMPARE_CONTEXT = 3;

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export interface CompareSide {
  id: string;
  version: string | null;
  contentHash: string | null;
  fileSize: number | null;
  fileName: string | null;
  createdAt: string;
  uploader: string | null;
  current: boolean;
}

export interface DetailChange { field: 'title' | 'type' | 'classification' | 'fileName'; from: string | null; to: string | null }

export type CompareHunk =
  | { kind: 'same' | 'added' | 'removed'; lines: string[] }
  | { kind: 'skipped'; count: number };

export type TextComparison =
  | {
      available: true;
      identical: boolean;
      truncated: boolean;
      counts: { added: number; removed: number; unchanged: number };
      hunks: CompareHunk[];
    }
  | { available: false; reason: string };

export type CompareResult =
  | { ok: true; from: CompareSide; to: CompareSide; sameBytes: boolean; details: DetailChange[]; text: TextComparison }
  | { ok: false; status: number; code: string; message: string };

interface VersionRow {
  id: string;
  document_title: string | null;
  document_type: string | null;
  classification: string | null;
  file_name: string | null;
  extracted_text: string | null;
}

function linesOf(text: string): { lines: string[]; truncated: boolean } {
  const all = text.replace(/\r\n?/g, '\n').split('\n');
  return all.length > COMPARE_LINE_CAP
    ? { lines: all.slice(0, COMPARE_LINE_CAP), truncated: true }
    : { lines: all, truncated: false };
}

/** Collapse unchanged runs to COMPARE_CONTEXT lines either side of a change, and cap the output. */
function toHunks(changes: Array<{ value: string[]; added?: boolean; removed?: boolean }>): { hunks: CompareHunk[]; capped: boolean } {
  const hunks: CompareHunk[] = [];
  let emitted = 0;
  let capped = false;
  const push = (h: CompareHunk) => {
    if (h.kind !== 'skipped') {
      const room = COMPARE_OUTPUT_CAP - emitted;
      if (room <= 0) { capped = true; return; }
      if (h.lines.length > room) { capped = true; h = { kind: h.kind, lines: h.lines.slice(0, room) }; }
      emitted += h.lines.length;
    }
    hunks.push(h);
  };
  changes.forEach((c, i) => {
    if (capped) return;
    if (c.added || c.removed) { push({ kind: c.added ? 'added' : 'removed', lines: c.value }); return; }
    const lead = i === 0 ? 0 : COMPARE_CONTEXT;
    const tail = i === changes.length - 1 ? 0 : COMPARE_CONTEXT;
    if (c.value.length <= lead + tail) { push({ kind: 'same', lines: c.value }); return; }
    if (lead) push({ kind: 'same', lines: c.value.slice(0, lead) });
    push({ kind: 'skipped', count: c.value.length - lead - tail });
    if (tail) push({ kind: 'same', lines: c.value.slice(c.value.length - tail) });
  });
  return { hunks, capped };
}

/** The text comparison, or why there is none. */
export function compareText(fromText: string | null, toText: string | null, labels: { from: string; to: string }): TextComparison {
  const missing = [!fromText?.trim() ? labels.from : null, !toText?.trim() ? labels.to : null].filter(Boolean);
  if (missing.length > 0) {
    return { available: false, reason: `No text was read from ${missing.join(' or ')}, so the text cannot be compared. The recorded details and SHA-256 are still compared.` };
  }
  const a = linesOf(fromText as string);
  const b = linesOf(toText as string);
  const changes = diffArrays(a.lines, b.lines, { maxEditLength: COMPARE_EDIT_BUDGET, timeout: COMPARE_TIMEOUT_MS });
  if (!changes) {
    return { available: false, reason: `The two texts differ too much to align line by line (${a.lines.length} and ${b.lines.length} lines). Download both to compare them.` };
  }
  const count = (k: 'added' | 'removed' | 'same') =>
    changes.filter((c) => (k === 'added' ? c.added : k === 'removed' ? c.removed : !c.added && !c.removed)).reduce((n, c) => n + c.value.length, 0);
  const { hunks, capped } = toHunks(changes);
  const counts = { added: count('added'), removed: count('removed'), unchanged: count('same') };
  return {
    available: true,
    identical: counts.added === 0 && counts.removed === 0,
    truncated: a.truncated || b.truncated || capped,
    counts,
    hunks,
  };
}

function detailChanges(from: VersionRow, to: VersionRow): DetailChange[] {
  const fields: Array<[DetailChange['field'], keyof VersionRow]> = [
    ['title', 'document_title'], ['type', 'document_type'], ['classification', 'classification'], ['fileName', 'file_name'],
  ];
  return fields
    .filter(([, col]) => (from[col] ?? null) !== (to[col] ?? null))
    .map(([field, col]) => ({ field, from: from[col] ?? null, to: to[col] ?? null }));
}

/**
 * Compare `againstId` with `documentId`, both versions of one document in this
 * program and organisation. The earlier version is `from`, the later `to`.
 */
export async function compareVaultVersions(
  q: Queryable,
  p: { programId: string; organizationId: number; documentId: string; againstId: string },
): Promise<CompareResult> {
  const family = await readVersionFamily(q, { programId: p.programId, organizationId: p.organizationId, documentId: p.documentId });
  if (!family) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'No such document in this project.' };
  const a = family.find((v) => v.id === p.documentId);
  const b = family.find((v) => v.id === p.againstId);
  if (!a || !b) {
    return { ok: false, status: 422, code: 'NOT_SAME_DOCUMENT', message: 'Only versions of the same document can be compared.' };
  }
  if (a.id === b.id) return { ok: false, status: 422, code: 'SAME_VERSION', message: 'Choose two different versions to compare.' };

  const { rows } = await q.query(
    `SELECT d.id::text AS id, d.document_title, d.document_type, d.classification::text AS classification,
            d.file_name, d.extracted_text
       FROM vault.documents d
      WHERE d.id = ANY($1::uuid[]) AND d.program_id = $2::uuid AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $3 AND rp.deleted_at IS NULL)`,
    [[a.id, b.id], p.programId, p.organizationId],
  );
  const byId = new Map((rows as VersionRow[]).map((r) => [r.id, r]));
  const [older, newer] = new Date(a.createdAt).getTime() <= new Date(b.createdAt).getTime() ? [a, b] : [b, a];
  const fromRow = byId.get(older.id);
  const toRow = byId.get(newer.id);
  if (!fromRow || !toRow) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'No such document in this project.' };

  const side = (v: typeof a): CompareSide => ({
    id: v.id, version: v.version, contentHash: v.contentHash, fileSize: v.fileSize, fileName: v.fileName,
    createdAt: v.createdAt, uploader: v.uploader, current: v.current,
  });
  const label = (v: typeof a) => (v.version ? `v${v.version}` : 'the version with no recorded number');
  return {
    ok: true,
    from: side(older),
    to: side(newer),
    sameBytes: Boolean(older.contentHash) && older.contentHash === newer.contentHash,
    details: detailChanges(fromRow, toRow),
    text: compareText(fromRow.extracted_text, toRow.extracted_text, { from: label(older), to: label(newer) }),
  };
}
