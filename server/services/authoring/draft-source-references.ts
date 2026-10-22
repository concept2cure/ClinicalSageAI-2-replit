/** Durable declared source references, reverified at save; not proof of claim support. */
import type { DraftSource } from '../ana/draft-project-sources.js';
import type { Queryable } from '../vault/document-catalog.service.js';
import { sourceAvailabilityPresentation } from '../vault/document-catalog-eligibility.js';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { savedImportSource, verifySavedImportSource } from './import-source-references';
import type { AuthoringActor } from './authoring-documents';
import { isWorkflowImportOrigin } from '../../../shared/authoring/source-import';
import type { DraftSourceReferenceV2, DraftSourceSpan, DraftSourceTextIdentityV2, StoredDraftSourceReference } from '../../../shared/authoring/draft-source-reference';
import { draftSourceIdentityForText } from '../ana/draft-source-identity';

export type DraftSourceReference = DraftSourceReferenceV2;
type SourceMetadata = Omit<DraftSource, 'text' | keyof DraftSourceTextIdentityV2>;
export type VerifiedDraftSourceReference = SourceMetadata & (
  (DraftSourceTextIdentityV2 & { identityVerification: 'exact_extraction_and_span' }) |
  { identityVerification: 'legacy_original_bytes_only' }
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw new Error('Invalid source metadata');
  return raw as Record<string, unknown>;
}

/** Known fields must be own data properties: decoding never evaluates getters. */
function field(value: Record<string, unknown>, key: string): unknown {
  const property = Object.getOwnPropertyDescriptor(value, key);
  if (property && (!property.enumerable || !Object.hasOwn(property, 'value'))) throw new Error('Invalid source metadata');
  return property?.value;
}

function parseSpan(raw: unknown, legacy: boolean): DraftSourceSpan {
  const span = record(raw);
  const values = [field(span, 'start'), field(span, 'end'), field(span, 'totalChars')];
  const [start, end, totalChars] = legacy ? [Number(values[0] ?? 0), Number(values[1]), Number(values[2])] : values;
  const integers = [start, end, totalChars].every(value => typeof value === 'number' && Number.isSafeInteger(value));
  if (!integers) throw new Error('Invalid source excerpt span');
  // The preceding runtime check establishes all three numeric coordinates.
  const coordinates = { start: start as number, end: end as number, totalChars: totalChars as number };
  return checkedSpan(coordinates);
}

function checkedSpan({ start, end, totalChars }: DraftSourceSpan): DraftSourceSpan {
  if (start < 0 || end - start < 1 || end - start > 12000 || totalChars < end) throw new Error('Invalid source excerpt span');
  return Object.freeze({ start, end, totalChars });
}

function checkedString(raw: unknown, pattern: RegExp): string {
  if (typeof raw !== 'string' || !pattern.test(raw)) throw new Error('Invalid source identity/version');
  return raw.toLowerCase();
}

function parseReference(raw: unknown, legacy: boolean): StoredDraftSourceReference {
  const ref = record(raw);
  const identityKeys = ['version', 'extractedTextSha256', 'spanSha256'];
  if (legacy && identityKeys.some(key => Object.hasOwn(ref, key))) throw new Error('Invalid historical source identity');
  const base = { documentId: checkedString(field(ref, 'documentId'), UUID), contentHash: checkedString(field(ref, 'contentHash'), SHA256),
    span: parseSpan(field(ref, 'span'), legacy) };
  if (legacy) return Object.freeze(base);
  if (field(ref, 'version') !== 2) throw new Error('Invalid source identity version');
  return Object.freeze({ ...base, version: 2, extractedTextSha256: checkedString(field(ref, 'extractedTextSha256'), SHA256),
    spanSha256: checkedString(field(ref, 'spanSha256'), SHA256) });
}

function parseReferences(raw: unknown, legacy: boolean): StoredDraftSourceReference[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw new Error('Select one to eight source references');
  const refs = Array.from({ length: raw.length }, (_, index) => parseReference(field(raw as unknown as Record<string, unknown>, String(index)), legacy));
  if (new Set(refs.map(r => r.documentId)).size !== refs.length ||
      refs.reduce((n, r) => n + (r.span.end - r.span.start), 0) > 48000) throw new Error('Duplicate sources or excerpt budget exceeded');
  return refs;
}

/** New writes never fall back to the historical original-byte/length decoder. */
export function parseDraftSourceReferences(raw: unknown): DraftSourceReference[] {
  if (raw === undefined) return [];
  return parseReferences(raw, false) as DraftSourceReference[];
}

/**
 * Whether the loaded document is the one the reference names, in the version it names, still
 * readable and still available: same project, same content hash on the row and on its catalog
 * entry, extracted or catalogued, not withdrawn or superseded, and extracted text of exactly the
 * length the reference recorded. Every clause is a reason to refuse; one predicate so the refusal
 * has one definition.
 */
type LoadedDocument = Awaited<ReturnType<typeof import('../vault/document-catalog.service.js').loadDocumentForOrg>>;
/** What `verifiable` establishes: the document exists, it has a catalog entry, and it has text. */
type VerifiedDocument = NonNullable<LoadedDocument> & { catalog: NonNullable<NonNullable<LoadedDocument>['catalog']>; extractedText: string };

function verifiable(doc: LoadedDocument, ref: StoredDraftSourceReference, programId: string): doc is VerifiedDocument {
  if (!doc || doc.id.toLowerCase() !== ref.documentId || doc.programId.toLowerCase() !== programId.toLowerCase()) return false;
  if (doc.contentHash.toLowerCase() !== ref.contentHash) return false;
  if (!doc.catalog || doc.catalog.contentHash !== doc.contentHash) return false;
  if (!['extracted', 'cataloged'].includes(doc.catalog.status)) return false;
  if (['remove_data', 'supersede'].includes(doc.disposition ?? '')) return false;
  return !!doc.extractedText?.trim() && doc.extractedText.length === ref.span.totalChars;
}

export async function verifyDraftSourceReferences(
  refs: DraftSourceReference[], pool: Queryable, organizationId: number, programId: string,
  /**
   * Filled with each verified excerpt's text, for the drafted-figure check (S5a) and the
   * cross-document claims check (section-claims-check.ts). `ctdSection` and `documentType` are the
   * catalogued facts that give the cited document its role in a comparison (`claimDocRoleOf`);
   * both may be absent, and the role is then `other`, which makes no role convention bind.
   */
  options: { actor: AuthoringActor | undefined; excerpts?: Array<{ documentId: string; contentHash: string; text: string; start?: number; ctdSection?: string | null; documentType?: string | null }> },
): Promise<VerifiedDraftSourceReference[]> {
  // Direct typed callers get the same strict runtime decoder and private copy.
  const pinned = parseDraftSourceReferences(refs);
  return verifyReferenceSnapshots(pinned, pool, organizationId, programId, options);
}

type VerifyOptions = Parameters<typeof verifyDraftSourceReferences>[4];
async function verifyReferenceSnapshots(refs: readonly StoredDraftSourceReference[], pool: Queryable,
  organizationId: number, programId: string, options: VerifyOptions): Promise<VerifiedDraftSourceReference[]> {
  const { actor, excerpts } = options;
  const userId = actor ? Number(actor.id) : undefined;
  const { loadDocumentForOrg } = await import('../vault/document-catalog.service.js');
  const verified: VerifiedDraftSourceReference[] = [];
  for (const ref of refs) {
    const doc = await loadDocumentForOrg(ref.documentId, organizationId, { includeText: true, executor: pool, userId, programId, currentOnly: true });
    if (!verifiable(doc, ref, programId)) throw new Error('Source references could not be verified');
    const identity = verifiedIdentity(doc.extractedText, ref);
    excerpts?.push({
      documentId: doc.id,
      contentHash: doc.contentHash,
      // The characters served, where they stand in the document (S5d).
      text: doc.extractedText.slice(ref.span.start, ref.span.end),
      start: ref.span.start,
      ctdSection: doc.ctdSection ?? null,
      documentType: doc.documentType ?? null,
    });
    verified.push({ ...identity, documentId: doc.id, programId, contentHash: doc.contentHash,
      title: doc.documentTitle || doc.fileName || '', span: ref.span,
      completeText: ref.span.start === 0 && ref.span.end === doc.extractedText.length,
      extractionMethod: doc.catalog.extractionMethod, extractionConfidence: doc.catalog.extractionConfidence,
      ...sourceAvailabilityPresentation(doc) });
  }
  return verified;
}

function verifiedIdentity(text: string, ref: StoredDraftSourceReference):
  (DraftSourceTextIdentityV2 & { identityVerification: 'exact_extraction_and_span' }) | { identityVerification: 'legacy_original_bytes_only' } {
  if (!('version' in ref)) return { identityVerification: 'legacy_original_bytes_only' };
  const current = draftSourceIdentityForText(text, ref.span);
  if (current.extractedTextSha256 !== ref.extractedTextSha256 || current.spanSha256 !== ref.spanSha256) throw new Error('Source text identity changed');
  return { ...current, identityVerification: 'exact_extraction_and_span' };
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
  { programId: string; groups: StoredDraftSourceReference[][] } | null {
  const provenance = doc.provenance;
  if (provenance == null) return null; // Legacy/manual records carry no selected-source receipt.
  if (typeof provenance !== 'object' || Array.isArray(provenance)) throw new Error('Invalid saved provenance');
  const groups = (provenance as Record<string, unknown>).projectSourceReferences;
  const imported = savedImportSource(doc);
  if (groups === undefined && !imported) return null;
  if (groups === undefined && imported) return { programId: imported.programId.toLowerCase(), groups: [] };
  if (!Array.isArray(groups) || groups.length > 200) throw new Error('Invalid saved source groups');
  if (groups.length === 0 && !imported) return null;
  if (typeof doc.client_program_id !== 'string' || !UUID.test(doc.client_program_id)) throw new Error('Saved source project missing');
  const programId = doc.client_program_id.toLowerCase();
  return { programId, groups: groups.map(group => savedGroupReferences(group, programId)) };
}

/** Saved-only compatibility: a partial V2 group cannot become legacy. */
function savedGroupReferences(value: unknown, programId: string): StoredDraftSourceReference[] {
  const group = record(value);
  const sectionCode = field(group, 'sectionCode');
  if (typeof sectionCode !== 'string' || !sectionCode.trim() ||
      field(group, 'qualification') !== 'unassessed' || field(group, 'verification') !== 'current_at_save') throw new Error('Invalid saved source group');
  const versioned = Object.hasOwn(group, 'sourceReferenceVersion');
  if (versioned && field(group, 'sourceReferenceVersion') !== 2) throw new Error('Invalid saved source group version');
  const sources = field(group, 'sources');
  const refs = parseReferences(sources, !versioned);
  // A conflicting saved scope is reviewed rather than silently normalized away.
  if (!Array.isArray(sources) || sources.some(source => {
    const sourceProgram = field(record(source), 'programId');
    return typeof sourceProgram !== 'string' || sourceProgram.toLowerCase() !== programId;
  })) throw new Error('Saved source scope conflicts');
  return refs;
}

export async function verifySavedDraftSourceReferences(
  doc: { provenance?: unknown; client_program_id?: unknown }, q: Queryable, organizationId: number,
  actor?: AuthoringActor,
): Promise<void> {
  try {
    doc = snapshotSavedDocument(doc);
    actor = actor ? { id: actor.id, email: actor.email } : undefined;
    const selected = savedSourceSelection(doc);
    if (!selected) return;
    for (const refs of selected.groups) await verifyReferenceSnapshots(refs, q, organizationId, selected.programId, { actor });
    await verifySavedImportSource(doc, q, organizationId, actor);
  } catch {
    throw new SavedDraftSourceError();
  }
}

/** Inside BEGIN. A successor is an INSERT, so locking only its predecessor
 * does not reserve the current version. Keep the existing source stores stable
 * until the new rendition's receipt commits; no source data is changed. */
export async function reserveSavedDraftSourceReferences(
  doc: { provenance?: unknown; client_program_id?: unknown }, q: Queryable, organizationId: number,
  actor?: AuthoringActor,
): Promise<void> {
  try {
    doc = snapshotSavedDocument(doc);
    actor = actor ? { id: actor.id, email: actor.email } : undefined;
    const selected = savedSourceSelection(doc);
    if (!selected) return;
    // Existing excerpt receipts reserve check-in inserts through their canonical
    // table lock. Exact imported origins reserve just their recorded source row
    // through verifySavedImportSource's FOR SHARE, avoiding a new global lock.
    if (selected.groups.length) await reserveDraftSourceStores(q, organizationId, selected.programId);
    else await lockDocumentDispositionProgram(q, organizationId, selected.programId);
    await verifySavedDraftSourceReferences(doc, q, organizationId, actor);
  } catch {
    throw new SavedDraftSourceError();
  }
}

/** Inside BEGIN; source versions remain reserved through save/rendition commit. */
export async function reserveDraftSourceStores(q: Queryable, organizationId: number, programId: string): Promise<void> {
  await lockDocumentDispositionProgram(q, organizationId, programId);
  await q.query('LOCK TABLE vault.documents, vault.document_catalog IN SHARE MODE');
}

function snapshotSavedDocument(doc: { provenance?: unknown; client_program_id?: unknown }) {
  return { client_program_id: doc.client_program_id, provenance: globalThis.structuredClone(doc.provenance) };
}

/** Source-linked exports reserve their versions through rendering and receipt.
 * Legacy/manual exports retain the existing path without an invented receipt. */
export async function withSavedDraftSourceReservation<T>(
  doc: { provenance?: unknown; client_program_id?: unknown },
  pool: Queryable & { connect(): Promise<Queryable & { release(): void }> },
  organizationId: number, work: (q: Queryable) => Promise<T>,
  actor?: AuthoringActor,
): Promise<T> {
  let selected: ReturnType<typeof savedSourceSelection>;
  try {
    doc = snapshotSavedDocument(doc);
    actor = actor ? { id: actor.id, email: actor.email } : undefined;
    selected = savedSourceSelection(doc);
  } catch { throw new SavedDraftSourceError(); }
  if (!selected) return work(pool);
  const q = await pool.connect();
  try {
    const imported = savedImportSource(doc);
    await q.query(imported && isWorkflowImportOrigin(imported) ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN');
    await reserveSavedDraftSourceReferences(doc, q, organizationId, actor);
    const result = await work(q);
    await q.query('COMMIT');
    return result;
  } catch (error) {
    await q.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { q.release(); }
}
