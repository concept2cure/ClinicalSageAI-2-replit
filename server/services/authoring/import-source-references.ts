/** A working copy keeps its exact original dependency through later exports.
 * Keeping extracted data permits renditions; withdrawing data does not. */
import { isWorkflowImportOrigin, type AuthoringImportOrigin, type WorkflowImportOrigin } from '../../../shared/authoring/source-import';
import { isDeepStrictEqual } from 'node:util';
import { authorizeAuthoringProgram } from './authoring-program-access';
import type { AuthoringActor } from './authoring-documents';
import { materializeWorkflowSource, type MaterializedWorkflowSource } from './workflow-source-import';
import { capturedDataEligibleSql, vaultDataEligibleSql } from '../document-data-disposition/eligibility';
import { programInOrganization } from '../c2c/program-access';
import type { Queryable } from './authoring-evidence';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;

function hasWorkflowIdentity(source: WorkflowImportOrigin): boolean {
  return /^[1-9]\d*$/.test(source.id) && HASH.test(source.fingerprint)
    && source.selection?.kind === source.kind && String(source.kind === 'protocol' && source.selection.kind === 'protocol' ? source.selection.documentId : source.selection.kind === 'csr' ? source.selection.jobId : '') === source.id
    && Array.isArray(source.sectionOrigins) && source.sectionOrigins.length > 0
    && source.sectionOrigins.every(s => typeof s.code === 'string' && HASH.test(s.contentSha256) && ['machine', 'template', 'unknown'].includes(s.originalAuthorship))
    && Array.isArray(source.gaps) && source.gaps.every(g => typeof g === 'string');
}

function hasVerifiedImportIdentity(source: AuthoringImportOrigin): boolean {
  if (isWorkflowImportOrigin(source)) return hasWorkflowIdentity(source);
  if (typeof source.id !== 'string' || typeof source.sha256 !== 'string' || !HASH.test(source.sha256)) return false;
  if (source.kind === 'vault') return UUID.test(source.id);
  return source.kind === 'data-room' && /^[1-9]\d*$/.test(source.id);
}

function importMatchesProject(source: AuthoringImportOrigin, programId: unknown): boolean {
  return typeof programId === 'string' && UUID.test(programId) && typeof source.programId === 'string'
    && source.programId.toLowerCase() === programId.toLowerCase();
}

export function savedImportSource(doc: { provenance?: unknown; client_program_id?: unknown }): AuthoringImportOrigin | null {
  const provenance = doc.provenance;
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null;
  const value = (provenance as Record<string, unknown>).importSource;
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved import origin');
  const source = value as AuthoringImportOrigin;
  if (!importMatchesProject(source, doc.client_program_id) || !hasVerifiedImportIdentity(source)) {
    throw new Error('Invalid saved import identity or version');
  }
  return source;
}

export async function verifySavedImportSource(doc: { provenance?: unknown; client_program_id?: unknown }, q: Queryable, organizationId: number, actor?: AuthoringActor): Promise<void> {
  const source = savedImportSource(doc);
  if (!source) return;
  if (isWorkflowImportOrigin(source)) {
    if (!actor) throw new Error('Current workflow source actor required');
    await verifySavedWorkflowImport(doc, q, { organizationId, actor });
    return;
  }
  // A retained document grant does not grant perpetual access to its private
  // project sources. Interactive consumers supply their verified current actor.
  if (actor) await authorizeAuthoringProgram(q, { tenantId: organizationId, actor, programId: source.programId, forWrite: false });
  else if (!(await programInOrganization(q, source.programId, organizationId))) throw new Error('Imported source project unavailable');
  const result = source.kind === 'vault'
    ? await q.query(`SELECT d.content_hash AS hash FROM vault.documents d
        WHERE d.id=$1 AND d.program_id=$2 AND d.deleted_at IS NULL
          AND to_jsonb(d)->>'organization_id'=$3::text AND ${vaultDataEligibleSql('d')} FOR SHARE OF d`,
      [source.id, source.programId, organizationId])
    : await q.query(`SELECT s.checksum AS hash FROM cre_evidence_sources s
        WHERE s.id=$1 AND s.client_program_id=$2 AND s.organization_id=$3
          AND s.source_type='client_document' AND s.is_current IS NOT FALSE AND s.deleted_at IS NULL
          AND ${capturedDataEligibleSql('s')} FOR SHARE OF s`, [source.id, source.programId, organizationId]);
  if (result.rows.length !== 1 || String(result.rows[0].hash ?? '').trim().toLowerCase() !== source.sha256.toLowerCase()) {
    throw new Error('Imported source unavailable or changed');
  }
}

/** Current source/target access and snapshot verification for governance callers.
 * The receipt does not confer perpetual project access or scientific qualification. */
export async function verifySavedWorkflowImport(doc: { provenance?: unknown; client_program_id?: unknown }, q: Queryable,
  input: { organizationId: number; actor: AuthoringActor }): Promise<MaterializedWorkflowSource | null> {
  const origin = savedImportSource(doc);
  if (!origin || !isWorkflowImportOrigin(origin)) return null;
  const target = await authorizeAuthoringProgram(q, { tenantId: input.organizationId, actor: input.actor, programId: origin.programId, forWrite: false });
  const current = await materializeWorkflowSource({ organizationId: input.organizationId, userId: Number(input.actor.id),
    target: { programId: origin.programId, projectId: target.projectId }, source: origin.selection,
    ...(origin.association.reason ? { associationReason: origin.association.reason } : {}) }, q);
  if (current.fingerprint !== origin.fingerprint) throw new Error('Imported workflow source changed or unavailable');
  if (!isDeepStrictEqual(current.origin.sectionOrigins, origin.sectionOrigins)
    || !isDeepStrictEqual(current.origin.sourceScope, origin.sourceScope)) throw new Error('Stored workflow origin annotations do not match the verified source');
  return current;
}
