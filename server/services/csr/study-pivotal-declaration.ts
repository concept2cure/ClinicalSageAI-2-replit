/**
 * The sponsor's declaration, per study, of whether it is pivotal (D5, founder's
 * decision of 2026-10-29; docs/design/STUDY_PIVOTAL_DECLARATION_2026-10-29.md).
 *
 * Module 2 decided "pivotal" from the phase number: Phase 3 was pivotal and a
 * Phase 2/3 study was not, whatever the sponsor's position. It is the sponsor's
 * claim, so the client declares it, study by study, with a reason, and Module 2
 * reads the declaration (m2-summary-builders.ts). An undeclared study is not
 * pivotal and is named as undeclared; nothing is inferred.
 *
 * A study is keyed as the CSR loader keys it: the project and the study id of
 * its CSR builds (csr_build_jobs). The table is append-only
 * (migrations/20261029e_study_pivotal_declarations.sql): the latest row is the
 * current declaration and every earlier one stays as its history.
 */
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '../../../shared/constants/governed-reason';

export interface StudyPivotalQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface StudyPivotalDeclaration {
  studyId: string;
  pivotal: boolean;
  reason: string;
  declaredBy: number;
  declaredAt: string;
  /** Who declared it, by name, where the reader resolves one (readProjectStudyPivotal). */
  declaredByName?: string | null;
}

/** One study of a project, as its latest CSR build names it, with its current declaration. */
export interface ProjectStudyPivotal {
  studyId: string;
  protocolNumber: string | null;
  title: string | null;
  phase: string | null;
  declaration: StudyPivotalDeclaration | null;
}

export class StudyPivotalDeclarationError extends Error {
  constructor(readonly status: 400 | 404, readonly code: string, message: string) {
    super(message);
    this.name = 'StudyPivotalDeclarationError';
  }
}

const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function declarationOf(row: Record<string, unknown>): StudyPivotalDeclaration {
  const at = row.declared_at;
  return {
    studyId: String(row.study_id),
    pivotal: row.pivotal === true,
    reason: String(row.reason),
    declaredBy: Number(row.declared_by),
    declaredAt: at instanceof Date ? at.toISOString() : String(at),
  };
}

/** The current declaration of each declared study of a project. */
export async function currentPivotalDeclarations(
  q: StudyPivotalQueryable, organizationId: number, projectId: number,
): Promise<Map<string, StudyPivotalDeclaration>> {
  const { rows } = await q.query(
    `SELECT DISTINCT ON (study_id) study_id, pivotal, reason, declared_by, declared_at
       FROM study_pivotal_declarations
      WHERE organization_id = $1 AND project_id = $2
      ORDER BY study_id, declared_at DESC, id DESC`,
    [organizationId, projectId],
  );
  return new Map(rows.map(row => [String(row.study_id), declarationOf(row)]));
}

/** Every study the project's CSR builds name, with its current declaration (null when undeclared). */
export async function readProjectStudyPivotal(
  q: StudyPivotalQueryable, organizationId: number, projectId: number,
): Promise<ProjectStudyPivotal[]> {
  const { rows } = await q.query(
    `SELECT DISTINCT ON (study_id) study_id, study_info_snapshot
       FROM csr_build_jobs
      WHERE organization_id = $1 AND project_id = $2
      ORDER BY study_id, created_at DESC, id DESC`,
    [organizationId, projectId],
  );
  const declared = await currentPivotalDeclarations(q, organizationId, projectId);
  // Who declared each, by name: the resolver the audit views use (public.actor_name).
  const declarers = [...new Set([...declared.values()].map(d => d.declaredBy))];
  if (declarers.length > 0) {
    const names = await q.query(
      'SELECT p.id, a.name FROM unnest($1::integer[]) AS p(id) LEFT JOIN LATERAL public.actor_name(p.id) a ON TRUE',
      [declarers],
    );
    const byId = new Map(names.rows.map(r => [Number(r.id), textOrNull(r.name)]));
    for (const d of declared.values()) d.declaredByName = byId.get(d.declaredBy) ?? null;
  }
  return rows.map(row => {
    const studyId = String(row.study_id);
    const snapshot = row.study_info_snapshot as { studyInfo?: Record<string, unknown> } | null;
    const info = snapshot?.studyInfo ?? {};
    return {
      studyId,
      protocolNumber: textOrNull(info.protocolNumber),
      title: textOrNull(info.title),
      phase: textOrNull(info.phase),
      declaration: declared.get(studyId) ?? null,
    };
  });
}

/**
 * Record the sponsor's declaration for one study of the project. The study
 * must be one the project's CSR builds name, and the reason is stated (the
 * governed-reason floor). A change is a new row.
 */
export async function declareStudyPivotal(q: StudyPivotalQueryable, input: {
  organizationId: number; projectId: number; studyId: unknown; pivotal: unknown; reason: unknown; declaredBy: number;
}): Promise<StudyPivotalDeclaration> {
  if (typeof input.pivotal !== 'boolean') {
    throw new StudyPivotalDeclarationError(400, 'PIVOTAL_CHOICE_REQUIRED', 'Choose whether this study is pivotal. Nothing was recorded.');
  }
  const studyId = typeof input.studyId === 'string' ? input.studyId.trim() : '';
  if (!studyId || studyId.length > 200) {
    throw new StudyPivotalDeclarationError(400, 'STUDY_REQUIRED', 'Name the study this declaration is for. Nothing was recorded.');
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < GOVERNED_REASON_MIN || reason.length > GOVERNED_REASON_MAX) {
    throw new StudyPivotalDeclarationError(400, 'PIVOTAL_REASON_REQUIRED',
      `State why, in at least ${GOVERNED_REASON_MIN} characters. Nothing was recorded.`);
  }
  const study = await q.query(
    'SELECT 1 FROM csr_build_jobs WHERE organization_id = $1 AND project_id = $2 AND study_id = $3 LIMIT 1',
    [input.organizationId, input.projectId, studyId],
  );
  if (study.rows.length === 0) {
    throw new StudyPivotalDeclarationError(404, 'STUDY_NOT_IN_PROJECT',
      'This project has no CSR for that study, so there is nothing to declare. Nothing was recorded.');
  }
  const { rows } = await q.query(
    `INSERT INTO study_pivotal_declarations (organization_id, project_id, study_id, pivotal, reason, declared_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING study_id, pivotal, reason, declared_by, declared_at`,
    [input.organizationId, input.projectId, studyId, input.pivotal, reason, input.declaredBy],
  );
  return declarationOf(rows[0]);
}
