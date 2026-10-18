import pg from '/workspace/ClinicalSageAI-2-replit/node_modules/pg/lib/index.js';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const stage=process.argv[2];assert.ok(['before','after'].includes(stage));
const dir=process.env.RUNTIME_REFRESH_ARTIFACT_DIR;const u=new URL(process.env.DATABASE_URL);
assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/platform_test');
assert.equal(process.env.APP_SERVICE_DB_PASSWORD,'');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pool=new pg.Pool({connectionString:u.toString(),max:1});
try{const q=await pool.connect();try{
 await q.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal((await q.query('SELECT current_database() AS name')).rows[0].name,'platform_test');
 const globalHashes={
  credential:hash((await q.query('SELECT rolname,rolpassword FROM pg_authid ORDER BY rolname')).rows),
  attributes:hash((await q.query('SELECT row_to_json(r) AS attributes FROM pg_authid r ORDER BY rolname')).rows),
  memberships:hash((await q.query('SELECT row_to_json(m) AS membership FROM pg_auth_members m ORDER BY roleid,member,grantor')).rows),
  settings:hash((await q.query('SELECT row_to_json(s) AS settings FROM pg_db_role_setting s ORDER BY setdatabase,setrole')).rows)};
 const tables=['authoring_documents','authoring_sections','authoring_reviews','doc_revisions','authoring_audit_trail','authoring_signatures','electronic_signatures','audit_logs','audit_events','workflow_history','document_audit_logs','regulatory_audit_logs','unified_tasks','qms_documents','qms_change_controls','qms_training_records'];
 const governedCounts={};for(const table of tables){
  const present=(await q.query('SELECT to_regclass($1) IS NOT NULL AS present',['public.'+table])).rows[0].present;
  governedCounts[table]=present?{present:true,count:(await q.query(`SELECT count(*)::text AS n FROM public.${table}`)).rows[0].n}:{present:false,count:null};
 }
 const reviewColumns=(await q.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='authoring_reviews' AND column_name=ANY($1::text[]) ORDER BY column_name",[['reviewed_snapshot','reviewed_snapshot_hash','review_binding_basis']])).rows;
 const observation={stage,database:'platform_test',globalHashes,governedCounts,reviewColumns,qualification:'Role/credential/membership/settings hashes and selected governed row counts only; not whole-row content or audit-chain requalification.'};
 if(stage==='after'){
  const before=JSON.parse(readFileSync(dir+'/before.json','utf8'));assert.deepEqual(globalHashes,before.globalHashes);
  assert.deepEqual(governedCounts,before.governedCounts);
  assert.equal(reviewColumns.length,3);assert.ok(reviewColumns.every(row=>row.is_nullable==='YES'&&row.column_default===null));
  assert.equal(reviewColumns.find(row=>row.column_name==='reviewed_snapshot').data_type,'jsonb');
  assert.ok(reviewColumns.filter(row=>row.column_name!=='reviewed_snapshot').every(row=>row.data_type==='text'));
 }
 writeFileSync(dir+'/'+stage+'.json',JSON.stringify(observation,null,2)+'\n',{mode:0o600,flag:'wx'});
 await q.query('ROLLBACK');console.log(JSON.stringify({stage,database:'platform_test',selectedStores:tables.length,globalHashGroups:4,countsCaptured:true}));
 }finally{q.release();}}finally{await pool.end();}
