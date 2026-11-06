/** Native Quality facts for the existing source catalogue and report computation.
 * Split from the controlled-document readers; this module never writes a record. */
import type { Queryable } from '../authoring/authoring-evidence';
import type { NativeRecordSnapshot } from '../clinical-regulatory-evidence/record-source';
import { createHash } from 'node:crypto';
import { getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, verifiedProgramAnchors } from '../c2c/current-program-access';
import { authorizeQmsContentRead } from './controlled-document-content';
import type { InForceRelease } from './in-force-release';
import { readQmsTrainingReleaseContext } from './current-release-approval';
import { readQmsReviewSchedule, type QmsReviewSchedule } from './periodic-review';
import type { QmsDocumentRow } from './document-approval-signature';
import { qualityFamilyQuery } from './project-evidence-queries';
export type { NativeRecordSnapshot } from '../clinical-regulatory-evidence/record-source';

export interface QualityEvidenceInput {
  organizationId: number;
  userId: number;
  /** null supplies explicitly organization-scoped Quality-system context only. */
  programId: string | null;
}

export class QualityEvidenceUnavailable extends Error {
  readonly status = 503;
  readonly code = 'QUALITY_EVIDENCE_UNAVAILABLE';
  constructor(message = 'Current Quality evidence could not be verified. No Quality evidence was supplied.') {
    super(message);
    this.name = 'QualityEvidenceUnavailable';
  }
}

type Row = Record<string, unknown>;
const ROW_LIMIT = 1000;
const SNAPSHOT_LIMIT = 5000;
const TEXT_LIMIT = 20 * 1024 * 1024;

/** Stable serialization binds facts, not object key order or the observation clock. */
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
const serialize = (value: unknown) => JSON.stringify(canonical(value));
const hash = (value: unknown) => createHash('sha256').update(serialize(value)).digest('hex');
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const pick = (row: Row, fields: string): Row => Object.fromEntries(fields.split(' ').filter(k => Object.hasOwn(row, k)).map(k => [k, row[k]]));
const fields = (...parts: string[]) => parts.join(' ');
const COMMON = 'id created_at updated_at';
const DOCUMENT = fields(COMMON, 'doc_number title doc_type category version status effective_date next_review_date author_id approver_id approved_at superseded_by_id authoring_document_id');

interface Family {
  table: string;
  fields: string;
  label: string;
  state: string;
  scope: 'organization' | 'optional-project' | 'project' | 'capa-action' | 'document-child' | 'change-child' | 'role-child' | 'qmp-child';
}
/** These are the existing Quality registers, not another source store. Never project arbitrary metadata. */
const FAMILIES: readonly Family[] = [
  { table: 'qms_change_controls', label: 'Change control', state: 'status', scope: 'optional-project', fields: fields(COMMON, 'change_number title description change_type classification risk_level status reason impact_assessment implementation_plan proposed_by assessed_by approved_by approved_at target_implementation_date implemented_at verified_by verified_at effectiveness_review closed_at qms_document_id program_id') },
  { table: 'qms_nonconforming_products', label: 'Nonconformance', state: 'disposition', scope: 'optional-project', fields: fields(COMMON, 'nc_number device_name lot_or_serial detected_at detected_by source description disposition disposition_rationale disposition_at capa_linked program_id') },
  { table: 'capa_records', label: 'CAPA', state: 'state', scope: 'project', fields: fields(COMMON, 'program_id capa_code title summary type source source_refs risk_level assigned_to target_close_date problem_statement containment_actions root_cause_analysis corrective_action_plan effectiveness_check_criteria effectiveness_check_result state closed_at closed_by created_by updated_by') },
  { table: 'capa_actions', label: 'CAPA action', state: 'state', scope: 'capa-action', fields: fields(COMMON, 'capa_id n type description owner due_date completed_at completed_by evidence_refs state') },
  { table: 'qms_suppliers', label: 'Supplier', state: 'approval_status', scope: 'organization', fields: fields(COMMON, 'supplier_name supplier_code scope criticality approval_status approval_date reapproval_date quality_agreement_id last_audit_date next_audit_date iso_certifications') },
  { table: 'qc_deviations', label: 'GMP deviation', state: 'status', scope: 'organization', fields: fields(COMMON, 'deviation_number deviation_type classification category title description detected_date detected_by location department batch_number product_name process_step impact_assessment impact_level investigation_required investigation_status investigation_details root_cause_identified root_cause contributing_factors capa_required capa_number corrective_actions preventive_actions immediate_actions resolution_description effectiveness_check trending_data status priority assigned_to target_closure_date actual_closure_date reviewed_by reviewed_date approved_by approved_date qa_approved_by qa_approved_date notes client_workspace_id') },
  { table: 'qms_internal_audits', label: 'Internal audit', state: 'status', scope: 'organization', fields: fields(COMMON, 'audit_number scope audit_standard auditor_lead_id auditor_team planned_date started_at completed_at status finding_count major_findings minor_findings observations report_artifact_id') },
  { table: 'qms_management_reviews', label: 'Management review', state: 'status', scope: 'organization', fields: fields(COMMON, 'review_date period chair_id attendees inputs outputs open_action_count closed_action_count minutes_artifact_id') },
  { table: 'qms_training_records', label: 'Training receipt', state: 'acknowledgment_method', scope: 'document-child', fields: fields(COMMON, 'user_id document_id document_version acknowledged_at acknowledgment_method trainer_id quiz_score expires_at') },
  { table: 'qms_training_assignments', label: 'Training assignment', state: 'removed_at', scope: 'document-child', fields: fields(COMMON, 'document_id job_role_id user_id assigned_by assigned_at removed_by removed_at') },
  { table: 'qms_job_roles', label: 'Quality job role', state: 'status', scope: 'organization', fields: fields(COMMON, 'name description created_by updated_by') },
  { table: 'qms_job_role_members', label: 'Quality job-role membership', state: 'removed_at', scope: 'role-child', fields: fields(COMMON, 'job_role_id user_id added_by added_at removed_by removed_at') },
  { table: 'quality_management_plans', label: 'Quality management plan', state: 'status', scope: 'organization', fields: fields(COMMON, 'name description version status approved_by_id approved_at effective_date expiry_date review_frequency_days last_review_date next_review_date review_reminder_days created_by_id client_workspace_id') },
  { table: 'ctq_factors', label: 'Critical-to-quality factor', state: 'status', scope: 'qmp-child', fields: fields(COMMON, 'qmp_id name description category risk_level applicable_section validation_criteria validation_method status requires_evidence_type requirement_type failure_action') },
  { table: 'qmp_section_gating', label: 'Quality section gate', state: 'status', scope: 'qmp-child', fields: fields(COMMON, 'qmp_id section_key section_name required_ctq_factor_ids minimum_mandatory_completion minimum_recommended_completion allow_override override_requires_approval override_requires_reason') },
  { table: 'qmp_traceability_matrix', label: 'Quality traceability requirement', state: 'verification_status', scope: 'qmp-child', fields: fields(COMMON, 'qmp_id ctq_factor_id requirement_id requirement_text requirement_source verification_method implementation_evidence verification_status verified_by_id verified_at notes') },
  { table: 'qms_change_links', label: 'Quality record relationship', state: 'removed_at', scope: 'change-child', fields: fields(COMMON, 'change_id link_type linked_ref linked_label linked_id relationship note created_by removed_by removed_at removal_reason') },
];

/** Admission failures omit an object; an unavailable decision never becomes an empty success. */
async function canReadDocument(q: Queryable, input: QualityEvidenceInput, row: Row): Promise<boolean> {
  try {
    if (row.authoring_document_id) {
      if (!input.programId) return false;
      const parent = await q.query('SELECT client_program_id FROM authoring_documents WHERE id=$1::uuid AND tenant_id=$2', [row.authoring_document_id,input.organizationId]);
      if (String(parent.rows[0]?.client_program_id ?? '').toLowerCase() !== input.programId.toLowerCase()) return false;
    }
    await authorizeQmsContentRead(q, input.organizationId, input.userId, row as never);
    return true;
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 403 || status === 404 || status === 409) return false;
    throw error;
  }
}

function statusOf(row: Row, family: Family): string {
  if (family.state === 'removed_at') return row.removed_at ? 'removed' : 'active';
  return typeof row[family.state] === 'string' && row[family.state] ? String(row[family.state]) : 'not_recorded';
}

/**
 * One admitted project plus explicitly labelled organization QA/QS context.
 * Every read is fenced by a second identical read before return: this works on
 * the caller's transaction without beginning/committing a nested transaction.
 * Unknown stores, changed rows, failed authorization and overflow fail closed.
 */
export async function readQualityProjectEvidence(q: Queryable, input: QualityEvidenceInput): Promise<NativeRecordSnapshot[]> {
  try {
    return await collectQuality(q, input);
  } catch (error) {
    if (error instanceof QualityEvidenceUnavailable || [403, 404, 409, 503].includes(Number((error as { status?: unknown } | null)?.status))) throw error;
    throw new QualityEvidenceUnavailable();
  }
}

interface Collector {
  reader: Queryable;
  input: QualityEvidenceInput;
  program: string | null;
  workspace: number | null;
  snapshots: NativeRecordSnapshot[];
  totalText: number;
  currentParents: Map<number, NativeRecordSnapshot['sourceScope']>;
  versions: Map<number, Map<string, NativeRecordSnapshot['sourceScope']>>;
  acceptedAuthored: Map<string, Row>;
  parents: Map<string, Map<string, NativeRecordSnapshot['sourceScope']>>;
  reviews?: QmsReviewSchedule;
}
interface SnapshotInput {
  table: string; row: Row; scope: NativeRecordSnapshot['sourceScope']; title: string;
  lifecycle: string; data: unknown; suffix?: string; authoringId?: string;
}
function addSnapshot(c: Collector, item: SnapshotInput): void {
  const { table, row, scope, title, lifecycle, data, suffix = '', authoringId } = item;
  if (row.id === undefined || row.id === null) throw new QualityEvidenceUnavailable();
  const id = String(row.id);
  const native = { kind: table, id, ...(authoringId ? { authoringDocumentId: authoringId } : {}) };
  const text = serialize({ evidenceKind: 'qms', sourceScope: scope, native, lifecycle,
    ...(scope === 'project' ? { programId: c.program } : {}), data,
    qualification: 'Recorded Quality-system facts. Capture is not scientific verification, approval or an audit-chain assessment.' });
  c.totalText += Buffer.byteLength(text, 'utf8');
  if (text.length > 2_000_000 || title.length > 1000 || c.snapshots.length >= SNAPSHOT_LIMIT || c.totalText > TEXT_LIMIT)
    throw new QualityEvidenceUnavailable('Quality evidence exceeds the bounded snapshot size. No partial evidence was supplied.');
  c.snapshots.push({ key: `quality:${table}:${id}${suffix}`, title, text,
    version: typeof row.version === 'string' ? row.version : null, sourceScope: scope, native, lifecycle });
}
async function bounded(c: Collector, sql: string, args: unknown[]): Promise<Row[]> {
  const result = await c.reader.query(sql, args);
  if (result.rows.length > ROW_LIMIT) throw new QualityEvidenceUnavailable('Quality evidence exceeds the bounded record count. No partial evidence was supplied.');
  return result.rows as Row[];
}
function rememberVersion(c: Collector, row: Row, scope: NativeRecordSnapshot['sourceScope'], documentId = Number(row.id)): void {
  if (typeof row.version !== 'string') return;
  const versions = c.versions.get(documentId) ?? new Map();
  versions.set(row.version, scope); c.versions.set(documentId, versions);
}
function periodicReview(c:Collector,row:Row):Row {
  const review=c.reviews?.reviews.get(Number(row.id));
  const release=c.reviews?.inForce.get(Number(row.id));
  return {releaseVersion:release?.release.version ?? null,nextDue:c.reviews?.dueOf(row as unknown as QmsDocumentRow) ?? null,
    lastStandingReview:review ? pick(review as unknown as Row,'signatureId reviewedAt reviewerId reason outcome nextReviewDate nextDue version') : null};
}
async function readWorkingDocument(c: Collector, row: Row): Promise<void> {
  const authoringId = typeof row.authoring_document_id === 'string' ? row.authoring_document_id : undefined;
  if (authoringId && !await canReadDocument(c.reader,c.input,row)) return;
  const scope = authoringId ? 'project' : 'organization';
  const sections = authoringId ? await bounded(c, `SELECT s.id,s.code,s.title,s.content,s.order_index FROM authoring_sections s
    WHERE s.doc_id=$1::uuid AND s.tenant_id=$2 ORDER BY s.order_index,s.id LIMIT $3`, [authoringId,c.input.organizationId,ROW_LIMIT+1]) : [];
  addSnapshot(c,{ table:'qms_documents',row,scope, title:`${row.doc_number ?? 'Controlled document'} ${row.title ?? ''} — working record`,
    lifecycle:typeof row.status === 'string' ? row.status : 'not_recorded', data:{ record:pick(row,DOCUMENT),sections,releasePeriodicReview:periodicReview(c,row),
      contentBasis:authoringId ? 'Current saved Authoring sections; working record, not a signed release.' : 'Legacy registry metadata only; no authored content is asserted.' },
    suffix:':working',authoringId });
  c.currentParents.set(Number(row.id),scope); rememberVersion(c,row,scope);
  if (authoringId) c.acceptedAuthored.set(authoringId,row);
}
function releaseApproval(result: Awaited<ReturnType<typeof readQmsTrainingReleaseContext>>): Row {
  return { state:result.approval?.state ?? 'unverified',signatureId:result.approval?.signatureId ?? null,
    contentDigest:result.context.contentDigest,contentVerified:result.context.eligible,reason:result.context.unavailableReason ?? null };
}
async function readRelease(c: Collector, inForce: InForceRelease): Promise<void> {
  const release = inForce.release;
  if (!release.authoring_document_id || !await canReadDocument(c.reader,c.input,release as unknown as Row)) return;
  const result = await readQmsTrainingReleaseContext(c.reader,release);
  const { context } = result;
  const authority=releaseApproval(result);
  const approvalState=String(authority.state);
  if (approvalState === 'unavailable') throw new QualityEvidenceUnavailable();
  const raw = object(release.metadata?.authoringContent).sections;
  const sections = Array.isArray(raw) ? raw.map(s => pick(object(s),'id code title content orderIndex')) : [];
  const qualified = approvalState === 'valid' && context.eligible;
  addSnapshot(c,{ table:'qms_documents',row:release as unknown as Row,scope:'project',
    title:`${release.doc_number} ${release.title} — ${qualified ? 'release in force' : 'release record; approval '+approvalState}`,lifecycle:qualified ? 'effective' : `effective; approval ${approvalState}`,
    data:{ record:pick(release as unknown as Row,DOCUMENT),sections,inForce:qualified,structuralReleaseCandidate:true,underRevision:inForce.underRevision,pendingEffective:inForce.pendingEffective ?? false,releasePeriodicReview:periodicReview(c,release as unknown as Row),
      approval:authority },
    suffix:':release-in-force',authoringId:String(release.authoring_document_id) });
  rememberVersion(c,release as unknown as Row,'project');
  c.acceptedAuthored.set(String(release.authoring_document_id),release as unknown as Row);
}
async function readDocuments(c: Collector): Promise<void> {
  const documents = await bounded(c,`SELECT d.id,d.created_at,d.updated_at,d.doc_number,d.title,d.doc_type,d.category,d.version,d.status,
    d.effective_date,d.next_review_date,d.author_id,d.approver_id,d.approved_at,d.superseded_by_id,d.authoring_document_id,d.organization_id,d.deleted_at,
    jsonb_build_object('lastRevision',jsonb_build_object('from',d.metadata->'lastRevision'->>'from')) AS metadata,
    a.client_program_id::text AS authoring_program_id
    FROM qms_documents d LEFT JOIN authoring_documents a ON a.id=d.authoring_document_id AND a.tenant_id=d.organization_id
    WHERE d.organization_id=$1 AND d.deleted_at IS NULL
      AND (d.authoring_document_id IS NULL OR ($2::uuid IS NOT NULL AND a.client_program_id=$2::uuid)) ORDER BY d.id LIMIT $3`,[c.input.organizationId,c.program,ROW_LIMIT+1]);
  for (let n=0;n<documents.length;n++) {
    const row=documents[n];
    if (row.authoring_document_id && await canReadDocument(c.reader,c.input,row)) {
      const body=await c.reader.query('SELECT d.* FROM qms_documents d WHERE d.id=$1 AND d.organization_id=$2 AND d.authoring_document_id=$3::uuid AND d.deleted_at IS NULL',
        [row.id,c.input.organizationId,row.authoring_document_id]);
      if (!body.rows[0]) throw new QualityEvidenceUnavailable();
      documents[n]=body.rows[0] as Row;
    }
  }
  c.reviews=await readQmsReviewSchedule(c.reader,c.input.organizationId,documents as unknown as QmsDocumentRow[],{
    admitRelease:async row=>!!row.authoring_document_id && canReadDocument(c.reader,c.input,row as unknown as Row),
  });
  const releases=c.reviews.inForce;
  for (const row of documents) {
    await readWorkingDocument(c,row);
    const release = releases.get(Number(row.id));
    if (release) await readRelease(c,release);
  }
}
async function readRetainedVersions(c: Collector): Promise<void> {
  const versions = await bounded(c,`SELECT v.id,v.document_id,v.organization_id,v.version,v.authoring_document_id,v.record_kind FROM qms_document_versions v
    JOIN qms_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id AND d.deleted_at IS NULL
    LEFT JOIN authoring_documents a ON a.id=v.authoring_document_id AND a.tenant_id=v.organization_id
    WHERE v.organization_id=$1 AND ((v.authoring_document_id IS NULL AND d.authoring_document_id IS NULL)
      OR ($2::uuid IS NOT NULL AND a.client_program_id=$2::uuid)) ORDER BY v.id LIMIT $3`,[c.input.organizationId,c.program,ROW_LIMIT+1]);
  for (const identity of versions) {
    let row=identity;
    if (row.authoring_document_id && !await canReadDocument(c.reader,c.input,row)) continue;
    if (row.authoring_document_id) {
      const body=await c.reader.query('SELECT v.* FROM qms_document_versions v WHERE v.id=$1 AND v.organization_id=$2 AND v.authoring_document_id=$3::uuid',
        [row.id,c.input.organizationId,row.authoring_document_id]);
      if (!body.rows[0]) throw new QualityEvidenceUnavailable();
      row=body.rows[0] as Row;
    }
    const authoringId = typeof row.authoring_document_id === 'string' ? row.authoring_document_id : undefined;
    const scope = authoringId ? 'project' : 'organization';
    const sections = Array.isArray(row.sections) ? row.sections.map(s => pick(object(s),'id code title content orderIndex')) : [];
    addSnapshot(c,{ table:'qms_document_versions',row,scope,title:`Retained Quality document ${row.document_id} v${row.version}`,
      lifecycle:'retained version; current approval not asserted',data:{ record:pick(row,'id document_id version record_kind authoring_document_id content_digest signature_id approved_at'),sections },authoringId });
    rememberVersion(c,row,scope,Number(row.document_id));
    if (authoringId) c.acceptedAuthored.set(authoringId,row);
  }
}
function trainingVersions(c: Collector): Array<{ document_id:number;version:string }> {
  return [...c.versions].flatMap(([id,versions]) => [...versions.keys()].map(version => ({ document_id:id,version })));
}
function familyQuery(c: Collector, family: Family): { sql:string;args:unknown[] } | null {
  return qualityFamilyQuery(family.table, {
    organizationId:c.input.organizationId,programId:c.program,workspaceId:c.workspace,limit:ROW_LIMIT+1,
    documentIds:[...c.currentParents.keys()],trainingVersions:serialize(trainingVersions(c)),
    changeIds:[...(c.parents.get('qms_change_controls')?.keys() ?? [])],
    roleIds:[...(c.parents.get('qms_job_roles')?.keys() ?? [])],
    planIds:[...(c.parents.get('quality_management_plans')?.keys() ?? [])],
  });
}
function familyScope(c:Collector,family:Family,row:Row): NativeRecordSnapshot['sourceScope'] {
  if (family.table === 'qms_training_records') return c.versions.get(Number(row.document_id))?.get(String(row.document_version)) ?? unreadableChild();
  if (family.scope === 'document-child') return c.currentParents.get(Number(row.document_id)) ?? unreadableChild();
  if (family.scope === 'change-child') return c.parents.get('qms_change_controls')?.get(String(row.change_id)) ?? unreadableChild();
  return family.scope === 'project' || family.scope === 'capa-action' || (family.scope === 'optional-project' && row.program_id) ? 'project' : 'organization';
}
function unreadableChild():never {throw new QualityEvidenceUnavailable('A Quality record parent changed during the read. No partial evidence was supplied.');}
async function readFamilies(c:Collector):Promise<void> {
  for (const family of FAMILIES) {
    const query = familyQuery(c,family);if (!query) continue;
    const rows = await bounded(c,query.sql,query.args);
    const parents = new Map<string,NativeRecordSnapshot['sourceScope']>();
    for (const row of rows) {
      const scope=familyScope(c,family,row);parents.set(String(row.id),scope);
      const name=row.title ?? row.supplier_name ?? row.name ?? row.change_number ?? row.nc_number ?? row.audit_number ?? row.period ?? row.id;
      addSnapshot(c,{table:family.table,row,scope,title:`${family.label}: ${String(name)}`,lifecycle:statusOf(row,family),data:{record:pick(row,family.fields),
        ...(family.table === 'qms_training_records' ? {receiptBinding:pick(object(row.metadata),'contentDigest bindingBasis declaration'),receiptQualification:'Recorded receipt only; current assigned-person training coverage and approval validity are not inferred.'} : {}),
        ...(family.table === 'qms_change_controls' ? {approvalQualification:'Recorded lifecycle and approval stamps; electronic-signature standing is not inferred.'} : {})}});
    }
    c.parents.set(family.table,parents);
  }
}
function fencedReader(q:Queryable) {
  const reads:Array<{sql:string;args:unknown[]|undefined;digest:string}>=[];
  let recording=true;
  const reader:Queryable={query:async(sql,args)=>{
    const result=await q.query(sql,args);
    if (recording) {
      if (Buffer.byteLength(serialize(result.rows),'utf8')>TEXT_LIMIT) throw new QualityEvidenceUnavailable('Quality evidence exceeds the bounded read size. No partial evidence was supplied.');
      reads.push({sql,args,digest:hash(result.rows)});
    }
    return result;
  }};
  return {reader,stop:()=>{recording=false;},verify:async()=>{
    for (const read of reads) if (hash((await q.query(read.sql,read.args)).rows)!==read.digest)
      throw new QualityEvidenceUnavailable('Quality records changed during the read. Refresh before supplying evidence.');
  }};
}
async function collectQuality(q:Queryable,input:QualityEvidenceInput):Promise<NativeRecordSnapshot[]> {
  const fence=fencedReader(q);const {reader}=fence;
  const scopeInput={organizationId:input.organizationId,userId:input.userId,programId:input.programId};
  const scope=await getCurrentAccessibleProgramScope(reader,scopeInput);
  const workspace=input.programId ? verifiedProgramAnchors(reader,scopeInput,scope)[0]?.clientWorkspaceId ?? null : null;
  const c:Collector={reader,input,program:input.programId?.toLowerCase() ?? null,workspace,snapshots:[],totalText:0,
    currentParents:new Map(),versions:new Map(),acceptedAuthored:new Map(),parents:new Map()};
  await readDocuments(c);await readRetainedVersions(c);await readFamilies(c);fence.stop();
  for (const row of c.acceptedAuthored.values()) if (!await canReadDocument(reader,input,row)) throw new QualityEvidenceUnavailable();
  await requireProgramScopeStillCurrent(reader,scopeInput,scope);await fence.verify();
  return c.snapshots.sort((a,b)=>a.key.localeCompare(b.key));
}

export async function readQualityRecordEvidence(q: Queryable, input: QualityEvidenceInput, key: string): Promise<NativeRecordSnapshot | null> {
  return (await readQualityProjectEvidence(q, input)).find(row => row.key === key) ?? null;
}

export class QualityEvidenceNotReadable extends Error {
  readonly status = 404;
  readonly code = 'QUALITY_RECORD_NOT_AVAILABLE';
  constructor() { super('The native Quality record is not available with current access.'); }
}

async function historicalDocumentRow(q:Queryable,input:QualityEvidenceInput,native:NativeRecordSnapshot['native']):Promise<Row> {
  if (!/^[1-9]\d*$/.test(native.id) || Number(native.id)>2_147_483_647) throw new QualityEvidenceNotReadable();
  const result=native.kind==='qms_documents'
    ? await q.query(`SELECT d.id,d.organization_id,d.authoring_document_id,jsonb_build_object('retainedAuthoringDocuments',d.metadata->'retainedAuthoringDocuments') AS metadata FROM qms_documents d
        WHERE d.id=$1 AND d.organization_id=$2 AND d.deleted_at IS NULL`,[Number(native.id),input.organizationId])
    : await q.query(`SELECT v.id,v.document_id,v.organization_id,v.authoring_document_id FROM qms_document_versions v
        JOIN qms_documents d ON d.id=v.document_id AND d.organization_id=v.organization_id AND d.deleted_at IS NULL
        WHERE v.id=$1 AND v.organization_id=$2`,[Number(native.id),input.organizationId]);
  if (!result.rows[0]) throw new QualityEvidenceNotReadable();
  return result.rows[0] as Row;
}
async function historicalAuthoredParent(q:Queryable,input:QualityEvidenceInput,native:NativeRecordSnapshot['native'],row:Row):Promise<void> {
  const authoringId=native.authoringDocumentId;
  if (!authoringId) {if (row.authoring_document_id) throw new QualityEvidenceNotReadable();return;}
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authoringId)) throw new QualityEvidenceNotReadable();
  if (native.kind==='qms_document_versions' && row.authoring_document_id!==authoringId) throw new QualityEvidenceNotReadable();
  if (native.kind==='qms_documents' && row.authoring_document_id!==authoringId) {
    const retained=await q.query(`SELECT id FROM qms_document_versions WHERE document_id=$1 AND organization_id=$2 AND authoring_document_id=$3::uuid`,
      [Number(native.id),input.organizationId,authoringId]);
    const prior=object(row.metadata).retainedAuthoringDocuments;
    if (!retained.rows.length && !(Array.isArray(prior) && prior.includes(authoringId))) throw new QualityEvidenceNotReadable();
  }
  const exact={...row,authoring_document_id:authoringId};
  if (!await canReadDocument(q,input,exact)) throw new QualityEvidenceNotReadable();
}

/** Historical capture access is about its exact retained parent, not today's working-copy hash. */
async function authorizeSnapshot(q: Queryable, input: QualityEvidenceInput,
  native: NativeRecordSnapshot['native']): Promise<void> {
  if (!native || typeof native.id !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(native.id)) throw new QualityEvidenceNotReadable();
  const scopeInput = { organizationId: input.organizationId, userId: input.userId, programId: input.programId };
  const scope = await getCurrentAccessibleProgramScope(q, scopeInput);
  if (native.kind === 'qms_documents' || native.kind === 'qms_document_versions') {
    const row=await historicalDocumentRow(q,input,native);
    await historicalAuthoredParent(q,input,native,row);
    await requireProgramScopeStillCurrent(q,scopeInput,scope);
    await historicalAuthoredParent(q,input,native,row);
    return;
  }
  if (!FAMILIES.some(family => family.table === native.kind)) throw new QualityEvidenceNotReadable();
  const matches = await readQualityProjectEvidence(q,input);
  if (!matches.some(row => row.native.kind === native.kind && row.native.id === native.id)) throw new QualityEvidenceNotReadable();
  await requireProgramScopeStillCurrent(q,scopeInput,scope);
}

export async function authorizeQualityEvidenceSnapshot(q:Queryable,input:QualityEvidenceInput,native:NativeRecordSnapshot['native']):Promise<void> {
  try {await authorizeSnapshot(q,input,native);}
  catch(error) {
    if (error instanceof QualityEvidenceNotReadable || error instanceof QualityEvidenceUnavailable
      || [403,404,409,503].includes(Number((error as {status?:unknown}|null)?.status))) throw error;
    throw new QualityEvidenceUnavailable();
  }
}
