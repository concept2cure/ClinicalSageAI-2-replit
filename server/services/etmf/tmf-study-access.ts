/**
 * Who may read or write a study's trial master file, and the study it names: the half of the TMF artifact
 * persistence service that admits a caller to a study's project. Split out of tmf-artifact-persistence.ts
 * (2026-11-12, when "not applicable" took that file past its size), in its folder; that file re-exports what its
 * callers import from it.
 *
 * A TMF belongs to a study of a project (founder decision P-75; eTMF convergence slice E2,
 * docs/design/ETMF_CONVERGENCE_2026-10-30.md). The trial a caller names is the study's own id string, the `studyId`
 * that GET /api/study-design?program_id= lists (cdisc_prm_studies.study_id). It must be a study of the caller's
 * organization whose project the caller can currently open; anything else is STUDY_NOT_FOUND and nothing is read or
 * written. Whether the caller can open the project is decided by the Vault's own rule
 * (services/c2c/current-program-access.ts for a read, services/vault/vault-write-authority.ts for a write), not by a
 * rule kept here.
 *
 * @module server/services/etmf/tmf-study-access
 */

import { pool } from '../../db';
import { ProgramReadAccessError, requireCurrentProgramAccess } from '../c2c/current-program-access';
import { requireCurrentVaultProgramWrite } from '../vault/vault-write-authority';

/** The caller, from the session; `ipAddress` and `userAgent` go on the audit row of a write. */
export type TmfCtx = { organizationId: number; userId: number; ipAddress?: string; userAgent?: string };

/** Every refusal this service gives, with the HTTP status its route answers. */
export const TMF_ERROR_STATUS = {
  NOT_FOUND: 404,
  STUDY_NOT_FOUND: 404,
  UNKNOWN_ARTIFACT: 400,
  UNRESOLVABLE_DOCUMENT_REF: 400,
  REASON_REQUIRED: 400,
  DOCUMENT_NOT_IN_PROJECT: 409,
  RECORD_FILED: 409,
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
export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}
export const poolQueryable: Queryable = { query: (text, params) => pool.query(text, params) };

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

export const studyNotFound = () =>
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
export async function requireTmfStudy(q: Queryable, trialId: string, ctx: TmfCtx, forWrite: boolean): Promise<TmfStudy> {
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
export async function requireTmfStudyByRef(q: Queryable, studyRef: number, ctx: TmfCtx, forWrite: boolean): Promise<TmfStudy> {
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
