/**
 * Clinical Regulatory Evidence spine — org-scoped persistence + query.
 *
 * The one write/read path for the cre_* tables. Enforces the §13 visibility
 * boundary by construction: reads see GLOBAL_PUBLIC (organization_id IS NULL)
 * PLUS the caller's own org; writes are stamped with the caller's org unless an
 * explicit governed global write is requested. Also enforces the §4.7 inferred-
 * relationship rule and the §4.8 no-single-source-generalized-lesson rule.
 *
 * Raw SQL over the shared pool, matching the codebase's service convention.
 *
 * @module server/services/clinical-regulatory-evidence/evidence-spine.service
 */

import { pool } from '../../db';
import {
  SOURCE_TYPES, VISIBILITY_CLASSES, OUTCOME_TYPES, RELATIONSHIP_TYPES, ENTITY_TYPES,
  INGESTION_STATUSES, EXTRACTION_STATUSES,
  type EvidenceSource, type ClinicalStudy, type RegulatoryFinding, type RegulatoryOutcome,
  type EvidenceRelationship, type DesignLesson, type SourceType, type VisibilityClass,
  type OutcomeType, type RelationshipType, type EntityType,
  type IngestionStatus, type ExtractionStatus,
} from './types';

export class EvidenceSpineError extends Error {}

/** Reads see global-public rows (org NULL) plus the caller's own org. Returns a
 *  SQL fragment + the param; callers append it to their WHERE.
 *
 *  Exported so sibling services in this directory reuse the one predicate rather
 *  than re-typing it. A tenancy rule copied per call site is how the file_uploads
 *  contract ended up with four different answers (see #1102). */
export function visibleOrgClause(orgId: number, startIndex: number): { sql: string; param: number } {
  return { sql: `(organization_id IS NULL OR organization_id = $${startIndex})`, param: orgId };
}

/** Resolve the organization_id a write is stamped with. A GLOBAL_PUBLIC write
 *  (org NULL) is only allowed when explicitly requested — the public FDA CRL
 *  corpus is curated, not minted by ordinary tenant traffic. */
function writeOrg(orgId: number, visibility: VisibilityClass): number | null {
  return visibility === 'global_public' ? null : orgId;
}

function assertOneOf<T extends string>(value: T, allowed: readonly T[], field: string): void {
  if (!allowed.includes(value)) {
    throw new EvidenceSpineError(`${field} must be one of: ${allowed.join(', ')}`);
  }
}

// ─── Evidence sources ─────────────────────────────────────────────────────────

/** The narrow surface createSource needs — pool, or a transaction client. */
type SourceExecutor = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/**
 * Record a new source AS THE SUCCESSOR of one already held, atomically.
 *
 * WHY THIS IS NOT createSource WITH AN EXTRA FIELD. Two rows change: the new
 * source is written, and the one it replaces stops being current. Apart, a
 * failure between them leaves either two current versions of one document or a
 * retired source with no successor — both worse than no linkage, because both
 * are a lineage that reads as complete and is not. They go in one transaction.
 *
 * WHAT MAKES SOMETHING A SUCCESSOR IS THE CALLER'S CALL, NOT THIS FUNCTION'S.
 * It links exactly the predecessor it is handed. Deciding that upload B revises
 * document A is a judgement about content, and a wrong one is expensive: it
 * would tell a reviewer their citation is stale on the strength of a guess. The
 * ingest path makes that decision explicitly, conservatively, and records how it
 * was reached in the successor's provenance.
 *
 * The retirement is conditional on the predecessor still being current and still
 * belonging to this org. If it is already retired, nothing is written and the
 * caller is told — a second successor would fork the lineage, which the unique
 * index also refuses at the schema level.
 */
export async function createSupersedingSource(
  orgId: number,
  p: Parameters<typeof createSource>[1],
  predecessorId: number,
): Promise<{ source: EvidenceSource; supersededId: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const retired = await client.query(
      `UPDATE cre_evidence_sources
          SET is_current = FALSE
        WHERE id = $1 AND organization_id = $2 AND is_current = TRUE
        RETURNING id`,
      [predecessorId, orgId],
    );
    if (retired.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error(
        `createSupersedingSource: source ${predecessorId} is not a current source of org ${orgId} — ` +
        'it was already superseded, or belongs to another tenant. Refusing to fork its lineage.',
      );
    }
    const source = await createSource(orgId, { ...p, previousVersionId: predecessorId }, client);
    await client.query('COMMIT');
    return { source, supersededId: predecessorId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function createSource(orgId: number, p: {
  sourceType: SourceType; visibilityClass?: VisibilityClass; clientWorkspaceId?: number | null;
  /** regulatory_programs.id (UUID) — the project-management id-space. Set this
   *  OR clientWorkspaceId depending on which scope the caller actually has;
   *  see migrations/20260726_cre_source_program_scope.sql. */
  clientProgramId?: string | null;
  agency?: string | null; sourceRecordIdentifier?: string | null; title?: string | null;
  sponsor?: string | null; product?: string | null; indication?: string | null;
  therapeuticArea?: string | null; phase?: string | null; applicationType?: string | null;
  applicationNumber?: string | null; trialRegistryIdentifier?: string | null;
  documentDate?: string | null; officialUrl?: string | null; storedArtifactRef?: string | null;
  checksum?: string | null; version?: string | null; provenance?: Record<string, unknown> | null;
  /** The source this one REPLACES, when that is known. See createSupersedingSource:
   *  it is set by the ingest path, never inferred here. */
  previousVersionId?: number | null;
  linkedCsrReportId?: number | null; linkedPrecedentId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Defaults to 'pending'. A source whose bytes are already stored and read is
   *  'ingested' at creation — leaving it 'pending' would misreport the corpus. */
  ingestionStatus?: IngestionStatus;
  /** Defaults to 'pending'. Set to 'extracted' when text was pulled at ingest;
   *  'failed' when extraction was attempted and produced nothing usable. */
  extractionStatus?: ExtractionStatus;
},
/** Runs on the caller's transaction when one is supplied. createSupersedingSource
 *  needs the insert and the predecessor's retirement to land together. */
exec: SourceExecutor = pool,
): Promise<EvidenceSource> {
  assertOneOf(p.sourceType, SOURCE_TYPES, 'sourceType');
  const visibility = p.visibilityClass ?? 'tenant_private';
  assertOneOf(visibility, VISIBILITY_CLASSES, 'visibilityClass');
  const ingestionStatus = p.ingestionStatus ?? 'pending';
  assertOneOf(ingestionStatus, INGESTION_STATUSES, 'ingestionStatus');
  const extractionStatus = p.extractionStatus ?? 'pending';
  assertOneOf(extractionStatus, EXTRACTION_STATUSES, 'extractionStatus');
  const values: unknown[] = [
    writeOrg(orgId, visibility), visibility, p.clientWorkspaceId ?? null, p.sourceType,
    p.agency ?? null, p.sourceRecordIdentifier ?? null, p.title ?? null, p.sponsor ?? null,
    p.product ?? null, p.indication ?? null, p.therapeuticArea ?? null, p.phase ?? null,
    p.applicationType ?? null, p.applicationNumber ?? null, p.trialRegistryIdentifier ?? null,
    p.documentDate ?? null, p.officialUrl ?? null, p.storedArtifactRef ?? null, p.checksum ?? null,
    p.version ?? null, p.provenance ? JSON.stringify(p.provenance) : null,
    p.linkedCsrReportId ?? null, p.linkedPrecedentId ?? null,
    p.metadata ? JSON.stringify(p.metadata) : null,
    ingestionStatus, extractionStatus,
  ];
  const columns = [
    'organization_id', 'visibility_class', 'client_workspace_id', 'source_type', 'agency',
    'source_record_identifier', 'title', 'sponsor', 'product', 'indication', 'therapeutic_area',
    'phase', 'application_type', 'application_number', 'trial_registry_identifier',
    'document_date', 'official_url', 'stored_artifact_ref', 'checksum', 'version', 'provenance',
    'linked_csr_report_id', 'linked_precedent_id', 'metadata',
    'ingestion_status', 'extraction_status',
  ];
  const placeholders = [
    '$1', '$2', '$3', '$4', '$5', '$6', '$7', '$8', '$9', '$10', '$11', '$12', '$13', '$14',
    '$15', '$16', '$17', '$18', '$19', '$20', `COALESCE($21::jsonb,'{}'::jsonb)`, '$22', '$23',
    `COALESCE($24::jsonb,'{}'::jsonb)`, '$25', '$26',
  ];

  // `client_program_id` is added by migrations/20260726_cre_source_program_scope.sql,
  // which is separate from the spine that creates this table. Naming the column
  // unconditionally would break every write on a database that has the spine but
  // not that migration — including production, and including the CSR/CRL paths
  // that never set a program. So it is named ONLY when a caller supplies one.
  //
  // A caller that DOES supply one on a database missing the column still fails
  // loudly, which is correct: silently dropping a project scope would put a
  // document in no project while reporting success.
  if (p.clientProgramId != null) {
    values.push(p.clientProgramId);
    columns.push('client_program_id');
    placeholders.push(`$${values.length}`);
  }

  // `previous_version_id` is added by migrations/20260829_cre_source_versioning.sql,
  // separately from the spine that creates this table — so it is named only when
  // a caller supplies one, for exactly the reason client_program_id is. Naming it
  // unconditionally would break every write on a database that has the spine but
  // not that migration.
  if (p.previousVersionId != null) {
    values.push(p.previousVersionId);
    columns.push('previous_version_id');
    placeholders.push(`$${values.length}`);
  }

  const { rows } = await exec.query(
    `INSERT INTO cre_evidence_sources (${columns.join(', ')})
     VALUES (${placeholders.join(',')})
     RETURNING *`,
    values,
  );
  return adaptSource(rows[0]);
}

/**
 * The Data Room read: every client document a project holds, newest first.
 *
 * Scoped by whichever project id-space the caller has — a `regulatory_programs`
 * UUID (what the project-management module is keyed on) or the numeric
 * workspace id. Both are supported because both are real and in use; see
 * migrations/20260726_cre_source_program_scope.sql.
 *
 * Deliberately NOT falling back to "all tenant sources" when a scope is
 * supplied but matches nothing: a project showing another project's documents
 * because a filter silently widened is exactly the failure a Data Room cannot
 * have. Unscoped tenant documents are opt-in via `includeUnscoped`, so they can
 * be surfaced for adoption into a project without being implied to belong to it.
 */
export async function listClientDocuments(orgId: number, opts: {
  programId?: string | null;
  workspaceId?: number | null;
  includeUnscoped?: boolean;
  limit?: number;
} = {}): Promise<EvidenceSource[]> {
  const c = visibleOrgClause(orgId, 1);
  const args: unknown[] = [c.param];
  let where = `${c.sql} AND deleted_at IS NULL AND source_type = 'client_document'`;

  const scopes: string[] = [];
  if (opts.programId) {
    args.push(opts.programId);
    scopes.push(`client_program_id = $${args.length}`);
  }
  if (opts.workspaceId != null && Number.isFinite(opts.workspaceId)) {
    args.push(opts.workspaceId);
    scopes.push(`client_workspace_id = $${args.length}`);
  }
  if (opts.includeUnscoped) {
    scopes.push(`(client_program_id IS NULL AND client_workspace_id IS NULL)`);
  }
  if (scopes.length > 0) where += ` AND (${scopes.join(' OR ')})`;

  args.push(Math.min(Math.max(opts.limit ?? 200, 1), 500));
  const { rows } = await pool.query(
    `SELECT * FROM cre_evidence_sources
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${args.length}`,
    args,
  );
  return rows.map(adaptSource);
}

/**
 * Resolve chosen source identities to the uploads their bytes live in.
 *
 * This is what lets a user pick documents in the Data Room and have AnA
 * actually read them: a selected `cre_evidence_sources` id maps back to the
 * `file_uploads` row recorded in its provenance, and the turn is then grounded
 * through the same tenant-scoped attachment path a freshly-attached file uses.
 * One grounding mechanism, two ways of choosing — rather than a second,
 * differently-scoped reader for selected sources.
 *
 * Tenant-scoped like every read here. Sources the caller does not own simply do
 * not resolve, so a guessed id yields nothing rather than another tenant's
 * bytes. Sources with no recorded upload (a CSR projection, an ingested CRL)
 * resolve to nothing too — they have no file to read, and inventing one would
 * ground a draft in a document that does not exist.
 *
 * Returns the upload ids in the order the sources were requested, de-duplicated.
 */
export async function resolveSourceUploadIds(
  orgId: number,
  sourceIds: Array<number | string>,
): Promise<string[]> {
  const ids = (Array.isArray(sourceIds) ? sourceIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return [];

  const c = visibleOrgClause(orgId, 2);
  const { rows } = await pool.query<{ id: number; file_upload_id: string | null }>(
    `SELECT id, provenance->>'fileUploadId' AS file_upload_id
       FROM cre_evidence_sources
      WHERE id = ANY($1) AND ${c.sql} AND deleted_at IS NULL`,
    [ids, c.param],
  );

  const byId = new Map(rows.map((r) => [Number(r.id), r.file_upload_id]));
  const ordered: string[] = [];
  for (const id of ids) {
    const uploadId = byId.get(id);
    if (uploadId && !ordered.includes(uploadId)) ordered.push(uploadId);
  }
  return ordered;
}

/**
 * Find a live source by content checksum within the caller's visibility.
 *
 * `cre_evidence_sources` has no unique constraint on checksum, so identity has
 * to be resolved explicitly: re-uploading the same bytes must resolve to the
 * source that already exists rather than minting a second identity for one
 * document. That is the whole point of a canonical source object — two rows for
 * one file is the fragmentation this model is meant to end.
 *
 * Scoped like every other read here (own org plus global-public), so one
 * tenant's checksum can never resolve to another tenant's source.
 */
export async function findSourceByChecksum(
  orgId: number,
  checksum: string,
  opts: { sourceType?: SourceType } = {},
): Promise<EvidenceSource | null> {
  if (!checksum) return null;
  const c = visibleOrgClause(orgId, 2);
  const args: unknown[] = [checksum, c.param];
  let where = `checksum = $1 AND ${c.sql} AND deleted_at IS NULL`;
  if (opts.sourceType) {
    args.push(opts.sourceType);
    where += ` AND source_type = $${args.length}`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM cre_evidence_sources WHERE ${where} ORDER BY created_at ASC LIMIT 1`,
    args,
  );
  return rows[0] ? adaptSource(rows[0]) : null;
}

/**
 * The one current source this upload would REPLACE, or null when that cannot be
 * established without guessing.
 *
 * The rule is deliberately narrow: same tenant, same project scope, same
 * source type, same title, still current, not deleted. A re-upload of
 * "Protocol.pdf" into the project that already holds "Protocol.pdf" is a
 * revision; that is the case this exists for.
 *
 * It returns null when MORE THAN ONE candidate matches. Two documents sharing a
 * filename in one project is exactly where a "revision" call becomes a guess,
 * and a wrong one is not cosmetic — it would retire a live source and tell a
 * reviewer their citation is stale on the strength of a filename. Ambiguity
 * declines to decide rather than picking the newest.
 *
 * It also returns null when the scope is unknown. An unscoped tenant upload has
 * no project context to be a revision WITHIN, so filename alone is far too weak.
 *
 * NOTE: this reads `is_current`, added by
 * migrations/20260829_cre_source_versioning.sql. Callers reach it only from the
 * ingest path, which tolerates the column being absent by treating a failed
 * lookup as "no predecessor known" — see the call site.
 */
export async function findSupersededCandidate(
  orgId: number,
  p: {
    title: string;
    sourceType: SourceType;
    programId?: string | null;
    workspaceId?: number | null;
  },
): Promise<EvidenceSource | null> {
  const title = (p.title ?? '').trim();
  if (!title) return null;
  // No project scope → no context in which "same name" means "same document".
  if (p.programId == null && p.workspaceId == null) return null;

  const args: unknown[] = [orgId, title, p.sourceType];
  let where = `organization_id = $1 AND title = $2 AND source_type = $3
               AND is_current = TRUE AND deleted_at IS NULL`;
  if (p.programId != null) {
    args.push(p.programId);
    where += ` AND client_program_id = $${args.length}`;
  } else {
    args.push(p.workspaceId);
    where += ` AND client_workspace_id = $${args.length}`;
  }
  // LIMIT 2, not 1: one row is a decision, two rows is an ambiguity that must
  // not be resolved by ordering.
  const { rows } = await pool.query(
    `SELECT * FROM cre_evidence_sources WHERE ${where} ORDER BY created_at DESC LIMIT 2`,
    args,
  );
  if (rows.length !== 1) return null;
  return adaptSource(rows[0]);
}

export async function getSource(orgId: number, id: number): Promise<EvidenceSource | null> {
  const c = visibleOrgClause(orgId, 2);
  const { rows } = await pool.query(
    `SELECT * FROM cre_evidence_sources WHERE id = $1 AND ${c.sql} AND deleted_at IS NULL`,
    [id, c.param],
  );
  return rows[0] ? adaptSource(rows[0]) : null;
}

export async function listSources(orgId: number, opts: {
  sourceType?: SourceType; applicationNumber?: string; indication?: string; limit?: number;
} = {}): Promise<EvidenceSource[]> {
  const c = visibleOrgClause(orgId, 1);
  const args: unknown[] = [c.param];
  let where = `${c.sql} AND deleted_at IS NULL`;
  if (opts.sourceType) { args.push(opts.sourceType); where += ` AND source_type = $${args.length}`; }
  if (opts.applicationNumber) { args.push(opts.applicationNumber); where += ` AND application_number = $${args.length}`; }
  if (opts.indication) { args.push(opts.indication); where += ` AND indication = $${args.length}`; }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await pool.query(
    `SELECT * FROM cre_evidence_sources WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`, args,
  );
  return rows.map(adaptSource);
}

// ─── Clinical studies (canonical identity; upsert on canonical key) ────────────

export async function upsertStudy(orgId: number, p: {
  canonicalStudyKey: string; visibilityClass?: VisibilityClass; clientWorkspaceId?: number | null;
  nctId?: string | null; registryIds?: unknown[]; sponsorStudyId?: string | null;
  protocolNumber?: string | null; indication?: string | null; phase?: string | null;
  product?: string | null; modality?: string | null; sponsor?: string | null;
  studyStatus?: string | null; provenanceConfidence?: number | null;
  linkedCsrStudyId?: number | null; metadata?: Record<string, unknown> | null;
}): Promise<ClinicalStudy> {
  const visibility = p.visibilityClass ?? 'tenant_private';
  assertOneOf(visibility, VISIBILITY_CLASSES, 'visibilityClass');
  const org = writeOrg(orgId, visibility);
  const { rows } = await pool.query(
    `INSERT INTO cre_clinical_studies (
       organization_id, visibility_class, client_workspace_id, canonical_study_key, nct_id,
       registry_ids, sponsor_study_id, protocol_number, indication, phase, product, modality,
       sponsor, study_status, provenance_confidence, linked_csr_study_id, metadata
     ) VALUES ($1,$2,$3,$4,$5,COALESCE($6::jsonb,'[]'::jsonb),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               COALESCE($17::jsonb,'{}'::jsonb))
     ON CONFLICT (organization_id, canonical_study_key) WHERE deleted_at IS NULL
     DO UPDATE SET nct_id = EXCLUDED.nct_id, indication = EXCLUDED.indication, phase = EXCLUDED.phase,
                   product = EXCLUDED.product, modality = EXCLUDED.modality, sponsor = EXCLUDED.sponsor,
                   study_status = EXCLUDED.study_status, linked_csr_study_id = EXCLUDED.linked_csr_study_id,
                   updated_at = now()
     RETURNING *`,
    [
      org, visibility, p.clientWorkspaceId ?? null, p.canonicalStudyKey, p.nctId ?? null,
      p.registryIds ? JSON.stringify(p.registryIds) : null, p.sponsorStudyId ?? null,
      p.protocolNumber ?? null, p.indication ?? null, p.phase ?? null, p.product ?? null,
      p.modality ?? null, p.sponsor ?? null, p.studyStatus ?? null, p.provenanceConfidence ?? null,
      p.linkedCsrStudyId ?? null, p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
  return adaptStudy(rows[0]);
}

export async function listStudies(orgId: number, opts: { indication?: string; phase?: string; limit?: number } = {}): Promise<ClinicalStudy[]> {
  const c = visibleOrgClause(orgId, 1);
  const args: unknown[] = [c.param];
  let where = `${c.sql} AND deleted_at IS NULL`;
  if (opts.indication) { args.push(opts.indication); where += ` AND indication = $${args.length}`; }
  if (opts.phase) { args.push(opts.phase); where += ` AND phase = $${args.length}`; }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await pool.query(
    `SELECT * FROM cre_clinical_studies WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`, args,
  );
  return rows.map(adaptStudy);
}

// ─── Regulatory findings ──────────────────────────────────────────────────────

export async function createFinding(orgId: number, p: {
  sourceId: number; visibilityClass?: VisibilityClass; applicationIdentifier?: string | null;
  relatedStudyIds?: number[]; findingDomain?: string | null; findingCategory?: string | null;
  findingSubcategory?: string | null; fdaReviewDiscipline?: string | null; findingText?: string | null;
  normalizedSummary?: string | null; requestedAction?: string | null; severity?: string | null;
  affectedCtdSection?: string | null; affectedIchE3Section?: string | null;
  affectedProtocolElement?: string | null; affectedSapElement?: string | null;
  affectedStudyDesignFeature?: string | null; sourcePage?: number | null; sourceExcerpt?: string | null;
  explicitOrInferred?: 'explicit' | 'inferred'; extractionConfidence?: number | null;
  verificationStatus?: string | null; metadata?: Record<string, unknown> | null;
}): Promise<RegulatoryFinding> {
  // DEFAULT CHANGED from 'global_public' (2026-07-27). This module's contract
  // is "writes are stamped with the caller's org unless an explicit governed
  // global write is requested" — a global default inverted that: any caller
  // omitting visibilityClass published its tenant's finding to every tenant.
  // Proven by test before the fix (facade-convergence suite: a tenant-private
  // CRL's finding was readable by another org). The one caller that WANTS
  // global writes, crl-ingestion of the public FDA corpus, already passes
  // 'global_public' explicitly, so nothing legitimate changes.
  const visibility = p.visibilityClass ?? 'tenant_private';
  assertOneOf(visibility, VISIBILITY_CLASSES, 'visibilityClass');
  const { rows } = await pool.query(
    `INSERT INTO cre_regulatory_findings (
       organization_id, visibility_class, source_id, application_identifier, related_study_ids,
       finding_domain, finding_category, finding_subcategory, fda_review_discipline, finding_text,
       normalized_summary, requested_action, severity, affected_ctd_section, affected_ich_e3_section,
       affected_protocol_element, affected_sap_element, affected_study_design_feature, source_page,
       source_excerpt, explicit_or_inferred, extraction_confidence, verification_status, metadata
     ) VALUES ($1,$2,$3,$4,COALESCE($5::jsonb,'[]'::jsonb),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
               COALESCE($21,'explicit'),$22,COALESCE($23,'unverified'),COALESCE($24::jsonb,'{}'::jsonb))
     RETURNING *`,
    [
      writeOrg(orgId, visibility), visibility, p.sourceId, p.applicationIdentifier ?? null,
      p.relatedStudyIds ? JSON.stringify(p.relatedStudyIds) : null, p.findingDomain ?? null,
      p.findingCategory ?? null, p.findingSubcategory ?? null, p.fdaReviewDiscipline ?? null,
      p.findingText ?? null, p.normalizedSummary ?? null, p.requestedAction ?? null, p.severity ?? null,
      p.affectedCtdSection ?? null, p.affectedIchE3Section ?? null, p.affectedProtocolElement ?? null,
      p.affectedSapElement ?? null, p.affectedStudyDesignFeature ?? null, p.sourcePage ?? null,
      p.sourceExcerpt ?? null, p.explicitOrInferred ?? null, p.extractionConfidence ?? null,
      p.verificationStatus ?? null, p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
  return adaptFinding(rows[0]);
}

/** One finding by id, scoped like every read here. Null when absent or invisible. */
export async function getFindingById(orgId: number, id: number): Promise<RegulatoryFinding | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const c = visibleOrgClause(orgId, 2);
  const { rows } = await pool.query(
    `SELECT * FROM cre_regulatory_findings WHERE id = $1 AND ${c.sql} AND deleted_at IS NULL`,
    [id, c.param],
  );
  return rows[0] ? adaptFinding(rows[0]) : null;
}

export async function listFindings(orgId: number, opts: {
  sourceId?: number; applicationIdentifier?: string; findingDomain?: string; limit?: number;
} = {}): Promise<RegulatoryFinding[]> {
  const c = visibleOrgClause(orgId, 1);
  const args: unknown[] = [c.param];
  let where = `${c.sql} AND deleted_at IS NULL`;
  if (opts.sourceId) { args.push(opts.sourceId); where += ` AND source_id = $${args.length}`; }
  if (opts.applicationIdentifier) { args.push(opts.applicationIdentifier); where += ` AND application_identifier = $${args.length}`; }
  if (opts.findingDomain) { args.push(opts.findingDomain); where += ` AND finding_domain = $${args.length}`; }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await pool.query(
    `SELECT * FROM cre_regulatory_findings WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`, args,
  );
  return rows.map(adaptFinding);
}

// ─── Regulatory outcomes ──────────────────────────────────────────────────────

export async function createOutcome(orgId: number, p: {
  outcomeType: OutcomeType; visibilityClass?: VisibilityClass; sourceId?: number | null;
  applicationIdentifier?: string | null; outcomeDate?: string | null; approvalDate?: string | null;
  timeToResolutionDays?: number | null; evidenceNote?: string | null; verificationStatus?: string | null;
  linkedSubmissionOutcomeId?: string | null; linkedPrecedentId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<RegulatoryOutcome> {
  assertOneOf(p.outcomeType, OUTCOME_TYPES, 'outcomeType');
  // Same fail-safe default as createFinding above: private unless a governed
  // global write is explicit. See the note there.
  const visibility = p.visibilityClass ?? 'tenant_private';
  assertOneOf(visibility, VISIBILITY_CLASSES, 'visibilityClass');
  const { rows } = await pool.query(
    `INSERT INTO cre_regulatory_outcomes (
       organization_id, visibility_class, source_id, application_identifier, outcome_type,
       outcome_date, approval_date, time_to_resolution_days, evidence_note, verification_status,
       linked_submission_outcome_id, linked_precedent_id, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'unverified'),$11,$12,COALESCE($13::jsonb,'{}'::jsonb))
     RETURNING *`,
    [
      writeOrg(orgId, visibility), visibility, p.sourceId ?? null, p.applicationIdentifier ?? null,
      p.outcomeType, p.outcomeDate ?? null, p.approvalDate ?? null, p.timeToResolutionDays ?? null,
      p.evidenceNote ?? null, p.verificationStatus ?? null, p.linkedSubmissionOutcomeId ?? null,
      p.linkedPrecedentId ?? null, p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
  return adaptOutcome(rows[0]);
}

export async function listOutcomes(orgId: number, opts: { applicationIdentifier?: string; outcomeType?: OutcomeType; limit?: number } = {}): Promise<RegulatoryOutcome[]> {
  const c = visibleOrgClause(orgId, 1);
  const args: unknown[] = [c.param];
  let where = `${c.sql} AND deleted_at IS NULL`;
  if (opts.applicationIdentifier) { args.push(opts.applicationIdentifier); where += ` AND application_identifier = $${args.length}`; }
  if (opts.outcomeType) { args.push(opts.outcomeType); where += ` AND outcome_type = $${args.length}`; }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await pool.query(
    `SELECT * FROM cre_regulatory_outcomes WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`, args,
  );
  return rows.map(adaptOutcome);
}

// ─── Typed relationships (§4.7) ───────────────────────────────────────────────

export async function addRelationship(orgId: number, p: {
  fromEntityType: EntityType; fromEntityId: string | number; toEntityType: EntityType;
  toEntityId: string | number; relationshipType: RelationshipType; isInferred?: boolean;
  confidence?: number | null; provenance?: Record<string, unknown> | null; global?: boolean;
}): Promise<EvidenceRelationship> {
  assertOneOf(p.fromEntityType, ENTITY_TYPES, 'fromEntityType');
  assertOneOf(p.toEntityType, ENTITY_TYPES, 'toEntityType');
  assertOneOf(p.relationshipType, RELATIONSHIP_TYPES, 'relationshipType');
  // §4.7: a potentially_related edge MUST be inferred and carry confidence.
  const inferred = p.relationshipType === 'potentially_related' ? true : Boolean(p.isInferred);
  if (p.relationshipType === 'potentially_related' && (p.confidence == null)) {
    throw new EvidenceSpineError('potentially_related relationships must carry a confidence.');
  }
  const { rows } = await pool.query(
    `INSERT INTO cre_evidence_relationships (
       organization_id, from_entity_type, from_entity_id, to_entity_type, to_entity_id,
       relationship_type, is_inferred, confidence, provenance
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::jsonb,'{}'::jsonb))
     RETURNING *`,
    [
      p.global ? null : orgId, p.fromEntityType, String(p.fromEntityId), p.toEntityType,
      String(p.toEntityId), p.relationshipType, inferred, p.confidence ?? null,
      p.provenance ? JSON.stringify(p.provenance) : null,
    ],
  );
  return adaptRelationship(rows[0]);
}

export async function listRelationshipsFor(orgId: number, entityType: EntityType, entityId: string | number): Promise<EvidenceRelationship[]> {
  const c = visibleOrgClause(orgId, 3);
  const { rows } = await pool.query(
    `SELECT * FROM cre_evidence_relationships
      WHERE ((from_entity_type = $1 AND from_entity_id = $2) OR (to_entity_type = $1 AND to_entity_id = $2))
        AND ${c.sql}
      ORDER BY created_at ASC`,
    [entityType, String(entityId), c.param],
  );
  return rows.map(adaptRelationship);
}

// ─── Design lessons (§4.8) — governed derived intelligence ────────────────────

export async function proposeDesignLesson(orgId: number, p: {
  lessonStatement: string; supportingSourceIds: number[]; visibilityClass?: VisibilityClass;
  contradictingSourceIds?: number[]; applicablePopulation?: string | null; applicablePhase?: string | null;
  modality?: string | null; endpointType?: string | null; minimumEvidenceCount?: number | null;
  evidenceQualityScore?: number | null; confidenceInterval?: unknown | null; derivationMethod?: string | null;
  modelVersion?: string | null; metadata?: Record<string, unknown> | null;
}): Promise<DesignLesson> {
  const visibility = p.visibilityClass ?? 'tenant_private';
  assertOneOf(visibility, VISIBILITY_CLASSES, 'visibilityClass');
  // §4.8: never publish a design lesson from a single source as a generalized rule.
  const minEvidence = p.minimumEvidenceCount ?? 2;
  if (minEvidence < 2) {
    throw new EvidenceSpineError('A generalizable design lesson requires minimumEvidenceCount ≥ 2.');
  }
  if ((p.supportingSourceIds?.length ?? 0) < minEvidence) {
    throw new EvidenceSpineError(
      `A design lesson needs at least ${minEvidence} supporting sources (got ${p.supportingSourceIds?.length ?? 0}).`,
    );
  }
  const { rows } = await pool.query(
    `INSERT INTO cre_design_lessons (
       organization_id, visibility_class, lesson_statement, applicable_population, applicable_phase,
       modality, endpoint_type, supporting_source_ids, contradicting_source_ids, minimum_evidence_count,
       evidence_quality_score, confidence_interval, derivation_method, model_version,
       human_review_status, last_recalculated_at, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::jsonb,'[]'::jsonb),COALESCE($9::jsonb,'[]'::jsonb),
               $10,$11,$12::jsonb,$13,$14,'pending',now(),COALESCE($15::jsonb,'{}'::jsonb))
     RETURNING *`,
    [
      writeOrg(orgId, visibility), visibility, p.lessonStatement, p.applicablePopulation ?? null,
      p.applicablePhase ?? null, p.modality ?? null, p.endpointType ?? null,
      JSON.stringify(p.supportingSourceIds), p.contradictingSourceIds ? JSON.stringify(p.contradictingSourceIds) : null,
      minEvidence, p.evidenceQualityScore ?? null, p.confidenceInterval ? JSON.stringify(p.confidenceInterval) : null,
      p.derivationMethod ?? null, p.modelVersion ?? null, p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
  return adaptLesson(rows[0]);
}

export async function reviewDesignLesson(orgId: number, id: number, status: 'approved' | 'rejected'): Promise<DesignLesson | null> {
  const { rows } = await pool.query(
    `UPDATE cre_design_lessons SET human_review_status = $3, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING *`,
    [id, orgId, status],
  );
  return rows[0] ? adaptLesson(rows[0]) : null;
}

export async function listDesignLessons(orgId: number, opts: { humanReviewStatus?: string; applicablePhase?: string; limit?: number } = {}): Promise<DesignLesson[]> {
  const c = visibleOrgClause(orgId, 1);
  const args: unknown[] = [c.param];
  let where = `${c.sql} AND deleted_at IS NULL`;
  if (opts.humanReviewStatus) { args.push(opts.humanReviewStatus); where += ` AND human_review_status = $${args.length}`; }
  if (opts.applicablePhase) { args.push(opts.applicablePhase); where += ` AND applicable_phase = $${args.length}`; }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await pool.query(
    `SELECT * FROM cre_design_lessons WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`, args,
  );
  return rows.map(adaptLesson);
}

// ─── snake_case → camelCase adapters (DB rows are dynamically shaped) ──────────

const j = (v: any) => (v == null ? {} : typeof v === 'string' ? JSON.parse(v) : v);
const arr = (v: any) => (v == null ? [] : typeof v === 'string' ? JSON.parse(v) : v);

function adaptSource(r: any): EvidenceSource {
  return {
    id: r.id, organizationId: r.organization_id, visibilityClass: r.visibility_class,
    clientWorkspaceId: r.client_workspace_id, clientProgramId: r.client_program_id ?? null,
    sourceType: r.source_type, agency: r.agency,
    sourceRecordIdentifier: r.source_record_identifier, title: r.title, sponsor: r.sponsor,
    product: r.product, indication: r.indication, therapeuticArea: r.therapeutic_area, phase: r.phase,
    applicationType: r.application_type, applicationNumber: r.application_number,
    trialRegistryIdentifier: r.trial_registry_identifier, documentDate: r.document_date,
    officialUrl: r.official_url, storedArtifactRef: r.stored_artifact_ref, checksum: r.checksum,
    version: r.version, provenance: j(r.provenance), ingestionStatus: r.ingestion_status,
    extractionStatus: r.extraction_status, linkedCsrReportId: r.linked_csr_report_id,
    linkedPrecedentId: r.linked_precedent_id, metadata: j(r.metadata),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function adaptStudy(r: any): ClinicalStudy {
  return {
    id: r.id, organizationId: r.organization_id, visibilityClass: r.visibility_class,
    clientWorkspaceId: r.client_workspace_id, canonicalStudyKey: r.canonical_study_key, nctId: r.nct_id,
    registryIds: arr(r.registry_ids), sponsorStudyId: r.sponsor_study_id, protocolNumber: r.protocol_number,
    indication: r.indication, phase: r.phase, product: r.product, modality: r.modality, sponsor: r.sponsor,
    studyStatus: r.study_status, provenanceConfidence: r.provenance_confidence,
    linkedCsrStudyId: r.linked_csr_study_id, metadata: j(r.metadata), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function adaptFinding(r: any): RegulatoryFinding {
  return {
    id: r.id, organizationId: r.organization_id, visibilityClass: r.visibility_class, sourceId: r.source_id,
    applicationIdentifier: r.application_identifier, relatedStudyIds: arr(r.related_study_ids),
    findingDomain: r.finding_domain, findingCategory: r.finding_category, findingSubcategory: r.finding_subcategory,
    fdaReviewDiscipline: r.fda_review_discipline, findingText: r.finding_text, normalizedSummary: r.normalized_summary,
    requestedAction: r.requested_action, severity: r.severity, affectedCtdSection: r.affected_ctd_section,
    affectedIchE3Section: r.affected_ich_e3_section, affectedProtocolElement: r.affected_protocol_element,
    affectedSapElement: r.affected_sap_element, affectedStudyDesignFeature: r.affected_study_design_feature,
    sourcePage: r.source_page, sourceExcerpt: r.source_excerpt, explicitOrInferred: r.explicit_or_inferred,
    extractionConfidence: r.extraction_confidence, verificationStatus: r.verification_status,
    metadata: j(r.metadata), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function adaptOutcome(r: any): RegulatoryOutcome {
  return {
    id: r.id, organizationId: r.organization_id, visibilityClass: r.visibility_class, sourceId: r.source_id,
    applicationIdentifier: r.application_identifier, outcomeType: r.outcome_type, outcomeDate: r.outcome_date,
    approvalDate: r.approval_date, timeToResolutionDays: r.time_to_resolution_days, evidenceNote: r.evidence_note,
    verificationStatus: r.verification_status, linkedSubmissionOutcomeId: r.linked_submission_outcome_id,
    linkedPrecedentId: r.linked_precedent_id, metadata: j(r.metadata), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function adaptRelationship(r: any): EvidenceRelationship {
  return {
    id: r.id, organizationId: r.organization_id, fromEntityType: r.from_entity_type, fromEntityId: r.from_entity_id,
    toEntityType: r.to_entity_type, toEntityId: r.to_entity_id, relationshipType: r.relationship_type,
    isInferred: r.is_inferred, confidence: r.confidence, provenance: j(r.provenance), createdAt: r.created_at,
  };
}
function adaptLesson(r: any): DesignLesson {
  return {
    id: r.id, organizationId: r.organization_id, visibilityClass: r.visibility_class,
    lessonStatement: r.lesson_statement, applicablePopulation: r.applicable_population,
    applicablePhase: r.applicable_phase, modality: r.modality, endpointType: r.endpoint_type,
    supportingSourceIds: arr(r.supporting_source_ids), contradictingSourceIds: arr(r.contradicting_source_ids),
    minimumEvidenceCount: r.minimum_evidence_count, evidenceQualityScore: r.evidence_quality_score,
    confidenceInterval: r.confidence_interval == null ? null : j(r.confidence_interval),
    derivationMethod: r.derivation_method, modelVersion: r.model_version, humanReviewStatus: r.human_review_status,
    lastRecalculatedAt: r.last_recalculated_at, metadata: j(r.metadata), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
