import { PGlite } from '@electric-sql/pglite';
import httpRequest from 'supertest';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

const io = vi.hoisted(() => ({
  resolve: vi.fn(),
  query: vi.fn(),
  requestQuery: vi.fn(),
  lumen: vi.fn(),
  memory: vi.fn(),
  enrich: vi.fn(),
  prefetch: vi.fn(),
  bootstrap: vi.fn(),
  reflect: vi.fn(),
  logToolRun: vi.fn(),
}));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', () => ({ getPool: () => ({ query: io.query }), pool: { query: io.query }, db: {} }));
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal =>
  (await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
);
vi.mock('../../../services/ana-ri/orchestrator.js', async original => ({
  ...await original<typeof import('../../../services/ana-ri/orchestrator.js')>(),
  prefetchProjectIntelligence: async () => null, preloadRIMContext: async () => '',
}));
vi.mock('../../../services/c2c/project-ref.js', () => ({ integerProjectForRef: io.resolve }));
vi.mock('../../../services/c2c/program-project-anchor.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  strictProjectRowForRef: io.resolve,
}));
vi.mock('../../../services/lumen-context-builder.js', async original => ({ ...await original<typeof import('../../../services/lumen-context-builder.js')>(), getIntelligencePrefix: io.lumen }));
vi.mock('../../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: io.memory }));
vi.mock('../../../services/ana-ri/context-enrichment.js', () => ({ enrichContextForChat: io.enrich }));
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', () => ({ sessionBootstrapBlockFor: io.bootstrap }));
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());
vi.mock('../../../services/toolRegistry.js', () => ({ logToolRun: io.logToolRun }));
vi.mock('../../../services/ana-ri/relational-profile-service.js', () => ({ loadRelationalOverlay: async () => '', reflectAfterTurn: io.reflect }));
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());

import { mountStreamRoute } from '../stream.js';
import { harness as h, resetHarness, streamApp } from './support/stream-route-harness.js';


vi.mock('../../../services/intelligence/learning-loop-service.js', () => ({ getFeedbackSummary: async () => ({ totalFeedback: 0 }) }));
vi.mock('../../../services/external-intelligence/index.js', () => ({ buildExternalIntelBlock: async () => '' }));
vi.mock('../../../services/ana/session-briefing.js', () => ({ getSessionBriefing: async () => ({ block: '' }) }));
vi.mock('../../../services/ana/deadline-radar.js', () => ({ getDeadlineRadar: async () => ({}), buildDeadlineRadarBlock: () => '' }));
vi.mock('../../../services/ana/contradiction-watch.js', () => ({ getOpenContradictionsForOrg: async () => [], buildContradictionWatchBlock: () => '' }));
vi.mock('../../../services/decision-lifecycle-service.js', () => ({ decisionLifecycleService: { getDecisionContext: () => [] } }));

const app = streamApp(router => {
  router.use((req, _res, next) => { Object.assign(req, { dbClient: { query: io.requestQuery } }); next(); });
  mountStreamRoute(router);
});
const PROGRAM = '11111111-2222-4333-8444-555555555555';
const PRIVATE_PROGRAM = '22222222-2222-4333-8444-555555555555';
const DOC = '11111111-2222-4333-8444-000000000041';
const PRIVATE_DOC = '11111111-2222-4333-8444-000000000042';
const SEC = '22222222-2222-4333-8444-000000000001';
const PARENT_TEMPLATE = '11111111-2222-4333-8444-000000000061';
const CHILD_TEMPLATE = '11111111-2222-4333-8444-000000000062';
const PRIVATE_TEMPLATE = '11111111-2222-4333-8444-000000000063';
const CHILD_GUIDE = 'EXACT_RETAINED_CHILD_CSR_GUIDANCE: retain actual completed patient CRFs; never invent them.';
const source = (id: string, entryId: string, registryId: string | null, region = 'GLOBAL') => ({
  id, entryId, version: 1, sha256: (id === CHILD_TEMPLATE ? 'b' : 'a').repeat(64), kind: 'narrative',
  aiDraftable: true, authoringMode: 'ai_draft', originalFormat: 'narrative', limitations: [id === PARENT_TEMPLATE ? 'PARENT_ONLY_US_IND_LIMIT' : 'Retain original records.'],
  filingContext: { registryId, region, agency: region === 'US' ? 'FDA' : 'ICH' },
});
let database: PGlite;
const statements: string[] = [];
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,client_workspace_id int,regulatory_program_id uuid,owner_id int,created_by_id int,settings jsonb,status text DEFAULT 'active');
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE users(id int PRIMARY KEY,status text,email text);
    CREATE TABLE organizations(id int PRIMARY KEY,status text,client_type text);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_review_assignments(reviewer_id int,organization_id int,artifact_id uuid,status text);
    CREATE TABLE concept2cure_artifacts(id uuid PRIMARY KEY,project_id int,organization_id int,metadata jsonb);
    CREATE TABLE authoring_documents(id uuid PRIMARY KEY,tenant_id int,client_program_id uuid,title text,module text,product_code text,status text,created_by text,updated_at timestamptz,template_id uuid,provenance jsonb);
    CREATE TABLE authoring_sections(id uuid PRIMARY KEY,doc_id uuid,tenant_id int,code text,title text,order_index int,created_at timestamptz,updated_at timestamptz,content text);
    CREATE TABLE doc_permissions(id uuid DEFAULT gen_random_uuid(),doc_id uuid,section_id uuid,tenant_id int,principal_id text,email text,role text,valid_from timestamptz DEFAULT now(),valid_until timestamptz,revoked_at timestamptz);
    CREATE TABLE authoring_audit_trail(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),doc_id uuid,section_id uuid,tenant_id int,operation_type text,actor_email text,metadata jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE template_guidance(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id uuid,tenant_id int,section_name text,section_code text,guidance_text text,examples jsonb,regulatory_references jsonb,ai_prompts jsonb,compliance_checklist jsonb);
    CREATE SCHEMA intelligence;
    CREATE TABLE intelligence.document_templates(id uuid PRIMARY KEY,status text);
    CREATE TABLE intelligence.template_sections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id uuid,section_code text,section_title text,ordering int,content_guidance text,required_elements jsonb,source_reference text);
    INSERT INTO organizations VALUES(7,'active','biotech');
    INSERT INTO users VALUES(3,'active','reviewer@example.test'),(5,'active','other@example.test');
    INSERT INTO organization_users VALUES(7,3,'member'),(7,5,'member');
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',7,NULL),('${PRIVATE_PROGRAM}',7,NULL);
    INSERT INTO projects VALUES(42,7,NULL,'${PROGRAM}',3,3,'{}','active'),(84,7,NULL,'${PRIVATE_PROGRAM}',5,5,'{}','active');
    INSERT INTO project_visibility_settings VALUES(42,7,'org_public'),(84,7,'private');
  `);
}, 90_000);
afterAll(async () => { await database.close(); });
beforeEach(async () => {
  resetHarness();
  const executeSql = async (sql: string, params?: unknown[]) => { statements.push(sql); return database.query<Record<string, unknown>>(sql, params); };
  io.query.mockReset().mockImplementation(executeSql);
  io.requestQuery.mockReset().mockImplementation(executeSql);
  io.resolve.mockReset().mockResolvedValue(42);
  io.memory.mockReset().mockResolvedValue({ memoryBlock: '', atoms: [], diagnostics: null });
  io.enrich.mockReset().mockResolvedValue({ block: '', sources: [], enrichmentMeta: {} });
  io.bootstrap.mockReset().mockResolvedValue(''); io.reflect.mockReset().mockResolvedValue(undefined); io.logToolRun.mockReset().mockResolvedValue(undefined); io.lumen.mockReset().mockResolvedValue('');
  await database.exec('TRUNCATE authoring_documents,authoring_sections,authoring_audit_trail,doc_permissions,template_guidance');
  await database.query(`INSERT INTO authoring_documents VALUES($1,7,$2,'Parent IND','M5','DRUG','DRAFT','3','2026-10-02',$3,$4),($5,7,$6,'Private IB','M5','DRUG','DRAFT','5','2026-10-02',$7,$8)`,
    [DOC,PROGRAM,PARENT_TEMPLATE,{templateSource:source(PARENT_TEMPLATE,'registry:US_IND','US_IND','US')},PRIVATE_DOC,PRIVATE_PROGRAM,PRIVATE_TEMPLATE,{templateSource:source(PRIVATE_TEMPLATE,'registry:ICH_IB','ICH_IB')}]);
  await database.query(`INSERT INTO doc_permissions(doc_id,tenant_id,principal_id,role) VALUES($1,7,'3','VIEWER')`,[DOC]);
  await database.query(`INSERT INTO authoring_sections VALUES($1,$2,7,'16.3.1','Actual saved appendix',0,'2026-10-01','2026-10-02','')`,[SEC,DOC]);
  const child = source(CHILD_TEMPLATE,'component:clinical_study_report',null);
  await database.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,tenant_id,operation_type,metadata) VALUES($1,$2,7,'CREATE',$3)`,
    [DOC,SEC,{templateSource:child,templateGuidance:{guidance_text:CHILD_GUIDE,drafting_mode:'manual',regulatory_references:['ICH E3'],compliance_checklist:[],common_pitfalls:[],source_reference:'server/services/ind/ctd/csr-e3-guidance.ts#16.3.1'},
      assembly:{version:1,docId:DOC,programId:PROGRAM,templateId:CHILD_TEMPLATE,templateSnapshot:child.sha256,fingerprint:'c'.repeat(64)}}]);
  statements.length=0;
});
async function turn(artifactId = DOC, sectionId: string | null = SEC, options: { clientCode?: string; documentContext?: Record<string, unknown>; artifactStatus?: string } = {}) {
  h.state.script = ['A source review is needed.'];
  const response=await httpRequest(app).post('/api/ana-ri/stream').send({message:'Review the exact open section.',project_id:PROGRAM,
    authoring_context:{projectId:PROGRAM,artifactId,...(sectionId ? {sectionId} : {}),sectionCode:options.clientCode ?? '3.2.P',sectionTitle:'Client label',artifactStatus:options.artifactStatus,documentType:'US_IND'},document_context:options.documentContext});
  expect(response.status,response.text).toBe(200);
  expect(h.state.requests.length).toBeGreaterThan(0);
  return h.state.requests[0].messages.map(message=>String(message.content)).join('\n');
}

function expectNoProtectedReferenceReads() {
  const protectedReads = statements.filter(sql => /authoring_audit_trail|template_guidance|intelligence\.template_sections/.test(sql) ||
    (/authoring_documents/.test(sql) && /template_id|provenance/.test(sql)));
  expect(protectedReads).toEqual([]);
}

function referenceOf(prompt: string): { draftingMode: string } {
  const match = /BEGIN_SAVED_SECTION_TEMPLATE_REFERENCE_JSON\n([\s\S]*?)\nEND_SAVED_SECTION_TEMPLATE_REFERENCE_JSON/.exec(prompt);
  expect(match).not.toBeNull();
  return JSON.parse(match![1]) as { draftingMode: string };
}

describe('the live stream uses the exact admitted saved section reference', () => {
  it('retains assembled CSR guidance instead of the different parent IND outline', async () => {
    const prompt=await turn();
    expect(prompt).toContain(CHILD_GUIDE);
    expect(referenceOf(prompt).draftingMode).toBe('manual');
    expect(prompt).not.toContain('registry US_IND');
    expect(prompt).not.toContain('PARENT_ONLY_US_IND_LIMIT');
  });
  it('does not leak another recorded project’s saved template through the admitted public project', async () => {
    const prompt=await turn(PRIVATE_DOC,null);
    expect(prompt).not.toContain('registry ICH_IB');
    expect(prompt).not.toContain('registry US_IND');
    expect(prompt).not.toContain('ICH E6(R3) Appendix A');
    expectNoProtectedReferenceReads();
  });
});


describe('saved-section context is retained as reference and obeys current VIEW access', () => {
  it('records the exact gateway message bytes while keeping reference guidance out of answer evidence', async () => {
    const prompt = await turn();
    expect(prompt).toContain(CHILD_GUIDE);
    const sealed = h.state.post.turnRecorder.seal('answered');
    const sent = h.state.requests[0].messages;
    expect(sealed.body.modelInput).toHaveLength(sent.length);
    sealed.body.modelInput.forEach((message: { role: string; text: { sha256: string } }, index: number) => {
      expect(message.role).toBe(sent[index].role);
      expect(sealed.blobs.get(message.text.sha256)).toBe(String(sent[index].content));
    });
    expect(JSON.stringify(h.state.post.toolEvidenceCorpus)).not.toContain(CHILD_GUIDE);
    expect(io.requestQuery.mock.calls.some(([sql]) => /authoring_audit_trail/.test(String(sql)))).toBe(true);
    expect(io.query.mock.calls.filter(([sql]) => /authoring_documents|authoring_audit_trail|template_guidance/.test(String(sql)))).toEqual([]);
    expect(statements.some(sql => /SELECT[\s\S]*\bcontent\b[\s\S]*FROM authoring_sections/.test(sql))).toBe(false);
  });

  it('retains an exact non-registry blank CRF component without adopting its parent’s IND type', async () => {
    const guide = 'EXACT_RETAINED_BLANK_CRF_GUIDANCE: leave participant values blank.';
    const crf = source(CHILD_TEMPLATE,'component:blank_crf',null);
    await database.query(`UPDATE authoring_audit_trail SET metadata=jsonb_set(jsonb_set(metadata,'{templateSource}',$1),'{templateGuidance}',$2)`,[crf,{guidance_text:guide,drafting_mode:'narrative',regulatory_references:['Platform blank CRF specification'],compliance_checklist:[],common_pitfalls:[],source_reference:'server/services/market-specs/document-template-library.ts:blank_crf'}]);
    const prompt = await turn();
    expect(prompt).toContain(guide);
    expect(prompt).toContain('component:blank_crf');
    expect(referenceOf(prompt).draftingMode).toBe('narrative');
    expect(prompt).not.toContain('registry US_IND');
    expect(prompt).not.toContain('PARENT_ONLY_US_IND_LIMIT');
  });

  it('permits a section-only viewer to inspect a frozen manual appendix without document-wide access', async () => {
    await database.query(`UPDATE authoring_documents SET status='FROZEN',created_by='5' WHERE id=$1`,[DOC]);
    await database.query('UPDATE doc_permissions SET section_id=$1 WHERE doc_id=$2',[SEC,DOC]);
    const prompt = await turn(DOC,SEC,{artifactStatus:'DRAFT'});
    expect(prompt).toContain(CHILD_GUIDE);
    expect(prompt).toContain('## DOCUMENT STATE: LOCKED');
    expect(prompt).not.toContain('## DOCUMENT STATE: DRAFT');
    expect(h.state.gatewayCalls).toBe(1);
    expect(statements.some(sql => /^(INSERT|UPDATE|DELETE)\b/i.test(sql.trim()))).toBe(false);
  });

  it('uses the actor’s current canonical email grant and observes its later revocation', async () => {
    await database.query(`UPDATE authoring_documents SET created_by='5' WHERE id=$1`,[DOC]);
    await database.query(`UPDATE doc_permissions SET principal_id='other',email='REVIEWER@example.test',section_id=$1 WHERE doc_id=$2`,[SEC,DOC]);
    expect(await turn()).toContain(CHILD_GUIDE);
    await database.query('UPDATE doc_permissions SET revoked_at=now() WHERE doc_id=$1',[DOC]);
    resetHarness(); statements.length=0;
    const prompt = await turn();
    expect(prompt).not.toContain(CHILD_GUIDE);
    expect(prompt).not.toContain('registry US_IND');
    expectNoProtectedReferenceReads();
  });

});

describe('invalid saved reference selectors never restore a parent reference', () => {
  it('does not read a different document’s section guidance even when the parent document is viewable', async () => {
    const otherSection = '22222222-2222-4333-8444-000000000002';
    await database.query(`INSERT INTO authoring_sections VALUES($1,$2,7,'2','Private synopsis',0,'2026-10-01','2026-10-02','private text')`,[otherSection,PRIVATE_DOC]);
    const prompt = await turn(DOC,otherSection);
    expect(prompt).not.toContain(CHILD_GUIDE);
    expect(prompt).not.toContain('registry US_IND');
    expectNoProtectedReferenceReads();
  });

  it('reports malformed retained assembly identity as unread rather than reverting to the parent source', async () => {
    await database.query(`UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{assembly,programId}',$1)`,[JSON.stringify(PRIVATE_PROGRAM)]);
    const prompt = await turn();
    expect(prompt).not.toContain(CHILD_GUIDE);
    expect(prompt).not.toContain('registry US_IND');
    expect(prompt).not.toContain('PARENT_ONLY_US_IND_LIMIT');
  });

  it('refuses an oversized Unicode reference as a whole instead of clipping its mandatory context', async () => {
    const large = 'OVERSIZED_GUIDE_START ' + '日本語の必須条件'.repeat(2000);
    await database.query(`UPDATE authoring_audit_trail SET metadata=jsonb_set(metadata,'{templateGuidance,guidance_text}',$1)`,[JSON.stringify(large)]);
    const prompt = await turn();
    expect(prompt).not.toContain('OVERSIZED_GUIDE_START');
    expect(prompt).not.toContain('registry US_IND');
    expect(prompt).not.toContain('PARENT_ONLY_US_IND_LIMIT');
  });

  it('keeps historical exact E3 original-record guidance available for oversight without inventing draft eligibility', async () => {
    await database.query(`UPDATE authoring_audit_trail SET metadata=metadata #- '{templateGuidance,drafting_mode}'`);
    const prompt = await turn();
    expect(prompt).toContain(CHILD_GUIDE);
    expect(prompt).toContain('server/services/ind/ctd/csr-e3-guidance.ts#16.3.1');
    expect(referenceOf(prompt).draftingMode).toBe('manual');
    expect(prompt).not.toContain('registry US_IND');
  });

  it('keeps surface-only protocol context available without reading saved authoring identity', async () => {
    h.state.script=['Use the current source protocol.'];
    const response=await httpRequest(app).post('/api/ana-ri/stream').send({message:'Explain this protocol structure.',authoring_context:{documentType:'ICH_PROTOCOL'}});
    expect(response.status).toBe(200);
    const prompt=h.state.requests[0].messages.map(message=>String(message.content)).join('\n');
    expect(prompt).toContain('ICH M11');
    expect(prompt).toContain('stated by the surface');
    expect(statements.some(sql=>/authoring_documents|authoring_sections|authoring_audit_trail/.test(sql))).toBe(false);
  });
});


describe('a native IND supplement follows the server’s actual saved section code', () => {
  it('uses the saved cover-letter section despite conflicting client type and section claims', async () => {
    const native = source(CHILD_TEMPLATE,'registry:US_IND','US_IND','US');
    const guide = {guidance_text:'Exact retained native IND cover-letter source.',drafting_mode:'narrative',regulatory_references:['ICH M4E'],compliance_checklist:[],common_pitfalls:[],source_reference:'fixture:retained-native-IND'};
    await database.query(`UPDATE authoring_audit_trail SET metadata=jsonb_set(jsonb_set(metadata,'{templateSource}',$1),'{templateGuidance}',$2)`,[native,guide]);
    await database.query(`UPDATE authoring_sections SET code='1.2' WHERE id=$1`,[SEC]);
    const prompt = await turn(DOC,SEC,{clientCode:'3.2.S',documentContext:{documentType:'ICH_IB',section:'3.2.S'}});
    const { buildSectionSpecificPrompt } = await import('../../../services/lumen-context/sections');
    const actual = buildSectionSpecificPrompt('1.2','US_IND');
    const conflicting = buildSectionSpecificPrompt('3.2.S','US_IND');
    expect(actual).not.toBeNull(); expect(conflicting).not.toBeNull();
    expect(prompt).toContain(actual!.split('\n')[0]);
    expect(prompt).not.toContain(conflicting!.split('\n')[0]);
    expect(referenceOf(prompt).draftingMode).toBe('narrative');
    expect(prompt).not.toContain('- Document Type: ICH_IB');
    expect(prompt).not.toContain('- Section: 3.2.S');
    expect(prompt).not.toContain('## ACTIVE SECTION: 3.2.S');
  });
});


describe('untrusted client classifications cannot restore canonical CTD context', () => {
  it('keeps a numeric blank CRF heading separate from client US_IND classification', async () => {
    const crf = source(CHILD_TEMPLATE,'component:blank_crf',null);
    const guide = {guidance_text:'EXACT_BLANK_CRF_WITH_NUMERIC_CODE',drafting_mode:'narrative',regulatory_references:['Platform blank CRF specification'],compliance_checklist:[],common_pitfalls:[],source_reference:'server/services/market-specs/document-template-library.ts:blank_crf'};
    await database.query(`UPDATE authoring_audit_trail SET metadata=jsonb_set(jsonb_set(metadata,'{templateSource}',$1),'{templateGuidance}',$2)`,[crf,guide]);
    await database.query(`UPDATE authoring_sections SET code='3.2.S' WHERE id=$1`,[SEC]);
    const prompt=await turn(DOC,SEC,{clientCode:'3.2.S',documentContext:{documentType:'US_IND',section:'3.2.S'}});
    expect(prompt).toContain('EXACT_BLANK_CRF_WITH_NUMERIC_CODE');
    expect(prompt).toContain('component:blank_crf');
    expect(prompt).not.toContain('## ACTIVE SECTION:');
    expect(prompt).not.toContain('- Document Type: US_IND');
    const { buildSectionSpecificPrompt }=await import('../../../services/lumen-context/sections');
    expect(prompt).not.toContain(buildSectionSpecificPrompt('3.2.S','US_IND')!.split('\n')[0]);
  });

  it('keeps a denied private saved artifact unknown despite client US_IND type and section claims', async () => {
    const prompt=await turn(PRIVATE_DOC,null,{clientCode:'3.2.S',documentContext:{documentType:'US_IND',section:'3.2.S'}});
    expect(prompt).not.toContain('registry ICH_IB');
    expect(prompt).not.toContain('- Document Type: US_IND');
    expect(prompt).not.toContain('## ACTIVE SECTION:');
    expectNoProtectedReferenceReads();
  });
});

describe('whole legacy source channel selection', () => {
  it('loads an exact saved child from a complete legacy context when authoring_context is absent', async () => {
    h.state.script=['Review the retained legacy-channel source.'];
    const response=await httpRequest(app).post('/api/ana-ri/stream').send({message:'Review the exact saved legacy context.',project_id:PROGRAM,
      context:{projectId:PROGRAM,artifactId:DOC,sectionId:SEC,sectionCode:'3.2.P',documentType:'US_IND'}});
    expect(response.status,response.text).toBe(200);
    const prompt=h.state.requests[0].messages.map(message=>String(message.content)).join('\n');
    expect(prompt).toContain(CHILD_GUIDE);
    expect(prompt).not.toContain('registry US_IND');
    expect(io.requestQuery.mock.calls.some(([sql])=>/authoring_audit_trail/.test(String(sql)))).toBe(true);
    expect(io.query.mock.calls.filter(([sql])=>/authoring_documents|authoring_audit_trail|template_guidance/.test(String(sql)))).toEqual([]);
  });

  it('does not fill an incomplete explicit authoring_context from a complete legacy context', async () => {
    h.state.script=['The saved reference is unavailable.'];
    const response=await httpRequest(app).post('/api/ana-ri/stream').send({message:'Review this exact source if it can be verified.',project_id:PROGRAM,
      authoring_context:{sectionId:SEC},context:{projectId:PROGRAM,artifactId:DOC,sectionId:SEC,sectionCode:'3.2.P',documentType:'US_IND'}});
    expect(response.status,response.text).toBe(200);
    const prompt=h.state.requests[0].messages.map(message=>String(message.content)).join('\n');
    expect(prompt).not.toContain(CHILD_GUIDE);
    expectNoProtectedReferenceReads();
  });
});
