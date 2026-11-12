/**
 * TMF artifact persistence service.
 *
 * The Trial Master File of a study: a durable, tenant-scoped, audited record
 * of the documents filed against a protocol-design study of a project, with
 * inspection-readiness computed from the stored filings. Every read and write
 * is scoped to the caller's organizationId (never request input).
 *
 * A TMF belongs to a study of a project (founder decision P-75; eTMF
 * convergence slice E2, docs/design/ETMF_CONVERGENCE_2026-10-30.md). The
 * trial a caller names is the study's own id string, the `studyId` that
 * GET /api/study-design?program_id= lists (cdisc_prm_studies.study_id). It
 * must be a study of the caller's organization whose project the caller can
 * currently open; anything else is STUDY_NOT_FOUND and nothing is read or
 * written. Whether the caller can open the project is decided by the Vault's
 * own rule (services/c2c/current-program-access.ts for a read,
 * services/vault/vault-write-authority.ts for a write), not by a rule kept
 * here.
 *
 * Filing and removing are governed acts (slice E3). Each needs the person's
 * reason (the governed-reason floor, routes/governed-reason.ts), and its audit
 * row is written by the same transaction as the change, through the chained
 * writer the Vault uses (writeChainedAuditRow): a filing or a removal without
 * its audit row cannot exist. A removal marks the row (removed_at, removed_by,
 * removal_reason) and never deletes it; every reader here skips a removed row.
 *
 * An artifact code must be a known DIA TMF Reference Model code (the service
 * validates against `tmf-completeness`), keeping the store clean and the
 * completeness roll-up meaningful.
 *
 * @module server/services/etmf/tmf-artifact-persistence
 */

import { eq, and, asc, isNull } from 'drizzle-orm';
import { db, pool, transaction } from '../../db';
import { tmfArtifactFilings, type TmfArtifactFiling } from '../../../shared/schema/tmf-artifacts';
import type { AuditRowOutcome } from '../audit/audit-write-outcome';
import { writeChainedAuditRow } from '../auditService';
import { requireGovernedReason } from '../../routes/governed-reason';
import { createScopedLogger } from '../../utils/logger';
import {
  getTmfReferenceModel,
  assessTmfCompleteness,
  type TmfCompletenessResult,
  type TmfDocumentEvidence,
} from './tmf-completeness';
import { ProgramReadAccessError, requireCurrentProgramAccess } from '../c2c/current-program-access';
import { requireCurrentVaultProgramWrite } from '../vault/vault-write-authority';

const logger = createScopedLogger('tmf-artifact-persistence');

/** A vault document reference: `vault://<document id>`. */
const VAULT_REF = /^vault:\/\/(.+)$/;

/** The caller, from the session; `ipAddress` and `userAgent` go on the audit row of a write. */
export type TmfCtx = { organizationId: number; userId: number; ipAddress?: string; userAgent?: string };

/** Every refusal this service gives, with the HTTP status its route answers. */
const TMF_ERROR_STATUS = {
  NOT_FOUND: 404,
  STUDY_NOT_FOUND: 404,
  UNKNOWN_ARTIFACT: 400,
  UNRESOLVABLE_DOCUMENT_REF: 400,
  REASON_REQUIRED: 400,
  DOCUMENT_NOT_IN_PROJECT: 409,
  VAULT_WRITE_ROLE_REQUIRED: 403,
  STUDY_ACCESS_UNAVAILABLE: 503,
} as const;
export type TmfErrorCode = keyof typeof TMF_ERROR_STATUS;

export class TmfArtifactError extends Error {
  readonly status: number;
  constructor(public code: TmfErrorCode, message: string) {
    super(message);
    this.name = 'TmfArtifactError';
    this.status = TMF_ERROR_STATUS[code];
  }
}

/** The pg-style statement runner the access rule and the writers share: the pool, or a transaction's client. */
interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}
const poolQueryable: Queryable = { query: (text, params) => pool.query(text, params) };

/**
 * The study a TMF belongs to: the protocol-design study (cdisc_prm_studies),
 * named as GET /api/study-design lists it, with the row id a filing's
 * `study_ref` holds.
 */
export interface TmfStudy {
  /** cdisc_prm_studies.id: what a filing's study_ref holds. */
  id: number;
  /** The study's own id string, `studyId` in GET /api/study-design. The trial a route names. */
  studyId: string;
  /** The project the study belongs to (regulatory_programs.id). */
  programId: string;
  protocolId: string;
  title: string;
  phase: string;
  indication: string;
  status: string;
}

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

/** A study row with a project, or null: a study filed under no project has no TMF. */
function studyFromRow(row: Record<string, unknown> | undefined): TmfStudy | null {
  const id = Number(row?.id);
  const programId = text(row?.program_id);
  if (!row || !Number.isSafeInteger(id) || id <= 0 || !programId) return null;
  return {
    id,
    studyId: text(row.study_id),
    programId,
    protocolId: text(row.protocol_id),
    title: text(row.protocol_title),
    phase: text(row.study_phase),
    indication: text(row.indication),
    status: text(row.protocol_status, 'draft'),
  };
}

const studyNotFound = () =>
  new TmfArtifactError('STUDY_NOT_FOUND', 'No study with this id is in a project you can open. Nothing was read or changed.');

/** What a refused project admission becomes here: the study is not disclosed, and an unverifiable check is an error. */
function studyAccessRefusal(err: unknown): unknown {
  if (!(err instanceof ProgramReadAccessError)) return err;
  if (err.status === 503) {
    return new TmfArtifactError('STUDY_ACCESS_UNAVAILABLE', "Current access to this study's project could not be verified. Nothing was read or changed.");
  }
  if (err.code === 'VAULT_WRITE_ROLE_REQUIRED') return new TmfArtifactError('VAULT_WRITE_ROLE_REQUIRED', err.message);
  return studyNotFound();
}

/**
 * Admit the caller to a study row's project, by the Vault's rule. A write is
 * admitted on the writer's own transaction, which holds the membership it
 * decided on until commit.
 */
async function admitToStudy(q: Queryable, row: Record<string, unknown> | undefined, ctx: TmfCtx, forWrite: boolean): Promise<TmfStudy> {
  const study = studyFromRow(row);
  if (!study) throw studyNotFound();
  const input = { organizationId: ctx.organizationId, userId: ctx.userId, programId: study.programId };
  try {
    if (forWrite) await requireCurrentVaultProgramWrite(q, input);
    else await requireCurrentProgramAccess(q, input);
  } catch (err) {
    throw studyAccessRefusal(err);
  }
  return study;
}

/** The study a route names by its own id string, when the caller can open its project. */
async function requireTmfStudy(q: Queryable, trialId: string, ctx: TmfCtx, forWrite: boolean): Promise<TmfStudy> {
  const studyId = typeof trialId === 'string' ? trialId.trim() : '';
  // cdisc_prm_studies.study_id is varchar(100): a longer name is no study's.
  if (!studyId || studyId.length > 100) throw studyNotFound();
  const { rows } = await q.query(
    `SELECT s.id, s.study_id, s.program_id::text AS program_id, s.protocol_id, s.protocol_title,
            s.study_phase, s.indication, s.protocol_status
       FROM cdisc_prm_studies s
      WHERE s.study_id = $1 AND s.tenant_id = $2`,
    [studyId, ctx.organizationId],
  );
  return admitToStudy(q, rows[0], ctx, forWrite);
}

/** The study a stored filing points at (its study_ref), when the caller can open its project. */
async function requireTmfStudyByRef(q: Queryable, studyRef: number, ctx: TmfCtx, forWrite: boolean): Promise<TmfStudy> {
  const { rows } = await q.query(
    `SELECT s.id, s.study_id, s.program_id::text AS program_id, s.protocol_id, s.protocol_title,
            s.study_phase, s.indication, s.protocol_status
       FROM cdisc_prm_studies s
      WHERE s.id = $1 AND s.tenant_id = $2`,
    [studyRef, ctx.organizationId],
  );
  return admitToStudy(q, rows[0], ctx, forWrite);
}

/** The study a route names, for a caller who can open its project. STUDY_NOT_FOUND otherwise. */
export async function getTmfStudy(trialId: string, ctx: TmfCtx): Promise<TmfStudy> {
  return requireTmfStudy(poolQueryable, trialId, ctx, false);
}

/**
 * A `vault://<id>` reference must name a document that EXISTS, in the project
 * of the study it is filed against.
 *
 * ── Why this guard exists ────────────────────────────────────────────────────
 * The eTMF surface's "File" button sent
 *   documentRef: 'vault://' + trialId + '/' + artifactCode
 * — a reference it MANUFACTURED from the two things it already knew. No
 * document was uploaded, none existed, and the store recorded the essential
 * document as filed against a path pointing at nothing. "File all N" did it for
 * every outstanding document in one click, which is how a trial reached
 * INSPECTION-READY without a single document having been filed.
 *
 * That is a false GCP record: an inspection-readiness verdict a sponsor acts
 * on, computed from filings that reference no documents. The client is fixed
 * too, but the guard belongs HERE — a store that accepts any string as proof a
 * document exists will be lied to again by the next caller.
 *
 * Absent/empty is still allowed and means what it says: a filing recorded with
 * no document attached. What is refused is a reference that CLAIMS a document
 * and cannot produce one.
 *
 * 2026-11-10 (E2): the document had only to be in the organization and in a
 * project the caller could open, so a study's TMF could be filed against
 * another project's document. It must now be a live document of the study's
 * own project. One refusal covers a document that is absent, deleted, another
 * project's or another organization's, so the answer never says which.
 */
function assertNotAManufacturedPath(documentRef: string): void {
  const m = VAULT_REF.exec(documentRef);
  // The manufactured form was `vault://<trialId>/<artifactCode>` — a path, not
  // an id. Nothing in vault.documents has ever been keyed that way, so it can
  // never resolve; naming that shape explicitly makes the refusal legible
  // rather than a generic "not found".
  if (m && m[1].trim().includes('/')) {
    throw new TmfArtifactError(
      'UNRESOLVABLE_DOCUMENT_REF',
      `"${documentRef}" is not a vault document reference — it is a path built from the trial and artifact code. File the actual document and reference the id the vault returns.`,
    );
  }
}

async function assertDocumentInStudyProject(q: Queryable, documentRef: string, study: TmfStudy, organizationId: number): Promise<void> {
  const m = VAULT_REF.exec(documentRef);
  if (!m) {
    // A non-vault scheme (an external URL, a paper-archive locator) is not
    // something this service can verify, and refusing it would break filings
    // that are legitimately recorded against off-platform originals.
    return;
  }
  const id = m[1].trim();
  let rows: Array<Record<string, unknown>>;
  try {
    ({ rows } = await q.query(
      `SELECT d.id::text AS id FROM vault.documents d
        WHERE d.id::text = $1
          AND d.organization_id = $2 AND d.deleted_at IS NULL
          AND d.program_id::text = $3
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = d.program_id
               AND rp.organization_id = $2
               AND rp.deleted_at IS NULL
          )
        LIMIT 1`,
      [id, organizationId, study.programId],
    ));
  } catch (err) {
    // An unprovisioned vault schema must not silently wave the reference
    // through — that is the exact failure this guard exists to prevent.
    if ((err as { code?: string })?.code === '42P01') {
      throw new TmfArtifactError(
        'UNRESOLVABLE_DOCUMENT_REF',
        'The vault document store is not provisioned in this deployment, so a vault reference cannot be verified.',
      );
    }
    throw err;
  }
  if (rows.length === 0) {
    throw new TmfArtifactError(
      'DOCUMENT_NOT_IN_PROJECT',
      "That Vault document is not held in this study's project, so the artifact cannot be recorded as filed against it. File a document from the project's own Vault.",
    );
  }
}

/** code → zone number, from the reference model (single source of truth). */
const ARTIFACT_ZONE: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  for (const zone of getTmfReferenceModel()) {
    for (const a of zone.artifacts) m.set(a.code, zone.number);
  }
  return m;
})();

export interface RecordArtifactInput {
  /** The study's own id string (cdisc_prm_studies.study_id). */
  trialId: string;
  artifactCode: string;
  documentRef?: string | null;
  /** Why it is filed, in the person's words (at least 8 characters). Recorded on the audit row. */
  reason: unknown;
}

export interface RemoveArtifactInput {
  /** The filing's id. */
  id: string;
  /** Why it is removed, in the person's words (at least 8 characters). Kept on the row and the audit row. */
  reason: unknown;
}

/** The person's reason, trimmed, or REASON_REQUIRED. Never a sentence composed in its place. */
function statedReason(value: unknown): string {
  const verdict = requireGovernedReason(value);
  if (!verdict.ok) throw new TmfArtifactError('REASON_REQUIRED', verdict.error);
  return verdict.reason;
}

/** The audit row of a change, written by the change's own transaction, so it is recorded on the chain or not made. */
const RECORDED_WITH_THE_CHANGE: AuditRowOutcome = { persisted: true, chained: true };

export type FiledTmfArtifact = TmfArtifactFiling & { auditTrail: AuditRowOutcome };
export type RemovedTmfArtifact = { id: string; auditTrail: AuditRowOutcome };

const asDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));
const asDateOrNull = (value: unknown): Date | null => (value == null ? null : asDate(value));
const asIntOrNull = (value: unknown): number | null => (value == null ? null : Number(value));
const asTextOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** A stored row as the drizzle reads serve it. */
function filingFromRow(row: Record<string, unknown>): TmfArtifactFiling {
  return {
    id: String(row.id),
    organizationId: Number(row.organization_id),
    trialId: String(row.trial_id),
    artifactCode: String(row.artifact_code),
    zoneNumber: asIntOrNull(row.zone_number),
    documentRef: asTextOrNull(row.document_ref),
    createdBy: asIntOrNull(row.created_by),
    filedAt: asDate(row.filed_at),
    updatedAt: asDate(row.updated_at),
    studyRef: asIntOrNull(row.study_ref),
    removedAt: asDateOrNull(row.removed_at),
    removedBy: asIntOrNull(row.removed_by),
    removalReason: asTextOrNull(row.removal_reason),
  };
}

/** The filing columns every write returns, as `filingFromRow` reads them. */
type FilingRow = Record<string, unknown>;

/** An instant as an audit row carries it: an ISO string, so what is hashed is what is stored. */
const isoOrNull = (value: unknown): string | null => (value == null ? null : asDate(value).toISOString());

/** What stood in the row before this filing, read under the row's lock. */
function priorFilingDetails(prior: FilingRow): Record<string, unknown> {
  const documentRef = asTextOrNull(prior.document_ref);
  if (prior.study_ref == null) {
    // A row filed before 2026-11-10: free text, no study. This filing takes its place.
    return { outcome: 'filed_over_unlinked',
      replacedUnlinkedFiling: { trialId: asTextOrNull(prior.trial_id), documentRef, filedAt: isoOrNull(prior.filed_at) } };
  }
  if (prior.removed_at != null) {
    return { outcome: 'filed_after_removal',
      clearedRemoval: { removedAt: isoOrNull(prior.removed_at), removedBy: asIntOrNull(prior.removed_by),
        reason: asTextOrNull(prior.removal_reason), documentRef } };
  }
  return { outcome: 'refiled', replacedDocumentRef: documentRef };
}

interface FilingWrite { organizationId: number; userId: number; study: TmfStudy; artifactCode: string; zone: number; documentRef: string | null }

/**
 * Write the one row of (organization, study, artifact): a new row, or the
 * existing one under its lock, with what stood there before. Re-filing after a
 * removal clears the removal on the same row, so the unique key needs no
 * second row; a row that had no study becomes this study's.
 */
async function writeFiling(q: Queryable, w: FilingWrite): Promise<{ row: FilingRow; prior: Record<string, unknown> }> {
  const inserted = await q.query(
    `INSERT INTO tmf_artifact_filings
       (organization_id, trial_id, artifact_code, zone_number, document_ref, created_by, study_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (organization_id, trial_id, artifact_code) DO NOTHING
     RETURNING id, organization_id, trial_id, artifact_code, zone_number, document_ref, created_by,
               filed_at, updated_at, study_ref, removed_at, removed_by, removal_reason`,
    [w.organizationId, w.study.studyId, w.artifactCode, w.zone, w.documentRef, w.userId, w.study.id],
  );
  if (inserted.rows.length > 0) return { row: inserted.rows[0], prior: { outcome: 'filed' } };
  const held = await q.query(
    `SELECT id, trial_id, study_ref, document_ref, filed_at, removed_at, removed_by, removal_reason
       FROM tmf_artifact_filings
      WHERE organization_id = $1 AND trial_id = $2 AND artifact_code = $3
        FOR UPDATE`,
    [w.organizationId, w.study.studyId, w.artifactCode],
  );
  if (held.rows.length === 0) throw new Error('TMF filing could not be read back for re-filing; nothing was changed.');
  // created_by is who made the row's present life: kept on a re-file, taken by a filing that follows a removal or an unlinked row.
  const updated = await q.query(
    `UPDATE tmf_artifact_filings
        SET document_ref = $2, zone_number = $3, study_ref = $4,
            created_by = CASE WHEN study_ref IS NULL OR removed_at IS NOT NULL THEN $5 ELSE created_by END,
            filed_at = now(), updated_at = now(),
            removed_at = NULL, removed_by = NULL, removal_reason = NULL
      WHERE id = $1
      RETURNING id, organization_id, trial_id, artifact_code, zone_number, document_ref, created_by,
                filed_at, updated_at, study_ref, removed_at, removed_by, removal_reason`,
    [held.rows[0].id, w.documentRef, w.zone, w.study.id, w.userId],
  );
  return { row: updated.rows[0], prior: priorFilingDetails(held.rows[0]) };
}

/** How an audit row names the study a filing belongs to. */
const auditedStudy = (study: TmfStudy) => ({ id: study.id, studyId: study.studyId, protocolId: study.protocolId, title: study.title });

/**
 * Record (or re-file) a TMF artifact for a study, with the person's reason.
 * One row per (org, study, artifact): re-filing updates the document and the
 * time on the same row. Rejects an unknown artifact code. Org-scoped.
 *
 * The row carries the study it was filed against (study_ref) and the study's
 * own id string as trial_id, so the unique key holds one row per study and
 * artifact. A row that was filed before 2026-11-10 under the same string has
 * no study: this filing takes its place, and nothing of it is read as the
 * study's.
 *
 * The audit row is written by this transaction (E3): it names the study, the
 * artifact, the document filed and, on a re-file, the document it replaced.
 * Until 2026-11-10 it was attempted after commit, without the document, and a
 * lost one left a filing with no record.
 */
export async function recordTmfArtifactFiling(input: RecordArtifactInput, ctx: TmfCtx): Promise<FiledTmfArtifact> {
  const zone = ARTIFACT_ZONE.get(input.artifactCode);
  if (zone === undefined) {
    throw new TmfArtifactError('UNKNOWN_ARTIFACT', `"${input.artifactCode}" is not a known TMF Reference Model artifact code.`);
  }
  const reason = statedReason(input.reason);
  const ref = typeof input.documentRef === 'string' ? input.documentRef.trim() : '';
  if (ref) assertNotAManufacturedPath(ref);

  const { row, study } = await transaction(async (q: Queryable) => {
    const admitted = await requireTmfStudy(q, input.trialId, ctx, true);
    if (ref) await assertDocumentInStudyProject(q, ref, admitted, ctx.organizationId);
    const written = await writeFiling(q, {
      organizationId: ctx.organizationId, userId: ctx.userId, study: admitted, artifactCode: input.artifactCode, zone, documentRef: ref || null,
    });
    await writeChainedAuditRow(q, {
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'TMF_ARTIFACT_FILED',
      resourceType: 'tmf_artifact',
      resourceId: String(written.row.id),
      reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      // The reason is in the details too: that is what the chain's hash covers.
      details: { study: auditedStudy(admitted), programId: admitted.programId, artifactCode: input.artifactCode, zone,
        documentRef: ref || null, ...written.prior, reason },
    });
    return { row: filingFromRow(written.row), study: admitted };
  });

  logger.info('Filed TMF artifact', { studyRef: study.id, artifactCode: input.artifactCode, organizationId: ctx.organizationId });
  return { ...row, auditTrail: RECORDED_WITH_THE_CHANGE };
}

/**
 * A study's live filings (org-scoped, stable order). Never a row with no
 * study, whatever its trial_id says, and never a removed row.
 */
function studyFilings(study: TmfStudy, organizationId: number): Promise<TmfArtifactFiling[]> {
  return db
    .select()
    .from(tmfArtifactFilings)
    .where(and(
      eq(tmfArtifactFilings.organizationId, organizationId),
      eq(tmfArtifactFilings.studyRef, study.id),
      isNull(tmfArtifactFilings.removedAt),
    ))
    .orderBy(asc(tmfArtifactFilings.artifactCode)) as Promise<TmfArtifactFiling[]>;
}

/** The Vault document a filing is filed against, as the list names it. */
export interface TmfFilingDocument {
  /** vault.documents.id: the id in the filing's `vault://<id>` reference. */
  id: string;
  /** The document's title; its file name when it has no title; null when it has neither. */
  title: string | null;
  version: string | null;
  /** False when a live later version has replaced it (the Vault's one link rule, vault-version-family.ts). */
  current: boolean;
}

/** A listed filing: the row, and the document it is filed against when that is a live document of the study's project. */
export type ListedTmfFiling = TmfArtifactFiling & { document: TmfFilingDocument | null };

/** The id inside a filing's `vault://<id>` reference, or null: no reference, an off-platform one, or a path. */
function vaultIdOf(filing: TmfArtifactFiling): string | null {
  const m = VAULT_REF.exec(typeof filing.documentRef === 'string' ? filing.documentRef.trim() : '');
  const id = m ? m[1].trim() : '';
  return id && !id.includes('/') ? id : null;
}

const trimmedOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * The documents a study's filings reference, by id: one read for the whole
 * list, held to the organization and to the study's project, live documents
 * only. An id that is absent, deleted, another project's or another
 * organization's is simply not in the answer, so its filing names no document.
 * A failed read throws: it says nothing about the documents.
 */
async function filedDocuments(ids: readonly string[], organizationId: number, programId: string): Promise<Map<string, TmfFilingDocument>> {
  const documents = new Map<string, TmfFilingDocument>();
  if (ids.length === 0) return documents;
  // "current" is VALID_LINK('succ', 'd') of services/vault/vault-version-family.ts written out, as that file's
  // readSuccessors does, so this SQL text carries no interpolation (ci:sql-interpolation).
  // tenant-isolation-safe: d is bound to the organization and the program; the link holds succ to the same ones.
  const { rows } = await pool.query(
    `SELECT d.id::text AS id, d.document_title, d.file_name, d.version,
            NOT EXISTS (
              SELECT 1 FROM vault.documents succ
               WHERE succ.supersedes_id = d.id
                 AND succ.program_id = d.program_id
                 AND succ.document_code IS NOT DISTINCT FROM d.document_code
                 AND succ.organization_id = d.organization_id
                 AND succ.deleted_at IS NULL AND d.deleted_at IS NULL
            ) AS current
       FROM vault.documents d
      WHERE d.id::text = ANY($1::text[])
        AND d.organization_id = $2 AND d.deleted_at IS NULL
        AND d.program_id::text = $3
        AND EXISTS (
          SELECT 1 FROM regulatory_programs rp
           WHERE rp.id = d.program_id
             AND rp.organization_id = $2
             AND rp.deleted_at IS NULL
        )`,
    [ids, organizationId, programId],
  );
  for (const row of rows as Array<Record<string, unknown>>) {
    const id = String(row.id);
    documents.set(id, {
      id,
      title: trimmedOrNull(row.document_title) ?? trimmedOrNull(row.file_name),
      version: trimmedOrNull(row.version),
      // Current only when the database said so.
      current: row.current === true,
    });
  }
  return documents;
}

/**
 * List a study's filed TMF artifacts, for a caller who can open the study's
 * project. Each filing says what its document is (`document`), so a reader
 * need not hold the project's Vault list to name it; a reference that is not
 * a live document of the study's project gives `document: null`, never a
 * title made from the reference.
 */
export async function listTmfArtifacts(trialId: string, ctx: TmfCtx): Promise<ListedTmfFiling[]> {
  const study = await requireTmfStudy(poolQueryable, trialId, ctx, false);
  const filings = await studyFilings(study, ctx.organizationId);
  const ids = [...new Set(filings.map(vaultIdOf).filter((id): id is string => id !== null))];
  const documents = await filedDocuments(ids, ctx.organizationId, study.programId);
  return filings.map((filing) => {
    const id = vaultIdOf(filing);
    return { ...filing, document: (id !== null && documents.get(id)) || null };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Remove a filed TMF artifact, with the person's reason (org-scoped). The
 * filing must be live and belong to a study whose project the caller can
 * write; a row with no study is not reachable here.
 *
 * The row is kept (E3): it is marked with who removed it, when and why, and
 * the audit row, written by the same transaction, names the study, the
 * artifact and the document that was filed. Until 2026-11-10 this was a DELETE
 * with no reason.
 */
export async function removeTmfArtifactFiling(input: RemoveArtifactInput, ctx: TmfCtx): Promise<RemovedTmfArtifact> {
  const { id } = input;
  const reason = statedReason(input.reason);
  const notFound = () => new TmfArtifactError('NOT_FOUND', 'TMF artifact not found.');
  if (!UUID.test(id)) throw notFound();
  await transaction(async (q: Queryable) => {
    const { rows } = await q.query(
      `SELECT f.study_ref FROM tmf_artifact_filings f
        WHERE f.id::text = $1 AND f.organization_id = $2 AND f.study_ref IS NOT NULL AND f.removed_at IS NULL`,
      [id, ctx.organizationId],
    );
    if (rows.length === 0) throw notFound();
    let study: TmfStudy;
    try {
      study = await requireTmfStudyByRef(q, Number(rows[0].study_ref), ctx, true);
    } catch (err) {
      // A filing in a project the caller cannot open is not disclosed.
      if (err instanceof TmfArtifactError && err.code === 'STUDY_NOT_FOUND') throw notFound();
      throw err;
    }
    const removed = await q.query(
      `UPDATE tmf_artifact_filings
          SET removed_at = now(), removed_by = $3, removal_reason = $4, updated_at = now()
        WHERE id::text = $1 AND organization_id = $2 AND removed_at IS NULL
        RETURNING id, artifact_code, zone_number, document_ref`,
      [id, ctx.organizationId, ctx.userId, reason],
    );
    // Removed by someone else between the read and the write: there is no live filing to remove.
    if (removed.rows.length === 0) throw notFound();
    const row = removed.rows[0];
    await writeChainedAuditRow(q, {
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'TMF_ARTIFACT_REMOVED',
      resourceType: 'tmf_artifact',
      resourceId: id,
      reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: { study: auditedStudy(study), programId: study.programId, artifactCode: String(row.artifact_code),
        zone: asIntOrNull(row.zone_number), documentRef: asTextOrNull(row.document_ref), reason },
    });
  });
  return { id, auditTrail: RECORDED_WITH_THE_CHANGE };
}

/**
 * What each filing's document reference is NOW. A vault reference is looked up
 * again (org-scoped, in the study's project, soft-deleted documents excluded)
 * — it was verified once, at filing, and a document can be deleted after. A
 * failed lookup throws: it says nothing about the documents, so it must not
 * become a readiness verdict.
 */
async function documentEvidenceFor(
  rows: TmfArtifactFiling[],
  organizationId: number,
  programId: string,
): Promise<Record<string, TmfDocumentEvidence>> {
  const evidence: Record<string, TmfDocumentEvidence> = {};
  const vaultIdByCode = new Map<string, string>();
  for (const r of rows) {
    const ref = typeof r.documentRef === 'string' ? r.documentRef.trim() : '';
    const m = VAULT_REF.exec(ref);
    if (!ref) evidence[r.artifactCode] = 'no_document';
    else if (!m) evidence[r.artifactCode] = 'unverifiable';
    else vaultIdByCode.set(r.artifactCode, m[1].trim());
  }
  if (vaultIdByCode.size === 0) return evidence;
  const { rows: found } = await pool.query(
    `SELECT d.id::text AS id FROM vault.documents d
      WHERE d.id::text = ANY($1::text[])
        AND d.deleted_at IS NULL
        AND d.program_id::text = $3
        AND EXISTS (
          SELECT 1 FROM regulatory_programs rp
           WHERE rp.id = d.program_id
             AND rp.organization_id = $2
             AND rp.deleted_at IS NULL
        )`,
    [[...new Set(vaultIdByCode.values())], organizationId, programId],
  );
  const resolving = new Set(found.map((f: { id: unknown }) => String(f.id)));
  for (const [code, id] of vaultIdByCode) evidence[code] = resolving.has(id) ? 'verified' : 'unresolved';
  return evidence;
}

/** The readiness assessment of a study's TMF, with the study it is about. */
export type TrialTmfCompleteness = TmfCompletenessResult & { study: TmfStudy };

/** One admitted read of a study's TMF: the study, its filings and their assessment. */
export interface TrialTmf {
  study: TmfStudy;
  filings: TmfArtifactFiling[];
  completeness: TrialTmfCompleteness;
}

/**
 * Read a study's TMF once: the study (admitted by the caller's current project
 * access), its filings, and inspection-readiness computed from them.
 * `scope` ('essential' default | 'all') mirrors the checker.
 *
 * 2026-10-15: this passed every filing ROW as a filed document, so a trial whose
 * essential artifacts were recorded with no document — or against vault
 * documents since deleted — read ready. An artifact now counts only when its
 * reference resolves to a document at the time of asking.
 */
export async function readTrialTmf(trialId: string, ctx: TmfCtx, scope: 'essential' | 'all' = 'essential'): Promise<TrialTmf> {
  const study = await requireTmfStudy(poolQueryable, trialId, ctx, false);
  const filings = await studyFilings(study, ctx.organizationId);
  const documentEvidence = await documentEvidenceFor(filings, ctx.organizationId, study.programId);
  const assessed = assessTmfCompleteness({ providedArtifacts: filings.map((r) => r.artifactCode), scope, documentEvidence });
  return { study, filings, completeness: { ...assessed, study } };
}

/** Inspection-readiness for a study from its stored filings, with the study it is about. */
export async function getTrialTmfCompleteness(
  trialId: string,
  ctx: TmfCtx,
  scope: 'essential' | 'all' = 'essential',
): Promise<TrialTmfCompleteness> {
  return (await readTrialTmf(trialId, ctx, scope)).completeness;
}
