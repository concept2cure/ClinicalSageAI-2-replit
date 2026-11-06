/** Module 2.4/2.6 read P-55's governed register through the existing project
 * policy and P-104 private source authority. Model-written figures are refused.
 * The deterministic composers produce drafts/worksheets, not safety approval. */
import { createHash } from 'node:crypto';
import { answersBeforeOutline, resolveRecordSourceProject, scopeRefusal, suppliedAny, type RecordSourceContext, type RecordSourceRefusal } from './record-source-project.js';
import { nonclinicalOutline } from './ctd-component-outline.js';
import { readProgramAnchorRow } from '../c2c/program-project-anchor.js';
import { looksLikeProgramUuid } from '../../lib/project-id.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { captureCurrentRunSourceGate, recordCurrentRunSource } from '../ai-gateway/model-call-scope.js';
import { buildEnrichedM24, type NonclinicalStudyInput } from '../preclinical/nonclinical-m24-adapter.js';
import { buildM26NonclinicalSummaries } from '../preclinical/m26-nonclinical-summaries.js';

export const MODEL_SUPPLIED_NONCLINICAL_KEYS = ['studies', 'findings'] as const;
const SNAPSHOT_LIMIT = 'This snapshot belongs to the current request. Re-read the governed records on a later turn before claiming they are current. Verify source reports, proposed placement and scientific applicability; no filing or safety approval is made.';

type AdmittedProject = { organizationId: number; projectId: number; actorUserId?: number };
interface NativeStudy {
  id: number; submissionId: number; applicationType: string; submissionUpdatedAt: string | null;
  studyNumber: string; title: string; studyType: string; species: string | null;
  glpCompliant: boolean | null; noael: string | null; durationLabel: string | null;
  keyFinding: string | null; ctdSection: string | null; status: string;
  reportFinalizedDate: string | null; updatedAt: string | null;
}
interface Snapshot { programId: string; studies: NativeStudy[]; hash: string }
interface RecordedInputs {
  ok: true; projectId: number; programId: string; studies: NonclinicalStudyInput[];
  snapshotHash: string; records: Array<Pick<NativeStudy, 'id' | 'submissionId' | 'studyNumber' | 'status' | 'updatedAt'>>;
  ignoredSuppliedFigures: false;
}
export type Module2NonclinicalInputs = RecordedInputs | RecordSourceRefusal;
class NonclinicalSourceUnavailable extends Error {
  constructor() { super('The protected project nonclinical source could not be verified. No studies were released.'); }
}

/** A locator is read from the record, never derived from category or title. */
function composerStudy(row: NativeStudy): NonclinicalStudyInput {
  return { studyId: row.studyNumber, studyType: row.studyType, species: row.species,
    glpCompliant: row.glpCompliant, noael: row.noael, duration: row.durationLabel ?? undefined,
    keyFindings: row.keyFinding, reportSection: row.ctdSection ?? undefined };
}

/** Same-org parents, unique anchor and the entire ordered eligible set. An
 * unavailable/unanchored source throws; an empty studies array is a real read. */
async function readSnapshot(client: RequestSqlClient, project: AdmittedProject): Promise<Snapshot> {
  const { rows: parents } = await client.query(`SELECT regulatory_program_id::text AS "programId", status
    FROM projects WHERE id=$1 AND organization_id=$2 AND status IS DISTINCT FROM 'deleted'`,
  [project.projectId, project.organizationId]);
  const programId = parents[0]?.programId;
  if (parents.length !== 1 || typeof programId !== 'string' || !looksLikeProgramUuid(programId)) throw new NonclinicalSourceUnavailable();
  const anchor = await readProgramAnchorRow(client, { programId, orgId: project.organizationId, context: 'module2-nonclinical', requireUnique: true });
  if (anchor?.id !== project.projectId) throw new NonclinicalSourceUnavailable();
  const { rows: programs } = await client.query(`SELECT id::text AS id, status FROM regulatory_programs
    WHERE id=$1::uuid AND organization_id=$2 AND deleted_at IS NULL AND status IS DISTINCT FROM 'deleted'`,
  [programId, project.organizationId]);
  if (programs.length !== 1) throw new NonclinicalSourceUnavailable();
  const { rows } = await client.query(`SELECT s.id, s.submission_id AS "submissionId", su.application_type AS "applicationType",
      su.updated_at::text AS "submissionUpdatedAt", s.study_number AS "studyNumber", s.title,
      s.study_type AS "studyType", s.species, s.glp_compliant AS "glpCompliant", s.noael,
      s.duration_label AS "durationLabel", s.key_finding AS "keyFinding", s.ctd_section AS "ctdSection", s.status,
      s.report_finalized_date::text AS "reportFinalizedDate", s.updated_at::text AS "updatedAt"
    FROM nonclinical_studies s JOIN submissions su ON su.id=s.submission_id AND su.organization_id=s.organization_id
    WHERE s.organization_id=$1 AND su.organization_id=$1 AND su.program_id=$2::uuid
      AND s.deleted_at IS NULL AND su.deleted_at IS NULL
      AND (s.status='finalized' OR (s.status='in_reporting' AND lower(btrim(su.application_type))='ind'))
    ORDER BY s.id`, [project.organizationId, programId]);
  const hash = createHash('sha256').update(JSON.stringify({ projectId: project.projectId, parents, programs, studies: rows })).digest('hex');
  return { programId, studies: rows as unknown as NativeStudy[], hash };
}

/** Source authority is private run state, never a receipt accepted from JSON.
 * Capture scalars/hash only; callers cannot mutate a later SDK recheck. */
async function registerSnapshot(client: RequestSqlClient, project: AdmittedProject, snapshot: Snapshot, module: '2.4' | '2.6'): Promise<void> {
  const organizationId = project.organizationId, userId = project.actorUserId, projectId = project.projectId;
  const programId = snapshot.programId, hash = snapshot.hash;
  const pinned = Object.freeze({ organizationId, userId, projectId, projectRef: programId, sqlClient: client });
  const recheck = async () => {
    const admitted = await resolveRecordSourceProject({}, pinned, { module, source: 'governed nonclinical studies', requiresRequestClient: true }, false);
    if (!admitted.ok || admitted.projectId !== projectId) throw new NonclinicalSourceUnavailable();
    const fresh = await readSnapshot(client, admitted);
    if (fresh.programId !== programId || fresh.hash !== hash) throw new NonclinicalSourceUnavailable();
  };
  // SSE may publish the tool result before the next model call. Check now as
  // well as on every protected SDK dispatch/retry/fallback.
  await recheck();
  const registered = recordCurrentRunSource({ organizationId, userId, projectId, programId,
    key: `nonclinical:${organizationId}:${projectId}:${programId}:${hash}`, tier: 3, recheck });
  if (!registered) throw new NonclinicalSourceUnavailable();
}

function unavailable(projectId: number): RecordSourceRefusal {
  return { ok: false, status: 'unavailable', projectId, code: 'NONCLINICAL_SOURCE_UNAVAILABLE', ignoredSuppliedFigures: false,
    message: 'The protected nonclinical source binding is unavailable for this request. No study-bearing result was released. Source availability could not be established; this is not an empty eligible study set.' };
}

export async function loadModule2NonclinicalInputs(
  input: Record<string, unknown>, ctx: RecordSourceContext | undefined, module: '2.4' | '2.6',
): Promise<Module2NonclinicalInputs> {
  const ignoredSuppliedFigures = suppliedAny(input, MODEL_SUPPLIED_NONCLINICAL_KEYS);
  const subject = { module, source: 'governed nonclinical studies', requiresRequestClient: true };
  const project = await resolveRecordSourceProject(input, ctx, subject, ignoredSuppliedFigures);
  if (!project.ok && project.status === 'needs_project' && !project.code) return { ...project,
    message: 'No project is open or named, so no project studies were read. Open or name the project to select its protected governed records; figures from the conversation are not used.' };
  if (!project.ok) return project;
  if (ignoredSuppliedFigures) return { ok: false, status: 'needs_data', projectId: project.projectId, ignoredSuppliedFigures,
    code: 'MODEL_SUPPLIED_NONCLINICAL_FIGURES', message: 'Studies, NOAELs and findings supplied in the call are not used. Call this tool without study figures to read the governed project records.' };
  if (!ctx?.sqlClient || !project.actorUserId || !captureCurrentRunSourceGate({ organizationId: project.organizationId, userId: project.actorUserId })) return unavailable(project.projectId);
  try {
    const snapshot = await readSnapshot(ctx.sqlClient, project);
    await registerSnapshot(ctx.sqlClient, project, snapshot, module);
    if (snapshot.studies.length === 0) return { ok: false, status: 'needs_data', projectId: project.projectId, ignoredSuppliedFigures: false,
      message: 'No eligible studies were found in this project’s governed nonclinical register: finalized studies and studies in reporting for their own IND submission are eligible. Planned, in-life, cancelled, deleted or unlinked studies were not used.' };
    return { ok: true, projectId: project.projectId, programId: snapshot.programId,
      studies: snapshot.studies.map(composerStudy), snapshotHash: snapshot.hash, ignoredSuppliedFigures: false,
      records: snapshot.studies.map(({ id, submissionId, studyNumber, status, updatedAt }) => ({ id, submissionId, studyNumber, status, updatedAt })) };
  } catch (error) {
    if (error instanceof NonclinicalSourceUnavailable) return unavailable(project.projectId);
    return scopeRefusal(error, subject, false);
  }
}

/** Both registered tools use this owner. No document is saved or approved. */
export async function draftNonclinicalFromRecords(input: Record<string, unknown>, ctx: RecordSourceContext | undefined, module: '2.4' | '2.6'): Promise<string> {
  try {
    const sourced = await loadModule2NonclinicalInputs(input, ctx, module);
    if (sourced.ok) {
      const summary = module === '2.4'
        ? buildEnrichedM24({ studies: sourced.studies }).summary
        : buildM26NonclinicalSummaries({ studies: sourced.studies });
      return JSON.stringify({ basis: 'recorded', summary, nonclinical_data: { status: 'recorded', source: 'nonclinical_studies',
        projectId: sourced.projectId, programId: sourced.programId, snapshotHash: sourced.snapshotHash, records: sourced.records },
      next_step: SNAPSHOT_LIMIT });
    }
    if (answersBeforeOutline(sourced)) return JSON.stringify(sourced);
    const title = module === '2.4' ? 'Nonclinical Overview (Module 2.4)' : 'Nonclinical Written and Tabulated Summaries (Module 2.6)';
    return JSON.stringify({ structure: { title, ich_reference: 'ICH M4S(R2)', ...(await nonclinicalOutline(module)) },
      nonclinical_data: { status: sourced.status, message: sourced.message,
        ...(sourced.code ? { code: sourced.code } : {}), ...(sourced.projectId ? { projectId: sourced.projectId } : {}) },
      next_step: `${sourced.message} Module ${module} was not composed; do not fill this requirements outline with figures from the conversation. ${SNAPSHOT_LIMIT}` });
  } catch {
    return JSON.stringify({ code: 'NONCLINICAL_DRAFT_UNAVAILABLE', error: `Module ${module} source context is unavailable. Nothing was composed.` });
  }
}
