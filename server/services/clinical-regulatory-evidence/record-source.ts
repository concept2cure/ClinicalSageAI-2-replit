/** Native-record projection on the existing source spine, not a second catalogue.
 * The QMS reader owns admission/content. The source writer owns capture/audit/
 * version chains. File processing is deliberately not involved: these are exact
 * native facts, with no uploaded original and no inferred approval. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { pool } from '../../db';
import type { RequestSqlClient } from '../../db/requestDb';
import { requireCurrentProgramAccess, ProgramReadAccessError } from '../c2c/current-program-access';
import { lockDocumentDispositionProgram } from '../document-data-disposition/program-lock';
import { createSource } from './evidence-spine.service';
import { recordSupersession } from './data-room-capture-audit';
import { SourceReadAccessError } from './source-read-access';

export interface NativeRecordSnapshot {
  key: string;
  title: string;
  text: string;
  version: string | null;
  sourceScope: 'project' | 'organization';
  native: { kind: string; id: string; authoringDocumentId?: string };
  lifecycle: string;
}
export interface NativeRecordScope {
  organizationId: number;
  programId: string;
  workArea: 'quality';
}
export const NATIVE_RECORD_ORIGIN = 'native_record_snapshot';
export const nativeRecordHash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
export const NATIVE_RECORD_REVISION = 'quality-evidence:v1';

function receipt(scope: NativeRecordScope, record: NativeRecordSnapshot) {
  return { version: 1, renderer: NATIVE_RECORD_REVISION, workArea: scope.workArea, key: record.key,
    sourceScope: record.sourceScope, native: record.native, lifecycle: record.lifecycle };
}
function validIdentity(r: NativeRecordSnapshot): boolean {
  return !!r && typeof r.key === 'string' && !!r.key.trim() && r.key.length <= 200
    && !!r.native && typeof r.native.kind === 'string' && !!r.native.kind && typeof r.native.id === 'string' && !!r.native.id;
}
function validContent(r: NativeRecordSnapshot): boolean {
  return typeof r.text === 'string' && !!r.text.trim() && r.text.length <= 2_000_000
    && Buffer.from(r.text, 'utf8').toString('utf8') === r.text && typeof r.title === 'string' && !!r.title.trim() && r.title.length <= 1000;
}
function validDescription(r: NativeRecordSnapshot): boolean {
  return ['project', 'organization'].includes(r.sourceScope) && typeof r.lifecycle === 'string' && !!r.lifecycle
    && (r.version === null || typeof r.version === 'string');
}
function validate(records: NativeRecordSnapshot[]) {
  if (!Array.isArray(records) || records.length > 5000) throw new Error('NATIVE_RECORD_LIMIT');
  const keys = new Set<string>();
  for (const r of records) {
    if (!validIdentity(r) || !validContent(r) || !validDescription(r) || keys.has(r.key)) throw new Error('NATIVE_RECORD_INVALID');
    keys.add(r.key);
  }
}
/** Caller owns the admitted project's transaction and disposition lock. A
 * missing record is never retired: it may be private to another actor. Native
 * admission/freshness excludes withdrawn or inaccessible records at read time. */
export async function reconcileRecordSources(q: RequestSqlClient, scope: NativeRecordScope, records: NativeRecordSnapshot[]) {
  validate(records);
  const current = await q.query(`SELECT id,checksum,provenance FROM cre_evidence_sources
    WHERE organization_id=$1 AND client_program_id=$2 AND source_type='client_document'
      AND provenance->>'origin'=$3 AND provenance->'recordSnapshot'->>'workArea'=$4
      AND is_current IS NOT FALSE AND deleted_at IS NULL FOR UPDATE`,
  [scope.organizationId, scope.programId, NATIVE_RECORD_ORIGIN, scope.workArea]);
  const byKey = new Map<string, Record<string, any>>();
  for (const row of current.rows) {
    const provenance = row.provenance as { recordSnapshot?: { key?: unknown } } | null;
    const key = provenance?.recordSnapshot?.key;
    if (typeof key !== 'string' || byKey.has(key)) throw new Error('NATIVE_RECORD_CHAIN_AMBIGUOUS');
    byKey.set(key, row);
  }
  const result = { created: 0, unchanged: 0, superseded: 0 };
  for (const record of records) {
    const prior = byKey.get(record.key);
    const checksum = nativeRecordHash(record.text);
    const snapshot = receipt(scope, record);
    if (prior?.checksum === checksum && stableStringify(prior.provenance.recordSnapshot) === stableStringify(snapshot)) { result.unchanged++; continue; }
    if (prior) await q.query('UPDATE cre_evidence_sources SET is_current=FALSE WHERE id=$1 AND organization_id=$2 AND is_current IS NOT FALSE', [prior.id, scope.organizationId]);
    const source = await createSource(scope.organizationId, {
      sourceType: 'client_document', clientProgramId: scope.programId,
      title: record.title, sourceRecordIdentifier: record.key, checksum, version: record.version,
      previousVersionId: prior ? Number(prior.id) : null,
      provenance: { origin: NATIVE_RECORD_ORIGIN, extractionMethod: 'native-record-projection', recordSnapshot: snapshot },
      metadata: { dossier: { evidenceKind: 'qms' }, nativeRecord: true,
        sourceScope: record.sourceScope, lifecycle: record.lifecycle, originalFileAvailable: false },
      ingestionStatus: 'ingested', extractionStatus: 'extracted', extractedText: record.text,
    }, q);
    if (prior) { await recordSupersession(q, scope.organizationId, Number(prior.id), source, null); result.superseded++; }
    result.created++;
  }
  return result;
}
/** Reconcile old and current native records on the first catalogue page. This
 * is an audited derived projection, not an approval or a mutation of QMS. */
export async function syncQualityProjectSources(input: { organizationId: number; programId: string; userId: number | undefined }) {
  if (!Number.isSafeInteger(input.userId) || !input.userId || input.userId <= 0) throw new SourceReadAccessError(403, 'SOURCE_ACTOR_REQUIRED', 'A current actor is required.');
  const actor = { ...input, userId: input.userId };
  const q = await pool.connect();
  let poisoned: Error | undefined;
  try {
    await q.query('BEGIN');
    await lockDocumentDispositionProgram(q, input.organizationId, input.programId);
    await requireCurrentProgramAccess(q, { ...input, forShare: true });
    const { readQualityProjectEvidence } = await import('../qms/project-evidence');
    const records = await readQualityProjectEvidence(q, actor);
    const result = await reconcileRecordSources(q, { ...input, workArea: 'quality' }, records);
    await requireCurrentProgramAccess(q, { ...input, forShare: true });
    await q.query('COMMIT');
    return result;
  } catch (error) {
    await q.query('ROLLBACK').catch(rollback => { poisoned = rollback instanceof Error ? rollback : new Error('Native source rollback unconfirmed'); });
    if (error instanceof ProgramReadAccessError || error instanceof SourceReadAccessError) throw error;
    throw new SourceReadAccessError(503, 'QUALITY_SOURCE_PROJECTION_UNAVAILABLE', 'Current Quality sources could not be verified. No partial catalogue was supplied.');
  } finally { q.release(poisoned); }
}

type NativeIdentityRow = Record<string, any>;
function nativeReceipt(row: NativeIdentityRow) {
  const snapshot = row.provenance?.recordSnapshot;
  if (!snapshot || snapshot.version !== 1 || snapshot.renderer !== NATIVE_RECORD_REVISION || snapshot.workArea !== 'quality'
    || typeof row.client_program_id !== 'string' || typeof snapshot.key !== 'string' || !snapshot.native) {
    throw new SourceReadAccessError(409, 'NATIVE_SOURCE_IDENTITY_INVALID', 'This native source needs a verified recorded parent.');
  }
  return snapshot;
}
async function verifyRetainedText(q: RequestSqlClient, organizationId: number, row: NativeIdentityRow): Promise<void> {
  const retained = await q.query(`SELECT extracted_text AS native_text FROM cre_evidence_sources
    WHERE id=$1 AND organization_id=$2 AND client_program_id=$3 AND checksum=$4
      AND provenance->'recordSnapshot'=$5::jsonb AND is_current IS NOT DISTINCT FROM $6
      AND deleted_at IS NULL`, [row.id, organizationId, row.client_program_id, row.checksum,
    JSON.stringify(row.provenance.recordSnapshot), row.is_current]);
  const text = retained.rows[0]?.native_text;
  if (retained.rows.length !== 1 || typeof text !== 'string' || nativeRecordHash(text) !== row.checksum) {
    throw new SourceReadAccessError(409, 'NATIVE_SOURCE_IDENTITY_INVALID', 'The native source’s retained text no longer matches its recorded digest.');
  }
}
function nativeAdmissionFailure(error: unknown): never {
  if (error instanceof SourceReadAccessError) throw error;
  if (error && typeof error === 'object' && 'status' in error && [403,404,409].includes(Number(error.status))) {
    throw new SourceReadAccessError(Number(error.status) as 403 | 404 | 409, 'NATIVE_SOURCE_ACCESS_DENIED', 'This native source is unavailable with current access.');
  }
  throw new SourceReadAccessError(503, 'NATIVE_SOURCE_ACCESS_UNAVAILABLE', 'Current Quality evidence could not be verified. No native source was supplied.');
}
/** One closure per read invocation, bound to its actor and executor. Only
 * admitted projects/objects are read to prose. A later end-of-read check creates
 * another closure, so changed facts or revoked grants cannot use this cache. */
export function createNativeRecordAdmission(q: RequestSqlClient, input: { organizationId: number; userId: number }) {
  const projects = new Map<string, Promise<NativeRecordSnapshot[]>>();
  const readProject = async (programId: string) => {
    let read = projects.get(programId);
    if (!read) {
      const { readQualityProjectEvidence } = await import('../qms/project-evidence');
      read = readQualityProjectEvidence(q, { ...input, programId }); projects.set(programId, read);
    }
    return read;
  };
  return async (row: NativeIdentityRow): Promise<void> => {
    if (row.provenance?.origin !== NATIVE_RECORD_ORIGIN) return;
    const snapshot = nativeReceipt(row);
    try {
      const { authorizeQualityEvidenceSnapshot } = await import('../qms/project-evidence');
      const actor = { ...input, programId: row.client_program_id as string };
      if (row.is_current === false && snapshot.native.authoringDocumentId) {
        await authorizeQualityEvidenceSnapshot(q, actor, snapshot.native);
      } else {
        const admitted = await readProject(actor.programId);
        if (row.is_current === false) {
          if (!admitted.some(record => record.native.kind === snapshot.native.kind && record.native.id === snapshot.native.id)) await authorizeQualityEvidenceSnapshot(q, actor, snapshot.native);
        } else {
          const current = admitted.find(record => record.key === snapshot.key);
          if (!current) {
            // Absence from the actor-admitted projection cannot distinguish a
            // missing record from a denied object. Reveal neither to a list.
            throw new SourceReadAccessError(404, 'NATIVE_SOURCE_NOT_AVAILABLE', 'This native source is unavailable with current access.');
          }
          if (nativeRecordHash(current.text) !== row.checksum || stableStringify(receipt({ ...actor, workArea: 'quality' }, current)) !== stableStringify(snapshot)) {
            throw new SourceReadAccessError(409, 'NATIVE_SOURCE_CHANGED', 'The Quality record changed or is no longer available. Refresh the project catalogue before using it.');
          }
        }
      }
      await verifyRetainedText(q, input.organizationId, row);
    } catch (error) { nativeAdmissionFailure(error); }
  };
}
