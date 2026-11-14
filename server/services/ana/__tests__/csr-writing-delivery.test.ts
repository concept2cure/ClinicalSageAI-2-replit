/** Actual drafting service and editor adapter; outbound transport and the
 * already-validated saved-reference boundary are controlled collaborators. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayRequest } from '../../ai-gateway/types';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { RecordedTemplateSource } from '../../../../shared/authoring/recorded-template-source';
import type { SavedTemplateReview } from '../saved-template-review';

const h = vi.hoisted(() => ({ route: vi.fn(), derivative: vi.fn(), review: vi.fn() }));
vi.mock('../../ai-gateway/gateway', async importOriginal => ({
  ...(await importOriginal<typeof import('../../ai-gateway/gateway')>()),
  getGateway: () => ({ route: h.route, routeDerivative: h.derivative }),
}));
vi.mock('../saved-template-review', () => ({ savedTemplateReview: h.review }));

import { AnaDocumentDraftingService, type DocumentDraftRequest } from '../AnaDocumentDraftingService';
import { csrWritingBrief, csrWritingGuidance } from '../medical-writing-csr';
import { buildSectionDraftPrompt, recordedFilingDraftContext, savedSectionDraftTemplate } from '../../authoring/authoring-draft-template';

const PROGRAM = 'd1111111-2222-4333-8444-000000000011';
const DOC = 'd2222222-2222-4333-8444-000000000011';
const SECTION = 'd3333333-2222-4333-8444-000000000011';
const TEMPLATE = '4331e7e3-7777-5c21-8c9b-0e2f56194e7e';
const DERIVATIVE = 'd4444444-2222-4333-8444-000000000011';
const PREFIX = 'server/services/ind/ctd/csr-e3-guidance.ts#';
const service = new AnaDocumentDraftingService();
const scope = { tenantId: 7, documentId: DOC, programId: PROGRAM, sectionId: SECTION, code: '11.4.1' };
let pg: PGlite;
const reads: string[] = [];
const sql: RequestSqlClient = { query: async (text, params) => {
  reads.push(text);
  return { rows: (await pg.query<Record<string, unknown>>(text, params)).rows };
} };
const request = (overrides: Partial<DocumentDraftRequest> = {}): DocumentDraftRequest => ({
  framework: 'ich_clinical', submissionType: 'ICH_CSR', sectionType: '11.4.1',
  instructions: 'Write only from retained evidence; preserve qualifications.', organizationId: 7,
  userId: 7, projectId: PROGRAM, contextSqlClient: sql, ...overrides,
});
const brief = () => csrWritingBrief(csrWritingGuidance('11.4.1'), null);
const prompt = () => (h.route.mock.calls.at(-1)![0] as GatewayRequest).messages.map(m => m.content).join('\n');
const source = (): RecordedTemplateSource => ({ id: TEMPLATE, entryId: 'component:clinical_study_report',
  version: 1, sha256: 'a'.repeat(64), kind: 'narrative', aiDraftable: true,
  authoringMode: 'ai_draft', originalFormat: 'docx', limitations: ['Original records remain originals.'],
  filingContext: { registryId: null, region: 'GLOBAL', agency: 'ICH' } });
function reviewed(reference = `${PREFIX}11.4.1`, recorded = source()): SavedTemplateReview {
  return { template: { id: recorded.id, sourceState: 'recorded' }, source: recorded,
    references: [{ sectionId: SECTION, templateId: recorded.id, authority: 'recorded',
      sourceVerification: 'full-recorded', source: { ...recorded },
      fields: { source_reference: reference, guidance_text: 'Exact retained section guidance.' } }], items: [] };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,deleted_at timestamp,
      product_type text,indication text,program_type text,primary_agency text,metadata jsonb);
    CREATE TABLE projects(id integer PRIMARY KEY,organization_id integer,client_workspace_id integer,
      regulatory_program_id uuid,owner_id integer,created_by_id integer,settings jsonb);
    CREATE TABLE organization_users(id serial PRIMARY KEY,organization_id integer,user_id integer,role text);
    CREATE TABLE users(id integer PRIMARY KEY,status text);
    CREATE TABLE organizations(id integer PRIMARY KEY,status text);
    CREATE TABLE project_visibility_settings(project_id integer,organization_id integer,visibility text);
    CREATE TABLE project_members(project_id integer,organization_id integer,user_id integer,role text,status text);
    CREATE TABLE concept2cure_review_assignments(reviewer_id integer,organization_id integer,artifact_id uuid,status text);
    CREATE TABLE concept2cure_artifacts(id uuid PRIMARY KEY,project_id integer,organization_id integer);
    CREATE TABLE project_charters(id serial PRIMARY KEY,organization_id integer,project_id integer,version integer,
      updated_at timestamptz,approval_status text,therapeutic_area text,development_stage text,target_population text);`);
});
beforeEach(async () => {
  await pg.exec(`TRUNCATE regulatory_programs,projects,organization_users,users,organizations,
      project_members,project_charters,project_visibility_settings RESTART IDENTITY;
    INSERT INTO organizations VALUES(7,'active'); INSERT INTO users VALUES(7,'active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(7,7,'member');
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',7,NULL,'small_molecule','Recorded indication','ind','FDA','{"submissionTypeId":"US_IND"}');
    INSERT INTO projects VALUES(11,7,71,'${PROGRAM}',7,7,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private');
    INSERT INTO project_members VALUES(11,7,7,'use','active');
    INSERT INTO project_charters(organization_id,project_id,version,updated_at,approval_status,therapeutic_area,development_stage,target_population)
      VALUES(7,11,1,'2026-11-13T12:00:00Z','draft','oncology','phase_2','Adults');`);
  reads.length = 0;
  h.review.mockReset().mockResolvedValue(reviewed());
  h.route.mockReset().mockImplementation(async (sent: GatewayRequest) => {
    await sent.beforeDispatch?.();
    return { content: 'A working draft.', model: 'fixture-model', finishReason: 'end_turn',
      usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1 };
  });
  h.derivative.mockReset().mockResolvedValue({ content: 'Restored derivative draft.', model: 'fixture-model',
    provider: 'local', requestId: DERIVATIVE, resolvedModel: 'fixture-pin', finishReason: 'stop',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 }, latencyMs: 1,
    derivativeVerification: { kind: 'deterministic_token_roundtrip', derivativeId: DERIVATIVE,
      payloadSha256: 'b'.repeat(64), semanticVerified: false, originTier: 2, effectiveTier: 1, resultingContentTier: 2 } });
});
afterAll(async () => { await pg.close(); });

describe('ordinary CSR generation receives the canonical writing standard', () => {
  it('carries the complete brief and the exact author revision instruction', async () => {
    await service.draftDocument(request({ existingContent: 'Existing supported paragraph (Table 14.2.1).',
      instructions: 'Improve the transition; retain uncertainty and citations.' }));
    expect(prompt()).toContain(brief());
    expect(prompt()).toContain('Existing supported paragraph (Table 14.2.1).');
    expect(prompt()).toContain('Improve the transition; retain uncertainty and citations.');
    expect(prompt()).toContain('Recorded application US_IND differs from the requested application ICH_CSR');
  });

  it('uses an omitted filing choice resolved to CSR by current project records', async () => {
    await pg.query('UPDATE regulatory_programs SET metadata=$1 WHERE id=$2', [{ submissionTypeId: 'ICH_CSR' }, PROGRAM]);
    await service.draftDocument(request({ submissionType: undefined }));
    expect(prompt()).toContain(brief());
    expect((h.route.mock.calls[0][0] as GatewayRequest).metadata).toMatchObject({ submissionType: 'ICH_CSR', recordedSubmissionType: 'ICH_CSR' });
  });

  it.each(['3', '14.2', '15', '16.3.1', '16.3.1 Safety Conclusions', '14.2 Analysis of Efficacy'])('refuses original-record section %s before a provider call', async sectionType => {
    await expect(service.draftDocument(request({ sectionType }))).rejects.toMatchObject({ status: 409, code: 'DRAFT_MANUAL_SECTION_REQUIRED' });
    expect(h.route).not.toHaveBeenCalled();
    expect(h.derivative).not.toHaveBeenCalled();
  });

  it.each(['99', '11.4.1 Unrelated heading', 'Statistical Methods', '9.7 Analysis of Efficacy'])('holds unverified or ambiguous E3 heading %s', async sectionType => {
    await expect(service.draftDocument(request({ sectionType }))).rejects.toMatchObject({ status: 409, code: 'DRAFT_CSR_SECTION_UNAVAILABLE' });
    expect(h.route).not.toHaveBeenCalled();
  });

  it('keeps a manual failure in its own batch slot', async () => {
    const out = await service.batchDraft({ requests: [request({ sectionType: '16.3.1' }), request()], concurrency: 1 });
    expect(out[0]).toMatchObject({ error: 'DRAFT_MANUAL_SECTION_REQUIRED', sectionType: '16.3.1' });
    expect(out[0]).not.toHaveProperty('content');
    expect(out[1]).toMatchObject({ content: 'A working draft.' });
    expect(h.route).toHaveBeenCalledOnce();
  });

  it('does not apply CSR section policy to another document with the same number', async () => {
    await service.draftDocument(request({ submissionType: 'ICH_IB', sectionType: '3' }));
    expect(h.route).toHaveBeenCalledOnce();
    expect(prompt()).not.toContain('## CSR writing standard');
  });

  it('preserves recorded-context stream buffering through the final current-access check', async () => {
    const onStream = vi.fn();
    h.route.mockImplementationOnce(async (sent: GatewayRequest) => {
      expect(sent.messages.map(m => m.content).join('\n')).toContain(brief());
      await sent.beforeDispatch?.(); sent.onStream?.('Pending result.');
      await pg.query("UPDATE users SET status='disabled' WHERE id=7");
      return { content: 'Pending result.', model: 'fixture-model', finishReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1 };
    });
    await expect(service.draftDocument(request({ onStream }))).rejects.toMatchObject({ status: 403 });
    expect(onStream).not.toHaveBeenCalled();
  });
});

describe('approved derivative custody remains a distinct exact payload', () => {
  it('forwards only custody and routing identities, with no ordinary writing brief or raw project facts', async () => {
    const result = await service.draftDocument(request({ derivativeId: DERIVATIVE,
      instructions: 'RAW_PRIVATE_INSTRUCTION', existingContent: 'RAW_PRIVATE_DRAFT' }));
    expect(h.derivative).toHaveBeenCalledOnce();
    expect(h.derivative.mock.calls[0][0]).toEqual({ organizationId: 7, userId: 7, projectId: 11,
      derivativeId: DERIVATIVE, taskType: 'document_drafting', qualifiedModelPin: undefined, maxTokens: 8192, signal: undefined });
    expect(JSON.stringify(h.derivative.mock.calls)).not.toMatch(/RAW_PRIVATE|CSR writing standard|Recorded indication/);
    expect(reads.join('\n')).not.toMatch(/project_charters|SELECT.*product_type/);
    expect(h.route).not.toHaveBeenCalled();
    expect(result.derivativeVerification?.semanticVerified).toBe(false);
  });

  it('locally refuses an explicitly identified original-record CSR section before custody dispatch', async () => {
    await expect(service.draftDocument(request({ derivativeId: DERIVATIVE, sectionType: '16.3.1' })))
      .rejects.toMatchObject({ code: 'DRAFT_MANUAL_SECTION_REQUIRED' });
    expect(h.derivative).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });
});

describe('the existing validated editor context receives CSR craft', () => {
  it('delivers the canonical brief before the unchanged saved-reference JSON and existing revision block', async () => {
    const context = await savedSectionDraftTemplate(sql, scope, { template_id: TEMPLATE }, 'FDA');
    const generated = buildSectionDraftPrompt({ section: { module: 'M5', code: scope.code, title: 'Efficacy', product_code: 'P' },
      tone: 'professional', region: context.region, referenceBlock: context.referenceBlock, evidenceBlock: '[SRC-1] Retained exact study text.',
      revision: { baseText: 'Current candidate.', instruction: 'Clarify its limitation.' } });
    expect(generated).toContain(brief());
    expect(context.referenceBlock.indexOf('## CSR writing standard')).toBeLessThan(context.referenceBlock.indexOf('BEGIN_SAVED_SECTION_TEMPLATE_REFERENCE_JSON'));
    expect(generated).toContain('Current candidate.'); expect(generated).toContain('Clarify its limitation.');
    expect(context.documentKind).toBe('csr');
    const data = context.referenceBlock.slice(context.referenceBlock.indexOf('Template reference data only'));
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(16 * 1024);
  });

  it.each([
    ['99', 'TEMPLATE_CSR_SECTION_UNAVAILABLE'], ['9.7', 'TEMPLATE_CSR_SECTION_MISMATCH'],
    ['14.2', 'TEMPLATE_NOT_DRAFTABLE'],
  ])('refuses invalid or conflicting retained E3 binding %s', async (reference, code) => {
    h.review.mockResolvedValue(reviewed(`${PREFIX}${reference}`));
    await expect(savedSectionDraftTemplate(sql, scope, { template_id: TEMPLATE }, 'FDA')).rejects.toMatchObject({ code });
  });

  it('retains original-record refusal when the saved CSR code has no policy field', async () => {
    h.review.mockResolvedValue(reviewed('', source()));
    await expect(savedSectionDraftTemplate(sql, { ...scope, code: '16.3.1' }, { template_id: TEMPLATE }, 'FDA'))
      .rejects.toMatchObject({ code: 'TEMPLATE_NOT_DRAFTABLE' });
  });

  it('preserves a valid large saved reference without applying its data budget to trusted canonical instructions', async () => {
    const review = reviewed();
    review.references[0].fields.guidance_text = 'Retained exact guidance. '.repeat(300);
    h.review.mockResolvedValue(review);
    const context = await savedSectionDraftTemplate(sql, scope, { template_id: TEMPLATE }, 'FDA');
    expect(context.referenceBlock).toContain(review.references[0].fields.guidance_text);
    expect(context.referenceBlock).toContain(brief());
    expect(Buffer.byteLength(context.referenceBlock)).toBeGreaterThan(16 * 1024);
    const data = context.referenceBlock.slice(context.referenceBlock.indexOf('Template reference data only'));
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(16 * 1024);
  });

  it('still refuses saved reference data beyond its original byte limit without clipping it', async () => {
    const review = reviewed(); review.references[0].fields.guidance_text = 'r'.repeat(17 * 1024);
    h.review.mockResolvedValue(review);
    await expect(savedSectionDraftTemplate(sql, scope, { template_id: TEMPLATE }, 'FDA'))
      .rejects.toMatchObject({ code: 'TEMPLATE_REFERENCE_TOO_LARGE' });
  });

  it('separates admitted document-local E3 structure from receiving-application metadata', async () => {
    const context = await savedSectionDraftTemplate(sql, scope, { template_id: TEMPLATE }, 'FDA');
    const filing = await recordedFilingDraftContext(sql, { tenantId: 7, programId: PROGRAM, code: scope.code }, 'FDA');
    expect(filing.block).toContain('US_IND');
    expect(context.referenceBlock).toContain(brief());
    expect(context.referenceBlock).toMatch(/document.local.*ICH E3/i);
  });

  it('retains CSR classification for an IND filing-coded template without interpreting its coordinate as E3', async () => {
    const recorded: RecordedTemplateSource = { ...source(), id: 'f7e72f59-71ed-5cf6-96bf-d8edea20cb84',
      entryId: 'section:m5.3.5.1', filingContext: { registryId: 'US_IND', region: 'US', agency: 'FDA' } };
    h.review.mockResolvedValue(reviewed('server/services/ind/ctd/authoring-guidance.ts#5.3.5.1', recorded));
    const context = await savedSectionDraftTemplate(sql, { ...scope, code: '5.3.5.1' }, { template_id: recorded.id }, 'FDA');
    expect(context.documentKind).toBe('csr');
    expect(context.referenceBlock).not.toContain('## CSR writing standard');
  });

  it('does not infer verified CSR writing guidance from a label or unrelated full template', async () => {
    const recorded: RecordedTemplateSource = { ...source(), id: 'd5555555-2222-4333-8444-000000000011',
      entryId: 'registry:ICH_IB', filingContext: { registryId: 'ICH_IB', region: 'GLOBAL', agency: 'ICH' } };
    h.review.mockResolvedValue(reviewed('', recorded));
    const context = await savedSectionDraftTemplate(sql, scope, { template_id: recorded.id, title: 'Clinical Study Report' }, 'FDA');
    expect(context.documentKind).toBe('ctd');
    expect(context.referenceBlock).not.toContain('## CSR writing standard');
  });
});
