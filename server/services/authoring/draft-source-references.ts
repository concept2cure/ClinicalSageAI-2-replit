/** Durable declared source references, reverified at save; not proof of claim support. */
import type { DraftSource } from '../ana/draft-project-sources.js';
import type { Queryable } from '../vault/document-catalog.service.js';
import { sourceAvailabilityPresentation } from '../vault/document-catalog-eligibility.js';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';

export type DraftSourceReference = Pick<DraftSource, 'documentId' | 'contentHash' | 'span'>;
export type VerifiedDraftSourceReference = Omit<DraftSource, 'text'>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseReference(raw: unknown): DraftSourceReference {
  const ref = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const span = ref.span && typeof ref.span === 'object' ? ref.span as Record<string, unknown> : {};
  if (typeof ref.documentId !== 'string' || !UUID.test(ref.documentId) ||
      typeof ref.contentHash !== 'string' || !/^[0-9a-f]{64}$/i.test(ref.contentHash)) throw new Error('Invalid source identity/version');
  if (span.start !== 0 || !Number.isSafeInteger(span.end) || !Number.isSafeInteger(span.totalChars) ||
      Number(span.end) < 1 || Number(span.end) > 12000 || Number(span.totalChars) < Number(span.end)) throw new Error('Invalid source excerpt span');
  return { documentId: ref.documentId.toLowerCase(), contentHash: ref.contentHash.toLowerCase(),
    span: { start: 0, end: Number(span.end), totalChars: Number(span.totalChars) } };
}

export function parseDraftSourceReferences(raw: unknown): DraftSourceReference[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new Error('Select one to eight source references');
  const refs = raw.map(parseReference);
  if (new Set(refs.map(r => r.documentId)).size !== refs.length ||
      refs.reduce((n, r) => n + r.span.end, 0) > 48000) throw new Error('Duplicate sources or excerpt budget exceeded');
  return refs;
}

export async function verifyDraftSourceReferences(
  refs: DraftSourceReference[], pool: Queryable, organizationId: number, programId: string,
  /** Filled with each verified excerpt's text, for the drafted-figure check (S5a). */
  excerpts?: Array<{ documentId: string; contentHash: string; text: string }>,
): Promise<VerifiedDraftSourceReference[]> {
  const { loadDocumentForOrg } = await import('../vault/document-catalog.service.js');
  const verified: VerifiedDraftSourceReference[] = [];
  for (const ref of refs) {
    const doc = await loadDocumentForOrg(ref.documentId, organizationId, { includeText: true, executor: pool, programId, currentOnly: true });
    if (!doc || doc.programId.toLowerCase() !== programId.toLowerCase() ||
        doc.contentHash.toLowerCase() !== ref.contentHash || !doc.catalog || doc.catalog.contentHash !== doc.contentHash ||
        !['extracted', 'cataloged'].includes(doc.catalog.status) ||
        ['remove_data', 'supersede'].includes(doc.disposition ?? '') ||
        !doc.extractedText?.trim() || doc.extractedText.length !== ref.span.totalChars) throw new Error('Source references could not be verified');
    excerpts?.push({ documentId: doc.id, contentHash: doc.contentHash, text: doc.extractedText.slice(0, ref.span.end) });
    verified.push({ documentId: doc.id, programId, contentHash: doc.contentHash,
      title: doc.documentTitle || doc.fileName, span: ref.span,
      completeText: ref.span.end === doc.extractedText.length,
      extractionMethod: doc.catalog.extractionMethod, extractionConfidence: doc.catalog.extractionConfidence,
      ...sourceAvailabilityPresentation(doc) });
  }
  return verified;
}

/** A saved receipt is not perpetual authorization to produce new renditions. */
export class SavedDraftSourceError extends Error {
  readonly code = 'SOURCE_REFERENCES_UNAVAILABLE';
  constructor() {
    super('Saved project sources are unavailable, changed, or could not be verified. Refresh the source records and review the affected draft before producing a new file.');
    this.name = 'SavedDraftSourceError';
  }
}

function savedSourceSelection(doc: { provenance?: unknown; client_program_id?: unknown }):
  { programId: string; groups: unknown[] } | null {
  const provenance = doc.provenance;
  if (provenance == null) return null; // Legacy/manual records carry no selected-source receipt.
  if (typeof provenance !== 'object' || Array.isArray(provenance)) throw new Error('Invalid saved provenance');
  const groups = (provenance as Record<string, unknown>).projectSourceReferences;
  if (groups === undefined) return null;
  if (!Array.isArray(groups) || groups.length > 200) throw new Error('Invalid saved source groups');
  if (groups.length === 0) return null;
  if (typeof doc.client_program_id !== 'string' || !UUID.test(doc.client_program_id)) throw new Error('Saved source project missing');
  return { programId: doc.client_program_id.toLowerCase(), groups };
}

function savedGroupReferences(value: unknown, programId: string): DraftSourceReference[] {
  const group = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (typeof group.sectionCode !== 'string' || !group.sectionCode.trim() ||
      group.qualification !== 'unassessed' || group.verification !== 'current_at_save') throw new Error('Invalid saved source group');
  const refs = parseDraftSourceReferences(group.sources);
  // A conflicting saved scope is reviewed rather than silently normalized away.
  if (!Array.isArray(group.sources) || group.sources.some(source =>
    typeof source.programId !== 'string' || source.programId.toLowerCase() !== programId)) throw new Error('Saved source scope conflicts');
  return refs;
}

export async function verifySavedDraftSourceReferences(
  doc: { provenance?: unknown; client_program_id?: unknown }, q: Queryable, organizationId: number,
): Promise<void> {
  try {
    const selected = savedSourceSelection(doc);
    if (!selected) return;
    for (const group of selected.groups) {
      await verifyDraftSourceReferences(savedGroupReferences(group, selected.programId), q, organizationId, selected.programId);
    }
  } catch {
    throw new SavedDraftSourceError();
  }
}

/** Inside BEGIN. A successor is an INSERT, so locking only its predecessor
 * does not reserve the current version. Keep the existing source stores stable
 * until the new rendition's receipt commits; no source data is changed. */
export async function reserveSavedDraftSourceReferences(
  doc: { provenance?: unknown; client_program_id?: unknown }, q: Queryable, organizationId: number,
): Promise<void> {
  try {
    const selected = savedSourceSelection(doc);
    if (!selected) return;
    await lockDocumentDispositionProgram(q, organizationId, selected.programId);
    await q.query('LOCK TABLE vault.documents, vault.document_catalog IN SHARE MODE');
    await verifySavedDraftSourceReferences(doc, q, organizationId);
  } catch {
    throw new SavedDraftSourceError();
  }
}

/** Source-linked exports reserve their versions through rendering and receipt.
 * Legacy/manual exports retain the existing path without an invented receipt. */
export async function withSavedDraftSourceReservation<T>(
  doc: { provenance?: unknown; client_program_id?: unknown },
  pool: Queryable & { connect(): Promise<Queryable & { release(): void }> },
  organizationId: number, work: (q: Queryable) => Promise<T>,
): Promise<T> {
  let selected: ReturnType<typeof savedSourceSelection>;
  try { selected = savedSourceSelection(doc); } catch { throw new SavedDraftSourceError(); }
  if (!selected) return work(pool);
  const q = await pool.connect();
  try {
    await q.query('BEGIN');
    await reserveSavedDraftSourceReferences(doc, q, organizationId);
    const result = await work(q);
    await q.query('COMMIT');
    return result;
  } catch (error) {
    await q.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { q.release(); }
}
