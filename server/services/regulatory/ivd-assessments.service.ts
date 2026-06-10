/**
 * IVD assessment persistence service.
 *
 * Saves the (otherwise stateless) IVD lifecycle calculator results and generated
 * post-market documents as org-scoped, audited records — the persistence the
 * UI/DB-readiness audit identified as the prerequisite for a regulated,
 * client-facing product. Mirrors the design-risk service conventions
 * (raw SQL via the shared pool, org-scoped reads/writes).
 */

import { pool } from '../../db';

/** Recognized assessment types (the calculator families that can be saved). */
export const IVD_ASSESSMENT_TYPES = [
  'ivdr_classification',
  'cdx_pairing',
  'study_design',
  'reviewer_simulation',
  'scientific_validity',
  'analytical_stability',
  'analytical_carryover',
  'analytical_hook_effect',
  'analytical_recovery',
  'analytical_cutoff',
  'analytical_traceability',
  'software_safety_class',
  'software_sdlc',
  'software_cybersecurity',
  'change_510k',
  'change_eu_significant',
  'process_validation',
  'process_capability',
  'lot_release',
  'signal_disproportionality',
  'registration_fda',
  'registration_eu',
  'pathway_readiness',
  'other',
] as const;
export type IvdAssessmentType = (typeof IVD_ASSESSMENT_TYPES)[number];

/** Recognized generated-document types. */
export const IVD_DOCUMENT_TYPES = [
  'emdr',
  'mir',
  'fsn',
  'psur',
  'declaration_of_conformity',
] as const;
export type IvdDocumentType = (typeof IVD_DOCUMENT_TYPES)[number];

export function isAssessmentType(v: unknown): v is IvdAssessmentType {
  return typeof v === 'string' && (IVD_ASSESSMENT_TYPES as readonly string[]).includes(v);
}
export function isDocumentType(v: unknown): v is IvdDocumentType {
  return typeof v === 'string' && (IVD_DOCUMENT_TYPES as readonly string[]).includes(v);
}

// ─── Assessments ────────────────────────────────────────────────────────────

export async function saveAssessment(orgId: number, p: {
  assessmentType: IvdAssessmentType;
  title?: string | null;
  inputs: unknown;
  result: unknown;
  verdict?: string | null;
  corpusVersion?: string | null;
  engineVersion?: string | null;
  createdBy?: string | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO ivd_assessments
       (organization_id, program_id, assessment_type, title, inputs, result, verdict, corpus_version, engine_version, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      orgId,
      (p as any).programId ?? null,
      p.assessmentType,
      p.title ?? null,
      JSON.stringify(p.inputs ?? {}),
      JSON.stringify(p.result ?? {}),
      p.verdict ?? null,
      p.corpusVersion ?? null,
      p.engineVersion ?? null,
      p.createdBy ?? null,
    ]
  );
  return rows[0];
}

export async function listAssessments(orgId: number, opts: { assessmentType?: string; programId?: string; limit?: number } = {}) {
  const args: unknown[] = [orgId];
  let where = 'organization_id = $1 AND deleted_at IS NULL';
  if (opts.assessmentType) { args.push(opts.assessmentType); where += ` AND assessment_type = $${args.length}`; }
  if (opts.programId) { args.push(opts.programId); where += ` AND program_id = $${args.length}`; }
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  const { rows } = await pool.query(
    `SELECT * FROM ivd_assessments WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`,
    args
  );
  return rows;
}

export async function getAssessment(orgId: number, id: string) {
  const { rows } = await pool.query(
    `SELECT * FROM ivd_assessments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [id, orgId]
  );
  return rows[0] ?? null;
}

export async function deleteAssessment(orgId: number, id: string) {
  const { rows } = await pool.query(
    `UPDATE ivd_assessments SET deleted_at = now(), updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id`,
    [id, orgId]
  );
  return rows.length > 0;
}

// ─── Generated documents ────────────────────────────────────────────────────

export async function saveGeneratedDocument(orgId: number, p: {
  docType: IvdDocumentType;
  title?: string | null;
  payload: unknown;
  status?: string | null;
  corpusVersion?: string | null;
  createdBy?: string | null;
  programId?: string | null;
}) {
  const { rows } = await pool.query(
    `INSERT INTO ivd_generated_documents
       (organization_id, program_id, doc_type, title, payload, status, corpus_version, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      orgId, p.programId ?? null, p.docType, p.title ?? null,
      JSON.stringify(p.payload ?? {}), p.status ?? 'draft', p.corpusVersion ?? null, p.createdBy ?? null,
    ]
  );
  return rows[0];
}

export async function listGeneratedDocuments(orgId: number, opts: { docType?: string; programId?: string } = {}) {
  const args: unknown[] = [orgId];
  let where = 'organization_id = $1 AND deleted_at IS NULL';
  if (opts.docType) { args.push(opts.docType); where += ` AND doc_type = $${args.length}`; }
  if (opts.programId) { args.push(opts.programId); where += ` AND program_id = $${args.length}`; }
  const { rows } = await pool.query(
    `SELECT * FROM ivd_generated_documents WHERE ${where} ORDER BY created_at DESC LIMIT 200`,
    args
  );
  return rows;
}
