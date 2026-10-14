/** Current-source facts, clause lineage and an actual signed adoption are separate
 * release predicates. SQL joins execute against PGlite, not query-shaped mocks. */
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AdmZip from 'adm-zip';
import type { WorkflowImportOrigin } from '../../../../shared/authoring/source-import';
const m = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('../import-source-references', () => ({ verifySavedWorkflowImport: m.verify,
  savedImportSource: () => null, verifySavedImportSource: async () => undefined }));
import { assertWorkflowImportRelease, prepareWorkflowImportAdoption, type WorkflowGovernanceInput } from '../workflow-import-governance';
import { enforceAuthorLineage } from '../../clinical-regulatory-evidence/lineage-gate';
import { computeAuthoringSignatureDigest, renderAuthoringExport, sectionsDigest } from '../authoring-export';
import { WORKFLOW_IMPORT_AUTHOR_ID } from '../revision-ledger';
import { hashPayload } from '../../audit/chain';
import { workflowCopySectionContent } from '../workflow-copy-content';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';

const ORG = 77;
const PROGRAM = '10000000-0000-4000-8000-000000000077';
const SOURCE = 'The study achieved the prespecified clinical efficacy endpoint.';
const HUMAN = 'The reviewer independently evaluated the complete retained study data.';
let pg: PGlite;
let origin: WorkflowImportOrigin;
let input: WorkflowGovernanceInput;
const q = { query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows:R[]; rowCount:number }> => {
  const result = await pg.query<R>(sql,params as unknown[]);
  return { rows:result.rows,rowCount:result.affectedRows ?? result.rows.length };
} };
const migration = (file: string) => readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8');

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,name text);
    INSERT INTO organizations VALUES(77,'Test');
    CREATE TABLE users(id integer PRIMARY KEY,email text,status text);
    INSERT INTO users VALUES(8,'reviewer@example.test','active'),(9,'author@example.test','active');
    CREATE TABLE authoring_documents(id uuid PRIMARY KEY);`);
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec('ALTER TABLE audit_logs ALTER COLUMN id SET DEFAULT gen_random_uuid()::text');
  for (const file of ['db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
    'db/migrations/20260803_document_span_lineage.sql', 'migrations/20260907_span_lineage_accepted_machine_draft.sql',
    'migrations/20260908_span_lineage_machine_draft.sql', 'db/migrations/20260725_authoring_audit_trail.sql',
    'db/migrations/20260725_authoring_signatures_and_workflow.sql', 'db/migrations/20260725_authoring_signature_freeze_binding.sql',
    'migrations/20260728_authoring_reviews.sql']) await pg.exec(migration(file));
}, 90_000);
afterAll(async () => { await pg.close(); });

beforeEach(async () => {
  m.verify.mockReset();
  const docId = randomUUID();
  const sectionId = randomUUID();
  const content = workflowCopySectionContent(SOURCE);
  origin = { kind: 'csr', id: '44', programId: PROGRAM, title: 'Stored CSR', documentType: null, sectionCode: null,
    fingerprint: 'a'.repeat(64), selection: { kind: 'csr', jobId: 44 }, version: '1', gaps: [],
    conversion: 'ich-e3-sections', sourceScope: { level: 'project', projectId: 11, programId: PROGRAM },
    association: { mode: 'recorded', reason: null }, sectionOrigins: [{ code: '11', sourceRowId: '44:11',
      contentSha256: 'b'.repeat(64), originalAuthorship: 'unknown', model: null, modelEvidence: 'unrecorded' }] };
  input = { organizationId: ORG, doc: { id: docId, created_by: '9', client_program_id: PROGRAM,
    provenance: { importSource: origin } }, sections: [{ id: sectionId, code: '11', content }],
    actor: { id: '8', email: 'reviewer@example.test' } };
  await q.query('INSERT INTO authoring_documents VALUES($1)', [docId]);
  await q.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,operation_type,actor_email,actor_id,tenant_id,metadata)
    VALUES($1,$2,'CREATE','author@example.test','9',$3,$4::jsonb)`,
  [docId,sectionId,ORG,JSON.stringify({ provenance: { importSource: origin }, section_code: '11' })]);
  await enforceAuthorLineage(q, ORG, { documentTable: 'authoring_sections', documentId: sectionId }, content, '9',
    { machineDraft: { authorId: WORKFLOW_IMPORT_AUTHOR_ID } });
  m.verify.mockImplementation(async () => ({ origin, fingerprint: origin.fingerprint,
    sections: [{ code: '11', title: 'Efficacy', content: SOURCE }] }));
});

async function approvedReview(): Promise<string> {
  const reviewId = randomUUID();
  await q.query(`INSERT INTO authoring_reviews(id,doc_id,reviewer_id,review_status,reviewed_at,requested_at,requested_by,tenant_id)
    VALUES($1,$2,'8','approved',NOW(),NOW()-interval '1 minute','9',$3)
    ON CONFLICT(doc_id,reviewer_id,tenant_id) DO UPDATE SET review_status='approved',reviewed_at=NOW(),requested_at=NOW() RETURNING id`, [reviewId,input.doc.id,ORG]);
  const current = await q.query('SELECT id FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2',[input.doc.id,ORG]);
  return String(current.rows[0].id);
}
async function adoptedCopy(includeChain = true): Promise<string> {
  const reviewId = await approvedReview();
  const adoption = await prepareWorkflowImportAdoption(q, { ...input, explicit: true });
  expect(adoption?.reviewId).toBe(reviewId);
  const signatureId = randomUUID();
  const contentHash = sectionsDigest(input.sections);
  const digest = computeAuthoringSignatureDigest({ signerEmail: 'reviewer@example.test', meaning: 'REVIEWER', contentHash, coveredContentHash: null });
  await q.query(`INSERT INTO authoring_signatures(id,doc_id,signer_email,meaning,content_hash,signature_digest,tenant_id)
    VALUES($1,$2,'reviewer@example.test','REVIEWER',$3,$4,$5)`, [signatureId,input.doc.id,contentHash,digest,ORG]);
  await q.query(`INSERT INTO authoring_audit_trail(doc_id,operation_type,actor_email,actor_id,tenant_id,metadata)
    VALUES($1,'E_SIGN','reviewer@example.test','8',$2,$3::jsonb)`,
  [input.doc.id,ORG,JSON.stringify({ signatureId,workflowSourceAdoption: adoption })]);
  if (includeChain) {
    const details = { signatureId,workflowSourceAdoption: adoption };
    await q.query(`INSERT INTO audit_logs(id,tenant_id,record_id,action,new_values,payload_hash)
      VALUES($1,$2,$3,'authoring.document.e-sign',$4::json,$5)`, [randomUUID(),ORG,input.doc.id,JSON.stringify(details),hashPayload(details)]);
  }
  return signatureId;
}
async function rewrite(content = workflowCopySectionContent(HUMAN)) {
  input.sections = [{ ...input.sections[0], content }];
  await enforceAuthorLineage(q, ORG, { documentTable: 'authoring_sections', documentId: input.sections[0].id }, content, '9');
}

describe('workflow release needs current explicit full-document human adoption', () => {
  it('refuses a copy when a current fingerprint and unknown/template metadata are its only evidence', async () => {
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code: 'WORKFLOW_HUMAN_ADOPTION_REQUIRED' });
  });
  it('a review verdict and an unchecked REVIEWER signature are not explicit adoption', async () => {
    await approvedReview();
    expect(await prepareWorkflowImportAdoption(q,{ ...input,explicit:false })).toBeNull();
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code: 'WORKFLOW_HUMAN_ADOPTION_REQUIRED' });
  });
  it.each(['unknown','template'] as const)('allows %s source after a current full-hash signed assigned adoption', async authorship => {
    origin.sectionOrigins[0].originalAuthorship = authorship;
    await adoptedCopy();
    await expect(assertWorkflowImportRelease(q,input)).resolves.toBeUndefined();
  });
  it('a signature and editable audit-shaped metadata without the chained act do not release', async () => {
    await adoptedCopy(false);
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code: 'WORKFLOW_HUMAN_ADOPTION_REQUIRED' });
  });
  it('rejects the author adopting their own copy and an unassigned reviewer', async () => {
    await expect(prepareWorkflowImportAdoption(q,{...input,explicit:true})).rejects.toMatchObject({ code: 'WORKFLOW_REVIEW_ASSIGNMENT_REQUIRED' });
    await approvedReview();
    input.doc.created_by = '8';
    await expect(prepareWorkflowImportAdoption(q,{...input,explicit:true})).rejects.toMatchObject({ code: 'WORKFLOW_REVIEW_ASSIGNMENT_REQUIRED' });
  });
});

describe('positive machine origin never becomes model qualification by review', () => {
  it.each([null,'a-model-name'])('holds retained known machine content with model %s even after explicit adoption', async model => {
    origin.sectionOrigins[0] = { ...origin.sectionOrigins[0],originalAuthorship:'machine',model,
      modelEvidence: model ? 'recorded-name-only' : 'unrecorded' };
    await adoptedCopy();
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code: 'WORKFLOW_MODEL_QUALIFICATION_REQUIRED' });
  });
  it('immutable genesis and current source facts win over relabeling the displayed origin', async () => {
    origin.sectionOrigins[0].originalAuthorship = 'machine';
    input.doc.provenance = { importSource: { ...origin,sectionOrigins:[{...origin.sectionOrigins[0],originalAuthorship:'template'}] } };
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code: 'WORKFLOW_MODEL_QUALIFICATION_REQUIRED' });
  });
  it('moving copied machine prose to another section cannot launder it as a local human save', async () => {
    origin.sectionOrigins[0].originalAuthorship = 'machine';
    await rewrite();
    const section = { id:randomUUID(),code:'12',content:workflowCopySectionContent(SOURCE) };
    await enforceAuthorLineage(q, ORG,{ documentTable:'authoring_sections',documentId:section.id },section.content,'9');
    input.sections = [...input.sections,section];
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code:'WORKFLOW_MODEL_QUALIFICATION_REQUIRED' });
  });
  it('formatting and whitespace changes are not replacement by human words', async () => {
    origin.sectionOrigins[0].originalAuthorship = 'machine';
    await rewrite('<div>The study achieved the prespecified\n clinical efficacy endpoint.</div>');
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code:'WORKFLOW_MODEL_QUALIFICATION_REQUIRED' });
  });
  it('punctuation-only edits do not clear a positive machine source hold', async () => {
    origin.sectionOrigins[0].originalAuthorship = 'machine';
    await rewrite(workflowCopySectionContent('The study, achieved the prespecified clinical efficacy endpoint!'));
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code:'WORKFLOW_MODEL_QUALIFICATION_REQUIRED' });
  });
  it('a genuine governed human rewrite clears qualification hold but requires a fresh full-document adoption', async () => {
    origin.sectionOrigins[0].originalAuthorship = 'machine';
    await adoptedCopy();
    await rewrite();
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code:'WORKFLOW_HUMAN_ADOPTION_REQUIRED' });
    // New current review request supersedes the old adoption.
    await q.query('UPDATE authoring_reviews SET requested_at=NOW(),reviewed_at=NOW() WHERE doc_id=$1',[input.doc.id]);
    await adoptedCopy();
    await expect(assertWorkflowImportRelease(q,input)).resolves.toBeUndefined();
  });
});

describe('source identity and current content stay verified at release', () => {
  it('fails closed when source access or fingerprint verification fails, including a previously adopted copy', async () => {
    await adoptedCopy();
    m.verify.mockRejectedValue(new Error('source changed'));
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code:'WORKFLOW_SOURCE_UNAVAILABLE' });
  });
  it('a title change invalidates adoption even when signature prose hash is unchanged', async () => {
    await adoptedCopy();
    input.doc.title='A revised study report title';
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code:'WORKFLOW_HUMAN_ADOPTION_REQUIRED' });
  });
  it('a reopened review assignment invalidates its earlier signed adoption', async () => {
    await adoptedCopy();
    await q.query("UPDATE authoring_reviews SET review_status='pending',reviewed_at=NULL WHERE doc_id=$1",[input.doc.id]);
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code:'WORKFLOW_HUMAN_ADOPTION_REQUIRED' });
  });
  it('a signature with an invalid recomputable digest is not adoption', async () => {
    const signatureId = await adoptedCopy();
    await q.query("UPDATE authoring_signatures SET signature_digest='invalid' WHERE id=$1",[signatureId]);
    await expect(assertWorkflowImportRelease(q,input)).rejects.toMatchObject({ code:'WORKFLOW_HUMAN_ADOPTION_REQUIRED' });
  });
  it('refuses a write whose present text no longer matches its live lineage', async () => {
    input.sections = [{...input.sections[0],content:'A different sentence without any matching provenance.'}];
    await expect(assertWorkflowImportRelease(q,input)).rejects.toThrow();
  });
});

describe('uncontrolled review copies retain the real qualification hold', () => {
  it('renders a working DOCX with NOT FINAL and qualification disclosure while controlled rendition refuses', async () => {
    origin.sectionOrigins[0].originalAuthorship='machine';
    await adoptedCopy();
    const args = { executor:q,tenantId:ORG,doc:{id:input.doc.id,title:'Stored CSR working copy',client_program_id:PROGRAM,
      provenance:input.doc.provenance,created_by:input.doc.created_by},
      sections:input.sections.map(section => ({...section,title:'Clinical findings'})),actor:input.actor,format:'docx' as const };
    await expect(renderAuthoringExport(args)).rejects.toMatchObject({code:'WORKFLOW_MODEL_QUALIFICATION_REQUIRED'});
    const working = await renderAuthoringExport({...args,workingCopy:{banner:'DRAFT — uncontrolled copy'}});
    const zip = new AdmZip(working.fileContent);
    const body = zip.readAsText('word/document.xml');
    const header = zip.readAsText('word/header1.xml');
    expect(body).toContain('NOT FINAL');
    expect(body).toContain('Stored machine content remains on release hold');
    expect(header).toContain('uncontrolled copy');
    expect(body).not.toContain('Electronic Signature Manifest');
  });
});
