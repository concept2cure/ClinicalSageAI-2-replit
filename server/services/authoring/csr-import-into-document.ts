/**
 * The CSR import's target mode (F6 of the 2026-11-02 demo walk, roadmap step 3 of
 * docs/design/CSR_END_TO_END_2026-10-29.md): the approved headings of a CSR build are written into the matching
 * sections, by ICH E3 number, of the CSR document the build was started from. No document is created. This is
 * POST /api/authoring/import/source with `targetDocumentId` (authoring-source-import.ts hands it here); a request
 * without one still creates a working copy, unchanged. Split into its own file beside authoring-source-import.ts,
 * which would otherwise pass the file-length limit.
 *
 * Admission, by name: the target is this organization's document in this project, the person may edit it, it is
 * not sealed, it is not itself an imported working copy, and the build's study data is the study data this document
 * froze (csr_build_jobs.source_run_id = csr_study_data.study_data_id for this document). One document takes in-place
 * imports from one build. The approved-only recheck of workflow-source-import.ts runs on the preview's snapshot and
 * again inside the write transaction, which must reproduce the preview's fingerprint.
 *
 * Each section is written through the editor's own revision path, the one PATCH /api/authoring/sections/:sectionId
 * uses: the content update, the lineage gate (the deterministic compositor recorded as the machine author, as the
 * copy records it), a ledger revision, the filing commit and a Part 11 audit row carrying the person's reason, the
 * source and its approval. All of it is one transaction: a failure writes nothing.
 *
 * THE EDITED-SECTION RULE. A target section is replaced only when the newest entry of its revision ledger
 * (doc_revisions, newest by created_at then id) still describes its saved text (content_sha256 is the SHA-256 of the
 * current content) and that entry is either
 *   (a) the section's genesis revision, and the section's creation receipt (its CREATE audit row) records that it
 *       was seeded from the document's template (metadata.seeded = true): the template scaffold; or
 *   (b) a revision written by an earlier import of this same build: an UPDATE audit row of this section records
 *       csrBuildImport.jobId = this build and csrBuildImport.revisionId = that revision.
 * A section that is empty holds nothing to lose and is replaced too. Anything else is a person's text: a human edit,
 * an AnA accept, a revert, a template re-apply, a genesis that was not a template seed, or content no revision
 * describes. It is left untouched and reported as edited here since. A section already holding exactly the approved
 * text is reported unchanged and not rewritten.
 */
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { WorkflowImportSource, CsrIntoDocumentSection, CsrIntoDocumentReceipt } from '../../../shared/authoring/source-import';
import { placeholderIn } from '../../../shared/authoring/csr-scientific-review';
import { enforceAuthorLineage } from '../clinical-regulatory-evidence/lineage-gate';
import { commitSectionToFiling } from '../c2c/commit-section-to-filing';
import { decideAuthoringPermission, type AuthoringPrincipal } from './authoring-permissions';
import { authorizeAuthoringProgram } from './authoring-program-access';
import { createRevision, writeAuthoringAuditTrail, type Queryable } from './authoring-evidence';
import type { CreateContext } from './authoring-documents';
import { reserveWritableDocument } from './document-lock';
import { MACHINE_AUTHOR_IDS, WORKFLOW_IMPORT_AUTHOR_ID } from './revision-ledger';
import { workflowCopySectionContent } from './workflow-copy-content';
import { materializeWorkflowSource, type MaterializedWorkflowSource } from './workflow-source-import';

type CsrSource = Extract<WorkflowImportSource, { kind: 'csr' }>;
export interface CsrIntoDocumentInput {
  programId: string; source: CsrSource; targetDocumentId: string;
  previewOnly: boolean; expectedFingerprint?: string; reason?: string;
}
export class CsrIntoDocumentError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
const fail = (status: CsrIntoDocumentError['status'], code: string, message: string): never => { throw new CsrIntoDocumentError(status, code, message); };
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const NARRATIVES = '14.3.3';
const IMPORT_REASON = 'imported from a CSR build into its own document';

interface TargetDocument { id: string; title: string; status: string; createdBy: string }
interface TargetSection {
  id: string; code: string; title: string; content: string;
  latestId: string | null; latestOrigin: string | null; latestSha: string | null;
  seeded: boolean; importJobId: number | null; importRevisionId: string | null;
}
interface Approval { reviewer: string; reviewedAt: string | null }
interface Planned extends CsrIntoDocumentSection { sectionId?: string; before?: string; stored?: string; sourceRowId?: string; sourceSha?: string }
type Executor = Queryable & { release?: (error?: Error) => void };

/** The target document, in this organization and project, editable by this person, and not a working copy. */
async function admitTarget(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal, input: CsrIntoDocumentInput, lock: boolean): Promise<TargetDocument> {
  // The write transaction takes the document's row lock first, as its own fixed statement; the read follows on it.
  if (lock) await q.query('SELECT 1 FROM authoring_documents WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [input.targetDocumentId, ctx.tenantId]);
  const { rows } = await q.query(`SELECT id::text, title, status, created_by::text, client_program_id::text AS program_id
      FROM authoring_documents WHERE id = $1 AND tenant_id = $2`, [input.targetDocumentId, ctx.tenantId]);
  const doc = rows[0] as { id: string; title: string; status: string; created_by: string; program_id: string | null } | undefined;
  if (!doc) return fail(404, 'IMPORT_TARGET_NOT_FOUND', 'This document is not in your organization. Nothing was imported.');
  if (String(doc.program_id ?? '').toLowerCase() !== input.programId) return fail(409, 'IMPORT_TARGET_OTHER_PROJECT', 'This document belongs to another project than the build. Nothing was imported.');
  const permission = await decideAuthoringPermission({ pool: q as Pool, principal,
    scope: { tenantId: ctx.tenantId, docId: doc.id, sectionId: null, documentStatus: doc.status, createdBy: doc.created_by }, action: 'edit' });
  if (!permission.allowed) return fail(403, 'IMPORT_TARGET_PERMISSION_DENIED', 'You cannot edit this document with your current permissions, or it is sealed. Nothing was imported.');
  const copy = await q.query(`SELECT 1 FROM authoring_audit_trail WHERE doc_id = $1 AND tenant_id = $2 AND operation_type = 'CREATE'
      AND metadata->'provenance'->'importSource' IS NOT NULL LIMIT 1`, [doc.id, ctx.tenantId]);
  if (copy.rows.length) return fail(409, 'IMPORT_TARGET_IS_WORKING_COPY', 'This document is an imported working copy. Import into the CSR document the build was started from. Nothing was imported.');
  return { id: doc.id, title: doc.title, status: doc.status, createdBy: doc.created_by };
}

/** The build was drafted over the study data this document froze. */
async function requireStudyDataBinding(q: Queryable, tenantId: number, programId: string, jobId: number, documentId: string): Promise<void> {
  const { rows } = await q.query(`SELECT 1 FROM csr_build_jobs j JOIN csr_study_data s
      ON s.study_data_id::text = j.source_run_id AND s.organization_id = j.organization_id
    WHERE j.id = $1 AND j.organization_id = $2 AND s.program_id = $3::uuid AND s.authoring_document_id = $4::uuid LIMIT 1`,
  [jobId, tenantId, programId, documentId]);
  if (!rows.length) fail(409, 'IMPORT_TARGET_STUDY_DATA_MISMATCH', 'This build was not drafted from the study data this document froze. Import it into the document whose study data it was built on. Nothing was imported.');
}

/** The headings this build already wrote into the document; a build that is not this one refuses the import. */
async function earlierImports(q: Queryable, tenantId: number, documentId: string, jobId: number): Promise<string[]> {
  const { rows } = await q.query(`SELECT DISTINCT metadata->'csrBuildImport'->>'jobId' AS job_id, metadata->'csrBuildImport'->>'sectionNumber' AS code
      FROM authoring_audit_trail WHERE doc_id = $1 AND tenant_id = $2 AND operation_type IN ('UPDATE', 'CSR_IMPORT') AND metadata ? 'csrBuildImport'`, [documentId, tenantId]);
  const other = (rows as Array<{ job_id: string; code: string | null }>).find(row => row.job_id !== String(jobId));
  if (other) fail(409, 'IMPORT_TARGET_BOUND_TO_OTHER_BUILD', `This document holds sections imported from CSR build ${other.job_id}. A document takes its imported sections from one build. Nothing was imported.`);
  return (rows as Array<{ code: string | null }>).map(row => row.code).filter((code): code is string => typeof code === 'string');
}

/** The request's approved headings, plus every heading this build already wrote here, so one origin covers them all. */
function effectiveSource(source: CsrSource, earlier: string[]): CsrSource {
  const codes = [...new Set([...(source.sectionNumbers ?? []), ...earlier])].sort();
  return { kind: 'csr', jobId: source.jobId, sectionNumbers: codes, approvedOnly: true };
}

async function targetSections(q: Queryable, tenantId: number, documentId: string, lock: boolean): Promise<Map<string, TargetSection>> {
  // The write transaction locks the document's section rows first (they alone, as FOR UPDATE OF s did), then reads them.
  if (lock) await q.query('SELECT 1 FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 FOR UPDATE', [documentId, tenantId]);
  const { rows } = await q.query(`SELECT s.id::text, s.code, s.title, COALESCE(s.content, '') AS content,
      r.id::text AS latest_id, r.origin AS latest_origin, r.content_sha256 AS latest_sha,
      EXISTS (SELECT 1 FROM authoring_audit_trail c WHERE c.section_id = s.id AND c.tenant_id = s.tenant_id
        AND c.operation_type = 'CREATE' AND c.metadata->>'seeded' = 'true') AS seeded,
      i.metadata->'csrBuildImport'->>'jobId' AS import_job_id, i.metadata->'csrBuildImport'->>'revisionId' AS import_revision_id
    FROM authoring_sections s
    LEFT JOIN LATERAL (SELECT id, origin, content_sha256 FROM doc_revisions WHERE section_id = s.id AND tenant_id = s.tenant_id
      ORDER BY created_at DESC, id DESC LIMIT 1) r ON true
    LEFT JOIN LATERAL (SELECT metadata FROM authoring_audit_trail t WHERE t.section_id = s.id AND t.tenant_id = s.tenant_id
      AND t.operation_type = 'UPDATE' AND t.metadata ? 'csrBuildImport' ORDER BY t.created_at DESC, t.id DESC LIMIT 1) i ON true
    WHERE s.doc_id = $1 AND s.tenant_id = $2`, [documentId, tenantId]);
  return new Map((rows as Array<Record<string, unknown>>).map(row => [String(row.code), {
    id: String(row.id), code: String(row.code), title: String(row.title ?? ''), content: String(row.content ?? ''),
    latestId: (row.latest_id as string | null) ?? null, latestOrigin: (row.latest_origin as string | null) ?? null,
    latestSha: (row.latest_sha as string | null) ?? null, seeded: row.seeded === true,
    importJobId: row.import_job_id == null ? null : Number(row.import_job_id), importRevisionId: (row.import_revision_id as string | null) ?? null,
  }]));
}

/** The edited-section rule (this file's header): may this section's text be replaced? */
export function replaceable(section: TargetSection, jobId: number): boolean {
  if (!section.content.trim()) return true;
  if (!section.latestId || section.latestSha !== sha(section.content)) return false;
  if (section.latestOrigin === 'genesis') return section.seeded;
  return section.importJobId === jobId && section.importRevisionId === section.latestId;
}

function planSection({ code, title, raw, byReference }: { code: string; title: string; raw: string; byReference: boolean },
  sections: Map<string, TargetSection>, jobId: number): Planned {
  const section = sections.get(code);
  if (!section) return { code, title, outcome: 'no-heading', placeholder: false };
  if (byReference) return { code, title: section.title || title, outcome: 'by-reference', placeholder: false };
  const stored = workflowCopySectionContent(raw);
  const placeholder = placeholderIn(stored) !== null;
  const base = { code, title: section.title || title, placeholder, sectionId: section.id, before: section.content, stored };
  if (sha(stored) === sha(section.content)) return { ...base, outcome: 'unchanged' };
  return { ...base, outcome: replaceable(section, jobId) ? 'will-write' : 'edited' };
}

function plan(materialized: MaterializedWorkflowSource, sections: Map<string, TargetSection>, jobId: number): Planned[] {
  const origins = new Map(materialized.origin.sectionOrigins.map(origin => [origin.code, origin]));
  return materialized.sections.map(section => {
    const origin = origins.get(section.code);
    const planned = planSection({ code: section.code, title: section.title, raw: section.content,
      byReference: section.code === NARRATIVES && !!origin?.narrativeReference }, sections, jobId);
    return { ...planned, sourceRowId: origin?.sourceRowId, sourceSha: origin?.contentSha256 };
  });
}

async function approvals(q: Queryable, tenantId: number, jobId: number, codes: string[]): Promise<Map<string, Approval>> {
  const { rows } = await q.query(`SELECT o.section_number, o.review_decided_at, COALESCE(NULLIF(u.name, ''), u.email, 'reviewer ' || o.reviewer_id) AS reviewer
      FROM csr_section_outputs o LEFT JOIN users u ON u.id = o.reviewer_id
    WHERE o.job_id = $1 AND o.organization_id = $2 AND o.section_number = ANY($3::text[])`, [jobId, tenantId, codes]);
  return new Map((rows as Array<Record<string, unknown>>).map(row => [String(row.section_number), {
    reviewer: String(row.reviewer ?? 'an independent reviewer'),
    reviewedAt: row.review_decided_at ? new Date(String(row.review_decided_at)).toISOString() : null,
  }]));
}

interface Admitted { doc: TargetDocument; materialized: MaterializedWorkflowSource; planned: Planned[] }
async function admitAndPlan(q: Queryable, ctx: CreateContext, principal: AuthoringPrincipal, input: CsrIntoDocumentInput, lock: boolean): Promise<Admitted> {
  const target = await authorizeAuthoringProgram(q, { tenantId: ctx.tenantId, actor: ctx.actor, principal, programId: input.programId });
  const doc = await admitTarget(q, ctx, target.principal, input, lock);
  if (lock) await reserveWritableDocument(q, doc.id, ctx.tenantId);
  await requireStudyDataBinding(q, ctx.tenantId, input.programId, input.source.jobId, doc.id);
  const source = effectiveSource(input.source, await earlierImports(q, ctx.tenantId, doc.id, input.source.jobId));
  const materialized = await materializeWorkflowSource({ organizationId: ctx.tenantId, userId: Number(ctx.actor.id),
    target: { programId: input.programId, projectId: target.projectId }, source }, q);
  return { doc, materialized, planned: plan(materialized, await targetSections(q, ctx.tenantId, doc.id, lock), input.source.jobId) };
}

function receipt(admitted: Admitted, preview: boolean): CsrIntoDocumentReceipt {
  const { doc, materialized, planned } = admitted;
  return { preview, into: { documentId: doc.id, title: doc.title }, fingerprint: materialized.fingerprint, origin: materialized.origin,
    sections: planned.map(({ code, title, outcome, placeholder }) => ({ code, title, outcome: !preview && outcome === 'will-write' ? 'written' : outcome, placeholder })),
    gaps: materialized.gaps, warnings: ['Approval and signatures of the build’s headings are not transferred; this document is reviewed and signed as itself.'] };
}

interface WriteScope { q: Queryable; ctx: CreateContext; input: CsrIntoDocumentInput & { reason: string }; admitted: Admitted }

/** One section through the editor's revision path, inside the import's transaction. */
async function writeSection({ q, ctx, input, admitted }: WriteScope, section: Planned, approval: Approval | undefined): Promise<void> {
  const { doc, materialized } = admitted;
  const sectionId = section.sectionId!; const content = section.stored!;
  const updated = await q.query('UPDATE authoring_sections SET content = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 AND doc_id = $4 RETURNING id',
    [content, sectionId, ctx.tenantId, doc.id]);
  if (updated.rows.length !== 1) fail(409, 'IMPORT_TARGET_CHANGED', 'A section of this document changed during the import. Nothing was imported.');
  await enforceAuthorLineage(q, ctx.tenantId, { documentTable: 'authoring_sections', documentId: sectionId }, content, ctx.actor.id,
    { machineDraft: { authorId: WORKFLOW_IMPORT_AUTHOR_ID } });
  const revisionId = await createRevision(q, { sectionId, content, updatedBy: ctx.actor.id, tenantId: ctx.tenantId, origin: 'ai-draft-accept',
    contributors: [{ id: WORKFLOW_IMPORT_AUTHOR_ID, name: MACHINE_AUTHOR_IDS[WORKFLOW_IMPORT_AUTHOR_ID] }] });
  await commitSectionToFiling({ client: q as never, sectionId, content, actorId: ctx.actor.id, tenantId: ctx.tenantId, reason: input.reason, draftSource: 'imported' });
  const approvedBy = approval ? `heading approved by ${approval.reviewer}${approval.reviewedAt ? ` at ${approval.reviewedAt}` : ''}` : 'heading approval recorded on the build';
  await writeAuthoringAuditTrail(ctx.audit, { docId: doc.id, sectionId, operationType: 'UPDATE', beforeContent: section.before ?? null, afterContent: content,
    changeReason: input.reason, executor: q, metadata: {
      section_code: section.code,
      csrBuildImport: { jobId: input.source.jobId, sectionNumber: section.code, revisionId, sourceRowId: section.sourceRowId ?? null,
        sourceContentSha256: section.sourceSha ?? null, storedContentSha256: sha(content), fingerprint: materialized.fingerprint,
        reviewer: approval?.reviewer ?? null, reviewedAt: approval?.reviewedAt ?? null,
        statement: `Imported from CSR build ${input.source.jobId}, §${section.code}, ${approvedBy}.` },
      workflowSourceOrigin: materialized.origin.sectionOrigins.find(origin => origin.code === section.code) ?? null,
    } });
}

/** The fingerprint of the newest import this document recorded, or null. */
async function recordedFingerprint(q: Queryable, tenantId: number, documentId: string): Promise<string | null> {
  const { rows } = await q.query(`SELECT metadata->'csrBuildImport'->>'fingerprint' AS fingerprint FROM authoring_audit_trail
    WHERE doc_id = $1 AND tenant_id = $2 AND operation_type = 'CSR_IMPORT' ORDER BY created_at DESC, id DESC LIMIT 1`, [documentId, tenantId]);
  return (rows[0] as { fingerprint?: string } | undefined)?.fingerprint ?? null;
}

/** The import's document-level receipt: its origin (the one release verifies, workflow-import-governance.ts) and
 * what it did. Written whenever it wrote a section or the build's approved state differs from the last receipt, so
 * the receipt always describes the source as it now stands. The document's provenance names it, as a working copy's
 * does, so the CSR readers that follow importSource find the build. */
async function recordImport({ q, ctx, input, admitted }: WriteScope, planned: Planned[]): Promise<void> {
  const { doc, materialized } = admitted;
  const importSource = { ...materialized.origin, warnings: [IMPORT_REASON], reason: input.reason };
  const codes = (outcome: Planned['outcome']) => planned.filter(section => section.outcome === outcome).map(section => section.code);
  await writeAuthoringAuditTrail(ctx.audit, { docId: doc.id, sectionId: null, operationType: 'CSR_IMPORT', beforeContent: null, afterContent: null,
    changeReason: input.reason, executor: q, metadata: { provenance: { importSource },
      csrBuildImport: { jobId: input.source.jobId, fingerprint: materialized.fingerprint, written: codes('will-write'), unchanged: codes('unchanged'),
        edited: codes('edited'), noHeading: codes('no-heading'), byReference: codes('by-reference') } } });
  await q.query(`UPDATE authoring_documents SET provenance = jsonb_set(COALESCE(provenance, '{}'::jsonb), '{importSource}', $1::jsonb, true)
    WHERE id = $2 AND tenant_id = $3`, [JSON.stringify(importSource), doc.id, ctx.tenantId]);
}

/** The two isolation levels this import opens, as fixed statements. */
const BEGIN_AT = { SERIALIZABLE: 'BEGIN ISOLATION LEVEL SERIALIZABLE', 'REPEATABLE READ': 'BEGIN ISOLATION LEVEL REPEATABLE READ' } as const;

async function inTransaction<T>(ctx: CreateContext, isolation: keyof typeof BEGIN_AT, work: (q: Executor) => Promise<T>): Promise<T> {
  const client = await ctx.pool.connect() as Executor;
  let discard: Error | undefined;
  try {
    await client.query(BEGIN_AT[isolation]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { discard = new Error('CSR import rollback failed'); });
    throw error;
  } finally { client.release?.(discard); }
}

async function writeImport(ctx: CreateContext, principal: AuthoringPrincipal, input: CsrIntoDocumentInput & { reason: string }): Promise<CsrIntoDocumentReceipt> {
  return inTransaction(ctx, 'SERIALIZABLE', async q => {
    const admitted = await admitAndPlan(q, ctx, principal, input, true);
    if (admitted.materialized.fingerprint !== input.expectedFingerprint) fail(409, 'SOURCE_CHANGED', 'The build’s approved sections or this document changed since the preview. Preview it again. Nothing was imported.');
    const writes = admitted.planned.filter(section => section.outcome === 'will-write');
    const approved = await approvals(q, ctx.tenantId, input.source.jobId, writes.map(section => section.code));
    const scope = { q, ctx, input, admitted };
    for (const section of writes) await writeSection(scope, section, approved.get(section.code));
    if (writes.length || await recordedFingerprint(q, ctx.tenantId, admitted.doc.id) !== admitted.materialized.fingerprint) {
      await recordImport(scope, admitted.planned);
    }
    return receipt(admitted, false);
  });
}

/** Preview (what would be written, kept and why) or write; the caller maps a CsrIntoDocumentError to its refusal. */
export async function importCsrIntoDocument(ctx: CreateContext, principal: AuthoringPrincipal, input: CsrIntoDocumentInput): Promise<CsrIntoDocumentReceipt> {
  if (input.source.approvedOnly !== true || !input.source.sectionNumbers?.length) {
    return fail(400, 'IMPORT_TARGET_REQUIRES_APPROVED', 'Only approved CSR headings are imported into a document. Nothing was imported.');
  }
  if (input.previewOnly) return inTransaction(ctx, 'REPEATABLE READ', async q => receipt(await admitAndPlan(q, ctx, principal, input, false), true));
  if (!input.reason || !input.expectedFingerprint) return fail(400, 'SOURCE_PREVIEW_REQUIRED', 'Preview this import and state a reason first. Nothing was imported.');
  const write = { ...input, reason: input.reason };
  for (let attempt = 0; ; attempt++) {
    try { return await writeImport(ctx, principal, write); } catch (error) {
      if ((error as { code?: string }).code !== '40001') throw error;
      if (attempt) return fail(409, 'IMPORT_RETRY_REQUIRED', 'This document or the build changed concurrently. Retry the import. Nothing was overwritten.');
    }
  }
}
