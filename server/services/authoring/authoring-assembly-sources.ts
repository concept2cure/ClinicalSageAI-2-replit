/** One exact, actor-admitted source reader for catalogue assembly and its drafts. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { ASSEMBLY_SOURCE_EXCERPT_LIMIT, readAssemblySourceManifest, readAssemblySourceSelectors,
  type AssemblySourceEntry, type AssemblySourceManifest, type AssemblySourceSelector } from '../../../shared/authoring/assembly-sources';
import type { RequestSqlClient } from '../../db/requestDb';
import { requireCurrentProgramAccess, ProgramReadAccessError } from '../c2c/current-program-access';
import { getSource } from '../clinical-regulatory-evidence/evidence-spine.service';
import { getCurrentReadableSourceScope, requireSourceReadScopeStillCurrent, SourceReadAccessError } from '../clinical-regulatory-evidence/source-read-access';
import { resolveEvidenceSourceIdsByVaultDocuments } from '../clinical-regulatory-evidence/retrieval-source-link';
import { loadDocumentForOrg } from '../vault/document-catalog.service';
import { chooseSourceWindow } from '../ana/draft-source-window';
import { draftSourceIdentityForText } from '../ana/draft-source-identity';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { reserveDraftSourceStores } from './draft-source-references';

export class AssemblySourceError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
export interface AssemblySourceIdentity { organizationId: number; userId: number; programId: string }
export interface AssemblySourceOptions { query?: string; expectedManifest?: AssemblySourceManifest; lock?: boolean }
interface SourceState {
  source: AssemblySourceSelector; title: string; contentHash: string; text: string; version: string | null;
  originalFileAvailable: boolean | null; disposition: string | null; extractionMethod: string | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const hash = (value: unknown) => createHash('sha256').update(stableStringify(value)).digest('hex');
function unavailable(): never { throw new AssemblySourceError(409, 'ASSEMBLY_SOURCES_UNAVAILABLE', 'Selected project sources are unavailable or no longer eligible. Refresh the catalogue and preview again.'); }
function changed(): never { throw new AssemblySourceError(409, 'ASSEMBLY_SOURCES_CHANGED', 'The selected sources or their extracted text changed. Refresh the catalogue and preview again.'); }
function invalid(): never { throw new AssemblySourceError(400, 'ASSEMBLY_SOURCES_INVALID', 'Choose one to five exact sources from this project.'); }

function pinInput(identity: AssemblySourceIdentity, raw: AssemblySourceSelector[], options: AssemblySourceOptions) {
  const actor = { organizationId: identity.organizationId, userId: identity.userId, programId: identity.programId };
  if (![actor.organizationId, actor.userId].every(value => Number.isSafeInteger(value) && value > 0)
    || typeof actor.programId !== 'string' || !UUID.test(actor.programId)) invalid();
  actor.programId = actor.programId.toLowerCase();
  const sources = readAssemblySourceSelectors(raw);
  if (!sources || sources.some(source => source.kind === 'data-room' && source.sourceId > 2_147_483_647)) invalid();
  const expected = options.expectedManifest === undefined ? undefined : readAssemblySourceManifest(options.expectedManifest);
  if (options.expectedManifest !== undefined && (!expected || expected.programId.toLowerCase() !== actor.programId
    || stableStringify(expected.entries.map(entry => entry.source)) !== stableStringify(sources))) changed();
  return { actor, sources, expected: expected ?? undefined, query: typeof options.query === 'string' ? options.query : undefined, lock: options.lock === true };
}

async function reserveSources(q: RequestSqlClient, actor: AssemblySourceIdentity, sources: AssemblySourceSelector[]) {
  if (sources.some(source => source.kind === 'vault')) await reserveDraftSourceStores(q, actor.organizationId, actor.programId);
  else await lockDocumentDispositionProgram(q, actor.organizationId, actor.programId);
  const ids = sources.filter(source => source.kind === 'data-room').map(source => source.sourceId);
  if (ids.length) await q.query(`SELECT id FROM cre_evidence_sources WHERE organization_id=$1 AND client_program_id=$2
    AND id=ANY($3::int[]) FOR SHARE`, [actor.organizationId, actor.programId, ids]);
}

type Capture = Awaited<ReturnType<typeof getSource>>;
function captureEligible(doc: Capture, actor: AssemblySourceIdentity): doc is NonNullable<Capture> & { checksum: string } {
  return !!doc && doc.organizationId === actor.organizationId && doc.clientProgramId?.toLowerCase() === actor.programId
    && doc.sourceType === 'client_document' && doc.isCurrent && doc.dataEligible === true && doc.textAvailable === true
    && HASH.test(doc.checksum ?? '') && !['remove_data', 'supersede'].includes(doc.disposition ?? '');
}
async function dataRoomSource(q: RequestSqlClient, actor: AssemblySourceIdentity, source: Extract<AssemblySourceSelector, { kind: 'data-room' }>): Promise<SourceState> {
  // Identity-only admission precedes getSource's full canonical row read.
  // Access to another project cannot make it the open document's source.
  const identity = await q.query(`SELECT id FROM cre_evidence_sources WHERE id=$1 AND organization_id=$2
    AND client_program_id=$3 AND source_type='client_document' AND is_current IS NOT FALSE AND deleted_at IS NULL`,
  [source.sourceId, actor.organizationId, actor.programId]);
  if (identity.rows.length !== 1) unavailable();
  const doc = await getSource(actor.organizationId, source.sourceId, q);
  if (!captureEligible(doc, actor)) unavailable();
  const result = await q.query(`SELECT extracted_text FROM cre_evidence_sources WHERE id=$1 AND organization_id=$2
    AND client_program_id=$3 AND source_type='client_document' AND is_current IS NOT FALSE AND deleted_at IS NULL`,
  [source.sourceId, actor.organizationId, actor.programId]);
  const text = result.rows[0]?.extracted_text;
  if (result.rows.length !== 1 || typeof text !== 'string' || !text.trim()) unavailable();
  return { source, title: doc.title || `Source ${doc.id}`, contentHash: doc.checksum.toLowerCase(), text,
    version: doc.version ?? null, disposition: doc.disposition ?? null, originalFileAvailable: doc.originalFileAvailable ?? null,
    extractionMethod: typeof doc.provenance.extractionMethod === 'string' ? doc.provenance.extractionMethod : null };
}

type VaultDocument = Awaited<ReturnType<typeof loadDocumentForOrg>>;
function vaultEligible(doc: VaultDocument, actor: AssemblySourceIdentity, source: Extract<AssemblySourceSelector, { kind: 'vault' }>):
  doc is NonNullable<VaultDocument> & { extractedText: string; catalog: NonNullable<NonNullable<VaultDocument>['catalog']> } {
  return !!doc && doc.id.toLowerCase() === source.documentId && doc.programId.toLowerCase() === actor.programId
    && HASH.test(doc.contentHash) && !!doc.catalog && doc.catalog.contentHash === doc.contentHash
    && ['extracted', 'cataloged'].includes(doc.catalog.status) && !!doc.extractedText?.trim()
    && !['remove_data', 'supersede'].includes(doc.disposition ?? '');
}
async function vaultSource(q: RequestSqlClient, actor: AssemblySourceIdentity, source: Extract<AssemblySourceSelector, { kind: 'vault' }>): Promise<SourceState> {
  const doc = await loadDocumentForOrg(source.documentId, actor.organizationId, { executor: q, userId: actor.userId,
    programId: actor.programId, includeText: true, currentOnly: true });
  if (!vaultEligible(doc, actor, source)) unavailable();
  return { source, title: doc.documentTitle || doc.fileName || source.documentId, contentHash: doc.contentHash.toLowerCase(), text: doc.extractedText,
    version: doc.version ?? null, disposition: doc.disposition ?? null, originalFileAvailable: doc.originalFileAvailable ?? null,
    extractionMethod: doc.catalog.extractionMethod };
}

async function loadStates(q: RequestSqlClient, actor: AssemblySourceIdentity, sources: AssemblySourceSelector[]) {
  const states: SourceState[] = [];
  for (const source of sources) {
    const state = source.kind === 'data-room' ? await dataRoomSource(q, actor, source) : await vaultSource(q, actor, source);
    if (source.expectedChecksum && state.contentHash !== source.expectedChecksum) changed();
    states.push(state);
  }
  return states;
}

/** Keep a preview window within the shared budget without splitting a surrogate pair. */
function sourceSpan(text: string, query: string | undefined) {
  const window = chooseSourceWindow(text, query, ASSEMBLY_SOURCE_EXCERPT_LIMIT);
  let { start, end } = window;
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start]) && /[\uD800-\uDBFF]/.test(text[start - 1])) start++;
  if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end]) && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return { start, end, totalChars: text.length };
}

function manifestFor(actor: AssemblySourceIdentity, states: SourceState[], query?: string, expected?: AssemblySourceManifest): AssemblySourceManifest {
  const entries: AssemblySourceEntry[] = states.map((state, index) => {
    const span = expected?.entries[index].span ?? sourceSpan(state.text, query);
    let identity: ReturnType<typeof draftSourceIdentityForText>;
    try { identity = draftSourceIdentityForText(state.text, span); } catch { return changed(); }
    return { source: state.source, title: state.title, contentHash: state.contentHash, extractedTextSha256: identity.extractedTextSha256,
      version: state.version, originalFileAvailable: state.originalFileAvailable, disposition: state.disposition,
      span: { start: span.start, end: span.end, totalChars: span.totalChars, sha256: identity.spanSha256 } };
  });
  const limitations = ['Selected references record assembly intent, not citation support, model consumption, scientific qualification or filing approval.'];
  if (entries.some(entry => entry.span.start !== 0 || entry.span.end !== entry.span.totalChars)) limitations.push('Only the recorded bounded excerpts were selected; this is not whole-document review.');
  if (entries.some(entry => entry.originalFileAvailable === false || entry.disposition === 'keep_data')) limitations.push('Eligible extracted data was retained for a source whose original file is unavailable.');
  if (states.some(state => state.extractionMethod?.includes('ocr'))) limitations.push('OCR text may misread figures, identifiers and dates; verify against the original page when available.');
  const base = { version: 1 as const, programId: actor.programId, entries, limitations };
  const manifest = { ...base, fingerprint: hash(base) };
  if (expected && stableStringify(manifest) !== stableStringify(expected)) changed();
  return manifest;
}

async function read(q: RequestSqlClient, identity: AssemblySourceIdentity, selectors: AssemblySourceSelector[], options: AssemblySourceOptions) {
  const { actor, sources, expected, query, lock } = pinInput(identity, selectors, options);
  await requireCurrentProgramAccess(q, actor);
  const creIds = sources.filter(source => source.kind === 'data-room').map(source => source.sourceId);
  const scope = creIds.length ? await getCurrentReadableSourceScope(q, { ...actor, sourceIds: creIds }) : null;
  if (lock) await reserveSources(q, actor, sources);
  const states = await loadStates(q, actor, sources);
  const manifest = manifestFor(actor, states, query, expected);
  const vaultIds = sources.filter(source => source.kind === 'vault').map(source => source.documentId);
  const links = vaultIds.length ? await resolveEvidenceSourceIdsByVaultDocuments(actor.organizationId, actor.programId, vaultIds,
    { query: async <R>(sql: string, args?: unknown[]) => ({ rows: (await q.query(sql, args)).rows as R[] }) }) : new Map<string, number>();
  const final = await loadStates(q, actor, sources);
  if (stableStringify(states) !== stableStringify(final)) changed();
  if (scope) await requireSourceReadScopeStillCurrent(q, actor, scope);
  await requireCurrentProgramAccess(q, actor);
  return { manifest, chunks: states.map((state, index) => ({ content: state.text.slice(manifest.entries[index].span.start, manifest.entries[index].span.end),
    title: state.title, sourceId: state.source.kind === 'data-room' ? `cre_source:${state.source.sourceId}`
      : links.has(state.source.documentId) ? `cre_source:${links.get(state.source.documentId)}` : null })) };
}

export async function readSelectedAuthoringSources(q: RequestSqlClient, identity: AssemblySourceIdentity, selectors: AssemblySourceSelector[], options: AssemblySourceOptions = {}) {
  try { return await read(q, identity, selectors, options); }
  catch (error) {
    if (error instanceof AssemblySourceError) throw error;
    if (error instanceof ProgramReadAccessError || error instanceof SourceReadAccessError) {
      throw new AssemblySourceError(error.status === 503 ? 503 : error.status === 409 ? 409 : 403, 'ASSEMBLY_SOURCES_UNAVAILABLE', 'Current access to every selected project source could not be verified. No source content was supplied.');
    }
    throw new AssemblySourceError(503, 'ASSEMBLY_SOURCES_UNAVAILABLE', 'The selected project sources could not be verified. Refresh the catalogue before trying again.');
  }
}
