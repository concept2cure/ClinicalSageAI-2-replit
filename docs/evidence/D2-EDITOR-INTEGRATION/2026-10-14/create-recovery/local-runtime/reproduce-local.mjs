/** Local-only qualification. Requires Node 22, installed repo dependencies and
 * the managed/local Docker Unix socket. Creates and removes its own isolated
 * PostgreSQL container; no deployment, provider call or existing database reset.
 * Run from the canonical repository root. See README.md for scope and results. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

assert.equal(Number(process.versions.node.split('.')[0]),22,'Use Node 22');
const repo=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['branch','--show-current'],{cwd:repo,encoding:'utf8'}).trim(),'concept2cure-v2');
const require=createRequire(path.join(repo,'package.json'));
const {Client}=require('pg');
const JSZip=require('jszip');
const output=path.resolve(process.env.C2C_SMOKE_OUTPUT||path.join(path.dirname(new URL(import.meta.url).pathname),'replay'));
assert.ok(!fs.existsSync(output),'Use a new evidence output directory');
fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'c2c-editor-local-smoke-'));
const dbPort=Number(process.env.C2C_SMOKE_DATABASE_PORT||6543);
const appPort=Number(process.env.C2C_SMOKE_APP_PORT||5000);
const container=`c2c-editor-local-smoke-${crypto.randomBytes(6).toString('hex')}`;
const database='c2c_editor_local_smoke';
const secrets=Array.from({length:5},()=>crypto.randomBytes(32).toString('hex'));
const [adminPassword,runtimePassword,sessionSecret,jwtSecret,refreshSecret]=secrets;
const owner=`postgresql://postgres:${adminPassword}@127.0.0.1:${dbPort}/${database}?sslmode=disable`;
const runtime=`postgresql://app_service:${runtimePassword}@127.0.0.1:${dbPort}/${database}?sslmode=disable`;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const clean=s=>secrets.reduce((v,secret)=>v.replaceAll(secret,'[REDACTED]'),String(s))
  .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/g,'[REDACTED_LOCAL_DATABASE_URL]')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [REDACTED]');
const jsonClean=x=>JSON.parse(JSON.stringify(x,(key,value)=>/token|secret|password|sessionId/i.test(key)?'[REDACTED]':value));
const summary={automated:true,realHttp:true,realPostgres:true,node:process.version,
  head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
  scope:'Local editor API and working-draft Vault qualification. No human browser, provider-backed AnA, untrusted-upload scanner, deployment, submission or agency readiness claim.',
  steps:[],requests:[],documents:[],cleanup:{}};
const write=()=>fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
function docker(args,extra={}){
  return spawnSync('docker',['--host=unix:///var/run/docker.sock',...args],{env:{...dockerEnv,...extra},encoding:'utf8',maxBuffer:32*1024*1024});
}
function requireOk(result,name){assert.equal(result.status,0,clean(`${name}: ${result.stderr||result.stdout}`));}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function portAvailable(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
let app,log,token,programId,orgId,userId,createdContainer=false;
const base=`http://127.0.0.1:${appPort}`;
async function http(method,route,body,bearer=token){
  const response=await fetch(base+route,{method,headers:{...(bearer?{authorization:`Bearer ${bearer}`}:{ }),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  const data=await response.json();
  summary.requests.push({method,route,status:response.status,response:jsonClean(data)});write();
  console.info(`${method} ${route} -> ${response.status}`);
  return {status:response.status,data};
}
async function ownerClient(){const client=new Client({connectionString:owner,ssl:false});await client.connect();return client;}
async function observeRuntimeRole(client,documentId,bearer){
  const role=(await client.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='app_service'")).rows[0];assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query('LOCK TABLE public.authoring_sections IN ACCESS EXCLUSIVE MODE');
  const pending=fetch(`${base}/api/authoring/docs/${documentId}/sections`,{headers:{authorization:`Bearer ${bearer}`},signal:AbortSignal.timeout(20000)});
  let connections=[];
  try{
    for(let attempt=0;attempt<30;attempt++){
      await client.query('SELECT pg_stat_clear_snapshot()');
      connections=(await client.query("SELECT usename,state,wait_event_type FROM pg_stat_activity WHERE datname=current_database() AND usename='app_service' AND state='active' AND wait_event_type='Lock'")).rows;
      if(connections.length)break;
      await delay(100);
    }
    assert.ok(connections.length,'Observe actual request on app_service');
  }finally{await client.query('ROLLBACK');assert.equal((await pending).status,200);}
  return{role,observedRequestConnections:connections,lockReleased:true};
}
async function stopApp(){
  if(!app||app.exitCode!==null)return;
  const exited=new Promise(resolve=>app.once('exit',resolve));
  // The detached process group contains only the server this script spawned.
  process.kill(-app.pid,'SIGTERM');
  await Promise.race([exited,delay(10000)]);
  if(app.exitCode===null){process.kill(-app.pid,'SIGKILL');await exited;}
}
try{
  await portAvailable(dbPort);await portAvailable(appPort);
  requireOk(docker(['info','--format','{{.ServerVersion}}']),'managed Docker socket');
  requireOk(docker(['pull','pgvector/pgvector:pg16']),'canonical pgvector pull');
  summary.postgresImage=docker(['image','inspect','pgvector/pgvector:pg16','--format','{{index .RepoDigests 0}}']).stdout.trim();
  requireOk(docker(['run','--detach','--name',container,'--env','POSTGRES_PASSWORD','--env',`POSTGRES_DB=${database}`,
    '--publish',`127.0.0.1:${dbPort}:5432`,'--mount',`type=bind,src=${repo},dst=${repo},readonly`,'pgvector/pgvector:pg16'],{POSTGRES_PASSWORD:adminPassword}),'isolated Postgres');
  createdContainer=true;
  for(let attempt=0;attempt<60;attempt++){
    if(docker(['exec',container,'pg_isready','-U','postgres','-d',database]).status===0)break;
    assert.notEqual(attempt,59,'Postgres readiness timeout');await delay(1000);
  }
  const bin=path.join(temporary,'bin');fs.mkdirSync(bin);
  // This is the real image's psql, reading canonical files through a read-only
  // mount. The wrapper refuses any connection outside this isolated database.
  fs.writeFileSync(path.join(bin,'psql'),`#!${process.execPath}
const {spawnSync}=require('node:child_process');
const args=process.argv.slice(2).map(arg=>{if(/^postgres(?:ql)?:/.test(arg)){const u=new URL(arg);if(u.hostname!=='127.0.0.1'||u.port!==${JSON.stringify(String(dbPort))}||u.pathname!==${JSON.stringify('/'+database)})throw new Error('Non-task database refused');u.port='5432';return u.href;}return arg;});
const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const r=spawnSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',${JSON.stringify(container)},'psql',...args],{stdio:'inherit',env});process.exit(r.status??1);
`,{mode:0o700});
  const env={...process.env,PATH:`${bin}:${path.dirname(process.execPath)}:${process.env.PATH}`,NODE_OPTIONS:'--max-old-space-size=4096',APP_SERVICE_DB_PASSWORD:runtimePassword,SEED_DEMO_USER:'1'};
  for(const key of ['DATABASE_URL','DATABASE_URL_DEV','DATABASE_URL_STAGING','DATABASE_URL_PROD','DATABASE_URL_ADMIN','NEON_DATABASE_URL','NEON_DATABASE_URL_ADMIN','DATABASE_NEON_NEW_SECRET','DATABASE_OWNER_URL'])env[key]=owner;
  env.APP_DATABASE_URL=runtime;
  for(const step of ['install-fresh','deploy-migrate']){
    const result=spawnSync(process.execPath,[`scripts/db/${step}.mjs`],{cwd:repo,env,encoding:'utf8',maxBuffer:64*1024*1024,timeout:15*60*1000});
    const text=clean(`${result.stdout||''}\n${result.stderr||''}`);
    fs.writeFileSync(path.join(output,`${step}.txt`),text);
    summary.steps.push({step,exitCode:result.status,signal:result.signal,logSha256:sha(text)});write();requireOk(result,step);
  }
  Object.assign(env,{NODE_ENV:'development',ALLOW_DEV_AUTH:'1',RLS_ENFORCE:'on',EXPORT_REVIEW_GATE:'enforce',PORT:String(appPort),SESSION_SECRET:sessionSecret,JWT_SECRET:jwtSecret,REFRESH_TOKEN_SECRET:refreshSecret,CONCEPT2CURE_SIGNER_MODE:'dev',STORAGE_PROVIDER:'local',SKIP_DB_STARTUP_TEST:'false',ANA_DIGEST_HEARTBEAT_DISABLED:'true',ENABLE_EXTERNAL_INTELLIGENCE:'false',SCHEDULE_OF_EVENTS_SWEEP_DISABLED:'true',TASK_DUE_SWEEP_DISABLED:'true'});
  for(const key of Object.keys(env))if(/^(OPENAI|ANTHROPIC|KIMI|DEEPSEEK|GEMINI|COHERE|GROQ|MISTRAL|AZURE_OPENAI)/.test(key))env[key]='';
  for(const key of ['ANTHROPIC_API_KEY','OPENAI_API_KEY','KIMI_API_KEY','AI_BEDROCK_ENABLED','AI_VERTEX_ENABLED','AI_DETERMINISTIC','AI_DETERMINISTIC_MODE'])env[key]='';
  log=fs.createWriteStream(path.join(output,'server.txt'));
  app=spawn(process.execPath,[path.join(repo,'node_modules/tsx/dist/cli.mjs'),'server/index.ts'],{cwd:repo,env,detached:true,stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',chunk=>log.write(clean(chunk)));app.stderr.on('data',chunk=>log.write(clean(chunk)));
  for(let attempt=0;attempt<120;attempt++){
    assert.equal(app.exitCode,null,'Server exited before liveness');
    try{if((await fetch(base+'/healthz',{signal:AbortSignal.timeout(1000)})).status===200)break;}catch{/* Retry while the actual server boots. */}
    assert.notEqual(attempt,119,'Server liveness timeout');await delay(1000);
  }
  assert.equal((await http('GET','/healthz')).status,200);
  const ready=await http('GET','/readyz');summary.readiness=ready;
  for(const dependency of ['database','schema','storage'])assert.equal(ready.data.dependencies[dependency],'ok',`${dependency} prerequisite`);
  assert.equal(ready.data.anaState,'no_provider');assert.equal(ready.status,503);
  const login=await http('POST','/api/auth/dev-login',{email:'jonmichaelpsmith@gmail.com'});assert.equal(login.status,200);token=login.data.accessToken;
  const me=await http('GET','/api/auth/me');assert.equal(me.status,200);
  userId=me.data.user?.id||me.data.id;orgId=Number(me.data.user?.organizationId||me.data.organizationId);
  const project=await http('POST','/api/c2c/projects',{name:'LOCAL TEST ONLY — editor qualification',productName:'Non-sensitive local test material',programType:'ind',productType:'drug',primaryAgency:'FDA',submissionTypeId:'US_IND'});
  assert.equal(project.status,201);programId=project.data.program?.id||project.data.data?.id;summary.programId=programId;
  const listed=await http('GET','/api/authoring/templates');assert.equal(listed.status,200);const templates=listed.data.templates;
  summary.builtinCount=templates.filter(t=>t.category==='IND pyramid'||t.entryId).length;
  assert.equal(summary.builtinCount,305);
  const selected=['registry:US_NDA','registry:CA_CTA','registry:EU_CTA','registry:JP_CTN','component:quality_overall_summary','component:pil'].map(id=>templates.find(t=>t.entryId===id));
  selected.push(...['M1','M2','M3','M4','M5'].map(module=>templates.find(t=>t.category==='IND pyramid'&&t.module===module)));
  for(const template of selected){
    assert.ok(template,'Selected canonical template missing');
    const label=template.entryId||template.module;
    const created=await http('POST','/api/authoring/docs',{title:`LOCAL TEST ONLY — ${label}`,module:template.module,template_id:template.id,client_program_id:programId});assert.equal(created.status,201);
    const doc=created.data.document;
    const sections=await http('GET',`/api/authoring/docs/${doc.id}/sections`);assert.equal(sections.status,200);
    assert.equal(sections.data.sections.length,created.data.sections_seeded);assert.ok(sections.data.sections.length);assert.ok(sections.data.sections.every(s=>s.content===''));
    const section=sections.data.sections[0];
    assert.equal((await http('GET',`/api/authoring/guidance/${section.id}`)).status,200);
    const content=`<p>LOCAL TEST ONLY: exact saved paragraph for ${label}. No regulatory facts asserted.</p>`;
    const reason='Local smoke verification of explicit section save and reopen.';
    assert.equal((await http('PATCH',`/api/authoring/sections/${section.id}`,{content,changeReason:reason,expectedUpdatedAt:section.updated_at})).status,200);
    const reopened=await http('GET',`/api/authoring/docs/${doc.id}`);assert.equal(reopened.status,200);assert.equal(reopened.data.document.template_id,template.id);
    assert.deepEqual(reopened.data.document.provenance.templateSource.filingContext,template.filingContext);
    const saved=await http('GET',`/api/authoring/docs/${doc.id}/sections`);assert.equal(saved.data.sections.find(s=>s.id===section.id).content,content);
    assert.equal((await http('GET',`/api/authoring/sections/${section.id}/history`)).status,200);
    const audit=await http('GET',`/api/authoring/docs/${doc.id}/audit`);assert.equal(audit.status,200);assert.ok(JSON.stringify(audit.data).includes(reason));
    const recovery=await http('GET',`/api/authoring/docs?programId=${programId}`);assert.equal(recovery.status,200);assert.equal(recovery.data.filters.programId,programId);assert.ok(recovery.data.documents.some(d=>d.id===doc.id));
    summary.documents.push({label,documentId:doc.id,sectionId:section.id,templateId:template.id,sectionCount:sections.data.sections.length,sourceSha256:doc.provenance.templateSource.sha256,contentSha256:sha(content)});write();
  }
  const client=await ownerClient();
  try{
    summary.runtimeRole=await observeRuntimeRole(client,summary.documents[0].documentId,token);write();
    const foreign=crypto.randomUUID();assert.notEqual(orgId,1);
    await client.query("INSERT INTO authoring_documents (id,title,module,status,tenant_id,created_by) VALUES ($1,'LOCAL TEST ONLY — foreign sentinel','M1','draft',1,'local-smoke-fixture')",[foreign]);
    assert.equal((await http('GET',`/api/authoring/docs/${foreign}`)).status,404);
    const unknown=await http('GET',`/api/authoring/docs?programId=${crypto.randomUUID()}`);assert.equal(unknown.status,200);assert.deepEqual(unknown.data.documents,[]);
    const original=(await client.query('SELECT role FROM organization_users WHERE organization_id=$1 AND user_id=$2',[orgId,userId])).rows[0].role;
    const before=(await client.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1',[orgId])).rows[0].n;
    try{
      await client.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2",[orgId,userId]);
      for(const bearer of [token,(await http('POST','/api/auth/dev-login',{email:'jonmichaelpsmith@gmail.com'})).data.accessToken]){
        assert.equal((await http('GET',`/api/authoring/docs/${summary.documents[0].documentId}`,undefined,bearer)).status,200);
        assert.equal((await http('PATCH',`/api/authoring/sections/${summary.documents[0].sectionId}`,{content:'<p>THIS VIEWER WRITE MUST BE REFUSED</p>',changeReason:'Local viewer denial verification.'},bearer)).status,403);
        assert.equal((await http('POST','/api/authoring/docs',{title:'THIS VIEWER CREATE MUST BE REFUSED',module:'M1',client_program_id:programId},bearer)).status,403);
      }
    }finally{await client.query('UPDATE organization_users SET role=$3 WHERE organization_id=$1 AND user_id=$2',[orgId,userId,original]);}
    assert.equal((await client.query('SELECT count(*)::int AS n FROM authoring_documents WHERE tenant_id=$1',[orgId])).rows[0].n,before);
    summary.currentViewerDenials={oldAdminJwt:403,freshViewerJwt:403,documentCountUnchanged:true,membershipRestored:true};write();
  }finally{await client.query('ROLLBACK');await client.end();}
  const qos=summary.documents.find(d=>d.label==='component:quality_overall_summary');
  const filed=await http('POST',`/api/authoring/docs/${qos.documentId}/file-to-vault`,{format:'docx'});assert.equal(filed.status,201);assert.equal(filed.data.data.sealed,false);assert.notEqual(filed.data.data.approval?.carried,true);
  const download=await fetch(`${base}/api/c2c/project-vault/${programId}/documents/${filed.data.data.vaultDocumentId}/download`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});assert.equal(download.status,200);
  const bytes=Buffer.from(await download.arrayBuffer());assert.equal(sha(bytes),filed.data.data.sha256);
  const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('word/document.xml').async('string');
  const margins=await Promise.all(Object.keys(zip.files).filter(p=>/^word\/(?:header|footer)\d+\.xml$/.test(p)).map(p=>zip.file(p).async('string')));
  assert.match([xml,...margins].join('\n'),/working (?:copy|draft)|uncontrolled|not approved/i);
  assert.ok(xml.includes('LOCAL TEST ONLY: exact saved paragraph for component:quality_overall_summary. No regulatory facts asserted.'));
  summary.vault={status:201,downloadStatus:200,bytes:bytes.length,sha256:sha(bytes),draftMarking:true,exactParagraph:true,approval:filed.data.data.approval};
  summary.result='passed-local-manual-api-scope';write();
}catch(error){summary.result='failed';summary.failure=clean(error.stack||error);write();process.exitCode=1;}
finally{
  try{await stopApp();summary.cleanup.serverStopped=true;}catch(error){summary.cleanup.serverStopError=clean(error.message);process.exitCode=1;}
  if(log)await new Promise(resolve=>log.end(resolve));
  if(createdContainer){const stopped=docker(['rm','--force','--volumes',container]);summary.cleanup.ownContainerAndAnonymousVolumeRemoved=stopped.status===0;if(stopped.status!==0)process.exitCode=1;}
  fs.rmSync(temporary,{recursive:true,force:true});summary.cleanup.temporaryWrapperRemoved=true;
  // The project UUID was created by this script in an isolated DB. Remove only
  // its own local test bytes, never another project's or org's storage tree.
  if(programId&&orgId){const own=path.join(repo,'storage/vault',String(orgId),programId.replace(/[^a-zA-Z0-9_-]/g,'_'));if(fs.existsSync(own)){fs.rmSync(own,{recursive:true});summary.cleanup.ownProjectBytesRemoved=true;}}
  write();console.info(`Local smoke ${summary.result}; sanitized evidence: ${output}`);
}
