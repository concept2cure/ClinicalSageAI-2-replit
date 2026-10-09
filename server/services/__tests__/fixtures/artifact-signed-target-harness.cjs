'use strict';
// Executes complete production modules. Drizzle expression construction, schema,
// signer identity and the audit writer are explicit doubles. SQL predicates and
// rollback execute on SQLite; PostgreSQL FOR UPDATE/SHARE are recorded only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');const ts=require('typescript');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const snake=k=>k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
const camel=k=>k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
const clone=x=>structuredClone(x);
const timestamp='2026-10-09T16:00:00.000Z';
const dateFields=new Set(['updatedAt','lockedAt','publishedAt','signedAt','authenticationTimestamp']);
function revive(row){if(!row)return row;return Object.fromEntries(Object.entries(row).map(([k,v])=>{k=camel(k);return[k,dateFields.has(k)&&v!==null?new Date(v):v];}));}
function patch(obj,delta){Object.assign(obj,delta||{});for(const k of dateFields)if(typeof obj[k]==='string'&&/T/.test(obj[k]))obj[k]=new Date(obj[k]);}
function enc(v){if(v===undefined)return null;if(v instanceof Date)return v.toISOString();if(typeof v==='boolean')return +v;return v&&typeof v==='object'?JSON.stringify(v):v;}
function load(tree,file,doubles){
 const src=fs.readFileSync(path.join(tree,file),'utf8');
 const compiled=ts.transpileModule(src,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});
 assert.equal(compiled.diagnostics.length,0,'syntactic diagnostics');
 const exp={};vm.runInThisContext(`(function(require,module,exports){${compiled.outputText}\n})`,{filename:file})
 (n=>{if(Object.hasOwn(doubles,n))return doubles[n];if(n==='crypto')return crypto;throw new Error('Unexpected import: '+n);},{exports:exp},exp);
 return exp;
}
const columns={
 concept2cure_artifacts:`id integer primary key, artifact_id text, organization_id integer, project_id integer, version integer, status text, content text, content_hash text, approved_version_id integer, published_version_id integer, title text, ctd_section text, template_id text, created_by_id integer, updated_at text, locked_at text, locked_by_id integer, published_at text`,
 concept2cure_artifact_versions:`id integer primary key autoincrement, artifact_id integer, organization_id integer, version integer, content text, content_hash text, change_description text, created_by_id integer, UNIQUE(artifact_id,organization_id,version)`,
 concept2cure_signatures:`id integer primary key autoincrement, organization_id integer, signature_id text, artifact_id integer, artifact_version_id integer, signature_type text, signature_purpose text, signature_meaning text, signer_id integer, signer_name text, signer_email text, signer_role text, authentication_method text, authentication_timestamp text, second_factor_verified integer, signature_hash text, signature_manifest text, ip_address text, device_info text, status text, signed_at text`,
 concept2cure_submission_snapshots:`id integer primary key autoincrement, snapshot_id text, artifact_id integer, organization_id integer, version_id integer, approved_version_id integer, published_version_id integer, content_hash text, title text, ctd_section text, template_id text, action_type text, actor_id integer, actor_name text, actor_email text, actor_role text, attestation_text text, signature_meaning text, metadata text`,
 concept2cure_review_assignments:`id integer primary key, artifact_id integer, organization_id integer, reviewer_id integer, review_round integer, status text`,
 concept2cure_review_decisions:`id integer primary key, assignment_id integer, artifact_id integer, organization_id integer, reviewer_id integer, review_round integer, decision text, version_reviewed integer`,
 audit_fixture:`id integer primary key autoincrement, payload text`,action_fixture:`id integer primary key autoincrement, payload text`,
};
const schema={};for(const [name,table] of Object.entries({concept2cureArtifacts:'concept2cure_artifacts',concept2cureArtifactVersions:'concept2cure_artifact_versions',concept2cureSignatures:'concept2cure_signatures',concept2cureSubmissionSnapshots:'concept2cure_submission_snapshots'}))schema[name]=new Proxy({table},{get:(o,k)=>k==='table'?o.table:{table:o.table,column:snake(k)}});
const qcol=c=>`"${c.column}"`;
const orm={eq:(c,v)=>({sql:`${qcol(c)} = ?`,params:[enc(v)]}),isNull:c=>({sql:`${qcol(c)} IS NULL`,params:[]}),and:(...pred)=>({sql:pred.map(p=>'('+p.sql+')').join(' AND '),params:pred.flatMap(p=>p.params)})};
async function runCase(tree,c){
 const db=new DatabaseSync(':memory:');for(const [table,ddl]of Object.entries(columns))db.exec(`CREATE TABLE ${table} (${ddl});`);
 const trace=[];let started=false;
 const fail=kind=>{if(c.failure===kind)throw new Error('fixture '+kind+' unavailable');};
 const insert=(table,row)=>{const keys=Object.keys(row);return db.prepare(`INSERT INTO ${table} (${keys.map(snake).join(',')}) VALUES (${keys.map(()=>'?').join(',')}) RETURNING *`).get(...keys.map(k=>enc(row[k])));};
 const update=(table,delta,where)=>{const keys=Object.keys(delta||{});if(keys.length)db.prepare(`UPDATE ${table} SET ${keys.map(k=>snake(k)+' = ?').join(',')} ${where}`).run(...keys.map(k=>enc(delta[k])));};
 const review=load(tree,'server/services/artifact-approval-act.ts',{'./ectd/package-content-fingerprint':{artifactApproval:()=>({filable:true})},'./contradiction-engine-service':{contradictionEngineService:{checkPromotionBlocked:async()=>({blocked:false,blockingFindings:[],warningFindings:[]})}}});
 const head={id:101,artifactId:'artifact_owned',organizationId:7,projectId:3,version:3,status:c.status==='locked'?'approved':'review',content:'Evidence — αβγ\nDose is 2 mg; not 20 mg.',approvedVersionId:c.status==='locked'?3:null,publishedVersionId:null,title:'Clinical overview',ctdSection:'2.5',templateId:'clinical-template',createdById:300,updatedAt:new Date(timestamp)};
 head.contentHash=hash(head.content);patch(head,c.initialHead);
 const ver={id:401,artifactId:101,organizationId:7,version:3,content:head.content,contentHash:hash(head.content),createdById:300,changeDescription:'Persisted draft'};patch(ver,c.initialVersion);
 insert('concept2cure_artifacts',head);if(!c.missingVersion)insert('concept2cure_artifact_versions',ver);
 const input={artifact:revive(db.prepare('SELECT * FROM concept2cure_artifacts').get()),version:c.missingVersion?null:revive(db.prepare('SELECT * FROM concept2cure_artifact_versions').get()),status:c.status||'approved',previousStatus:c.status==='locked'?'approved':'review',organizationId:7,userId:777,userRole:'admin',attestationText:'I approve the reviewed document.',reason:'Reviewed',secondFactorVerified:true,ipAddress:null};
 input.updateData=review.artifactStatusUpdate(input.artifact,input.previousStatus,input.status,input.userId);
 patch(input.artifact,c.cachedHead);if(input.version)patch(input.version,c.cachedVersion);patch(input,c.input);
 if(Object.hasOwn(c,'update'))input.updateData=c.update===null?null:{...input.updateData,...c.update};
 if(c.deleteHead)db.exec('DELETE FROM concept2cure_artifacts');else update('concept2cure_artifacts',c.head,'WHERE id=101');
 if(c.deleteVersion)db.exec('DELETE FROM concept2cure_artifact_versions');else update('concept2cure_artifact_versions',c.stored,'WHERE id=401');
 if(c.versionAppears)insert('concept2cure_artifact_versions',ver);
 if(c.quorum!=='none'){
  insert('concept2cure_review_assignments',{id:1,artifact_id:101,organization_id:7,reviewer_id:700,review_round:2,status:c.quorum==='pending'?'pending':'completed'});
  if(c.quorum!=='missing')insert('concept2cure_review_decisions',{id:1,assignment_id:1,artifact_id:101,organization_id:7,reviewer_id:c.quorum==='wrongReviewer'?701:700,review_round:2,decision:c.quorum==='reject'?'reject':'approve',version_reviewed:c.quorum==='stale'?2:3});
  if(c.quorum==='newRound')insert('concept2cure_review_assignments',{id:2,artifact_id:101,organization_id:7,reviewer_id:701,review_round:3,status:'pending'});
 }
 const snap=()=>JSON.stringify(Object.fromEntries(Object.keys(columns).map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()])));
 const before=snap();
 const query=async(sql,params=[])=>{assert(started,'query is on transaction');trace.push({kind:'query',sql,params});if(sql.includes('review_assignments'))fail('assignmentsRead');if(sql.includes('review_decisions'))fail('decisionsRead');return{rows:db.prepare(sql).all(Object.fromEntries(params.map((p,i)=>['$'+(i+1),p])))};};
 function builder(kind,table){let cond,payload,limit,lock,ignore=false;
  const b={from:t=>(table=t,b),where:x=>(cond=x,b),for:x=>(lock=x,b),limit:n=>(limit=n,exec()),set:v=>(payload=v,b),values:v=>(payload=v,b),onConflictDoNothing:()=>(ignore=true,b),returning:()=>exec()};
  async function exec(){assert(started,'operation is on transaction');let sql,params=[];const t=table.table;
   if(kind==='select'){fail(t==='concept2cure_artifacts'?'headRead':'versionRead');sql=`SELECT * FROM ${t}`;if(cond){sql+=' WHERE '+cond.sql;params.push(...cond.params);}if(limit)sql+=' LIMIT '+limit;
    trace.push({kind,table:t,lock,sql,params});return db.prepare(sql).all(...params).map(revive);
   }
   if(kind==='update'){fail('statusWrite');const keys=Object.keys(payload);sql=`UPDATE ${t} SET ${keys.map(k=>snake(k)+' = ?').join(',')}`;params.push(...keys.map(k=>enc(payload[k])));if(cond){sql+=' WHERE '+cond.sql;params.push(...cond.params);}sql+=' RETURNING *';}
   else {fail({concept2cure_artifact_versions:'versionWrite',concept2cure_signatures:'signature',concept2cure_submission_snapshots:'snapshot'}[t]);const keys=Object.keys(payload);sql=`INSERT ${ignore?'OR IGNORE ':''}INTO ${t} (${keys.map(snake).join(',')}) VALUES (${keys.map(()=>'?').join(',')}) RETURNING *`;params.push(...keys.map(k=>enc(payload[k])));}
   trace.push({kind,table:t,sql,params});let rows=db.prepare(sql).all(...params).map(revive);
   if(c.returnedVersionPatch && t==='concept2cure_artifact_versions' && kind==='insert' && rows[0]){
    update(t,c.returnedVersionPatch,'WHERE id='+rows[0].id);rows=db.prepare('SELECT * FROM '+t+' WHERE id=?').all(rows[0].id).map(revive);
   }
   if((c.failure==='signatureReturn'&&t==='concept2cure_signatures')||(c.failure==='snapshotReturn'&&t==='concept2cure_submission_snapshots'))return [];
   return rows;
  }return b;
 }
 const tx={select:()=>builder('select'),update:t=>builder('update',t),insert:t=>builder('insert',t),query};
 const service=load(tree,'server/services/artifact-signed-act.ts',{'drizzle-orm':orm,'../../shared/schema':schema,'../db/drizzle-queryable':{queryableFromDrizzle:t=>{assert.equal(t,tx);return tx;}},'./artifact-approval-act':review,
  './part11/resolve-signer-identity':{resolveSignerIdentity:async(q)=>{assert.equal(q,tx);trace.push({kind:'identity'});fail('identity');return{name:'Qualified Reviewer',email:'reviewer@example.test'};}},
  '../routes/c2c/actions':{recordGovernedAction:async(q,payload)=>{assert.equal(q,tx);trace.push({kind:'ledger'});insert('action_fixture',{payload});fail('ledger');insert('audit_fixture',{payload});return{actionId:'a1',auditId:'u1',sha256Chain:'fixture-chain-not-hmac'};}},
 });
 let result,error;
 try{
  db.exec('BEGIN');started=true;
  try{result=await service.commitSignedArtifactAct(tx,input);db.exec('COMMIT');}
  catch(e){error=e;db.exec('ROLLBACK');}
  started=false;
  if(c.allowed){
   assert.ifError(error);assert.equal(result.version.content,head.content);assert.equal(result.version.contentHash,hash(head.content));
   const signatures=db.prepare('SELECT * FROM concept2cure_signatures').all();assert.equal(signatures.length,1);assert.equal(signatures[0].artifact_version_id,result.version.id);assert.equal(signatures[0].organization_id,7);
   assert.equal(JSON.parse(signatures[0].signature_manifest).contentHash,hash(head.content));
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_fixture').get().n,1);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM concept2cure_artifact_versions').get().n,1);
   const storedHead=db.prepare('SELECT * FROM concept2cure_artifacts').get();assert.equal(storedHead.content,head.content);assert.equal(storedHead.status,input.status);
   if(input.status==='locked'){assert.equal(result.snapshot.contentHash,hash(head.content));assert.equal(result.snapshot.versionId,3);assert.equal(result.snapshot.approvedVersionId,3);}
   const reads=trace.filter(t=>t.kind==='select');assert.equal(reads[0]?.lock,'update');assert.equal(reads[1]?.lock,'share');assert.equal(reads[0]?.table,'concept2cure_artifacts');
  }else{
   assert(error,'unsafe act was accepted');if(c.expectedError)assert.match(error.message,new RegExp(c.expectedError));else assert.equal(error.code,'ARTIFACT_CHANGED');
   assert.equal(snap(),before,'refusal must preserve all committed tables');
   if(!c.failure)assert.equal(trace.filter(t=>['insert','update','ledger'].includes(t.kind)).length,0,'target/quorum refusal is before writes');
  }
  return{allowed:!!result,error:error?{name:error.name,code:error.code,message:error.message}:null,rollbackUnchanged:error?snap()===before:null,trace};
 }finally{db.close();}
}
module.exports={runCase};
if(require.main===module){(async()=>{const tree=path.resolve(process.argv[2]);const out=path.resolve(process.argv[3]);const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'artifact-signed-target-cases.json'),'utf8'));const results=[];
 for(const c of cases){try{results.push({name:c.name,passed:true,result:await runCase(tree,c)});}catch(e){results.push({name:c.name,passed:false,error:e.stack});}}
 const report={node:process.version,typescript:ts.version,scope:'Full production signed act and quorum modules; SQLite transaction/predicate execution with explicit ORM/schema/identity/audit doubles. Row locks recorded, not executed. Not PostgreSQL, PGlite, RLS, HTTP, or reauthentication qualification.',sourceTree:tree,sourceSha256:hash(fs.readFileSync(path.join(tree,'server/services/artifact-signed-act.ts'))),passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,skipped:0,results};fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:results.length}));for(const r of results.filter(r=>!r.passed))console.log('FAIL '+r.name+': '+r.error.split('\n').slice(0,2).join(' '));process.exitCode=report.failed?1:0;})().catch(e=>{console.error(e);process.exitCode=2;});}
