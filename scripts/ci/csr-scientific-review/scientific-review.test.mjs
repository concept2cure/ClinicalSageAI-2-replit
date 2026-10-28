import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const root = process.env.CSR_REVIEW_TEST_BUILD;
if (!root) throw new Error('Use the included test runner; no production services are substituted silently.');
const core = await import(pathToFileURL(join(root, 'csr-scientific-review-core.js')));
const service = await import(pathToFileURL(join(root, 'csr-scientific-review.js')));
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sha = core.scientificSha256;
const copy = x => structuredClone(x);
function fixture() {
  const snapshot = { id: uid(1), title: 'Synthetic Clinical Study Report', module: 'csr', locale: 'en',
    productCode: null, version: '1', sections: [
      { id: uid(10), code: '1', title: 'Title Page', content: 'Synthetic demonstration; not clinical evidence.' },
      { id: uid(11), code: '11.4', title: 'Efficacy', content: 'Observed global cure: 190/250. Synthetic results only.' },
    ] };
  const runs = [{ runId: uid(20), programId: uid(2), releaseEligibilityVerified: true, studies: [{
    source: { documentId: uid(30), sha256: 'a'.repeat(64), version: '1', studyId: 'SYN-001', protocolNumber: 'SYN-001',
      sourceApproval: 'canonical-lifecycle', clinicalVerification: 'not-established' },
    tables: { primaryEfficacy: { title: 'Synthetic primary endpoint', headers: ['Endpoint','Arm','Result'],
      rows: [['Global cure', 'Synthetic active', '190/250']] } },
  }] }];
  const content = snapshot.sections[1].content;
  const start = content.indexOf('190/250');
  const submission = { format: core.CSR_SCIENTIFIC_REVIEW_FORMAT, runIds: [uid(20)],
    expectedTablesSha256: core.scientificTablesSha256(runs), allQuantitativeResultsMapped: true,
    populationsMethodsUnitsReviewed: true,
    sections: [
      { sectionId: uid(10), contentSha256: sha(snapshot.sections[0].content), assessment: 'no-quantitative-results',
        rationale: 'Administrative title page; no quantitative results.', claims: [] },
      { sectionId: uid(11), contentSha256: sha(content), assessment: 'mapped-results',
        rationale: 'One verbatim source-cell result; method and population reviewed by a human.',
        claims: [{ id: 'claim-1', start, end: start + 7, quoteSha256: sha('190/250'), runId: uid(20),
          studyId: 'SYN-001', table: 'primaryEfficacy', row: 0, column: 2, expectedValue: '190/250' }] },
    ] };
  const snapshotHash = sha(core.canonicalScientificJson(snapshot));
  const args = { organizationId: 7, programId: uid(2), documentId: uid(1), snapshotHash,
    reviewId: uid(40), reviewerId: '21', snapshot, submission, runs };
  const context = { tenantId: 7, actorId: '21', document: { id: uid(1), title: snapshot.title, module: 'csr', client_program_id: uid(2) },
    snapshot, snapshotHash };
  return { snapshot, runs, submission, args, context };
}
const expectCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('prepare: exact current source cells and full section coverage produce an explicitly human-scoped receipt', () => {
  const f = fixture(); const r = core.prepareScientificReviewReceipt(f.args);
  assert.equal(r.checkedSections, 2); assert.equal(r.checkedClaims, 1);
  assert.equal(r.scope, 'human-reviewed-mapped-tlf-cells');
  assert.equal(r.independentClinicalValidationEstablished, false);
  assert.equal(r.sources[0].sha256, 'a'.repeat(64));
});
test('neutral title section needs rationale, not an invented numerical claim', () => {
  const f=fixture(); f.submission.sections[0].rationale=' ';
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_SECTION_INVALID');
});
test('review payload cannot assert qualified status or insert an unrecognized property', () => {
  const f=fixture(); f.submission.qualified=true;
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_INPUT_INVALID');
});
test('missing coverage or method/population attestation is refused', () => {
  for (const key of ['allQuantitativeResultsMapped','populationsMethodsUnitsReviewed']) {
    const f=fixture(); f.submission[key]=false;
    expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_INPUT_INVALID');
  }
});
test('empty or duplicate source run selection is refused', () => {
  for(const ids of [[],[uid(20),uid(20)]]) {
    const f=fixture(); f.submission.runIds=ids;
    expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_INPUT_INVALID');
  }
});
test('an empty numerical map cannot qualify a CSR', () => {
  const f=fixture(); Object.assign(f.submission.sections[1],{assessment:'no-quantitative-results',claims:[]});
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_EMPTY');
});
test('each saved section must be represented, including administrative sections', () => {
  const f=fixture(); f.submission.sections.shift();
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_COVERAGE_INVALID');
});
test('an unexpected section cannot substitute for an expected saved section', () => {
  const f=fixture(); f.submission.sections[0].sectionId=uid(99);
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_SECTION_CHANGED');
});
test('duplicate section identity is refused', () => {
  const f=fixture(); f.submission.sections[0].sectionId=uid(11);
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_SECTION_INVALID');
});
test('changed or blank saved content invalidates the receipt', () => {
  for(const text of ['Changed result: 191/250','']) {
    const f=fixture(); f.snapshot.sections[1].content=text;
    expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_SECTION_CHANGED');
  }
});
test('wrong selected quote, location, or quote checksum is refused', () => {
  for(const change of [{end:9999},{start:0},{quoteSha256:'b'.repeat(64)}]) {
    const f=fixture(); Object.assign(f.submission.sections[1].claims[0],change);
    expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_CLAIM_CHANGED');
  }
});
test('claim must contain the exact retained display, not a newly invented conversion', () => {
  const f=fixture(); f.submission.sections[1].claims[0].expectedValue='76%';
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_CLAIM_CHANGED');
});
test('cell coordinates and study identity must resolve in the selected source', () => {
  for(const change of [{row:8},{column:6},{studyId:'OTHER-STUDY'},{table:'exposure'}]) {
    const f=fixture(); Object.assign(f.submission.sections[1].claims[0],change);
    expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_CELL_MISMATCH');
  }
});
test('changing a table cell, heading, title, or source hash invalidates the preview digest', () => {
  const mutations=[
    f=>f.runs[0].studies[0].tables.primaryEfficacy.rows[0][2]='191/250',
    f=>f.runs[0].studies[0].tables.primaryEfficacy.headers[2]='Adjusted estimate',
    f=>f.runs[0].studies[0].tables.primaryEfficacy.title='Different analysis population',
    f=>f.runs[0].studies[0].source.sha256='b'.repeat(64),
  ];
  for(const mutate of mutations){const f=fixture();mutate(f);expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_TABLES_CHANGED');}
});
test('a matching refreshed digest cannot rescue a mismatched original source cell', () => {
  const f=fixture(); f.runs[0].studies[0].tables.primaryEfficacy.rows[0][2]='191/250';
  f.submission.expectedTablesSha256=core.scientificTablesSha256(f.runs);
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_CELL_MISMATCH');
});
test('unapproved or malformed source receipt cannot produce a table digest', () => {
  const f=fixture(); f.runs[0].studies[0].source.sourceApproval='not-approved';
  expectCode(()=>core.scientificTablesSha256(f.runs),'CSR_EVIDENCE_SOURCE_INVALID');
});
test('duplicate study or run identities cannot silently choose a source', () => {
  const f=fixture(); f.runs[0].studies.push(copy(f.runs[0].studies[0]));
  expectCode(()=>core.scientificTablesSha256(f.runs),'CSR_EVIDENCE_SOURCE_INVALID');
  const g=fixture(); g.runs.push(copy(g.runs[0]));
  expectCode(()=>core.scientificTablesSha256(g.runs),'CSR_EVIDENCE_RUN_INVALID');
});
test('tables with malformed row widths fail instead of shifting column labels', () => {
  const f=fixture(); f.runs[0].studies[0].tables.primaryEfficacy.rows[0].pop();
  expectCode(()=>core.scientificTablesSha256(f.runs),'CSR_EVIDENCE_TABLE_INVALID');
});
test('another project or document cannot use a receipt', () => {
  const f=fixture(); f.runs[0].programId=uid(99);
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_SCOPE_INVALID');
  const g=fixture(); g.args.documentId=uid(98);
  expectCode(()=>core.prepareScientificReviewReceipt(g.args),'CSR_EVIDENCE_SCOPE_INVALID');
});
test('JSONB object-key order does not change the canonical bundle digest', () => {
  const f=fixture(); const t=f.runs[0].studies[0].tables.primaryEfficacy;
  const before=core.scientificTablesSha256(f.runs);
  f.runs[0].studies[0].tables.primaryEfficacy={rows:t.rows,title:t.title,headers:t.headers};
  assert.equal(core.scientificTablesSha256(f.runs),before);
});
test('canonical hashing rejects NaN and infinity instead of converting them to null', () => {
  for(const n of [NaN,Infinity,-Infinity]) expectCode(()=>core.canonicalScientificJson({n}),'CSR_EVIDENCE_INVALID');
});
test('payload and original source data remain unchanged during verification', () => {
  const f=fixture();const before=JSON.stringify(f);core.prepareScientificReviewReceipt(f.args);assert.equal(JSON.stringify(f),before);
});

function harness() {
  const f=fixture(); const calls=[];
  const receipt=core.prepareScientificReviewReceipt(f.args);
  const row={review_id:uid(40),reviewer_id:'21',reviewer_email:'reviewer@example.test',
    reviewed_snapshot:f.snapshot,metadata:{csrScientificEvidence:receipt},actor_id:'21'};
  const state={row,auditValid:true,required:false,authorityValid:true,loadError:null};
  const q={query:async(sql,params)=>{calls.push({sql,params});
    if(sql.includes('AS required')) return {rows:[{required:state.required}]};
    if(sql.includes('FROM authoring_reviews')) return {rows:state.row?[state.row]:[]};
    throw new Error('Unexpected SQL in adapter test');}};
  const deps={loadTables:async(client,scope,runId,options)=>{
    assert.equal(client,q);assert.deepEqual(scope,{organizationId:7,programId:uid(2),userId:21});
    assert.equal(runId,uid(20));assert.deepEqual(options,{forRelease:true});
    if(state.loadError)throw state.loadError;return f.runs[0];},
    snapshotHash:s=>sha(core.canonicalScientificJson(s)),
    verifyAudit:()=>state.auditValid,
    verifyReviewer:async()=>{if(!state.authorityValid)throw new core.CsrScientificReviewError('CSR_EVIDENCE_REVIEWER_UNAVAILABLE','revoked');}};
  return {...f,receipt,row,state,calls,q,deps};
}
test('adapter: preparation uses actual authorized source reads and returns metadata for the existing audit writer', async()=>{
 const h=harness();const result=await service.prepareCsrScientificApproval(h.q,{...h.context,reviewId:uid(40),submission:h.submission},h.deps);
 assert.deepEqual(result,h.receipt);assert.ok(h.calls.every(c=>!/^\s*(INSERT|UPDATE|DELETE)/i.test(c.sql)));
});
test('adapter: CSR approval without a coverage map fails before table reconstruction',async()=>{
 const h=harness();await assert.rejects(service.prepareCsrScientificApproval(h.q,{...h.context,reviewId:uid(40)},h.deps),e=>e.code==='CSR_SCIENTIFIC_REVIEW_REQUIRED');
});
test('adapter: release re-reads source tables and returns the retained current receipt',async()=>{
 const h=harness();const r=await service.requireCurrentCsrScientificApproval(h.q,h.context,h.deps);assert.deepEqual(r,h.receipt);
 const statement=h.calls.find(c=>c.sql.includes('FROM authoring_reviews'));
 assert.deepEqual(statement.params,[uid(1),7,h.context.snapshotHash]);
 assert.match(statement.sql,/r\.tenant_id=\$2/);assert.match(statement.sql,/FOR SHARE OF r, u, ou, o/);
 assert.match(statement.sql,/authoring\.section\.document_reviewed/);
});
test('adapter: no current approved review prevents signing',async()=>{
 const h=harness();h.state.row=null;await assert.rejects(service.requireCurrentCsrScientificApproval(h.q,h.context,h.deps),e=>e.code==='CSR_SCIENTIFIC_REVIEW_REQUIRED');
});
test('adapter: forged audit metadata is refused',async()=>{
 const h=harness();h.state.auditValid=false;await assert.rejects(service.requireCurrentCsrScientificApproval(h.q,h.context,h.deps),e=>e.code==='CSR_EVIDENCE_RECEIPT_INVALID');
});
test('adapter: revoked reviewer cannot lend authority to a release',async()=>{
 const h=harness();h.state.authorityValid=false;await assert.rejects(service.requireCurrentCsrScientificApproval(h.q,h.context,h.deps),e=>e.code==='CSR_EVIDENCE_REVIEWER_UNAVAILABLE');
});
test('adapter: receipt cannot cross tenant or document boundaries',async()=>{
 for(const changes of [{organizationId:8},{documentId:uid(99)},{reviewId:uid(98)},{reviewerId:'22'}]){
  const h=harness();Object.assign(h.row.metadata.csrScientificEvidence,changes);
  await assert.rejects(service.requireCurrentCsrScientificApproval(h.q,h.context,h.deps),e=>e.code==='CSR_EVIDENCE_RECEIPT_INVALID');
 }
});
test('adapter: withdrawal and source-lifecycle failures prevent release without modifying retained evidence',async()=>{
 for(const code of ['CSR_SOURCE_DATA_UNAVAILABLE','CSR_SOURCE_CHANGED','CSR_SOURCE_APPROVAL_REQUIRED']){
  const h=harness();h.state.loadError=new core.CsrScientificReviewError(code,'source unavailable');
  await assert.rejects(service.requireCurrentCsrScientificApproval(h.q,h.context,h.deps),e=>e.code===code);
  assert.deepEqual(h.row.metadata.csrScientificEvidence,h.receipt);
 }
});
test('adapter: changed current table or review count invalidates the retained receipt',async()=>{
 const h=harness();h.runs[0].studies[0].tables.primaryEfficacy.headers[2]='New population';
 await assert.rejects(service.requireCurrentCsrScientificApproval(h.q,h.context,h.deps),e=>e.code==='CSR_EVIDENCE_TABLES_CHANGED');
 const g=harness();g.row.metadata.csrScientificEvidence.checkedClaims=999;
 await assert.rejects(service.requireCurrentCsrScientificApproval(g.q,g.context,g.deps),e=>e.code==='CSR_EVIDENCE_RECEIPT_CHANGED');
});
test('adapter: a historical CSR identity remains controlled after display rename',async()=>{
 const h=harness();h.context.document.title='Renamed';h.context.document.module='other';h.state.required=true;
 assert.equal(await service.requiresCsrScientificReview(h.q,h.context),true);
});
test('adapter: non-CSR documents retain the existing workflow without a scientific-review assertion',async()=>{
 const h=harness();h.context.document.title='Protocol';h.context.document.module='protocol';
 assert.equal(await service.requireCurrentCsrScientificApproval(h.q,h.context,h.deps),null);
 assert.equal(await service.prepareCsrScientificApproval(h.q,{...h.context,reviewId:uid(40)},h.deps),null);
});
test('adapter: a CSR receipt cannot be attached to an unrelated document class',async()=>{
 const h=harness();h.context.document.title='Protocol';h.context.document.module='protocol';
 await assert.rejects(service.prepareCsrScientificApproval(h.q,{...h.context,reviewId:uid(40),submission:h.submission},h.deps),e=>e.code==='CSR_EVIDENCE_SCOPE_INVALID');
});
test('adapter: unverified current snapshot is refused before loading source evidence',async()=>{
 const h=harness();h.context.snapshotHash='b'.repeat(64);
 await assert.rejects(service.previewCsrScientificEvidence(h.q,h.context,[uid(20)],h.deps),e=>e.code==='CSR_EVIDENCE_SNAPSHOT_INVALID');
});

test('historical tables without current release eligibility cannot qualify a receipt',()=>{
 const f=fixture();f.runs[0].releaseEligibilityVerified=false;
 expectCode(()=>core.scientificTablesSha256(f.runs),'CSR_EVIDENCE_RUN_INVALID');
});

test('an exact source number cannot be a substring of a different draft number', () => {
  for (const value of ['1190/250', '190/2500', '190/250%']) {
    const f=fixture();
    f.snapshot.sections[1].content=value;
    f.submission.sections[1].contentSha256=sha(value);
    Object.assign(f.submission.sections[1].claims[0], {start:0,end:value.length,quoteSha256:sha(value)});
    expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_CLAIM_CHANGED');
  }
});
test('source-number matching allows surrounding prose and sentence punctuation', () => {
  const f=fixture();
  const text='The verified count was 190/250.';
  f.snapshot.sections[1].content=text;
  f.submission.sections[1].contentSha256=sha(text);
  Object.assign(f.submission.sections[1].claims[0],{start:0,end:text.length,quoteSha256:sha(text)});
  assert.equal(core.prepareScientificReviewReceipt(f.args).checkedClaims,1);
});
test('duplicate document-global claim IDs cannot be reused with a valid source', () => {
  const f=fixture();f.submission.sections[1].claims.push(copy(f.submission.sections[1].claims[0]));
  expectCode(()=>core.prepareScientificReviewReceipt(f.args),'CSR_EVIDENCE_CLAIM_INVALID');
});
test('invalid table preview run identifiers fail before database source reads', async () => {
  for(const ids of [[],['not-a-uuid'],[uid(20),uid(20)]]) {
    const h=harness();
    await assert.rejects(service.previewCsrScientificEvidence(h.q,h.context,ids,h.deps),
      error=>error.code==='CSR_EVIDENCE_INPUT_INVALID');
  }
});
