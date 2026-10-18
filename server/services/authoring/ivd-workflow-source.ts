/** Exact saved IVD snapshots for the existing verified Authoring import. Read-only. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import type { WorkflowImportSource, WorkflowImportOrigin, WorkflowImportAssociation } from '../../../shared/authoring/source-import';
import type { Queryable } from './authoring-evidence';
import { WorkflowSourceImportError, type MaterializedWorkflowSource, type WorkflowMaterializationInput } from './workflow-source-import';
import { readCsrProjectActor } from '../csr/project-scope';
import { programInOrganization } from '../c2c/program-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject } from '../report-os/project-access';
import { launchScopeEnforced } from '../entitlements/launch-scope';

type IvdSource = Extract<WorkflowImportSource, { kind: 'ivd-assessment' | 'ivd-document' }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fail = (status: WorkflowSourceImportError['status'], code: string, message: string): never => { throw new WorkflowSourceImportError(status, code, message); };

async function recordedScope(input: WorkflowMaterializationInput, record: Record<string, unknown>, q: Queryable): Promise<WorkflowImportOrigin['sourceScope']> {
  const actor = await readCsrProjectActor(q, input.organizationId, input.userId);
  if (record.program_id === null) return { level: 'organization', programId: null, projectId: null };
  const programId = record.program_id;
  if (typeof programId !== 'string' || !UUID.test(programId)) return fail(409, 'IVD_SOURCE_SCOPE_INVALID', 'The saved IVD program association is invalid.');
  if (!await programInOrganization(q, programId, input.organizationId)) return fail(404, 'IVD_SOURCE_NOT_FOUND', 'Saved IVD source not found.');
  const anchor = await readProgramAnchorRow(q, { orgId: input.organizationId, programId, context: 'ivd-workflow-import', requireUnique: true });
  if (!anchor || !await canAccessReportProject(input.organizationId, actor, anchor.id, q)) return fail(403, 'IVD_SOURCE_ACCESS_DENIED', 'The saved IVD program is not currently accessible to this actor.');
  if (programId.toLowerCase() !== input.target.programId.toLowerCase() || anchor.id !== input.target.projectId) return fail(409, 'IVD_SOURCE_SCOPE_MISMATCH', 'Open this IVD source’s recorded program before importing it.');
  return { level: 'program', programId: programId.toLowerCase(), projectId: anchor.id };
}

function snapshotSections(source: IvdSource, row: Record<string, unknown>): MaterializedWorkflowSource['sections'] {
  const fragments = source.kind === 'ivd-assessment'
    ? [{ code: 'ivd.inputs', title: 'Recorded assessment inputs', value: row.inputs },
       { code: 'ivd.result', title: 'Saved assessment result', value: row.result }]
    : [{ code: 'ivd.document', title: 'Saved generated document payload', value: row.payload }];
  fragments.unshift({ code: 'ivd.record', title: 'Saved source metadata', value: { id: row.id, title: row.title,
    ...(source.kind === 'ivd-assessment' ? { assessmentType: row.assessment_type, verdict: row.verdict, engineVersion: row.engine_version }
      : { documentType: row.doc_type, status: row.status }), corpusVersion: row.corpus_version, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at } });
  if (fragments.some(fragment => fragment.value === null || typeof fragment.value !== 'object')) return fail(409, 'IVD_SOURCE_CONTENT_INVALID', 'The saved IVD snapshot is unavailable or invalid.');
  return fragments.map(fragment => ({ code: fragment.code, title: fragment.title,
    content: `<h2>${escape(fragment.title)}</h2><pre>${escape(JSON.stringify(fragment.value, null, 2))}</pre>` }));
}

export async function materializeIvdWorkflowSource(input: WorkflowMaterializationInput & { source: IvdSource }, q: Queryable): Promise<MaterializedWorkflowSource> {
  if (launchScopeEnforced()) return fail(403, 'IVD_SOURCE_DEFERRED', 'IVD saved-source authoring is outside the current release.');
  const source = { ...input.source, documentId: input.source.documentId.toLowerCase() };
  const assessment = source.kind === 'ivd-assessment';
  // Static table choices only; no caller-supplied SQL identity or content.
  const sql = assessment
    ? `SELECT id, program_id, assessment_type, title, inputs, result, verdict, corpus_version, engine_version, created_by, created_at, updated_at FROM ivd_assessments WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR SHARE`
    : `SELECT id, program_id, doc_type, title, payload, status, corpus_version, created_by, created_at, updated_at FROM ivd_generated_documents WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL FOR SHARE`;
  const { rows } = await q.query(sql, [source.documentId, input.organizationId]);
  if (rows.length !== 1) return fail(404, 'IVD_SOURCE_NOT_FOUND', 'Saved IVD source not found.');
  const row: Record<string, unknown> = rows[0];
  const scope = await recordedScope(input, row, q);
  const sections = snapshotSections(source, row);
  if (sections.reduce((size, section) => size + section.content.length, 0) > 2_000_000) return fail(409, 'IVD_SOURCE_LIMIT', 'The saved IVD snapshot exceeds the working-copy limit.');
  const sectionOrigins = sections.map(section => ({ code: section.code, sourceRowId: `${assessment ? 'ivd_assessments' : 'ivd_generated_documents'}:${source.documentId}`,
    contentSha256: sha(section.content), originalAuthorship: 'unknown' as const, model: null, modelEvidence: 'unrecorded' as const }));
  const mode = scope.level === 'organization' ? 'explicit' : 'recorded';
  const gaps = ['This snapshot is a working copy of saved data; it establishes no conformity, clinical performance, approval or transmitted filing.',
    'The original result’s model/authorship qualification is not established by the saved row or this import.'];
  const fingerprint = sha(stableStringify({ source, row, scope, sections, sectionOrigins, gaps }));
  const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : assessment ? `IVD ${String(row.assessment_type)} assessment` : `IVD ${String(row.doc_type)} document`;
  const origin: WorkflowImportOrigin = { kind: source.kind, id: source.documentId, title, programId: input.target.programId,
    documentType: null, sectionCode: null, version: typeof row.corpus_version === 'string' ? row.corpus_version : null, fingerprint,
    conversion: assessment ? 'ivd-assessment-snapshot' : 'ivd-document-snapshot', sourceScope: scope,
    association: { mode, reason: mode === 'explicit' ? input.associationReason?.trim() || null : null },
    sectionOrigins, selection: source, gaps };
  const association: WorkflowImportAssociation = { mode, required: mode === 'explicit', reasonRequired: mode === 'explicit',
    sourceProgramId: scope.programId, sourceProjectId: scope.projectId, targetProgramId: input.target.programId };
  const warnings = ['Original input, result and signatures are retained in their saved store. The working copy starts as an unbound draft for review in Authoring.',
    'Original approval or transmission status is not transferred. Choose filing placement and review/sign the document through the existing lifecycle.'];
  if (mode === 'explicit') warnings.push('This saved record is unfiled. A governed association reason is required for its working copy.');
  return { origin, fingerprint, sections, gaps, warnings, association };
}
