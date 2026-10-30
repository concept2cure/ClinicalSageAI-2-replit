/** A blank CRF working copy from the exact saved design, on the caller's snapshot.
 * The design, projection and source store remain unchanged. */
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import { plainTextToHtml } from '../../../shared/authoring/plain-text-html';
import type { WorkflowImportSource, WorkflowImportOrigin, WorkflowImportAssociation } from '../../../shared/authoring/source-import';
import type { Queryable } from './authoring-evidence';
import { WorkflowSourceImportError, type MaterializedWorkflowSource, type WorkflowMaterializationInput } from './workflow-source-import';
import { rowsToStudyDesign } from '../study-design/study-design-repository';
import { projectCrfShell, type CrfForm, type CrfItem } from '../study-design/crf-shell';
import type { StudyDesign } from '../study-design/study-design-types';
import { readCsrProjectActor } from '../csr/project-scope';
import { programInOrganization } from '../c2c/program-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject } from '../report-os/project-access';

type CrfSource = Extract<WorkflowImportSource, { kind: 'study-design-crf' }>;
type CrfInput = WorkflowMaterializationInput & { source: CrfSource };
type Scope = WorkflowImportOrigin['sourceScope'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const fail = (status: WorkflowSourceImportError['status'], code: string, message: string): never => { throw new WorkflowSourceImportError(status, code, message); };
const LIMITATIONS = [
  'This is a blank form design/specification working copy, not completed patient CRFs, observed subject values, signatures or an approved collection system.',
  'CDASH domain and variable labels are hints from the existing projection; they do not establish CDASH validation, SDTM annotation or EDC deployability.',
  'Review source-supported field identifiers, codelists, requiredness, repeats, edit checks, instrument permissions, standards versions and mappings before use; these are not supplied by this projection.',
  'The projection completeness score describes five design-grounding signals, not CRF collection readiness or regulatory compliance.',
];

async function recordedScope(input: CrfInput, program: unknown, q: Queryable): Promise<Scope> {
  const actor = await readCsrProjectActor(q, input.organizationId, input.userId, { forShare: true });
  if (program === null) return { level: 'organization', programId: null, projectId: null };
  if (typeof program !== 'string' || !UUID.test(program)) return fail(409, 'CRF_SOURCE_SCOPE_INVALID', 'The saved design project association is invalid.');
  const programId = program.toLowerCase();
  if (!await programInOrganization(q, programId, input.organizationId, { forShare: true })) return fail(404, 'CRF_SOURCE_NOT_FOUND', 'Saved study design not found.');
  const anchor = await readProgramAnchorRow(q, { orgId: input.organizationId, programId, context: 'crf-workflow-import', requireUnique: true });
  if (!anchor || !await canAccessReportProject(input.organizationId, actor, anchor.id, q)) return fail(403, 'CRF_SOURCE_ACCESS_DENIED', 'The saved design project is not currently accessible to this actor.');
  if (programId !== input.target.programId.toLowerCase() || anchor.id !== input.target.projectId) return fail(409, 'CRF_SOURCE_SCOPE_MISMATCH', 'Open this saved design’s recorded project before importing its blank forms.');
  return { level: 'program', programId, projectId: anchor.id };
}

function verifiedDesign(row: Record<string, unknown>, input: CrfInput, scope: Scope): StudyDesign {
  const design = rowsToStudyDesign(row);
  if (!design || typeof design !== 'object' || Array.isArray(design) || typeof design.title !== 'string' || !design.title.trim()) return fail(409, 'CRF_SOURCE_INVALID', 'The saved study design is unavailable or invalid.');
  if (design.id !== undefined && design.id !== input.source.studyId) return fail(409, 'CRF_SOURCE_IDENTITY_MISMATCH', 'The saved design identity does not match its source row.');
  if (design.organizationId !== undefined && design.organizationId !== input.organizationId) return fail(409, 'CRF_SOURCE_IDENTITY_MISMATCH', 'The saved design organization does not match its source row.');
  if (design.programId !== undefined && (typeof design.programId !== 'string' || !UUID.test(design.programId)
    || design.programId.toLowerCase() !== scope.programId)) return fail(409, 'CRF_SOURCE_SCOPE_MISMATCH', 'The saved design and its source row disagree about their recorded project.');
  return design;
}

async function readSavedDesign(input: CrfInput, q: Queryable) {
  const { rows } = await q.query(`SELECT s.study_id, s.program_id, OCTET_LENGTH(to_jsonb(s)::text) AS source_bytes
    FROM cdisc_prm_studies s WHERE s.study_id=$1 AND s.tenant_id=$2 FOR SHARE OF s`, [input.source.studyId, input.organizationId]);
  if (rows.length !== 1) return fail(404, 'CRF_SOURCE_NOT_FOUND', 'Saved study design not found.');
  const header: Record<string, unknown> = rows[0];
  const scope = await recordedScope(input, header.program_id, q);
  if (typeof header.source_bytes !== 'number' || header.source_bytes > 2_000_000) return fail(409, 'CRF_SOURCE_LIMIT', 'The saved design exceeds the working-copy limit.');
  // Only after current actor, source programme and target admission: read all
  // saved fields so even a non-projected change invalidates the preview.
  const saved = await q.query('SELECT to_jsonb(s) AS snapshot FROM cdisc_prm_studies s WHERE s.study_id=$1 AND s.tenant_id=$2', [input.source.studyId, input.organizationId]);
  const row = saved.rows[0]?.snapshot;
  if (saved.rows.length !== 1 || !row || typeof row !== 'object' || Array.isArray(row)
    || row.study_id !== input.source.studyId || row.tenant_id !== input.organizationId || row.program_id !== header.program_id) return fail(409, 'CRF_SOURCE_INVALID', 'The saved design identity could not be verified.');
  return { row: row as Record<string, unknown>, scope, design: verifiedDesign(row, input, scope) };
}

function itemText(item: CrfItem, index: number): string {
  return [`Item ${index + 1}: ${item.prompt}`, `Type: ${item.type}`, `Derived from: ${item.derivedFrom}`,
    `CDASH variable hint: ${item.cdashVar ?? 'not recorded'}`, `Units: ${item.units ?? 'not recorded'}`,
    `Placeholder: ${item.placeholder === true ? 'yes — complete from supported design evidence' : 'not flagged by the projection'}`].join('\n');
}

function formText(form: CrfForm, design: StudyDesign): string {
  const visits = new Map((design.scheduleOfActivities?.visits ?? []).map(visit => [visit.id, visit.name]));
  return [`Form: ${form.name}`, `Origin: ${form.origin}`, `CDASH domain hint: ${form.cdashDomain ?? 'not recorded'}`,
    `Visit IDs: ${form.visitIds.length ? form.visitIds.map(id => `${id}${visits.has(id) ? ` (${visits.get(id)})` : ''}`).join(', ') : 'not visit-scheduled'}`,
    `Source activity: ${form.sourceActivityId ?? 'not recorded'}`, `Source endpoints: ${form.sourceEndpointNames?.join('; ') || 'not recorded'}`,
    `Projection note: ${form.note ?? 'none recorded'}`, '', ...form.items.map(itemText)].join('\n');
}

function composeSections(input: CrfInput, design: StudyDesign, shell: ReturnType<typeof projectCrfShell>, gaps: string[]) {
  const identification = [`Blank CRF shell for ${design.title}`, `Saved study ID: ${input.source.studyId}`,
    `Design version: ${design.version ?? 'not recorded'}`, `Phase: ${design.phase}`, `Indication: ${design.indication}`,
    `Product type: ${design.productType ?? 'not recorded'}`, `Forms: ${shell.counts.forms}; items: ${shell.counts.items}`,
    `Design-derived forms: ${shell.counts.designDerivedForms}; standard scaffold forms: ${shell.counts.standardScaffoldForms}`,
    `Visit-scheduled forms: ${shell.counts.visitScheduledForms}`, `Design grounding: ${shell.completeness.satisfied}/${shell.completeness.total} (${shell.completeness.percent}%)`,
    '', ...LIMITATIONS].join('\n');
  const sections = [{ code: 'crf.identification', title: 'Blank CRF identification and limitations', content: plainTextToHtml(identification) },
    { code: 'crf.gaps', title: 'Recorded CRF gaps and specification review', content: plainTextToHtml(gaps.join('\n\n')) },
    ...shell.forms.map((form, index) => ({ code: `crf.form.${String(index + 1).padStart(3, '0')}`, title: form.name, content: plainTextToHtml(formText(form, design)) }))];
  if (sections.length > 200 || sections.reduce((size, section) => size + section.content.length, 0) > 2_000_000) return fail(409, 'CRF_SOURCE_LIMIT', 'The projected blank forms exceed the working-copy limit.');
  return sections;
}

export async function materializeStudyDesignCrfSource(input: CrfInput, q: Queryable): Promise<MaterializedWorkflowSource> {
  const { row, scope, design } = await readSavedDesign(input, q);
  const shell = projectCrfShell(design);
  const gaps = [...shell.gaps, ...LIMITATIONS];
  const sections = composeSections(input, design, shell, gaps);
  const sectionOrigins = sections.map(section => ({ code: section.code, sourceRowId: `cdisc_prm_studies:${input.source.studyId}`,
    contentSha256: sha(section.content), originalAuthorship: 'unknown' as const, model: null, modelEvidence: 'unrecorded' as const }));
  const source: CrfSource = { kind: 'study-design-crf', studyId: input.source.studyId };
  const mode = scope.level === 'organization' ? 'explicit' : 'recorded';
  const fingerprint = sha(stableStringify({ source, row, scope, shell, sections, sectionOrigins, gaps }));
  const origin: WorkflowImportOrigin = { kind: source.kind, id: source.studyId, title: `Blank CRF shell — ${design.title}`,
    programId: input.target.programId, documentType: null, sectionCode: null, fingerprint,
    version: typeof row.protocol_version === 'string' ? row.protocol_version : null, conversion: 'study-design-crf-projection', sourceScope: scope,
    association: { mode, reason: mode === 'explicit' ? input.associationReason?.trim() || null : null }, sectionOrigins, selection: source, gaps };
  const association: WorkflowImportAssociation = { mode, required: mode === 'explicit', reasonRequired: mode === 'explicit',
    sourceProgramId: scope.programId, sourceProjectId: scope.projectId, targetProgramId: input.target.programId };
  const warnings = ['This blank CRF working copy is an unbound draft. Source completion, approval and signatures are not transferred.',
    'Original authorship and model qualification are not established by deterministic projection or a workflow fingerprint.', ...LIMITATIONS];
  if (mode === 'explicit') warnings.push('The saved design has no recorded project association. Creation requires an explicit association reason.');
  return { origin, fingerprint, sections, gaps, warnings, association };
}
