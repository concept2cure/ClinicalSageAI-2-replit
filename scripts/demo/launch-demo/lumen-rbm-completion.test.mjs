/** Actual seed CLI + RBM pack + step runner; synthetic HTTP only. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourceUrl = file => pathToFileURL(join(ROOT, file)).href;
const fixtureApi = `
import { ACTIONS, ASSESSMENT_TITLE, CTQ_FACTORS, EXTRACTS, KRIS, PERIOD_DAYS_AGO, PLAN, QTLS, SIGNALS, SUBJECT_EXTRACT, SUBJECTS }
  from ${JSON.stringify(sourceUrl('scripts/demo/launch-demo/packs/lumen-rbm-content.mjs'))};
export const PROGRAM = '11111111-2222-4333-8444-555555555555';
const ok = data => ({status:200,json:{data},text:''});
const board = () => ({governingPlanId:9,assessment:{id:1},items:[{}],plan:{id:9,status:'draft'},actions:[{}],freshness:[{source:'edc',ageDays:0}],attention:[],
  summary:{overallRisk:'medium',riskItems:{total:CTQ_FACTORS.length},kris:{total:KRIS.length,notEvaluated:0,red:1,amber:1},qtls:{total:QTLS.length,notEvaluated:0,approaching:1},
    signals:{total:SIGNALS.length,open:0},patients:{scored:process.env.SUBJECT_STATUS==='201'?SUBJECTS.length:0,flagged:0,review:0},sites:{total:0}}});
export async function api(method,url,body) {
  if(url==='/api/task-management/assignees')return ok([]);
  if(url.startsWith('/api/mdx/rbm-assessments?'))return ok([{id:1,title:ASSESSMENT_TITLE,status:'draft',version:1}]);
  if(url.startsWith('/api/mdx/rbm-risk-items?'))return ok(CTQ_FACTORS.map(f=>({ctq_factor:f.factor})));
  if(url.startsWith('/api/mdx/rbm-kris?'))return ok(KRIS.map((k,i)=>({id:i+1,name:k.name})));
  if(url.startsWith('/api/mdx/rbm-qtls?'))return ok(QTLS.map(q=>({parameter:q.parameter})));
  if(url.startsWith('/api/mdx/rbm-data-runs?'))return ok([
    ...PERIOD_DAYS_AGO.flatMap((_,i)=>EXTRACTS.map(x=>({status:'succeeded',source_ref:x.ref(i+1)}))),
    ...(process.env.ALREADY_LOADED==='1'?[{status:'succeeded',source_ref:SUBJECT_EXTRACT.ref}]:[])]);
  if(url==='/api/mdx/rbm-metric-ingest'&&method==='POST'){
    if(body.sourceRef!==SUBJECT_EXTRACT.ref)throw Error('Unexpected monthly rewrite');
    if(process.env.ALREADY_LOADED==='1')throw Error('Already-loaded subject extract was written again');
    return {status:Number(process.env.SUBJECT_STATUS),text:'synthetic intake refusal',json:{data:{projection:{subjectProfiles:SUBJECTS.length}}}};
  }
  if(url.startsWith('/api/mdx/rbm-patient-profiles?'))return ok(process.env.SUBJECT_STATUS==='201'?SUBJECTS.map(s=>({subject_id:s.id,scored_at:'2026-11-06'})):[]);
  if(url.startsWith('/api/mdx/rbm-monitoring-plans?'))return ok([{id:9,title:PLAN.title,status:'draft',version:1}]);
  if(url.startsWith('/api/mdx-rbm/rbm-board/'))return ok(board());
  if(url.startsWith('/api/mdx/rbm-signals?'))return ok(SIGNALS.map((s,i)=>({id:i+1,title:s.title,status:'closed'})));
  if(url.startsWith('/api/mdx/rbm-monitoring-actions?'))return ok(ACTIONS.map(a=>({description:a.description})));
  if(url==='/api/mdx-rbm/rbm-programs')return ok([{id:PROGRAM}]);
  throw Error('Unexpected synthetic HTTP: '+method+' '+url);
}
`;

function runSeed(t, status, alreadyLoaded = false) {
  const directory = mkdtempSync(join(tmpdir(), 'c2c-rbm-completion-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'packs'));
  writeFileSync(join(directory, 'seed.mjs'), readFileSync(join(ROOT, 'scripts/demo/launch-demo/seed.mjs')));
  writeFileSync(join(directory, 'http.mjs'), fixtureApi);
  writeFileSync(join(directory, 'lib.mjs'), `
    export {makeRun} from ${JSON.stringify(sourceUrl('scripts/demo/launch-demo/lib.mjs'))};
    import {api} from './http.mjs';
    export const connect=async()=>({api,baseUrl:'',identity:{email:'author@example.test',userId:7,organizationId:42},preflight:{}});
    export const ensureDemoPlan=async()=>({locked:[]});
  `);
  writeFileSync(join(directory, 'packs/lumen.mjs'), `
    import {ensureLumenRbm} from ${JSON.stringify(sourceUrl('scripts/demo/launch-demo/packs/lumen-rbm.mjs'))};
    import {PROGRAM} from '../http.mjs';
    export const seed=async ctx=>ensureLumenRbm({...ctx,tally:{found(){},created(){}}},{id:PROGRAM},'synthetic project');
  `);
  const result = spawnSync(process.execPath, [join(directory, 'seed.mjs'), '--pack', 'lumen'], {
    encoding: 'utf8', timeout: 10_000, env: { ...process.env, DEMO_BASE_URL: '',
      DEMO_MANIFEST_ROOT: join(directory, 'manifests'), SUBJECT_STATUS: String(status), ALREADY_LOADED: alreadyLoaded ? '1' : '0' },
  });
  assert.equal(result.error, undefined, result.error?.message);
  const manifest = JSON.parse(readFileSync(join(directory, 'manifests/lumen/manifest.json'), 'utf8'));
  return { ...result, manifest };
}

for (const status of [403, 429, 500]) {
  test(`required subject intake HTTP${status} fails the actual seed CLI and manifest`, t => {
    const result = runSeed(t, status);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(result.manifest.outcome, 'failed');
    assert.match(result.manifest.notes.join('\n'), new RegExp('HTTP ' + status));
    assert.doesNotMatch(result.stdout, /patient cohort scored.*ok/);
  });
}
test('successful required subject intake completes without signing the optional RACT', t => {
  const result = runSeed(t, 201);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.manifest.outcome, 'seeded_unqualified');
  assert.match(result.stdout, /not executed.*signer/);
  assert.doesNotMatch(result.stdout, /FAILED/);
});
test('an already-loaded subject extract completes without resubmitting it', t => {
  const result = runSeed(t, 201, true);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.manifest.outcome, 'seeded_unqualified');
  assert.match(result.stdout, /subject-level extract.*already loaded/);
});
