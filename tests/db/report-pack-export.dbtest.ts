/** Actual authenticated retained-packet export, restricted app_service and
 * forced RLS. Fresh invented QA records, audits and signatures are retained.
 * No auth, policy, entitlement, source or PDF mocks; no provider computation. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool, type PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { setTenantContextTx } from '../../server/services/tenant/governed-tenant-context';
import { requireReportEntitlement } from '../../server/services/report-os/entitlement-map';
import type { RenderedReport } from '../../server/services/report-os/render/types';

const TAG = `report-pack-native-${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
const PASSWORD = randomUUID(); // Never logged/filed; only these invented QA users know it.
const TYPE = `${TAG}.retained_status`;
const observations: Record<string, unknown> = { tag: TAG, scope: 'Synthetic native implementation checks only', cases: {} };
let owner: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
let foreignOrg: number;
let workspace: number;
type Actor = { id: number; token: string; role: 'admin' | 'member' | 'manager' };
const actors = {} as Record<'author' | 'reader' | 'signer' | 'scopeReader' | 'roleReader', Actor>;
type Run = { id: number; runUuid: string; projectId: number; body: RenderedReport };
let finalized: Run;
let partial: Run;
let privateRun: Run;
let foreignRun: Run;
let positiveBundle: string;
const scope = <T>(run: () => T): T => runWithTenantScope({ tenantId: String(orgId), orgUuid, role: 'admin', source: 'test', caller: TAG }, run);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const observe = (name: string, value: unknown) => { (observations.cases as Record<string, unknown>)[name] = value; };

async function runtimeTx<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  return scope(async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN'); await setTenantContextTx(client, orgId);
      const result = await run(client); await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  });
}
const authorization = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });
const packet = (actor: Actor, bundleId: string) => request(app).get(`/api/report-os/bundles/${bundleId}/export.pdf?content=reports`)
  .set(authorization(actor)).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = []; res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  }).then(response => response);
const finalize = (run: Run) => request(app).post(`/api/report-os/runs/${run.id}/finalize`).set(authorization(actors.signer))
  .send({ reason: 'Native synthetic retained packet qualification; no clinical or agency claim.', meaning: 'approval', reauth: { password: PASSWORD } }).then(response => response);
const errorBody = (response: request.Response) => Buffer.isBuffer(response.body) ? JSON.parse(response.body.toString()) : response.body;
async function parsedPdf(bytes: Buffer) {
  const { PDFParse } = await import('pdf-parse') as unknown as { PDFParse: new (opts: { data: Buffer }) => {
    getText(): Promise<{ text: string; pages: Array<{ num: number; text: string }> }>; destroy(): Promise<void> } };
  const parser = new PDFParse({ data: bytes });
  try { return await parser.getText(); } finally { await parser.destroy(); }
}
async function exportsFor(bundleId: string) {
  return (await owner.query("SELECT id,actor_id,user_id,new_values::jsonb AS details,sha256_chain FROM audit_logs WHERE tenant_id=$1 AND action='report_os.bundle_exported' AND record_id=$2 ORDER BY id", [orgId, bundleId])).rows;
}
async function seedProject(label: string, reader?: Actor): Promise<number> {
  const projectId = Number((await owner.query("INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,settings) VALUES($1,$2,$3,'regulatory','active',$4,$4,'{}'::jsonb) RETURNING id", [orgId, workspace, `${TAG} ${label}`, actors.author.id])).rows[0].id);
  await owner.query("INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,'private')", [orgId, projectId]);
  if (reader) await owner.query("INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'use','active')", [orgId, projectId, reader.id]);
  return projectId;
}
async function seedRun(projectId: number, label: string, long = false, organizationId = orgId): Promise<Run> {
  const body: RenderedReport = { reportTypeId: TYPE, scopeType: 'project', scopeId: String(projectId), status: 'partial', generatedAt: '2026-10-14T00:00:00.000Z',
    provenance: { source: 'synthetic_native_QA', label, marker: `CALCULATION-${label}` }, sections: [{ id: 'retained', title: `Retained synthetic ${label}`, blocks: [
      { kind: 'summary', text: `BODY-${label} Résumé 中文报告; synthetic QA only.` },
      { kind: 'table', columns: ['Synthetic input', 'Recorded value'], rows: Array.from({ length: long ? 1200 : 2 }, (_, i) => [`ROW-${label}-${i}`, i]), provenance: [{ sourceTable: 'synthetic_native_QA', recordId: label }] },
      { kind: 'summary', text: `END-OF-BODY-${label}` }] }] };
  const row = (await owner.query("INSERT INTO report_runs(organization_id,scope_type,scope_id,report_type_id,status,requested_by,dependency_summary,confidence,blockers) VALUES($1,'project',$2,$3,'completed',$4,$5::json,90,'[]'::json) RETURNING id,run_uuid", [organizationId, String(projectId), TYPE, actors.author.id, JSON.stringify({ lineageRendered: body })])).rows[0];
  await owner.query("INSERT INTO report_snapshots(run_id,organization_id,scope_type,scope_id,is_latest,snapshot_metadata,created_by) VALUES($1,$2,'project',$3,true,'{}'::json,$4)", [row.id, organizationId, String(projectId), actors.author.id]);
  return { id: Number(row.id), runUuid: String(row.run_uuid), projectId, body };
}
async function retainedBundle(runs: Run[], label: string): Promise<string> {
  const bundleId = randomUUID();
  const bundle = { bundleId, organizationId: orgId, name: `${TAG} ${label}`, createdAt: '2026-10-14T00:00:00.000Z', createdBy: actors.author.id,
    projectIds: [...new Set(runs.map(run => run.projectId))], runIds: runs.map(run => run.id), items: runs.map(run => ({ runId: run.id, runUuid: run.runUuid,
      reportTypeId: TYPE, reportTypeLabel: 'Synthetic native retained report', scopeType: 'project', scopeId: String(run.projectId),
      status: 'completed', confidence: 90, blockers: [], createdAt: run.body.generatedAt })) };
  const profile = Number((await owner.query('SELECT id FROM project_intelligence_profiles WHERE organization_id=$1 AND project_id=$2', [orgId, partial.projectId])).rows[0].id);
  await owner.query("INSERT INTO project_memory_entries(project_profile_id,project_id,organization_id,category,subcategory,title,content,source_document_type) VALUES($1,$2,$3,'regulatory','report_bundle_record',$4,$5,'report_os_state')", [profile, partial.projectId, orgId, `bundle:${bundleId}`, JSON.stringify({ bundleRecord: bundle })]);
  return bundleId;
}
async function provisionActors() {
  for (const key of ['author', 'reader', 'signer', 'scopeReader', 'roleReader'] as const) {
    const role = key === 'signer' || key === 'author' ? 'admin' : key === 'roleReader' ? 'manager' : 'member';
    const user = (await owner.query("INSERT INTO users(email,name,password_hash,status,default_organization_id) VALUES($1,$2,$3,'active',$4) RETURNING id", [`${TAG}-${key}@example.invalid`, `${TAG} ${key}`, await bcrypt.hash(PASSWORD, 4), orgId])).rows[0];
    await owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [orgId, user.id, role]);
    actors[key] = { id: Number(user.id), role, token: '' };
  }
  await new Promise(resolve => setTimeout(resolve, 1100));
  const { activeJwtSecret } = await import('../../server/utils/jwtVerify');
  for (const actor of Object.values(actors)) actor.token = jwt.sign({ type: 'access', userId: actor.id, organizationId: String(orgId), role: actor.role }, activeJwtSecret(), { expiresIn: '15m' });
}
async function assertRuntimePosture() {
  const identity = (await scope(() => getPool().query("SELECT current_database() AS database,current_user AS role,rolsuper,rolbypassrls,current_setting('app.rls_enforce') AS enforcement FROM pg_roles WHERE rolname=current_user"))).rows[0];
  expect(identity).toMatchObject({ database: new URL(databaseUrl).pathname.slice(1), role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on' });
  const stores = (await owner.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['public.report_runs'::regclass,'public.report_snapshots'::regclass,'public.project_memory_entries'::regclass,'public.project_members'::regclass,'public.project_visibility_settings'::regclass,'public.electronic_signatures'::regclass,'public.audit_logs'::regclass]) ORDER BY relname")).rows;
  expect(stores).toHaveLength(7); expect(stores.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  Object.assign(observations, { runtime: identity, stores, organizationId: orgId, actorIds: Object.fromEntries(Object.entries(actors).map(([key, actor]) => [key, actor.id])) });
}
beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('A real restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = (await owner.query("INSERT INTO organizations(name,slug,status,tier) VALUES($1,$1,'active','standard') RETURNING id,uuid", [TAG])).rows[0];
  orgId = Number(org.id); orgUuid = String(org.uuid);
  foreignOrg = Number((await owner.query("INSERT INTO organizations(name,slug,status,tier) VALUES($1,$1,'active','standard') RETURNING id", [`${TAG}-foreign`])).rows[0].id);
  await provisionActors();
  workspace = Number((await owner.query('INSERT INTO client_workspaces(organization_id,name,slug,created_by_id) VALUES($1,$2,$2,$3) RETURNING id', [orgId, TAG, actors.author.id])).rows[0].id);
  await owner.query("INSERT INTO report_type_registry(type_id,label,family,allowed_scopes,truthfulness_rules) VALUES($1,'Synthetic native retained report','readiness','[\"project\"]'::json,'{}'::json)", [TYPE]);
  await assertRuntimePosture();
  app = express(); app.use(express.json()); app.use('/api/report-os', (await import('../../server/routes/report-os')).default);
  finalized = await seedRun(await seedProject('finalized', actors.reader), 'FINAL');
  partial = await seedRun(await seedProject('partial', actors.reader), 'PARTIAL', true);
  privateRun = await seedRun(await seedProject('private'), 'PRIVATE');
  foreignRun = await seedRun(partial.projectId, 'FOREIGN', false, foreignOrg);
  const signed = await finalize(finalized); expect(signed.status, JSON.stringify(errorBody(signed))).toBe(200);
  const created = await request(app).post('/api/report-os/bundles').set(authorization(actors.reader)).send({ name: `${TAG} positive`, runIds: [partial.id, finalized.id] });
  expect(created.status, JSON.stringify(created.body)).toBe(201); positiveBundle = created.body.data.bundleId;
}, 120_000);
afterAll(async () => {
  if (process.env.REPORT_PACK_NATIVE_OBSERVATIONS) writeFileSync(process.env.REPORT_PACK_NATIVE_OBSERVATIONS, JSON.stringify(observations, null, 2) + '\n', { mode: 0o600 });
  await getPool().end(); await owner?.end(); // All invented history remains intact.
});

async function waitForLock(holderPid: number, kind: 'SHARE' | 'UPDATE', priorPid = 0) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const rows = (await owner.query("SELECT pid,query_start,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND usename='app_service' AND wait_event_type='Lock' AND query LIKE $1 AND ($2=ANY(pg_blocking_pids(pid)) OR $3=ANY(pg_blocking_pids(pid)))", [`%report_runs%FOR ${kind}%`, holderPid, priorPid])).rows;
    if (rows.length === 1) return rows[0] as { pid: number; query_start: Date; blockers: number[] };
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`No unique real report row ${kind} waiter reached the native barrier.`);
}
const observerCode = String.raw`
const {parentPort,workerData}=require('node:worker_threads');
const {Pool}=require('pg');
const inspect=new Pool({connectionString:workerData.ownerUrl,max:1});
const runtime=new Pool({connectionString:workerData.runtimeUrl,max:1});
const load=require('tsx/cjs/api').require;
const {applySessionScope,clearSessionScope}=load(workerData.root+'/server/db/sessionScope.ts',workerData.root+'/tests/db/report-pack-export.dbtest.ts');
(async()=>{
 let result={sourceQueryStart:null,afterSourceQueryStart:null,stableSourceMs:0,finalizerBlocked:false,withdrawalCommitted:false};
 let sourceStart=null,detectedAt=0,acted=false;
 try {
  await inspect.query('SELECT 1'); parentPort.postMessage({ready:true});
  const deadline=Date.now()+25000;
  while(Date.now()<deadline){
   const {rows}=await inspect.query('SELECT pid,state,query,query_start,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=ANY($1::int[])',[workerData.signerPid?[workerData.exportPid,workerData.signerPid]:[workerData.exportPid]]);
   const exporting=rows.find(r=>r.pid===workerData.exportPid),signing=rows.find(r=>r.pid===workerData.signerPid);
   if(exporting&&exporting.state==='idle in transaction'&&exporting.query==='SELECT name FROM public.actor_name($1)'){
    const start=exporting.query_start.toISOString();
    if(sourceStart!==start){sourceStart=start;detectedAt=Date.now();}
    const stable=Date.now()-detectedAt;
    if(stable>=40&&!acted){
     result.sourceQueryStart=start;result.stableSourceMs=stable;
     result.finalizerBlocked=Boolean(signing&&signing.blockers.includes(workerData.exportPid));
     if(workerData.mode!=='contention'){
      const q=await runtime.connect();
      try {
       await applySessionScope(q,{tenantId:String(workerData.orgId),orgUuid:workerData.orgUuid,role:'admin'});
       await q.query('BEGIN');
       const posture=(await q.query("SELECT current_user AS role,rolsuper,rolbypassrls,current_setting('app.rls_enforce') AS enforcement FROM pg_roles WHERE rolname=current_user")).rows[0];
       if(posture.role!=='app_service'||posture.rolsuper||posture.rolbypassrls||posture.enforcement!=='on')throw new Error('Invalid QA mutation runtime');
       result.mutationRuntime=posture;
       const changed=workerData.mode==='scope'
        ?await q.query("UPDATE project_members SET status='revoked' WHERE organization_id=$1 AND project_id=$2 AND user_id=$3 AND status='active'",[workerData.orgId,workerData.projectId,workerData.actorId])
        :await q.query("UPDATE organization_users SET role='viewer' WHERE organization_id=$1 AND user_id=$2 AND role='manager'",[workerData.orgId,workerData.actorId]);
       if(changed.rowCount!==1)throw new Error('QA withdrawal did not change exactly one row');
       await q.query('COMMIT');result.withdrawalCommitted=true;
      }catch(e){await q.query('ROLLBACK').catch(()=>{});throw e;}finally{await clearSessionScope(q);q.release();}
     }
     acted=true;
    }
   }else if(acted&&exporting&&exporting.query_start.toISOString()>result.sourceQueryStart){
    result.afterSourceQueryStart=exporting.query_start.toISOString();
    result.afterSourcePhase=/SELECT ou.role/.test(exporting.query)?'fresh-actor-read':/ROLLBACK/.test(exporting.query)?'rollback':/COMMIT/.test(exporting.query)?'commit':'later-transaction-query';
    parentPort.postMessage({result});return;
   }
   await new Promise(resolve=>setTimeout(resolve,1));
  }
  throw new Error('No verifiable actual source-to-late-read interval observed');
 }catch(error){parentPort.postMessage({error:'Native observer failed',code:error.code||'OBSERVER_FAILED'});}
 finally{await runtime.end();await inspect.end();}
})();`;
type ObserverFacts = { sourceQueryStart: string; afterSourceQueryStart: string; stableSourceMs: number; finalizerBlocked: boolean; withdrawalCommitted: boolean; afterSourcePhase: string };
async function startObserver(exportPid: number, mode: 'contention' | 'scope' | 'role', actor: Actor, run: Run, signerPid = 0) {
  const worker = new Worker(observerCode, { eval: true, workerData: { root: process.cwd(), ownerUrl: databaseUrl, runtimeUrl: process.env.APP_DATABASE_URL,
    exportPid, signerPid, mode, orgId, orgUuid, actorId: actor.id, projectId: run.projectId } });
  let readyResolve!: () => void;
  let doneResolve!: (facts: ObserverFacts) => void;
  let reject!: (error: Error) => void;
  const ready = new Promise<void>(resolve => { readyResolve = resolve; });
  const done = new Promise<ObserverFacts>((resolve, failure) => { doneResolve = resolve; reject = failure; });
  worker.on('message', message => { if (message.ready) readyResolve(); else if (message.result) doneResolve(message.result); else { readyResolve(); reject(new Error(`${message.error} (${message.code})`)); } });
  worker.on('error', error => { readyResolve(); reject(error); });
  await ready;
  return { done, stop: () => worker.terminate() };
}
async function holdRun(run: Run): Promise<{ client: PoolClient; pid: number }> {
  return scope(async () => {
    const client = await getPool().connect();
    await client.query('BEGIN'); await setTenantContextTx(client, orgId);
    const pid = Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await client.query('SELECT id FROM report_runs WHERE id=$1 AND organization_id=$2 FOR UPDATE', [run.id, orgId]);
    return { client, pid };
  });
}
function assertObservedInterval(facts: ObserverFacts) {
  expect(facts.stableSourceMs).toBeGreaterThanOrEqual(40);
  expect(new Date(facts.afterSourceQueryStart).getTime()).toBeGreaterThan(new Date(facts.sourceQueryStart).getTime());
}

describe('native retained complete report packets', () => {
  it('sends both retained bodies with exact-byte chained audit, saved order and real page ranges', async () => {
    const beforeSignatures = Number((await owner.query('SELECT count(*)::int AS n FROM electronic_signatures WHERE organization_id=$1', [orgId])).rows[0].n);
    const response = await packet(actors.reader, positiveBundle); expect(response.status, response.status >= 400 ? JSON.stringify(errorBody(response)) : '').toBe(200);
    const parsed = await parsedPdf(response.body); const text = parsed.text.replace(/\s+/g, ' ');
    for (const marker of ['BODY-FINAL Résumé 中文报告', 'END-OF-BODY-FINAL', 'END-OF-BODY-PARTIAL', 'ROW-PARTIAL-1199', 'CALCULATION-FINAL']) expect(text).toContain(marker);
    const rows = await exportsFor(positiveBundle); expect(rows).toHaveLength(1);
    const facts = rows[0].details; expect(facts).toMatchObject({ content: 'reports', runIds: [partial.id, finalized.id], sha256: digest(response.body), byteLength: response.body.length, pages: parsed.pages.length });
    expect(facts.constituents.map((item: { runId: number }) => item.runId)).toEqual([partial.id, finalized.id]);
    expect(facts.constituents[1]).toMatchObject({ sourceDocument: 'verified-sealed', sealVerdict: 'intact', statusAtRead: 'final' });
    expect(facts.constituents[0].lastPage).toBeLessThan(facts.constituents[1].firstPage);
    for (const page of parsed.pages.filter(page => page.num >= facts.constituents[0].firstPage && page.num <= facts.constituents[0].lastPage)) expect(page.text).toContain('NOT FINAL (COMPLETED)');
    for (const page of parsed.pages.filter(page => page.num >= facts.constituents[1].firstPage)) expect(page.text).not.toContain('NOT FINAL');
    expect(Number((await owner.query('SELECT count(*)::int AS n FROM electronic_signatures WHERE organization_id=$1', [orgId])).rows[0].n)).toBe(beforeSignatures);
    observe('positive', { bundleId: positiveBundle, byteLength: response.body.length, sha256: digest(response.body), pages: parsed.pages.length, auditId: rows[0].id, constituents: facts.constituents, signatureCount: beforeSignatures });
    if (process.env.REPORT_PACK_NATIVE_PDF) writeFileSync(process.env.REPORT_PACK_NATIVE_PDF, response.body, { mode: 0o600 });
  });
  it.each(['private', 'foreign', 'missing'] as const)('refuses the entire historical packet for a %s constituent without identifying it', async kind => {
    const selected = kind === 'private' ? privateRun : kind === 'foreign' ? foreignRun : { ...privateRun, id: 2_000_000_000, runUuid: randomUUID() };
    const bundleId = await retainedBundle([partial, selected], kind);
    const response = await packet(actors.reader, bundleId); expect(response.status).toBe(404);
    expect(errorBody(response)).toMatchObject({ error: { code: 'REPORT_BUNDLE_NOT_FOUND', message: 'Bundle not found.' } });
    expect(response.headers['content-disposition']).toBeUndefined(); expect(response.body.subarray(0, 4).toString()).not.toBe('%PDF');
    expect(JSON.stringify(errorBody(response))).not.toContain('PRIVATE'); expect(await exportsFor(bundleId)).toEqual([]);
    observe(kind, { bundleId, status: response.status, code: errorBody(response).error.code, exportAuditCount: 0 });
  });
  it('holds the real report reservation through rendering before the canonical finalizer can change its status', async () => {
    const run = await seedRun(await seedProject('contended', actors.reader), 'CONTENDED', true);
    const bundleId = await retainedBundle([run], 'contention');
    const holder = await holdRun(run); let observer: Awaited<ReturnType<typeof startObserver>> | undefined;
    try {
      const exporting = packet(actors.reader, bundleId); const exportWait = await waitForLock(holder.pid, 'SHARE');
      const signing = finalize(run); const signerWait = await waitForLock(holder.pid, 'UPDATE', exportWait.pid);
      observer = await startObserver(exportWait.pid, 'contention', actors.reader, run, signerWait.pid);
      await holder.client.query('COMMIT');
      const [response, signed, interval] = await Promise.all([exporting, signing, observer.done]);
      expect(response.status).toBe(200); expect(signed.status, JSON.stringify(errorBody(signed))).toBe(200);
      assertObservedInterval(interval); expect(interval.finalizerBlocked).toBe(true);
      const first = (await exportsFor(bundleId))[0].details.constituents[0]; expect(first).toMatchObject({ statusAtRead: 'completed', sourceDocument: 'retained-run-render', sealVerdict: null });
      const after = await packet(actors.reader, bundleId); expect(after.status).toBe(200);
      expect((await exportsFor(bundleId))[1].details.constituents[0]).toMatchObject({ statusAtRead: 'final', sourceDocument: 'verified-sealed', sealVerdict: 'intact' });
      observe('contention', { runId: run.id, bundleId, exportPid: exportWait.pid, signerPid: signerWait.pid, interval, priorExport: first, finalStatus: signed.status });
    } finally { await holder.client.query('ROLLBACK').catch(() => undefined); holder.client.release(); await observer?.stop(); }
  });
  it.each(['scope', 'role'] as const)('refuses an observed %s withdrawal during actual PDF work before any bytes leave', async kind => {
    const actor = kind === 'scope' ? actors.scopeReader : actors.roleReader;
    const run = await seedRun(await seedProject(`${kind} withdrawal`, kind === 'scope' ? actor : undefined), `WITHDRAW-${kind}`, true);
    const bundleId = await retainedBundle([run], `${kind} withdrawal`);
    const holder = await holdRun(run); let observer: Awaited<ReturnType<typeof startObserver>> | undefined;
    try {
      const exporting = packet(actor, bundleId); const waiting = await waitForLock(holder.pid, 'SHARE');
      observer = await startObserver(waiting.pid, kind, actor, run); await holder.client.query('COMMIT');
      const [response, interval] = await Promise.all([exporting, observer.done]);
      assertObservedInterval(interval); expect(interval.withdrawalCommitted).toBe(true);
      expect(response.status).toBe(404); expect(errorBody(response)).toMatchObject({ error: { code: 'REPORT_BUNDLE_NOT_FOUND' } });
      expect(response.headers['content-disposition']).toBeUndefined(); expect(await exportsFor(bundleId)).toEqual([]);
      observe(`${kind}Withdrawal`, { runId: run.id, bundleId, status: response.status, interval, exportAuditCount: 0 });
    } finally { await holder.client.query('ROLLBACK').catch(() => undefined); holder.client.release(); await observer?.stop(); }
  });
  it('fails closed on a real executor fault rather than assuming a verified standard plan', async () => {
    await runtimeTx(async client => {
      const positive = await requireReportEntitlement(orgId, TYPE, 'readiness', client); expect(positive).toMatchObject({ tier: 'standard', tierResolved: true, entitled: true });
      await expect(client.query('SELECT 1/0')).rejects.toMatchObject({ code: '22012' });
      const refusal = await requireReportEntitlement(orgId, TYPE, 'readiness', client); expect(refusal).toMatchObject({ tier: 'standard', tierResolved: false, entitled: false });
      observe('resolverFault', { faultCode: '22012', positive, refusal, executor: 'actual tenant-stamped app_service transaction' });
      await client.query('ROLLBACK'); // Clear the actual transaction error before the wrapper completes.
    });
  });
});
