/** Chat capture discovery applies current actor policy before counting and
 * limiting. The first pass reads identities only, never private file headers. */
import { AnaProjectScopeError } from '../ana/project-scope-admission.js';
import { assertAnaUploadAccess } from '../ana/source-context-admission.js';
import { assertAnaSourceProgramAllowed, type AdmittedAnaSourceReadScope, type AnaSourceReadScopeInput } from '../ana/source-read-scope.js';
import { capturedDataEligibleSql, capturedDispositionChoiceSql, capturedBinaryAvailableSql } from '../document-data-disposition/eligibility.js';
import { withAnaSourceReadScope } from './document-catalog-actor-access.js';
import { anaSourceScopeNotice } from './document-catalog-actor-reads.js';
import type { ChatUploadDigest, ChatUploadPage, Queryable } from './document-catalog.service.js';

export interface ActorChatUploadPage extends ChatUploadPage {
  total: number;
  withheld: number;
  actorFiltered: true;
  admittedScope: AdmittedAnaSourceReadScope;
  sourceAccessNotice: string;
}
const SHA = /^[0-9a-f]{64}$/i;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const identityFailure = (): never => {
  throw new AnaProjectScopeError(503, 'ANA_UPLOAD_IDENTITY_UNAVAILABLE', 'The exact authorized upload identity could not be verified. No complete file listing was produced.');
};
/** Same predicate in both identity admission and final counted page. Anchor
 * uniqueness covers all same-org rows, before intersecting allowed programs. */
function captureScopeSql(): string {
  return `s.organization_id=$1 AND s.deleted_at IS NULL AND s.source_type='client_document'
    AND s.is_current IS NOT FALSE AND ${capturedDataEligibleSql('s')}
    AND f.organization_id=$1
    AND (
      (source_project.regulatory_program_id=ANY($2::uuid[])
        AND rp.organization_id=$1 AND rp.deleted_at IS NULL
        AND (SELECT count(*) FROM projects all_anchor WHERE all_anchor.organization_id=$1
          AND all_anchor.regulatory_program_id=source_project.regulatory_program_id)=1)
      OR ($4::boolean AND s.client_program_id IS NULL AND s.client_workspace_id IS NULL
        AND s.provenance->>'origin'='chat_upload' AND s.created_by=$3 AND f.user_id=$3)
    )`;
}
function captureJoinsSql(): string {
  return `FROM cre_evidence_sources s
    JOIN file_uploads f ON f.id=s.provenance->>'fileUploadId' AND f.organization_id=s.organization_id
    LEFT JOIN concept2cure_artifacts source_artifact ON s.client_program_id IS NULL AND s.client_workspace_id IS NOT NULL
      AND source_artifact.organization_id=s.organization_id
      AND s.provenance->>'origin'='chat_upload' AND source_artifact.artifact_id=s.metadata->>'artifactId'
      AND source_artifact.metadata->>'fileId'=s.provenance->>'fileUploadId'
    LEFT JOIN projects source_project ON source_project.organization_id=s.organization_id
      AND ((s.client_program_id IS NOT NULL AND source_project.regulatory_program_id=s.client_program_id
          AND (s.client_workspace_id IS NULL OR s.client_workspace_id=source_project.client_workspace_id))
        OR (s.client_program_id IS NULL AND source_artifact.project_id=source_project.id
          AND s.client_workspace_id=source_project.id AND source_project.status<>'deleted'))
    LEFT JOIN regulatory_programs rp ON rp.id=source_project.regulatory_program_id AND rp.organization_id=s.organization_id`;
}
function checkUnboundCapture(row: Record<string, unknown>, scope: AdmittedAnaSourceReadScope): void {
  if (scope.projectId !== null || Number(row.upload_user_id) !== scope.userId || row.created_by !== scope.userId || row.source_origin !== 'chat_upload') identityFailure();
}
function checkLegacyCaptureBinding(row: Record<string, unknown>): void {
  if (row.source_origin !== 'chat_upload' || row.client_workspace_id !== row.source_project_id ||
      typeof row.source_artifact_ref !== 'string' || !row.source_artifact_ref ||
      row.source_artifact_id !== row.source_artifact_ref || row.source_artifact_file_id !== row.file_id ||
      row.source_artifact_project_id !== row.source_project_id || Number(row.artifact_binding_count) !== 1) identityFailure();
}
function checkBoundCapture(row: Record<string, unknown>, scope: AdmittedAnaSourceReadScope): void {
  if (!positive(row.source_project_id) || row.program_organization_id !== scope.organizationId || row.program_deleted_at !== null ||
      typeof row.resolved_program_id !== 'string' || Number(row.anchor_count) !== 1) identityFailure();
  if (row.client_program_id != null) {
    if (row.client_program_id !== row.resolved_program_id ||
      (row.client_workspace_id != null && row.client_workspace_id !== row.source_project_workspace_id)) identityFailure();
  } else checkLegacyCaptureBinding(row);

  assertAnaSourceProgramAllowed(scope, row.resolved_program_id);
}
function checkCaptureIdentity(row: Record<string, unknown>, scope: AdmittedAnaSourceReadScope): void {
  if (!positive(row.id) || row.organization_id !== scope.organizationId || row.upload_organization_id !== scope.organizationId ||
      typeof row.file_id !== 'string' || !row.file_id.trim()) identityFailure();
  if (row.client_program_id == null && row.client_workspace_id == null) checkUnboundCapture(row, scope);
  else checkBoundCapture(row, scope);
}
function checkCurrentCapture(row: Record<string, unknown>, scope: AdmittedAnaSourceReadScope, allowedFiles: readonly string[]): void {
  checkCaptureIdentity(row, scope);
  if (!allowedFiles.includes(String(row.file_id)) || typeof row.checksum !== 'string' || !SHA.test(row.checksum) ||
      row.checksum !== row.upload_checksum || row.is_current === false ||
      row.disposition === 'remove_data' || row.disposition === 'supersede') identityFailure();
}
function adaptCapture(row: Record<string, unknown>): ChatUploadDigest {
  const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  return {
    sourceId: Number(row.id), fileId: String(row.file_id),
    fileName: typeof meta.originalName === 'string' ? meta.originalName : typeof row.title === 'string' ? row.title : 'document',
    version: typeof row.version === 'string' ? row.version : null,
    extractionStatus: typeof row.extraction_status === 'string' && row.extraction_status ? row.extraction_status : 'unknown',
    dossier: meta.dossier ?? null, programId: typeof row.client_program_id === 'string' ? row.client_program_id : null,
    uploadedAt: String(row.created_at),
    ...(row.original_file_available === false ? { originalFileAvailable: false, sourceAccessNotice: 'Eligible extracted text retained; original file unavailable.' } : {}),
  };
}
async function admittedUploadFiles(q: Queryable, scope: AdmittedAnaSourceReadScope, candidates: Array<Record<string, unknown>>): Promise<string[]> {
  const allowedFiles: string[] = [];
  for (const row of candidates) {
    checkCaptureIdentity(row, scope);
    const fileId = String(row.file_id);
    if (allowedFiles.includes(fileId)) continue;
    try {
      await assertAnaUploadAccess(q, { organizationId: scope.organizationId, userId: scope.userId, fileIds: [fileId] });
      allowedFiles.push(fileId);
    } catch (error) {
      // Denied extra parents exclude this upload without disclosing them.
      // Unknown policy/SQL state remains unavailable.
      if (!(error instanceof AnaProjectScopeError) || error.status !== 403) throw error;
    }
  }
  return allowedFiles;
}
/** Internal admitted-scope primitive: q must be the same stamped connection
 * as canonical admission. Identity input cannot self-attest to a scope. */
export async function listChatUploadsInReadScope(
  q: Queryable,
  scope: AdmittedAnaSourceReadScope,
  opts: { limit?: number } = {},
): Promise<ActorChatUploadPage> {
  scope = Object.freeze({ ...scope, accessibleProgramIds: Object.freeze([...scope.accessibleProgramIds]) });
  const requestedLimit = opts.limit ?? 100;
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(200, Math.max(1, requestedLimit)) : 100;
  const params: unknown[] = [scope.organizationId, [...scope.accessibleProgramIds], scope.userId, scope.projectId === null];
  const identities = `s.id, s.organization_id, s.client_program_id, s.client_workspace_id, s.created_by,
    s.provenance->>'origin' AS source_origin,
    f.id AS file_id, f.organization_id AS upload_organization_id, f.user_id AS upload_user_id,
    source_project.id AS source_project_id, source_project.client_workspace_id AS source_project_workspace_id,
    source_project.regulatory_program_id AS resolved_program_id,
    s.metadata->>'artifactId' AS source_artifact_ref,
    source_artifact.artifact_id AS source_artifact_id, source_artifact.metadata->>'fileId' AS source_artifact_file_id,
    source_artifact.project_id AS source_artifact_project_id,
    (SELECT count(*) FROM concept2cure_artifacts all_binding JOIN projects binding_project
      ON binding_project.id=all_binding.project_id AND binding_project.organization_id=all_binding.organization_id
      WHERE all_binding.organization_id=$1 AND all_binding.artifact_id=s.metadata->>'artifactId'
        AND all_binding.metadata->>'fileId'=s.provenance->>'fileUploadId'
        AND binding_project.status<>'deleted') AS artifact_binding_count,
    rp.organization_id AS program_organization_id, rp.deleted_at AS program_deleted_at,
    (SELECT count(*) FROM projects all_anchor WHERE all_anchor.organization_id=$1
      AND all_anchor.regulatory_program_id=source_project.regulatory_program_id) AS anchor_count`;
  const candidateRows = await q.query(`SELECT ${identities} ${captureJoinsSql()} WHERE ${captureScopeSql()} ORDER BY s.id`, params);
  // No org-wide top-N is filtered after the fact. Canonical upload admission
  // examines every recorded parent before the final count/rank/LIMIT query.
  const allowedFiles = await admittedUploadFiles(q, scope, candidateRows.rows);
  params.push(allowedFiles, limit);
  const page = await q.query(`SELECT ${identities}, s.title, s.version, s.extraction_status, s.provenance, s.metadata, s.created_at,
    s.checksum, f.checksum_sha256 AS upload_checksum, s.is_current,
    ${capturedDispositionChoiceSql('s')} AS disposition,
    ${capturedBinaryAvailableSql('s')} AS original_file_available,
    COUNT(*) OVER () AS scope_total
    ${captureJoinsSql()} WHERE ${captureScopeSql()} AND f.id=ANY($5::text[])
    ORDER BY s.created_at DESC, s.id DESC LIMIT $6`, params);
  const uploads = page.rows.map(row => {
    checkCurrentCapture(row, scope, allowedFiles);
    return adaptCapture(row);
  });
  // Counts include rows outside this returned page. Repeat admission over the
  // complete pre-count admitted file set, so a newly private parent on an
  // unreturned upload cannot leave a stale supposedly authorized total.
  for (const fileId of allowedFiles) {
    await assertAnaUploadAccess(q, { organizationId: scope.organizationId, userId: scope.userId, fileIds: [fileId] });
  }
  const total = page.rows.length ? Number(page.rows[0].scope_total) : 0;
  if (!Number.isSafeInteger(total) || total < uploads.length || page.rows.some(row => Number(row.scope_total) !== total)) identityFailure();
  return { uploads, total, withheld: total - uploads.length, hasMore: total > uploads.length,
    actorFiltered: true, admittedScope: scope, sourceAccessNotice: anaSourceScopeNotice(scope) };
}
export function listChatUploadsForActor(input: AnaSourceReadScopeInput, opts: { limit?: number } = {}): Promise<ActorChatUploadPage> {
  const pinned = { organizationId: input.organizationId, userId: input.userId, projectId: input.projectId,
    projectRef: input.projectRef, requestedProgramId: input.requestedProgramId };
  const limit = opts.limit;
  return withAnaSourceReadScope(pinned, (q, scope) => listChatUploadsInReadScope(q, scope, { limit }));
}
