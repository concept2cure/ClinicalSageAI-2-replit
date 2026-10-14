/** Keep recorded project scope attached to an exact source or upload until
 * current access has been checked. No titles, extracted text or bytes here. */
import type { RequestSqlClient } from '../../db/requestDb';
import { admitAnaProjectScope, AnaProjectScopeError } from './project-scope-admission';
import { admitRecordedCreSourceScope, SourceReadAccessError } from '../clinical-regulatory-evidence/source-read-access';
import { requireCurrentProgramAccess, ProgramReadAccessError } from '../c2c/current-program-access';
import { AUTHORING_IMAGE_URL_PREFIX, isGovernedImageRef } from '../../../shared/authoring/figure-refs';
import { exportImageSrcs, imageReadingsDiffer } from '../authoring/authoring-html-sanitizer';
import type { StoredTrailRow } from '../authoring/authoring-evidence';
import { hashPayload } from '../audit/chain';
import { verifySequencedRow } from '../audit/chain-row';

interface SourceActor { organizationId: unknown; userId: unknown }
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
const deny = (): never => { throw new AnaProjectScopeError(403, 'ANA_SOURCE_ACCESS_DENIED', 'You do not have current access to the selected source.'); };
const unavailable = (): never => { throw new AnaProjectScopeError(503, 'ANA_SOURCE_ACCESS_UNAVAILABLE', 'Selected source access could not be verified. AnA has not read its content.'); };
const unverifiedFigure = (): never => { throw new AnaProjectScopeError(409, 'ANA_LEGACY_FIGURE_ASSOCIATION_UNVERIFIED', 'This figure’s original document association could not be verified. Request the original uploader to replace the figure through the current editor. A signed document needs a new version and review.'); };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function trailRow(row: Record<string, unknown>): StoredTrailRow | null {
  if (typeof row.id !== 'string' || typeof row.operation_type !== 'string' ||
      (row.before_content != null && typeof row.before_content !== 'string') ||
      (row.after_content != null && typeof row.after_content !== 'string')) return null;
  return { id: row.id, operation_type: row.operation_type,
    before_content: typeof row.before_content === 'string' ? row.before_content : null,
    after_content: typeof row.after_content === 'string' ? row.after_content : null,
    content_hash_before: typeof row.content_hash_before === 'string' ? row.content_hash_before : null,
    content_hash_after: typeof row.content_hash_after === 'string' ? row.content_hash_after : null,
    change_reason: typeof row.change_reason === 'string' ? row.change_reason : null, metadata: row.metadata };
}

async function legacyChainDetailsMatch(chain: Record<string, unknown>, candidate: Record<string, unknown>, upload: Record<string, unknown>, trail: StoredTrailRow): Promise<boolean> {
  const { verifyAuthoringTrailRow } = await import('../authoring/authoring-evidence');
  const details = record(chain.new_values);
  if (!details) return false;
  return details.docId === String(candidate.doc_id) && (details.sectionId ?? null) === (candidate.section_id ?? null) &&
    Number(chain.actor_id) === Number(upload.user_id) && Number(chain.user_id) === Number(upload.user_id) &&
    hashPayload(details) === chain.payload_hash && verifyAuthoringTrailRow(trail, details).intact === true;
}

async function verifyLegacyChainPosition(q: RequestSqlClient, chain: Record<string, unknown>, actor: SourceActor, upload: Record<string, unknown>): Promise<void> {
  const occurredAt = chain.occurred_at;
  if (typeof chain.action !== 'string' || typeof chain.target !== 'string' || typeof chain.payload_hash !== 'string' ||
      !(occurredAt instanceof Date || typeof occurredAt === 'string')) return unverifiedFigure();
  const seq = chain.chain_seq;
  const position = await verifySequencedRow(q, { action: chain.action, actor_id: Number(upload.user_id), target: chain.target,
    payload_hash: chain.payload_hash, occurred_at: occurredAt, tenant_id: Number(actor.organizationId),
    sha256_chain: typeof chain.sha256_chain === 'string' ? chain.sha256_chain : null,
    hmac_seal: typeof chain.hmac_seal === 'string' ? chain.hmac_seal : null,
    chain_seq: typeof seq === 'number' || typeof seq === 'string' || typeof seq === 'bigint' ? seq : null });
  if (position.link !== 'linked' || (position.seal !== 'valid' && position.seal !== 'no-key')) return unverifiedFigure();
}

async function verifyLegacyInsertion(q: RequestSqlClient, actor: SourceActor, upload: Record<string, unknown>,
  candidate: Record<string, unknown>, reference: string): Promise<boolean> {
  const { admitAuthoringImageDocument } = await import('../authoring/authoring-image-import');
  await admitAuthoringImageDocument(q, { ...actor, documentId: candidate.doc_id, action: 'view' });
  const retained = await q.query('SELECT * FROM authoring_audit_trail WHERE id=$1 AND tenant_id=$2 AND actor_id=$3',
    [candidate.id, actor.organizationId, String(upload.user_id)]);
  const row = retained.rows.length === 1 ? retained.rows[0] : null;
  const trail = row ? trailRow(row) : null;
  if (!trail) return unverifiedFigure();
  if (!exportImageSrcs(trail.after_content ?? '').includes(reference)) return false;
  if (exportImageSrcs(trail.before_content ?? '').includes(reference)) return false;
  if (await imageReadingsDiffer(trail.after_content ?? '') !== null) return unverifiedFigure();
  const chained = await q.query(`SELECT * FROM audit_logs WHERE tenant_id=$1
    AND new_values->>'trailId'=$2 AND action=$3 AND table_name=$4 AND record_id=$5`,
  [actor.organizationId, trail.id, 'authoring.section.' + trail.operation_type,
    candidate.section_id == null ? 'authoring_document' : 'authoring_section', String(candidate.section_id ?? candidate.doc_id)]);
  if (chained.rows.length !== 1 || !await legacyChainDetailsMatch(chained.rows[0], candidate, upload, trail)) return unverifiedFigure();
  await verifyLegacyChainPosition(q, chained.rows[0], actor, upload);
  return true;
}

/** Only an immutable, chained insertion by the original uploader establishes
 * a legacy figure parent. A later editor's mutable HTML is never a grant. */
async function admitLegacyFigure(q: RequestSqlClient, actor: SourceActor, upload: Record<string, unknown>): Promise<boolean> {
  const reference = AUTHORING_IMAGE_URL_PREFIX + String(upload.id);
  if (!isGovernedImageRef(reference) || !positiveId(Number(upload.user_id))) return false;
  // Identity-only first. Read private content only after the caller is admitted
  // to each candidate's current document and project.
  const candidates = await q.query(`SELECT id, doc_id, section_id FROM authoring_audit_trail
    WHERE tenant_id=$1 AND actor_id=$2 AND after_content LIKE $3 ORDER BY created_at,id`,
  [actor.organizationId, String(upload.user_id), '%' + reference + '%']);
  let established = false;
  for (const candidate of candidates.rows) {
    // Check every original retained parent; never pick a later public copy.
    const verified = await verifyLegacyInsertion(q, actor, upload, candidate, reference);
    established = verified || established;
  }
  return established;
}

async function activeActor(q: RequestSqlClient, actor: SourceActor): Promise<{ organizationId: number; userId: number }> {
  if (!positiveId(actor.organizationId) || !positiveId(actor.userId)) return deny();
  const { rows } = await q.query(`SELECT ou.user_id FROM organization_users ou
    JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
    WHERE ou.organization_id = $1 AND ou.user_id = $2 AND u.status = 'active' AND o.status = 'active'`,
  [actor.organizationId, actor.userId]);
  if (rows.length !== 1) return deny();
  return { organizationId: actor.organizationId, userId: actor.userId };
}

async function admitRecordedScope(q: RequestSqlClient, actor: {organizationId:number;userId:number}, row: Record<string, unknown>): Promise<void> {
  try {
    if (row.scope_kind==='artifact') {
      // Actual artifacts record projects.id in project_id; this is not a workspace field.
      if (!positiveId(Number(row.project_id))) throw new SourceReadAccessError(409,'SOURCE_PARENT_UNRESOLVED','The artifact needs a verified recorded project.');
      const admitted=await admitAnaProjectScope(q,{...actor,projectId:Number(row.project_id)});
      if (!admitted.programId) throw new SourceReadAccessError(409,'SOURCE_PARENT_UNRESOLVED','The artifact needs a verified program relationship.');
      const current=await requireCurrentProgramAccess(q,{...actor,programId:admitted.programId});
      if (current.projectId!==Number(row.project_id)) throw new SourceReadAccessError(409,'SOURCE_PARENT_UNRESOLVED','The artifact project relationship is ambiguous.');
      return;
    }
    // source.client_workspace_id is compared with the recorded anchor workspace,
    // or resolved through its exact immutable chat artifact association. Never
    // pass it as projectId simply because both columns happen to be integers.
    await admitRecordedCreSourceScope(q,actor,row);
  } catch(error) {
    if (error instanceof SourceReadAccessError || error instanceof ProgramReadAccessError) {
      if (error.status===503) return unavailable();
      if (error.status===409) throw new AnaProjectScopeError(409,'ANA_SOURCE_SCOPE_UNRESOLVED','This selected source needs a verified recorded parent before AnA can read it.');
      return deny();
    }
    throw error;
  }
}

function exactSourceIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new AnaProjectScopeError(400, 'ANA_SOURCE_SELECTION_INVALID', 'Choose at most 20 exact source identifiers.');
  }
  const ids = value.map(id => typeof id === 'string' && /^[1-9]\d*$/.test(id) ? Number(id) : id);
  if (!ids.every(positiveId)) throw new AnaProjectScopeError(400, 'ANA_SOURCE_SELECTION_INVALID', 'Choose valid source identifiers.');
  return [...new Set(ids)];
}

export async function admitAnaSelectedSources(q: RequestSqlClient, input: SourceActor & { sourceIds: unknown }): Promise<void> {
  const ids = exactSourceIds(input.sourceIds);
  if (!ids.length) return;
  try {
    const actor = await activeActor(q, input);
    const { rows } = await q.query(`SELECT id, organization_id, visibility_class, source_type, client_program_id, client_workspace_id,
        jsonb_build_object('origin',provenance->>'origin','fileUploadId',provenance->>'fileUploadId','authoringDocumentId',provenance->>'authoringDocumentId') AS provenance,
        jsonb_build_object('artifactId',metadata->>'artifactId') AS metadata
      FROM cre_evidence_sources WHERE id = ANY($1::int[]) AND deleted_at IS NULL
        AND (organization_id = $2 OR (organization_id IS NULL AND visibility_class = 'global_public'))`, [ids, actor.organizationId]);
    if (rows.length !== ids.length) return deny();
    for (const row of rows) {
      if (row.organization_id == null && row.visibility_class === 'global_public') continue;
      await admitRecordedScope(q, actor, row);
    }
  } catch (error) {
    if (error instanceof AnaProjectScopeError) throw error;
    return unavailable();
  }
}

export async function assertAnaUploadAccess(q: RequestSqlClient, input: SourceActor & { fileIds: string[] }): Promise<void> {
  if (!Array.isArray(input.fileIds) || input.fileIds.length > 20 || input.fileIds.some(id => typeof id !== 'string' || !id.trim())) {
    throw new AnaProjectScopeError(400, 'ANA_ATTACHMENT_SELECTION_INVALID', 'Choose at most 20 valid attachment identifiers.');
  }
  const ids = [...new Set(input.fileIds)];
  if (!ids.length) return;
  try {
    const actor = await activeActor(q, input);
    const { rows } = await q.query(`SELECT id, user_id FROM file_uploads WHERE organization_id = $1 AND id = ANY($2::text[])`, [actor.organizationId, ids]);
    if (rows.length !== ids.length) return deny();
    const scopes = await q.query(`SELECT provenance->>'fileUploadId' AS file_id, client_program_id, client_workspace_id, NULL::int AS project_id,
        jsonb_build_object('origin',provenance->>'origin','fileUploadId',provenance->>'fileUploadId','authoringDocumentId',provenance->>'authoringDocumentId') AS provenance,
        jsonb_build_object('artifactId',metadata->>'artifactId') AS metadata,source_type,'cre'::text AS scope_kind
      FROM cre_evidence_sources WHERE organization_id = $1 AND provenance->>'fileUploadId' = ANY($2::text[])
      UNION ALL
      SELECT metadata->>'fileId' AS file_id, NULL::uuid AS client_program_id, NULL::int AS client_workspace_id, project_id, NULL::jsonb AS provenance,NULL::jsonb AS metadata,NULL::text AS source_type,'artifact'::text AS scope_kind
      FROM concept2cure_artifacts WHERE organization_id = $1 AND metadata->>'fileId' = ANY($2::text[])`, [actor.organizationId, ids]);
    for (const upload of rows) {
      const recorded = scopes.rows.filter(scope => scope.file_id === upload.id);
      if (!recorded.length) {
        // Preserve the existing creator-only read for genuinely unbound bytes,
        // including opaque legacy figures the uploader needs to replace. A
        // recorded CRE/artifact parent is always enforced, even for its creator.
        if (Number(upload.user_id) !== actor.userId && !await admitLegacyFigure(q, actor, upload)) return deny();
      } else {
        for (const scope of recorded) await admitRecordedScope(q, actor, scope);
      }
    }
  } catch (error) {
    if (error instanceof AnaProjectScopeError) throw error;
    return unavailable();
  }
}
