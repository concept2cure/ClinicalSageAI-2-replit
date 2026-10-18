/** Read the last recorded source-based build, then verify its exact sources now. */
import type { RequestSqlClient } from '../../db/requestDb';
import type { SavedAssemblySources } from '../../../shared/authoring/saved-assembly-sources';
import { readAssemblySourceManifest, type AssemblySourceManifest } from '../../../shared/authoring/assembly-sources';
import { stableStringify } from '../../../shared/canonical-json';
import { hashPayload } from '../audit/chain';
import { verifySequencedRow, type SequencedRowInput } from '../audit/chain-row';
import { ProgramReadAccessError } from '../c2c/current-program-access';
import { verifyAuthoringTrailRow, type StoredTrailRow } from './authoring-evidence';
import { getCurrentAuthoringReadScope, requireAuthoringReadScopeStillCurrent, AuthoringReadScopeError } from './authoring-read-scope';
import { readSelectedAuthoringSources, AssemblySourceError } from './authoring-assembly-sources';

export class SavedAssemblySourcesError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
export interface SavedAssemblySourcesInput { organizationId: number; userId: number; docId: string; programId: string }
interface Position { eventId: string; auditId: string; sequence: string }
interface VerifiedRecord { eventId: string; recordedAt: string; manifest: AssemblySourceManifest; snapshot: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;
const OPERATION = 'ASSEMBLY_SOURCES';
const ACTION = 'authoring.section.ASSEMBLY_SOURCES';
function unverified(): never { throw new SavedAssemblySourcesError(409, 'SAVED_ASSEMBLY_SOURCES_UNVERIFIABLE', 'The last recorded source selection could not be verified. Check its document record before choosing sources again.'); }
function changed(): never { throw new SavedAssemblySourcesError(409, 'SAVED_ASSEMBLY_SOURCES_CHANGED', 'The recorded source selection changed during this check. Check saved sources again.'); }
const object = (raw: unknown): Record<string, unknown> | null => raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
const uuid = (raw: unknown): raw is string => typeof raw === 'string' && UUID.test(raw);
const sequence = (raw: unknown): raw is string => typeof raw === 'string' && /^[1-9]\d{0,18}$/.test(raw) && BigInt(raw) <= 9_223_372_036_854_775_807n;

function inputSnapshot(raw: SavedAssemblySourcesInput): SavedAssemblySourcesInput {
  const input = { organizationId: raw.organizationId, userId: raw.userId, docId: raw.docId, programId: raw.programId };
  if (![input.organizationId, input.userId].every(value => Number.isSafeInteger(value) && value > 0)
    || !uuid(input.docId) || !uuid(input.programId)) {
    throw new SavedAssemblySourcesError(400, 'SAVED_ASSEMBLY_SOURCES_INVALID', 'Choose an exact saved document and its project.');
  }
  return { ...input, docId: input.docId.toLowerCase(), programId: input.programId.toLowerCase() };
}

/** Reconcile both sides: filtering only trail.operation_type could hide damage
 * to the newest event and silently expose an older selection. No history cap. */
async function latest(q: RequestSqlClient, input: SavedAssemblySourcesInput): Promise<Position | null> {
  const result = await q.query(`WITH trails AS (
      SELECT id,operation_type,section_id,
        (operation_type='ASSEMBLY_SOURCES' OR (section_id IS NULL AND metadata->'assembly'->'sources' IS NOT NULL)) AS source_marker
      FROM authoring_audit_trail WHERE doc_id=$1::uuid AND tenant_id=$2
        AND (section_id IS NULL OR operation_type='ASSEMBLY_SOURCES')
    ), chains AS (
      SELECT a.id,a.action,a.table_name,a.record_id,a.new_values->>'trailId' AS trail_id,
             to_jsonb(a)->>'chain_seq' AS sequence
        FROM audit_logs a WHERE a.tenant_id=$2 AND (
          (a.table_name='authoring_document' AND a.record_id=$1::uuid::text AND
            (a.action='authoring.section.ASSEMBLY_SOURCES' OR a.new_values->>'operationType'='ASSEMBLY_SOURCES'))
          OR (a.new_values->>'docId'=$1::uuid::text AND
            (a.action='authoring.section.ASSEMBLY_SOURCES' OR a.new_values->>'operationType'='ASSEMBLY_SOURCES'))
          OR EXISTS (SELECT 1 FROM trails t WHERE t.source_marker AND t.id::text=a.new_values->>'trailId')
        )
    ), matches AS (
      SELECT t.id AS event_id,c.id AS audit_id,t.operation_type,t.section_id,c.action,c.table_name,c.record_id,c.sequence,
        CASE WHEN length(c.sequence)<=19 AND c.sequence ~ '^[1-9][0-9]*$'
          THEN c.sequence::numeric END AS position
      FROM trails t FULL OUTER JOIN chains c ON c.trail_id=t.id::text
      WHERE t.source_marker OR c.id IS NOT NULL
    ), summary AS (
      SELECT count(*)>0 AS has_events,
        COALESCE(bool_and(event_id IS NOT NULL AND audit_id IS NOT NULL AND section_id IS NULL AND operation_type='ASSEMBLY_SOURCES'
          AND action='authoring.section.ASSEMBLY_SOURCES' AND table_name='authoring_document' AND record_id=$1::uuid::text
          AND position>0 AND position<=9223372036854775807),true)
          AND count(*)=count(DISTINCT event_id) AND count(*)=count(DISTINCT audit_id)
          AND count(*)=count(DISTINCT position) AS ordering_valid FROM matches
    ) SELECT summary.*,
      (SELECT event_id::text FROM matches ORDER BY position DESC NULLS LAST LIMIT 1) AS event_id,
      (SELECT audit_id::text FROM matches ORDER BY position DESC NULLS LAST LIMIT 1) AS audit_id,
      (SELECT sequence FROM matches ORDER BY position DESC NULLS LAST LIMIT 1) AS sequence FROM summary`,
  [input.docId, input.organizationId]);
  const row = result.rows[0];
  if (result.rows.length !== 1 || typeof row?.has_events !== 'boolean' || row.ordering_valid !== true) unverified();
  if (!row.has_events) return null;
  if (!uuid(row.event_id) || !uuid(row.audit_id) || !sequence(row.sequence)) unverified();
  return { eventId: row.event_id, auditId: row.audit_id, sequence: row.sequence };
}

function detailsOf(row: Record<string, unknown>, input: SavedAssemblySourcesInput, position: Position) {
  // Keep direct JSON key order for the canonical JSON.stringify payload hash.
  const details = object(row.chain_details);
  if (!details || details.trailId !== position.eventId || details.docId !== input.docId || details.sectionId !== null
    || details.operationType !== OPERATION || row.operation_type !== OPERATION || row.section_id !== null
    || row.doc_id !== input.docId || row.tenant_id !== input.organizationId) unverified();
  return details;
}
function storedTrail(row: Record<string, unknown>, position: Position): StoredTrailRow {
  if (row.before_content !== null || row.after_content !== null || row.content_hash_before !== null || row.content_hash_after !== null
    || (row.change_reason !== null && typeof row.change_reason !== 'string')) unverified();
  return { id: position.eventId, operation_type: OPERATION, before_content: null, after_content: null,
    content_hash_before: null, content_hash_after: null, change_reason: row.change_reason, metadata: row.metadata };
}
function checkSelection(value: unknown): void {
  const target = object(value);
  if (!target || (target.target !== 'document' && !(target.target === 'section' && typeof target.code === 'string' && target.code.trim()))) unverified();
}
function assemblyMetadata(metadata: unknown, input: SavedAssemblySourcesInput) {
  const assembly = object(object(metadata)?.assembly);
  if (!assembly || assembly.version !== 1 || assembly.docId !== input.docId || assembly.programId !== input.programId
    || !uuid(assembly.templateId) || typeof assembly.templateSnapshot !== 'string' || !HASH.test(assembly.templateSnapshot)
    || typeof assembly.fingerprint !== 'string' || !HASH.test(assembly.fingerprint)) unverified();
  checkSelection(assembly.selection);
  return assembly;
}
function manifestOf(metadata: unknown, input: SavedAssemblySourcesInput): AssemblySourceManifest {
  const manifest = readAssemblySourceManifest(assemblyMetadata(metadata, input).sources);
  if (!manifest || manifest.programId !== input.programId) unverified();
  return manifest;
}
function checkChainIdentity(row: Record<string, unknown>, input: SavedAssemblySourcesInput, position: Position) {
  if (row.action !== ACTION || row.table_name !== 'authoring_document' || row.record_id !== input.docId
    || row.target !== `authoring_document:${input.docId}` || row.chain_tenant_id !== input.organizationId
    || row.sequence !== position.sequence) unverified();
}
function chainEnvelope(row: Record<string, unknown>, input: SavedAssemblySourcesInput, position: Position): SequencedRowInput {
  checkChainIdentity(row, input, position);
  if (typeof row.payload_hash !== 'string' || !HASH.test(row.payload_hash) || typeof row.sha256_chain !== 'string' || !HASH.test(row.sha256_chain)
    || typeof row.target !== 'string' || typeof row.actor_id !== 'number' || !Number.isSafeInteger(row.actor_id) || row.actor_id <= 0) unverified();
  const occurredAt = row.occurred_at;
  if (!(occurredAt instanceof Date || typeof occurredAt === 'string') || !Number.isFinite(new Date(occurredAt).getTime())) unverified();
  return { action: ACTION, actor_id: row.actor_id, target: row.target, payload_hash: row.payload_hash,
    occurred_at: occurredAt, tenant_id: input.organizationId, sha256_chain: row.sha256_chain,
    hmac_seal: typeof row.hmac_seal === 'string' ? row.hmac_seal : null, chain_seq: position.sequence };
}

async function record(q: RequestSqlClient, input: SavedAssemblySourcesInput, position: Position): Promise<VerifiedRecord> {
  const result = await q.query(`SELECT t.doc_id::text,t.section_id::text,t.tenant_id,t.operation_type,t.before_content,t.after_content,
      t.content_hash_before,t.content_hash_after,t.change_reason,t.metadata,
      a.action,a.table_name,a.record_id,a.target,a.actor_id,a.tenant_id AS chain_tenant_id,a.payload_hash,a.sha256_chain,
      a.hmac_seal,a.occurred_at,to_jsonb(a)->>'chain_seq' AS sequence,a.new_values AS chain_details
    FROM authoring_audit_trail t JOIN audit_logs a ON a.id=$4 AND a.tenant_id=$2
    WHERE t.id=$3 AND t.doc_id=$1 AND t.tenant_id=$2`,
  [input.docId, input.organizationId, position.eventId, position.auditId]);
  if (result.rows.length !== 1) unverified();
  const row = result.rows[0]; const details = detailsOf(row, input, position);
  const envelope = chainEnvelope(row, input, position);
  if (verifyAuthoringTrailRow(storedTrail(row, position), details).intact !== true || hashPayload(details) !== row.payload_hash) unverified();
  const integrity = await verifySequencedRow(q, envelope);
  if (integrity.link !== 'linked' || !['valid', 'no-key'].includes(integrity.seal)) unverified();
  return { eventId: position.eventId, recordedAt: new Date(envelope.occurred_at).toISOString(),
    manifest: manifestOf(row.metadata, input), snapshot: stableStringify(row) };
}

async function read(q: RequestSqlClient, raw: SavedAssemblySourcesInput): Promise<SavedAssemblySources> {
  const input = inputSnapshot(raw);
  const admission = { organizationId: input.organizationId, userId: input.userId, programId: input.programId, documentId: input.docId };
  const scope = await getCurrentAuthoringReadScope(q, admission);
  if (!scope.documentIds.includes(input.docId)) throw new AuthoringReadScopeError(404, 'AUTHORING_DOCUMENT_NOT_FOUND', 'Document not found.');
  const position = await latest(q, input);
  const saved = position ? await record(q, input, position) : null;
  const verifySources = async () => {
    if (saved) await readSelectedAuthoringSources(q, input, saved.manifest.entries.map(entry => entry.source), { expectedManifest: saved.manifest });
  };
  await verifySources();
  await requireAuthoringReadScopeStillCurrent(q, admission, scope);
  const finalPosition = await latest(q, input);
  if (stableStringify(finalPosition) !== stableStringify(position)) changed();
  if (position && saved && (await record(q, input, position)).snapshot !== saved.snapshot) changed();
  await verifySources();
  await requireAuthoringReadScopeStillCurrent(q, admission, scope);
  if (stableStringify(await latest(q, input)) !== stableStringify(position)) changed();
  return { version: 1, docId: input.docId, programId: input.programId,
    record: saved ? { eventId: saved.eventId, recordedAt: saved.recordedAt, manifest: saved.manifest } : null };
}

export async function readSavedAuthoringAssemblySources(q: RequestSqlClient, input: SavedAssemblySourcesInput): Promise<SavedAssemblySources> {
  try { return await read(q, input); }
  catch (error) {
    if (error instanceof SavedAssemblySourcesError) throw error;
    if (error instanceof AssemblySourceError || error instanceof AuthoringReadScopeError || error instanceof ProgramReadAccessError) {
      throw new SavedAssemblySourcesError(error.status, error.code, error.message);
    }
    throw new SavedAssemblySourcesError(503, 'SAVED_ASSEMBLY_SOURCES_UNAVAILABLE', 'Saved document sources could not be verified. Check again before reusing them.');
  }
}
