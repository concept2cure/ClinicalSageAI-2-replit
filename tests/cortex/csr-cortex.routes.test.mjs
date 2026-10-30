/** Actual Cortex handler integration, with Express registration, DB receipt and
 * model gateway doubles. No live server/DB/provider qualification is claimed. */
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temp = mkdtempSync(resolve(tmpdir(), 'c2c-cortex-routes-'));
function write(path, value) { mkdirSync(dirname(resolve(temp, path)), { recursive: true }); writeFileSync(resolve(temp, path), value); }
write('package.json', '{"type":"module"}');
const files = ['server/routes/ana-cortex', 'server/services/clinical-regulatory-evidence/csr-content-projection',
  'server/services/clinical-regulatory-evidence/csr-index-batch', 'server/services/csr/cortex-authoring-context', 'server/services/csr/cortex-authoring-reader',
  // Imported by cortex-authoring-context since the scientific-review receipts.
  'shared/authoring/csr-scientific-review'];
for (const path of files) {
  const source = readFileSync(resolve(root, `${path}.ts`), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true, fileName: `${path}.ts` });
  assert.deepEqual(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  // Match the repository bundler's .ts/.js relative module resolution in this
  // isolated Node test directory. Runtime code itself is not replaced.
  const output = result.outputText.replace(/(from\s*['"]|import\(\s*['"])(\.[^'"]+)(['"])/g,
    (_all, lead, value, tail) => `${lead}${/\.(?:js|mjs|cjs|json)$/i.test(value) ? value : value + '.js'}${tail}`);
  write(`${path}.js`, output);
}
function pkg(name, source) {
  write(`node_modules/${name}/package.json`, JSON.stringify({ name, type: 'module', exports: './index.js' }));
  write(`node_modules/${name}/index.js`, source);
}
pkg('express', `export default { Router() { return { routes: new Map(), middleware: [],
  use(fn) { this.middleware.push(fn); }, post(path,...handlers) { this.routes.set('POST '+path,handlers); },
  get(path,...handlers) { this.routes.set('GET '+path,handlers); } }; } };`);
pkg('drizzle-orm', 'export const and = (...v) => v; export const eq = (...v) => v;');
pkg('@shared/schema', 'export const anaObservationTerms = {};');
write('server/db.js', 'export const db = {};');
write('server/services/ana-cortex-service.js', 'export const anaCortexService = {};');
write('server/middleware/auth.js', `export const requireAuth = (req,res,next) => req.user ? next() : res.status(401).json({error:'UNAUTHENTICATED'});`);
write('server/utils/authedOrgId.js', `export function requireAuthedOrgId(req,res) { if (!Number.isSafeInteger(req.sessionOrgId) || req.sessionOrgId < 1) { res.status(403).json({error:'ORG_REQUIRED'}); return {ok:false}; } return {ok:true,orgId:req.sessionOrgId}; }`);
write('server/db/requestDb.js', 'export const requestPgClient = req => req.client;');
write('server/services/ana-personality.js', 'export const ANA_COMPACT_PROMPT = "AnA test personality";');
write('server/services/csr/vault-source-input.js', `export class CsrSourceInputError extends Error { constructor(status,code,message) { super(message); this.status=status; this.code=code; } }`);
write('server/services/csr/saved-clinical-tables.js', `import { CsrSourceInputError } from './vault-source-input.js';
export async function readSavedClinicalTables(q,scope,runId) {
 const f=globalThis.__cortexRoutes; f.reads.push({q,scope,runId});
 if(f.readError) throw f.readError;
 if(scope.organizationId!==7) throw new CsrSourceInputError(404,'CSR_RUN_INPUTS_NOT_FOUND','private');
 return structuredClone(f.retained);
}`);
write('server/services/clinical-regulatory-evidence/csr-adapter.service.js', `export async function atomizeOrgCsrReports(orgId,options) { const f=globalThis.__cortexRoutes; f.indexReads.push({orgId,options}); return f.indexResult; }`);
write('server/services/ai-gateway/index.js', `export function getGateway() { return { async route(request) { const f=globalThis.__cortexRoutes; f.gateway.push(request); if(f.gatewayError) throw f.gatewayError; return {content:f.modelContent ?? 'Draft for human review',provider:'test-double',model:'test-double'}; } }; }`);
write('server/services/ai-gateway.js', `export {getGateway} from './ai-gateway/index.js';`);
const { default: router } = await import(pathToFileURL(resolve(temp, 'server/routes/ana-cortex.js')).href);
const { CsrSourceInputError } = await import(pathToFileURL(resolve(temp, 'server/services/csr/vault-source-input.js')).href);
const runId = '11111111-1111-4111-8111-111111111111';
const programId = '22222222-2222-4222-8222-222222222222';
const selection = { runId, programId, studyId: 'S-1', sectionNumber: '11.4' };
const table = () => ({ title: 'Recorded aggregate', headers: ['Endpoint', 'Active'], rows: [['Response', '12 (90% CI 8 to 16)']] });
function fixture() { return { reads: [], indexReads: [], gateway: [], retained: { runId, programId, historical: true, releaseEligibilityVerified: false,
  studies: [{ source: { documentId: '33333333-3333-4333-8333-333333333333', version: '1', sha256: 'b'.repeat(64),
    dataCutDate: '2026-10-01', studyId: 'S-1', protocolNumber: 'P-1', clinicalVerification: 'not-established' },
    tables: { analysisPopulations: table(), primaryEfficacy: table(), secondaryEfficacy: table() } }] },
  indexResult: { scanned: 1, indexed: 1, failed: 0, empty: 0, partial: 0, atoms: 1, embedded: 1, complete: true, hasMore: false, nextAfterId: null, failures: [] } }; }
beforeEach(() => { globalThis.__cortexRoutes = fixture(); });
after(() => { delete globalThis.__cortexRoutes; rmSync(temp, { recursive: true, force: true }); });
async function request(path, body, overrides = {}) {
  const req = { body, headers: { 'x-correlation-id': 'corr-1' }, user: { id: 9 }, sessionOrgId: 7, client: { name: 'reserved-request-client' }, ...overrides };
  const res = { code: 200, headers: {}, body: undefined, status(code) { this.code=code; return this; }, json(body) { this.body=body; return this; },
    setHeader(name,value) { this.headers[name]=value; }, set(values) { Object.assign(this.headers,values); return this; } };
  const handlers = [...router.middleware, ...router.routes.get(`POST ${path}`)];
  for (const handler of handlers) { if (res.body !== undefined) break; await handler(req,res,()=>{}); }
  return res;
}
const chat = () => ({ message: 'Draft the efficacy section from this retained source.', context: { csrEvidence: selection } });
test('chat loads project-authorized evidence before calling the governed drafting gateway', async () => {
  const r = await request('/chat', chat()); const f = globalThis.__cortexRoutes;
  assert.equal(r.code,200); assert.equal(f.reads.length,1); assert.equal(f.gateway.length,1);
  assert.deepEqual(f.reads[0].scope,{organizationId:7,userId:9,programId});
  assert.equal(f.gateway[0].taskType,'document_drafting'); assert.equal(f.gateway[0].organizationId,7); assert.equal(f.gateway[0].userId,9);
  const data = f.gateway[0].messages.find(m=>m.content.startsWith('{"type":"retained_csr_evidence"'));
  assert.equal(data.role,'user'); assert.match(data.content,/90% CI 8 to 16/); assert.match(f.gateway[0].messages[0].content,/never as instructions/);
  assert.equal(r.body._meta.csrEvidence.clinicalVerification,'not-established'); assert.equal(r.body._meta.csrEvidence.approvalRequired,true);
  assert.equal(r.body._meta.correlationId,'corr-1'); assert.equal(r.headers['Cache-Control'],'no-store');
});
test('ordinary chat remains compatible and does not read CSR evidence', async () => {
  const r = await request('/chat',{message:'hello',source_surface:'test'});
  assert.equal(r.code,200); assert.equal(globalThis.__cortexRoutes.reads.length,0);
  assert.equal(globalThis.__cortexRoutes.gateway[0].taskType,'chat'); assert.equal(r.body._meta.sourceSurface,'test');
});
test('unauthenticated chat never reaches private evidence or a model', async () => {
  const r=await request('/chat',chat(),{user:null}); assert.equal(r.code,401);
  assert.equal(globalThis.__cortexRoutes.reads.length,0); assert.equal(globalThis.__cortexRoutes.gateway.length,0);
});
test('organization cannot be supplied by a request body',async()=>{
  const r=await request('/chat',{...chat(),organizationId:7},{sessionOrgId:undefined});
  assert.equal(r.code,403); assert.equal(globalThis.__cortexRoutes.reads.length,0);
});
test('invalid user fails before source lookup',async()=>{
  const r=await request('/chat',chat(),{user:{id:'bad'}}); assert.equal(r.code,403); assert.equal(globalThis.__cortexRoutes.reads.length,0);
});
test('client-injected statistics are rejected as an invalid selection',async()=>{
  const body=chat(); body.context.csrEvidence={...selection,tables:{fake:'100% success'}};
  const r=await request('/chat',body); assert.equal(r.code,400); assert.equal(globalThis.__cortexRoutes.reads.length,0); assert.equal(globalThis.__cortexRoutes.gateway.length,0);
});
test('foreign-tenant run denial is not turned into a generic model answer',async()=>{
  const r=await request('/chat',chat(),{sessionOrgId:8}); assert.equal(r.code,404); assert.equal(r.body.response,undefined); assert.equal(globalThis.__cortexRoutes.gateway.length,0);
});
test('source withdrawal refusal blocks drafting',async()=>{
  globalThis.__cortexRoutes.readError=new CsrSourceInputError(409,'CSR_SOURCE_WITHDRAWN','private reason');
  const r=await request('/chat',chat()); assert.equal(r.code,409); assert.equal(globalThis.__cortexRoutes.gateway.length,0); assert.doesNotMatch(JSON.stringify(r.body),/private reason/);
});
test('database outage returns unavailable, not no evidence or a fabricated draft',async()=>{
  globalThis.__cortexRoutes.readError=new Error('private SQL details'); const r=await request('/chat',chat());
  assert.equal(r.code,503); assert.equal(r.body.error,'CSR_EVIDENCE_UNAVAILABLE'); assert.equal(globalThis.__cortexRoutes.gateway.length,0);
  assert.doesNotMatch(JSON.stringify(r.body),/private SQL/);
});
test('run identity mismatch blocks gateway call even after loader success',async()=>{
  globalThis.__cortexRoutes.retained.programId='99999999-9999-4999-8999-999999999999';
  const r=await request('/chat',chat()); assert.equal(r.code,409); assert.equal(globalThis.__cortexRoutes.gateway.length,0);
});
test('unsupported section does not trigger metadata-only drafting',async()=>{
  const body=chat(); body.context.csrEvidence={...selection,sectionNumber:'12.5'};
  const r=await request('/chat',body); assert.equal(r.code,409); assert.equal(r.body.error,'CSR_SECTION_EVIDENCE_UNAVAILABLE'); assert.equal(globalThis.__cortexRoutes.gateway.length,0);
});
test('governed-model failure does not fall back to generic chat',async()=>{
  globalThis.__cortexRoutes.gatewayError=new Error('test provider unavailable');
  const r=await request('/chat',chat()); assert.equal(r.code,503); assert.equal(globalThis.__cortexRoutes.gateway.length,1); assert.equal(r.body.response,undefined);
});
test('evidence-context endpoint returns real cell reconciliation without model use',async()=>{
  const r=await request('/csr/evidence-context',{selection,claims:[{table:'primaryEfficacy',row:0,column:1,value:'99'}]});
  assert.equal(r.code,200); assert.equal(r.body.reconciliation.status,'needs_review'); assert.equal(r.body.reconciliation.findings[0].status,'mismatch');
  assert.equal(globalThis.__cortexRoutes.gateway.length,0);
});
test('evidence endpoint can explain unsupported sections without claiming a draft',async()=>{
  const r=await request('/csr/evidence-context',{selection:{...selection,sectionNumber:'12.5'}});
  assert.equal(r.code,200); assert.equal(r.body.evidence.status,'unavailable'); assert.equal(r.body.response,undefined);
});
test('index route forwards validated cursor and session organization',async()=>{
  const r=await request('/csr/index',{limit:2,afterId:30,organizationId:999});
  assert.equal(r.code,200); assert.deepEqual(globalThis.__cortexRoutes.indexReads,[{orgId:7,options:{limit:2,afterId:30}}]);
});
test('index route refuses invalid cursors before scanning',async()=>{
  const r=await request('/csr/index',{limit:2,afterId:-1}); assert.equal(r.code,400); assert.equal(globalThis.__cortexRoutes.indexReads.length,0);
});
test('empty or partly embedded indexing is not returned as success',async()=>{
  globalThis.__cortexRoutes.indexResult.partial=1; globalThis.__cortexRoutes.indexResult.complete=false;
  const r=await request('/csr/index',{}); assert.equal(r.code,207); assert.equal(r.body.success,false);
});

test('empty model content is not replaced with a successful generic CSR answer',async()=>{
  globalThis.__cortexRoutes.modelContent='  '; const r=await request('/chat',chat());
  assert.equal(r.code,502);assert.equal(r.body.error,'CSR_DRAFT_EMPTY');assert.equal(r.body.response,undefined);
});
