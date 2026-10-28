/** Runs the real CSR adapter and projection. SQL transport, CRE identity and
 * atom persistence are controlled doubles, not a live PostgreSQL qualification. */
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temp = mkdtempSync(resolve(tmpdir(), 'c2c-cortex-adapter-'));
function write(path, value) { mkdirSync(dirname(resolve(temp,path)),{recursive:true}); writeFileSync(resolve(temp,path),value); }
write('package.json','{"type":"module"}');
for(const name of ['csr-adapter.service','csr-content-projection','csr-index-batch']) {
  const path=`server/services/clinical-regulatory-evidence/${name}`;
  const result=ts.transpileModule(readFileSync(resolve(root,path+'.ts'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022},reportDiagnostics:true,fileName:path+'.ts'});
  assert.deepEqual(result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
  write(path+'.js',result.outputText.replace(/(from\s*['"]|import\(\s*['"])(\.[^'"]+)(['"])/g,
    (_all,lead,value,tail)=>`${lead}${/\.(?:js|mjs|cjs|json)$/i.test(value)?value:value+'.js'}${tail}`));
}
write('server/db.js',`export const pool={async query(sql,params){
 const f=globalThis.__cortexAdapter; f.queries.push({sql,params});
 if(sql.startsWith('SELECT id FROM csr_reports')) return {rows:f.reports.filter(r=>r.organization_id===params[0]&&!r.deleted_at&&r.id>params[1]).sort((a,b)=>a.id-b.id).slice(0,params[2]).map(r=>({id:r.id}))};
 if(sql.includes('SELECT * FROM csr_reports')) return {rows:f.reports.filter(r=>r.id===params[0]&&r.organization_id===params[1]&&!r.deleted_at)};
 if(sql.includes('SELECT * FROM csr_details')) return {rows:f.details.filter(d=>d.report_id===params[0])};
 if(sql.includes('FROM cre_evidence_sources')) return {rows:[]};
 throw new Error('Unexpected adapter SQL');
}};`);
write('server/services/clinical-regulatory-evidence/evidence-spine.service.js',`export async function createSource(org,input){globalThis.__cortexAdapter.sources.push({org,input});return {id:1000+input.linkedCsrReportId};}
export async function upsertStudy(org,input){return {id:2000+input.metadata.fromCsrReportId};}
export async function addRelationship(org,input){globalThis.__cortexAdapter.links.push({org,input});}
export async function getSource(){throw new Error('Unexpected getSource');}`);
write('server/services/study-design/csr-evidence-source.js','export async function gatherCsrEffectEvidence(){throw new Error("Not used in indexing");}');
write('server/services/clinical-regulatory-evidence/retrieval-atoms.service.js',`export function projectDesignFeature(){return [];}
export async function persistCsrDerivedAtoms(org,drafts,opts){
 const f=globalThis.__cortexAdapter; f.writes.push({org,drafts,opts});
 if(f.writerError) throw f.writerError;
 return {total:drafts.length,embedded:opts.embed===null?0:drafts.length,byType:{},skippedUnsupported:0};
}`);
const adapter=await import(pathToFileURL(resolve(temp,'server/services/clinical-regulatory-evidence/csr-adapter.service.js')).href);
function report(id,organization_id=7,content={efficacy_results:[{endpointName:'Response',value:12,pValue:0.03,ci:{lower:8,upper:16,level:'90%'}}]}) {
 return {id,organization_id,report_id:`CSR-${id}`,content,metadata:{},deleted_at:null};
}
beforeEach(()=>{globalThis.__cortexAdapter={reports:[report(11),report(12),report(13,8)],details:[],queries:[],writes:[],sources:[],links:[]};});
after(()=>{delete globalThis.__cortexAdapter;rmSync(temp,{recursive:true,force:true});});
test('actual batch SQL carries tenant, keyset cursor, deletion filter and lookahead',async()=>{
 const result=await adapter.atomizeOrgCsrReports(7,{limit:1,afterId:0,embed:async()=>[]});
 const f=globalThis.__cortexAdapter;
 assert.deepEqual(f.queries[0].params,[7,0,2]); assert.match(f.queries[0].sql,/deleted_at IS NULL AND id > \$2 ORDER BY id LIMIT \$3/);
 assert.equal(result.nextAfterId,11);assert.equal(result.hasMore,true);assert.equal(result.scanned,1);
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].org,7);assert.equal(f.writes[0].drafts[0].structuredData.csrReportId,'CSR-11');
});
test('continuation indexes later owned reports and never a foreign report',async()=>{
 const result=await adapter.atomizeOrgCsrReports(7,{limit:1,afterId:11,embed:async()=>[]});
 assert.equal(result.reports[0].reportId,12);assert.equal(result.hasMore,false);assert.equal(result.complete,true);
 const f=globalThis.__cortexAdapter;
 assert.ok(f.queries.filter(q=>q.sql.includes('SELECT * FROM csr_reports')).every(q=>q.params[1]===7));
 assert.ok(f.sources.every(s=>s.org===7));
});
test('actual adapter persists aggregate provenance and reports content coverage',async()=>{
 const result=await adapter.atomizeCsrReport(7,11,{embed:null}); const atom=globalThis.__cortexAdapter.writes[0].drafts[0];
 assert.equal(result.coverage.structured,1);assert.equal(result.embedded,0);
 assert.equal(atom.structuredData.sourceId,1011);assert.equal(atom.structuredData.studyId,2011);
 assert.equal(atom.structuredData.recordedAggregate.ci.level,'90%');assert.equal(atom.structuredData.recordedAggregate.p_value,0.03);
 assert.equal(atom.structuredData.verificationStatus,'unverified');assert.equal(atom.structuredData.trainingApproved,false);
});
test('direct csr_details result arrays reach the same existing writer',async()=>{
 const f=globalThis.__cortexAdapter;f.reports=[report(11,7,{})];f.details=[{report_id:11,results:[{endpointName:'Response',armId:'A',value:0,display:'0'}]}];
 const result=await adapter.atomizeCsrReport(7,11,{embed:null});
 assert.equal(result.coverage.structured,1);assert.equal(f.writes[0].drafts[0].structuredData.sourceLocation,'csr_details.results[0]');
});
test('foreign and deleted sources never reach CRE writes',async()=>{
 const f=globalThis.__cortexAdapter;f.reports[0].deleted_at='2026-10-01';
 assert.equal(await adapter.atomizeCsrReport(7,13),null);assert.equal(await adapter.atomizeCsrReport(7,11),null);
 assert.equal(f.writes.length,0);assert.equal(f.sources.length,0);
});
test('empty extraction is not counted as indexed',async()=>{
 const f=globalThis.__cortexAdapter;f.reports=[report(11,7,{})];
 const result=await adapter.atomizeOrgCsrReports(7,{embed:null});
 assert.equal(result.indexed,0);assert.equal(result.empty,1);assert.equal(result.complete,false);
});
test('embedding shortfall remains visible at batch level',async()=>{
 const result=await adapter.atomizeOrgCsrReports(7,{limit:1,embed:null});
 assert.equal(result.atoms,1);assert.equal(result.embedded,0);assert.equal(result.partial,1);assert.equal(result.complete,false);
});
test('partial aggregate omissions are surfaced, not silently declared complete',async()=>{
 const f=globalThis.__cortexAdapter;f.reports=[report(11,7,{efficacy_results:[{endpoint:'Response',value:1},{subjectId:'S-1',endpoint:'Response',value:2}]})];
 const result=await adapter.atomizeOrgCsrReports(7,{embed:async()=>[]});
 assert.equal(result.partial,1);assert.equal(result.reports[0].coverage.excluded.identifier_marker,1);
 assert.doesNotMatch(JSON.stringify(result),/S-1/);assert.equal(f.writes[0].drafts.length,1);
});
test('persistence failure records failure without returning private exception text',async()=>{
 globalThis.__cortexAdapter.writerError=new Error('private database details');
 const result=await adapter.atomizeOrgCsrReports(7,{limit:1});
 assert.deepEqual(result.failures,[11]);assert.equal(result.indexed,0);assert.equal(result.failed,1);
 assert.doesNotMatch(JSON.stringify(result),/private database/);
});
test('invalid tenant and cursor fail before any adapter query',async()=>{
 await assert.rejects(()=>adapter.atomizeOrgCsrReports(0,{}));
 await assert.rejects(()=>adapter.atomizeOrgCsrReports(7,{afterId:NaN}));
 assert.equal(globalThis.__cortexAdapter.queries.length,0);
});
