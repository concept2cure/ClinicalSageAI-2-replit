/** Read exact stored workflow content on the caller's snapshot. This module
 * writes no document, reservation, source association or approval evidence. */
import { createHash } from 'node:crypto';
import { createScopedLogger } from '../../utils/logger';
const sourceLogger = createScopedLogger('workflow-source-import');
import { stableStringify } from '../../../shared/canonical-json';
import type { WorkflowImportSource, WorkflowImportOrigin, WorkflowImportAssociation, WorkflowSectionOrigin } from '../../../shared/authoring/source-import';
import { agencyResponseImportId, studyDesignImportId } from '../../../shared/authoring/source-import';
import type { Queryable } from './authoring-evidence';
import { requireCsrJobAccess, readCsrProjectActor, CsrScopeError } from '../csr/project-scope';
import { canAccessReportProject } from '../report-os/project-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { flattenICHE3Sections, getICHE3Structure, resolveCSRDraftTargets } from '../csr-builder';
import { loadProtocolExportSnapshot, type ProtocolCompositionSnapshot } from '../protocol-export/protocol-export-service';
import { protocolAuthoringSections } from '../protocol-export/protocol-export-logic';
import { validateSoa } from '../protocol-soa/protocol-soa-logic';
import { listLiveMachineSpans, hashSpanText } from '../clinical-regulatory-evidence/span-lineage.service';
import { WORKFLOW_IMPORT_AUTHOR_ID } from './revision-ledger';
import { verifyRetainedProtocolMatrixEndpoints } from './protocol-import-matrix';
import { workflowCopySectionContent } from './workflow-copy-content';
import { importedCsrSectionEvidence } from '../csr/csr-claim-receipts';

export class WorkflowSourceImportError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message); this.name = 'WorkflowSourceImportError';
  }
}
export interface WorkflowMaterializationInput {
  organizationId: number; userId: number;
  target: { programId: string; projectId: number };
  source: WorkflowImportSource; associationReason?: string;
}
export interface MaterializedWorkflowSource {
  origin: WorkflowImportOrigin; fingerprint: string;
  sections: Array<{code:string;title:string;content:string}>;
  gaps: string[]; warnings: string[]; association: WorkflowImportAssociation;
}
type Scope = WorkflowImportOrigin['sourceScope'];
type Composition = {
  title: string; version: string | null; scope: Scope;
  sections: MaterializedWorkflowSource['sections']; sectionOrigins: WorkflowSectionOrigin[];
  gaps: string[]; facts: unknown;
};
const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const fail = (status: WorkflowSourceImportError['status'], code: string, message: string): never => { throw new WorkflowSourceImportError(status, code, message); };
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;

function sourceOrigin(code: string, sourceRowId: string, content: string, authorship: WorkflowSectionOrigin['originalAuthorship'] = 'unknown', model: string | null = null): WorkflowSectionOrigin {
  return { code, sourceRowId, contentSha256: sha(content), originalAuthorship: authorship, model, modelEvidence: model ? 'recorded-name-only' : 'unrecorded' };
}

function validateAgencySource(source: Extract<WorkflowImportSource, { kind: 'agency-response' }>): void {
  if (!agencyResponseImportId(source.eventId, source.questionId)) fail(400, 'WORKFLOW_SOURCE_INVALID', 'Choose an exact saved agency question.');
}

function validateInput(input: WorkflowMaterializationInput): void {
  if (!positive(input.organizationId) || !positive(input.userId) || !positive(input.target.projectId) || !UUID.test(input.target.programId)) fail(400, 'WORKFLOW_SCOPE_INVALID', 'A verified organization actor and target project are required.');
  if (input.source.kind === 'agency-response') {
    return validateAgencySource(input.source);
  }
  if (input.source.kind === 'study-design-crf') {
    const id = input.source.studyId;
    if (typeof id !== 'string' || studyDesignImportId(id) !== id) fail(400, 'WORKFLOW_SOURCE_INVALID', 'Choose an exact saved study design.');
    return;
  }
  const id = input.source.kind === 'csr' ? input.source.jobId : input.source.documentId;
  if (input.source.kind === 'ivd-assessment' || input.source.kind === 'ivd-document') {
    if (typeof id !== 'string' || !UUID.test(id)) fail(400, 'WORKFLOW_SOURCE_INVALID', 'Choose an exact saved IVD record.');
    return;
  }
  if (!positive(id)) fail(400, 'WORKFLOW_SOURCE_INVALID', 'Choose an exact saved protocol or CSR job.');
}

async function protocolRecordedProgram(input: WorkflowMaterializationInput, q: Queryable): Promise<unknown> {
  const { rows } = await q.query("SELECT id, study_design_id, to_jsonb(protocol_documents)->>'program_id' AS program_id FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL", [input.source.kind === 'protocol' ? input.source.documentId : 0, input.organizationId]);
  if (rows.length !== 1) return fail(404, 'WORKFLOW_SOURCE_NOT_FOUND', 'Saved protocol not found.');
  const stored = rows[0].program_id;
  const studyId = rows[0].study_design_id;
  if (studyId === null) return stored ?? null;
  if (typeof studyId !== 'string' || !studyId.trim()) return fail(409, 'WORKFLOW_SOURCE_SCOPE_UNAVAILABLE', 'The protocol study-design relationship could not be verified.');
  const designs = await q.query('SELECT program_id FROM cdisc_prm_studies WHERE study_id = $1 AND tenant_id = $2', [studyId, input.organizationId]);
  if (designs.rows.length !== 1) return fail(409, 'WORKFLOW_SOURCE_SCOPE_UNAVAILABLE', 'The protocol recorded study design is unavailable for this organization.');
  const designProgram = designs.rows[0].program_id;
  if (stored != null && stored !== designProgram) return fail(409, 'WORKFLOW_SOURCE_SCOPE_MISMATCH', 'The saved protocol and its bound design disagree about their project.');
  return stored ?? designProgram;
}

async function protocolScope(input: WorkflowMaterializationInput, q: Queryable): Promise<Scope> {
  const recorded = await protocolRecordedProgram(input, q);
  const actor = await readCsrProjectActor(q, input.organizationId, input.userId);
  if (recorded === null) return {level:'organization',programId:null,projectId:null};
  if (typeof recorded !== 'string' || !UUID.test(recorded)) return fail(409, 'WORKFLOW_SOURCE_SCOPE_UNAVAILABLE', 'The protocol’s recorded project relationship is invalid.');
  const programId = recorded.toLowerCase();
  const anchor = await readProgramAnchorRow(q, {programId,orgId:input.organizationId,context:'protocol-workflow-import',requireUnique:true});
  if (!anchor || !await canAccessReportProject(input.organizationId, actor, anchor.id, q)) return fail(403, 'WORKFLOW_SOURCE_ACCESS_DENIED', 'The saved protocol project is not accessible to this actor.');
  if (programId !== input.target.programId.toLowerCase() || anchor.id !== input.target.projectId) return fail(409, 'WORKFLOW_SOURCE_SCOPE_MISMATCH', 'This protocol belongs to another recorded project. Choose its recorded project.');
  return {level:'program',programId,projectId:anchor.id};
}

function protocolGaps(snapshot: ProtocolCompositionSnapshot): string[] {
  const { document, sourceRows } = snapshot;
  const gaps: string[] = [];
  if (!document.synopsis?.trim()) gaps.push('The saved protocol has no synopsis.');
  if (!document.objectives.length) gaps.push('The saved protocol has no structured objectives or endpoints.');
  if (!sourceRows.eligibility.length) gaps.push('The saved protocol has no structured eligibility criteria.');
  for (const row of sourceRows.sections) if (row.required === true && (typeof row.content !== 'string' || !row.content.trim())) gaps.push(`Required protocol section ${String(row.section_key)} has no saved content.`);
  if (document.soa) gaps.push(...validateSoa(document.soa.matrix, sourceRows.assessments.map(row => ({id:Number(row.id),name:String(row.name),category:String(row.category)}))).findings.map(f => f.message));
  return gaps;
}

function validateProtocolStructure(snapshot: ProtocolCompositionSnapshot): void {
  const { sourceRows } = snapshot;
  if (typeof sourceRows.document.title !== 'string' || typeof sourceRows.document.version !== 'string') fail(409, 'WORKFLOW_SOURCE_INVALID', 'The saved protocol identification is invalid.');
  for (const rows of [sourceRows.sections, sourceRows.objectives, sourceRows.eligibility, sourceRows.visits, sourceRows.assessments, sourceRows.cells]) {
    if (!rows.every(row => positive(row.id))) fail(409, 'WORKFLOW_SOURCE_INVALID', 'The saved protocol contains an invalid structured row identity.');
  }
  if (!sourceRows.cells.every(row => positive(row.assessment_id) && positive(row.visit_id) && typeof row.required === 'boolean')) fail(409, 'WORKFLOW_SOURCE_INVALID', 'The saved assessment matrix contains an invalid endpoint identity.');
}

async function composeProtocol(input: WorkflowMaterializationInput, q: Queryable): Promise<Composition> {
  const scope = await protocolScope(input, q);
  const id = input.source.kind === 'protocol' ? input.source.documentId : 0;
  const snapshot = await loadProtocolExportSnapshot(input.organizationId, id, q, {contentOnly:true});
  validateProtocolStructure(snapshot);
  const retired = await verifyRetainedProtocolMatrixEndpoints(q, input.organizationId, id, snapshot.sourceRows);
  if (!retired) return fail(409, 'WORKFLOW_SOURCE_INVALID', 'The saved assessment matrix contains a cell outside this protocol.');
  const sections = protocolAuthoringSections(snapshot.document);
  const structuredRows: Record<string, string> = {
    'protocol.header':`protocol_documents:${id}`, 'protocol.synopsis':`protocol_documents:${id}`,
    'protocol.objectives':`protocol_objectives:${snapshot.sourceRows.objectives.map(r => r.id).join(',')}`,
    'protocol.eligibility':`protocol_eligibility_criteria:${snapshot.sourceRows.eligibility.map(r => r.id).join(',')}`,
    'protocol.schedule':`protocol_schedule_visits:${snapshot.sourceRows.visits.map(r => r.id).join(',')}`,
    'protocol.soa':`protocol_soa_assessments:${snapshot.sourceRows.assessments.map(r => r.id).join(',')};protocol_soa_cells:${snapshot.sourceRows.cells.map(r => r.id).join(',')};protocol_schedule_visits:${snapshot.sourceRows.visits.map(r => r.id).join(',')}`,
  };
  const machineLineage: Record<string, unknown> = {};
  const sectionOrigins = await Promise.all(sections.map(async section => {
    const row = snapshot.sourceRows.sections.find(r => r.section_key === section.code);
    const sourceRowId = row ? `protocol_sections:${row.id}` : structuredRows[section.code];
    if (!row && section.code !== 'protocol.synopsis') return sourceOrigin(section.code, sourceRowId, section.content);
    const spans = (await listLiveMachineSpans(input.organizationId, {documentTable:row ? 'protocol_sections' : 'protocol_documents',documentId:String(row?.id ?? id)},q))
      .sort((a,b)=>sha(stableStringify(a)).localeCompare(sha(stableStringify(b))));
    if (!spans.every(span => Number.isSafeInteger(span.charStart) && Number.isSafeInteger(span.charEnd)
      && span.charStart >= 0 && span.charEnd > span.charStart && span.charEnd <= section.content.length
      && hashSpanText(section.content.slice(span.charStart,span.charEnd)) === span.spanTextSha256)) return fail(409,'WORKFLOW_SOURCE_LINEAGE_UNVERIFIED','Saved protocol machine lineage does not match the current source text. Reconcile its source provenance before importing.');
    machineLineage[section.code] = spans;
    // The deterministic importer is a copy operation, not proof that a model
    // originated these words. Ordinary assertions/tool transport also supply no
    // machine authorship; actual machine span proof remains unqualified here.
    return sourceOrigin(section.code, sourceRowId, section.content,spans.some(span=>span.machineAuthorId !== WORKFLOW_IMPORT_AUTHOR_ID) ? 'machine' : 'unknown');
  }));
  const retiredFacts = retired.visits.length || retired.assessments.length ? { retiredMatrixEndpoints: retired } : {};
  return {title:snapshot.document.title,version:snapshot.document.header.version,scope,sections,sectionOrigins,gaps:protocolGaps(snapshot),facts:{...snapshot.sourceRows,machineLineage,...retiredFacts}};
}

// The ICH_E3_GUIDANCE tree (2026-10-29: was csr-builder's duplicate outline),
// and the headings a CSR job writes output for: §3 and §14–16 are prepared
// from source and bare parents are written through their children, so neither
// is ever an expected saved output.
const CSR_CATALOG = flattenICHE3Sections(getICHE3Structure());
const CSR_DRAFT_TARGETS = resolveCSRDraftTargets().map(section => section.number);
const CSR_MANUAL_TOP_LEVEL = getICHE3Structure().filter(section => section.draftingMode === 'manual').map(section => section.number);
const CSR_CODES = new Map(CSR_CATALOG.map((section, index) => [section.number, {section,index}]));
const selectedBy = (code: string, selections: readonly string[]) => selections.some(parent => code === parent || code.startsWith(`${parent}.`));

function csrSelection(source: Extract<WorkflowImportSource,{kind:'csr'}>): string[] | undefined {
  if (source.sectionNumbers === undefined) return undefined;
  if (!Array.isArray(source.sectionNumbers) || !source.sectionNumbers.length || source.sectionNumbers.length > 200 || !source.sectionNumbers.every(code => typeof code === 'string' && CSR_CODES.has(code))) return fail(400, 'WORKFLOW_CSR_SELECTION_INVALID', 'Choose actual ICH E3 section numbers from this saved CSR.');
  return [...new Set(source.sectionNumbers)].sort((a,b) => CSR_CODES.get(a)!.index - CSR_CODES.get(b)!.index);
}

function csrSections(rows: Record<string, unknown>[], selection: string[] | undefined, studyInfo: unknown): Pick<Composition,'sections'|'sectionOrigins'> {
  const selected = rows.filter(row => typeof row.section_number === 'string' && (!selection || selectedBy(row.section_number, selection)));
  if (!selected.length) return fail(409, 'WORKFLOW_CSR_OUTPUT_MISSING', 'No saved output exists for the selected CSR section.');
  for (const code of selection ?? []) if (!selected.some(row => selectedBy(String(row.section_number), [code]))) return fail(409, 'WORKFLOW_CSR_OUTPUT_MISSING', `No saved output exists for selected CSR section ${code}.`);
  selected.sort((a,b) => (CSR_CODES.get(String(a.section_number))?.index ?? -1) - (CSR_CODES.get(String(b.section_number))?.index ?? -1));
  const sections: Composition['sections'] = [];
  const sectionOrigins: WorkflowSectionOrigin[] = [];
  for (const row of selected) {
    const verified = verifiedCsrSection(row, studyInfo);
    sections.push(verified.section);
    sectionOrigins.push(verified.origin);
  }
  return {sections,sectionOrigins};
}

function csrAuthorship(row: Record<string,unknown>): Pick<WorkflowSectionOrigin,'originalAuthorship'|'model'> {
  if (typeof row.ai_generated !== 'boolean' || (row.model != null && typeof row.model !== 'string')) return fail(409, 'WORKFLOW_CSR_ORIGIN_INVALID', 'The selected CSR section origin is invalid.');
  const lineage = row.lineage && typeof row.lineage === 'object' ? row.lineage as Record<string,unknown> : {};
  return {originalAuthorship:row.ai_generated ? 'machine' : lineage.source === 'template' ? 'template' : 'unknown',model:typeof row.model === 'string' && row.model.trim() ? row.model.trim() : null};
}

function verifiedCsrSection(row: Record<string,unknown>, studyInfo: unknown) {
  const code = row.section_number;
  const catalog = typeof code === 'string' ? CSR_CODES.get(code) : null;
  if (!positive(row.id) || !catalog || typeof row.content !== 'string' || !row.content.trim()) return fail(409, 'WORKFLOW_CSR_OUTPUT_INVALID', 'The selected CSR contains an invalid or empty saved section.');
  if (typeof row.content_hash !== 'string' || !HASH.test(row.content_hash) || sha(row.content) !== row.content_hash) return fail(409, 'WORKFLOW_CSR_HASH_MISMATCH', `Saved CSR section ${code} does not match its recorded content hash.`);
  const {originalAuthorship,model} = csrAuthorship(row);
  const origin = sourceOrigin(String(code),`csr_section_outputs:${row.id}`,row.content,originalAuthorship,model);
  // CSR slice 5: the section's claim receipts travel into the Authoring document,
  // bound to the copy this import stores, so a saved CSR can be re-checked.
  const csrEvidence = importedCsrSectionEvidence({sectionNumber:String(code),content:row.content,contentHash:row.content_hash,lineage:row.lineage},
    workflowCopySectionContent(row.content), studyInfo);
  return {section:{code:String(code),title:catalog.section.title,content:row.content},origin:csrEvidence ? {...origin,csrEvidence:{...csrEvidence}} : origin};
}

type CsrJob = {id:number;project_id:number|null;study_id:string;status:string;sections_to_generate:string[]|null;study_info_snapshot:unknown};
function verifiedCsrJob(row: Record<string,unknown> | undefined, targetProjectId: number): CsrJob {
  if (!row || !positive(row.id) || typeof row.study_id !== 'string' || typeof row.status !== 'string') return fail(409, 'WORKFLOW_SOURCE_INVALID', 'The saved CSR job identification is invalid.');
  if (row.project_id !== null && (!positive(row.project_id) || row.project_id !== targetProjectId)) return fail(409, 'WORKFLOW_SOURCE_SCOPE_MISMATCH', 'The saved CSR belongs to another recorded project.');
  if (row.sections_to_generate !== null && (!Array.isArray(row.sections_to_generate) || !row.sections_to_generate.every(code => typeof code === 'string' && CSR_CODES.has(code)))) return fail(409, 'WORKFLOW_SOURCE_INVALID', 'The saved CSR requested section set is invalid.');
  return {id:row.id,project_id:row.project_id,study_id:row.study_id,status:row.status,sections_to_generate:row.sections_to_generate?.length ? row.sections_to_generate : null,study_info_snapshot:row.study_info_snapshot};
}

function csrGaps(job: CsrJob, sections: Composition['sections'], selection: string[] | undefined): string[] {
  const present = new Set(sections.map(s=>s.code));
  const scopeCodes = selection ?? job.sections_to_generate;
  const expected = CSR_DRAFT_TARGETS.filter(code => !scopeCodes || selectedBy(code, scopeCodes));
  const gaps = expected.filter(code=>!present.has(code)).map(code=>`CSR section ${code} has no saved output in this selection.`);
  // §3 and §14–16 are never job outputs; their absence is a gap all the same.
  for (const code of CSR_MANUAL_TOP_LEVEL) if (!scopeCodes || selectedBy(code, scopeCodes)) gaps.push(`CSR section ${code} is prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it.`);
  if (job.status !== 'complete') gaps.unshift(`The saved CSR job is ${job.status}; available output is a partial draft.`);
  for (const section of sections) if (/\[DATA TO BE INSERTED\]/i.test(section.content)) gaps.push(`CSR section ${section.code} retains a data-to-be-inserted placeholder.`);
  return gaps;
}

function csrStudyInfo(job: CsrJob): Record<string,unknown> {
  const snapshot = job.study_info_snapshot && typeof job.study_info_snapshot === 'object' ? job.study_info_snapshot as Record<string,unknown> : {};
  return snapshot.studyInfo && typeof snapshot.studyInfo === 'object' ? snapshot.studyInfo as Record<string,unknown> : snapshot;
}

function csrTitle(job: CsrJob): string {
  const study = csrStudyInfo(job);
  return typeof study.title === 'string' && study.title.trim() ? study.title : `Clinical study report for ${job.study_id}`;
}

async function composeCsr(input: WorkflowMaterializationInput & { source: Extract<WorkflowImportSource, {kind:'csr'}> }, q: Queryable): Promise<Composition> {
  if (input.source.kind !== 'csr') return fail(400, 'WORKFLOW_SOURCE_INVALID', 'Choose an exact CSR job.');
  const selection = csrSelection(input.source);
  if (!await requireCsrJobAccess(q, input.organizationId, input.source.jobId, input.userId)) return fail(404, 'WORKFLOW_SOURCE_NOT_FOUND', 'Saved CSR job not found.');
  const jobResult = await q.query('SELECT id, project_id, study_id, status, sections_to_generate, study_info_snapshot FROM csr_build_jobs WHERE id = $1 AND organization_id = $2', [input.source.jobId,input.organizationId]);
  const job = verifiedCsrJob(jobResult.rows[0],input.target.projectId);
  // Scope identity is checked without selecting prose from a mismatched output.
  const identities = await q.query('SELECT id, project_id FROM csr_section_outputs WHERE job_id = $1 AND organization_id = $2', [input.source.jobId,input.organizationId]);
  if (!identities.rows.every((row: Record<string,unknown>) => row.project_id === job.project_id)) return fail(409, 'WORKFLOW_SOURCE_SCOPE_MISMATCH', 'Saved CSR output does not match its job project scope.');
  const output = await q.query(`SELECT id, section_number, content, content_hash, ai_generated, model, lineage, generated_at
    FROM csr_section_outputs WHERE job_id = $1 AND organization_id = $2 AND project_id IS NOT DISTINCT FROM $3 ORDER BY section_number, id`, [input.source.jobId,input.organizationId,job.project_id]);
  const composed = csrSections(output.rows, selection, csrStudyInfo(job));
  const present = new Set(composed.sections.map(s => s.code));
  const gaps = csrGaps(job,composed.sections,selection);
  const title = csrTitle(job);
  const scope: Scope = job.project_id == null ? {level:'organization',programId:null,projectId:null} : {level:'project',programId:null,projectId:job.project_id};
  const selectedOutputs = output.rows.filter((row: Record<string,unknown>) => present.has(String(row.section_number)));
  return {...composed,title,version:null,scope,gaps,facts:{job,outputs:selectedOutputs,selection:selection ?? null}};
}

function finish(input: WorkflowMaterializationInput & { source: Extract<WorkflowImportSource, {kind:'csr'|'protocol'}> }, composition: Composition): MaterializedWorkflowSource {
  const {sections,sectionOrigins,gaps,scope} = composition;
  if (sections.length > 200 || sections.reduce((n,s) => n + s.content.length,0) > 2_000_000 || new Set(sections.map(s => s.code)).size !== sections.length) return fail(409, 'WORKFLOW_SOURCE_LIMIT', 'The saved workflow is too large or has ambiguous section keys for one authoring draft.');
  const mode = scope.level === 'organization' ? 'explicit' : 'recorded';
  const association: WorkflowImportAssociation = {mode,required:mode === 'explicit',reasonRequired:mode === 'explicit',sourceProgramId:scope.programId,sourceProjectId:scope.projectId,targetProgramId:input.target.programId};
  const source: WorkflowImportSource = input.source.kind === 'csr'
    ? {kind:'csr',jobId:input.source.jobId,...(input.source.sectionNumbers ? {sectionNumbers:csrSelection(input.source)} : {})} : {kind:'protocol',documentId:input.source.documentId};
  const fingerprint = sha(stableStringify({source,scope,mode,facts:composition.facts,sectionOrigins,sections,gaps}));
  const origin: WorkflowImportOrigin = {
    kind:input.source.kind,id:String(input.source.kind === 'csr' ? input.source.jobId : input.source.documentId),programId:input.target.programId,
    title:composition.title,documentType:null,sectionCode:null,fingerprint,version:composition.version,
    conversion:input.source.kind === 'csr' ? 'ich-e3-sections' : 'protocol-structure',sourceScope:scope,
    association:{mode,reason:mode === 'explicit' ? input.associationReason?.trim() || null : null},sectionOrigins,
    selection:source,gaps,
  };
  const warnings = ['This is an unbound working draft. Source completion, approval and signatures are not transferred.',
    'Original authorship and model qualification are not established by a workflow fingerprint.',
    'Verified generation document/hash/span support was not recorded by this materializer.'];
  if (mode === 'explicit') warnings.push('The source has no recorded project association. Creation requires an explicit association reason.');
  return {origin,fingerprint,sections,gaps,warnings,association};
}

/** Caller authorizes the live target before invoking this read-only materializer
 * and controls the transaction isolation. No global locks are acquired here. */
export async function materializeWorkflowSource(input: WorkflowMaterializationInput, q: Queryable): Promise<MaterializedWorkflowSource> {
  validateInput(input);
  try {
    if (input.source.kind === 'agency-response') {
      const { materializeAgencyResponseSource } = await import('./agency-response-source');
      return await materializeAgencyResponseSource({ ...input, source: input.source }, q);
    }
    if (input.source.kind === 'study-design-crf') {
      const { materializeStudyDesignCrfSource } = await import('./study-design-crf-source');
      return await materializeStudyDesignCrfSource({ ...input, source: input.source }, q);
    }
    if (input.source.kind === 'ivd-assessment' || input.source.kind === 'ivd-document') {
      const { materializeIvdWorkflowSource } = await import('./ivd-workflow-source');
      return await materializeIvdWorkflowSource({ ...input, source: input.source }, q);
    }
    const selected = { ...input, source: input.source };
    return finish(selected, input.source.kind === 'protocol' ? await composeProtocol(input, q) : await composeCsr({ ...input, source: input.source }, q));
  }
  catch (error) {
    if (error instanceof WorkflowSourceImportError) throw error;
    if (error instanceof CsrScopeError) throw new WorkflowSourceImportError(error.status,error.code,error.message);
    sourceLogger.error('Saved workflow source verification failed', { message: error instanceof Error ? error.message : 'Unknown read failure' });
    return fail(503,'WORKFLOW_SOURCE_UNAVAILABLE','The saved workflow source could not be verified. Nothing was imported.');
  }
}

/** CSR slice 8 (2026-10-29): what the CSR assembler (csr/csr-assembly-source.ts)
 * composes from. The same verified sections, gaps and title an import into
 * Authoring produces, with every access, scope and hash check of that import,
 * plus the job's study and the retained run it was drafted from. Read-only. */
export interface CsrAssemblySource {
  jobId: number; studyId: string; sourceRunId: string | null; title: string; fingerprint: string;
  sections: MaterializedWorkflowSource['sections']; gaps: string[];
  /** When the newest saved section was generated: the assembled PDFs are stamped from content, never the clock. */
  lastGeneratedAt: Date | null;
}
export async function materializeCsrAssemblySource(input: WorkflowMaterializationInput, q: Queryable): Promise<CsrAssemblySource> {
  if (input.source.kind !== 'csr') return fail(400, 'WORKFLOW_SOURCE_INVALID', 'Choose an exact CSR job.');
  const jobId = input.source.jobId;
  const materialized = await materializeWorkflowSource(input, q);
  try {
    const { rows } = await q.query(`SELECT j.study_id, j.source_run_id, (SELECT max(o.generated_at) FROM csr_section_outputs o
      WHERE o.job_id = j.id AND o.organization_id = j.organization_id) AS last_generated_at
      FROM csr_build_jobs j WHERE j.id = $1 AND j.organization_id = $2`, [jobId, input.organizationId]);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row || typeof row.study_id !== 'string' || (row.source_run_id != null && typeof row.source_run_id !== 'string')) return fail(409, 'WORKFLOW_SOURCE_INVALID', 'The saved CSR job identification is invalid.');
    const last = row.last_generated_at == null ? null : new Date(row.last_generated_at as string);
    return { jobId, studyId: row.study_id, sourceRunId: (row.source_run_id as string | null) ?? null, title: materialized.origin.title,
      fingerprint: materialized.fingerprint, sections: materialized.sections, gaps: materialized.gaps, lastGeneratedAt: last && !Number.isNaN(last.getTime()) ? last : null };
  } catch (error) {
    if (error instanceof WorkflowSourceImportError) throw error;
    sourceLogger.error('Saved CSR assembly source read failed', { message: error instanceof Error ? error.message : 'Unknown read failure' });
    return fail(503, 'WORKFLOW_SOURCE_UNAVAILABLE', 'The saved CSR job could not be verified. Nothing was assembled.');
  }
}
