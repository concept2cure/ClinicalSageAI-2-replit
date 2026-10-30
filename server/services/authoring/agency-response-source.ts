/** Exact visible agency question/answer → the existing independent Authoring copy.
 * No agency record, approval or signature is written or adopted here. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { plainTextToHtml } from '../../../shared/authoring/plain-text-html';
import { AGENCY_CONTEXT_SECTION_CODE, AGENCY_RESPONSE_SECTION_CODE, agencyResponseImportId, type WorkflowImportOrigin, type WorkflowImportSource } from '../../../shared/authoring/source-import';
import { readLetter } from '../agency-responses/response-service';
import { canViewVisibilityTier } from '../agency-responses/visibility';
import { readCsrProjectActor } from '../csr/project-scope';
import { programInOrganization } from '../c2c/program-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject } from '../report-os/project-access';
import type { Queryable } from './authoring-evidence';
import { WorkflowSourceImportError, type MaterializedWorkflowSource, type WorkflowMaterializationInput } from './workflow-source-import';
import { retainedAgencyResponseMachineOrigin } from './agency-response-machine-origin';

export { AGENCY_CONTEXT_SECTION_CODE, AGENCY_RESPONSE_SECTION_CODE } from '../../../shared/authoring/source-import';
type AgencySource = Extract<WorkflowImportSource, { kind: 'agency-response' }>;
type AgencyInput = WorkflowMaterializationInput & { source: AgencySource };
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const fail = (status: WorkflowSourceImportError['status'], code: string, message: string): never => {
  throw new WorkflowSourceImportError(status, code, message);
};
const warnings = [
  'This is an independent working draft. Source completion, approval and signatures are not transferred.',
  'Save and review the response in the editor, then explicitly record that saved response on the original agency question. Editing this copy alone does not update the response register or package.',
  'Original authorship, model use, source support and scientific or regulatory correctness are not established by this copy or its fingerprint.',
];

const boundedText = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit;
const requiredText = (value: unknown, limit: number): value is string => boundedText(value, limit) && Boolean(value.trim());
const optionalText = (value: unknown): boolean => value == null || typeof value === 'string';
const revisionNumber = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;

function verifiedQuestion(row: Record<string, unknown>, input: AgencyInput, projectId: number) {
  if (row.id !== input.source.questionId || row.organization_id !== input.organizationId || row.project_id !== projectId
    || row.communication_event_id !== input.source.eventId) return fail(409, 'AGENCY_SOURCE_INVALID', 'The recorded agency question identity is invalid.');
  if (!requiredText(row.question_ref, 40) || !requiredText(row.question_text, 20_000)
    || !boundedText(row.response_text, 100_000) || !revisionNumber(row.response_revision)
    || !optionalText(row.discipline) || !optionalText(row.ctd_section)) {
    return fail(409, 'AGENCY_SOURCE_INVALID', 'The recorded agency question or response version is invalid.');
  }
  return { id: input.source.questionId, questionRef: row.question_ref, questionText: row.question_text,
    discipline: row.discipline ?? null, ctdSection: row.ctd_section ?? null,
    responseText: row.response_text, responseRevision: row.response_revision };
}

async function admittedSource(input: AgencyInput, q: Queryable) {
  const actor = await readCsrProjectActor(q, input.organizationId, input.userId);
  const programId = input.target.programId.toLowerCase();
  if (!await programInOrganization(q, programId, input.organizationId)) return fail(404, 'AGENCY_SOURCE_NOT_FOUND', 'Agency response source not found in this project.');
  const anchor = await readProgramAnchorRow(q, { programId, orgId: input.organizationId, context: 'agency-response-workflow-import', requireUnique: true });
  if (!anchor || anchor.id !== input.target.projectId) return fail(409, 'AGENCY_SOURCE_SCOPE_MISMATCH', 'The agency response target project could not be verified.');
  if (!await canAccessReportProject(input.organizationId, actor, anchor.id, q)) return fail(403, 'AGENCY_SOURCE_ACCESS_DENIED', 'Current project access is required to read this agency response.');
  const letter = await readLetter(q, input.organizationId, anchor.id, input.source.eventId);
  if (!letter || !canViewVisibilityTier(letter.visibilityTier as Parameters<typeof canViewVisibilityTier>[0], actor.role ?? undefined)) {
    return fail(404, 'AGENCY_SOURCE_NOT_FOUND', 'Agency response source not found in this project.');
  }
  if (letter.closureStatus === 'closed') return fail(409, 'AGENCY_SOURCE_CLOSED', 'This agency letter is closed. Its response cannot start a new editing copy.');
  const response = await q.query(`SELECT id, organization_id, project_id, communication_event_id,
      question_ref, question_text, discipline, ctd_section, response_text, response_revision, withdrawn_at
    FROM agency_communication_questions
    WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND communication_event_id=$4`,
  [input.source.questionId, input.organizationId, anchor.id, input.source.eventId]);
  if (response.rows.length !== 1) return fail(404, 'AGENCY_SOURCE_NOT_FOUND', 'Agency response source not found in this project.');
  const row: Record<string, unknown> = response.rows[0];
  if (row.withdrawn_at != null) return fail(409, 'AGENCY_SOURCE_WITHDRAWN', 'This agency question is withdrawn. Its response cannot start a new editing copy.');
  return { letter, row: verifiedQuestion(row, input, anchor.id),
  scope: { level: 'program' as const, programId, projectId: anchor.id } };
}

export async function materializeAgencyResponseSource(input: AgencyInput, q: Queryable): Promise<MaterializedWorkflowSource> {
  const id = agencyResponseImportId(input.source.eventId, input.source.questionId);
  if (!id) return fail(400, 'WORKFLOW_SOURCE_INVALID', 'Choose an exact saved agency question.');
  const { letter, row, scope } = await admittedSource(input, q);
  const machineOrigin = await retainedAgencyResponseMachineOrigin(q, { organizationId: input.organizationId, questionId: row.id,
    eventId: letter.eventId, questionRef: row.questionRef, questionText: row.questionText,
    responseText: row.responseText, responseRevision: row.responseRevision });
  const source: AgencySource = { kind: 'agency-response', eventId: input.source.eventId, questionId: input.source.questionId };
  const title = `Agency response ${row.questionRef} — ${letter.communicationType}`;
  const sections = [
    { code: AGENCY_CONTEXT_SECTION_CODE, title: 'Recorded agency question and working-copy limits', content: plainTextToHtml([
      `Letter: ${letter.communicationType}`, `Recorded event: ${letter.eventId}`, `Question: ${row.questionRef}`,
      row.questionText, `Discipline: ${row.discipline ?? 'not recorded'}`, `Recorded CTD section: ${row.ctdSection ?? 'not recorded'}`,
      `Response revision: ${row.responseRevision}`, ...warnings,
    ].join('\n\n')) },
    { code: AGENCY_RESPONSE_SECTION_CODE, title: `Response to ${row.questionRef}`, content: plainTextToHtml(row.responseText) },
  ];
  const gaps = row.responseText.trim() ? [] : ['This question has no saved response. Prepare source-supported response text before recording it on the agency question.'];
  const sectionOrigins = sections.map(section => ({ code: section.code, sourceRowId: `agency_communication_questions:${row.id}`,
    contentSha256: sha(section.content), originalAuthorship: section.code === AGENCY_RESPONSE_SECTION_CODE && machineOrigin.machine ? 'machine' as const : 'unknown' as const,
    model: null, modelEvidence: 'unrecorded' as const }));
  const fingerprint = sha(stableStringify({ source, scope, letter: { eventId: letter.eventId, communicationType: letter.communicationType,
    sourceType: letter.sourceType, visibilityTier: letter.visibilityTier, closureStatus: letter.closureStatus, responseRequired: letter.responseRequired },
  question: row, sections, sectionOrigins, gaps, machineOrigin }));
  const origin: WorkflowImportOrigin = { kind: source.kind, id, title, programId: scope.programId,
    documentType: null, sectionCode: null, fingerprint, selection: source, gaps, version: String(row.responseRevision),
    conversion: 'agency-response-snapshot', sourceScope: scope, association: { mode: 'recorded', reason: null }, sectionOrigins };
  return { origin, fingerprint, sections, gaps, warnings: [...warnings], association: { mode: 'recorded', required: false,
    reasonRequired: false, sourceProgramId: scope.programId, sourceProjectId: scope.projectId, targetProgramId: scope.programId } };
}
