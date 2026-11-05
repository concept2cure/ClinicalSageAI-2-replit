/** Executes the COMPLETE production prefix. Source readers, DB, canonical project
 * lookup and time are explicit controlled collaborators, not live integrations.
 * No model, network, tenant authorization, or clinical calculation is simulated
 * as a successful live workflow. Run: node --test <this file>. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(process.env.C2C_TS_PATH || 'typescript');
const root = process.env.C2C_RECALL_SOURCE_ROOT || path.resolve(__dirname, '../../..');
const sourcePath = 'server/services/lumen-context/intelligence-prefix.ts';
const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
const compiled = ts.transpileModule(source, { fileName: sourcePath,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true });
assert.equal(compiled.diagnostics.length, 0, 'production module must parse');
const PROGRAM = '7abb1c22-1234-4abc-8def-0123456789ab';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i=0; i<60; i++) await Promise.resolve(); };
function harness() {
  let now=1_000_000, serial=0;
  const timers=new Map(), calls={client:[],project:[],wisdom:[],objective:[],resolve:[]}, logs=[];
  const handlers={
    client: async org => `CLIENT_${org}`,
    project: async (id,org) => `PROJECT_${id}_ORG_${org}`,
    wisdom: async () => null,
    objective: async (_db,{orgId,projectId}) => `OBJECTIVE_${projectId}_ORG_${orgId}`,
    resolve: async (_load,{ref}) => {
      if (String(ref).trim().toLowerCase()===PROGRAM) return 42;
      if (!/^[1-9][0-9]*$/.test(String(ref))) return null;
      return Number.isSafeInteger(Number(ref)) ? Number(ref) : null;
    },
  };
  const wrap = key => (...args) => { calls[key].push(args); return handlers[key](...args); };
  const imports={
    '../client-intelligence-memory.js': {buildClientIntelligenceContext:wrap('client'), buildProjectIntelligenceContext:wrap('project')},
    '../c2c/project-ref.js': {integerProjectForRef:wrap('resolve')},
    '../ana-wisdom-engine.js': {buildWisdomContext:wrap('wisdom')},
    '../../db.js': {db:{tag:'controlled-db'}},
    '../c2c/charter-objectives.js': {readProjectObjectives:wrap('objective'),objectivesContextBlock: value=>value},
  };
  const mod={exports:{}};
  class Clock extends Date { static now(){return now;} }
  const context=vm.createContext({module:mod,exports:mod.exports,Date:Clock,AbortController,
    console:{warn:(...args)=>logs.push(args)},
    setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;},
    clearTimeout:id=>timers.delete(id),
    require:id=>{assert.ok(Object.hasOwn(imports,id),`unexpected import ${id}`);return imports[id];},
  });
  new vm.Script(compiled.outputText,{filename:sourcePath}).runInContext(context);
  return {...mod.exports,handlers,calls,logs,timers,
    async advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();},
    async waitFor(predicate){await flush();assert.ok(predicate(),'expected source call did not start');},
  };
}
function noOld(value){assert.doesNotMatch(value,/RETIRED_/);assert.match(value,/Intelligence recall unavailable/);}

test('completed project context is cached with objective and intelligence intact',async()=>{
  const h=harness(); const a=await h.getIntelligencePrefix(7,42), b=await h.getIntelligencePrefix(7,42);
  assert.equal(a,b);assert.match(a,/OBJECTIVE_42_ORG_7/);assert.match(a,/PROJECT_42_ORG_7/);
  assert.equal(h.calls.project.length,1);assert.equal(h.calls.client.length,0);assert.equal(h.timers.size,0);
});
test('healthy empty organization context is cached as a successful empty result',async()=>{
  const h=harness();h.handlers.client=async()=>null;
  assert.equal(await h.getIntelligencePrefix(7),'');assert.equal(await h.getIntelligencePrefix(7),'');assert.equal(h.calls.client.length,1);
});
test('the existing sixty-second TTL expires without extending on reads',async()=>{
  const h=harness();await h.getIntelligencePrefix(7,42);await h.advance(59_999);await h.getIntelligencePrefix(7,42);
  assert.equal(h.calls.project.length,1);await h.advance(1);await h.getIntelligencePrefix(7,42);assert.equal(h.calls.project.length,2);
});
test('missing organization still queries nothing',async()=>{
  const h=harness();assert.equal(await h.getIntelligencePrefix(undefined,42),'');assert.equal(Object.values(h.calls).flat().length,0);
});
test('organization and project scopes and different organizations do not share a result',async()=>{
  const h=harness();const values=await Promise.all([h.getIntelligencePrefix(7),h.getIntelligencePrefix(7,42),h.getIntelligencePrefix(8,42),h.getIntelligencePrefix(7,43)]);
  assert.match(values[0],/CLIENT_7/);assert.doesNotMatch(values[1],/CLIENT/);assert.match(values[2],/ORG_8/);assert.match(values[3],/PROJECT_43/);
});
test('number and matching string keep the existing project-key equivalence',async()=>{
  const h=harness();assert.equal(await h.getIntelligencePrefix(7,42),await h.getIntelligencePrefix(7,'42'));assert.equal(h.calls.project.length,1);
});
test('normalized program reference still differs from its leading numeric characters',async()=>{
  const h=harness();await h.getIntelligencePrefix(7,PROGRAM);await h.getIntelligencePrefix(7,` ${PROGRAM.toUpperCase()} `);await h.getIntelligencePrefix(7,7);
  assert.deepEqual(h.calls.project.map(c=>c[0]),[42,7]);
});
for(const ref of [undefined,42,PROGRAM]) test(`overlapping reads for ${ref??'organization'} share one source recall`,async()=>{
  const h=harness(), gate=deferred();const source=ref===undefined?'client':'project';h.handlers[source]=()=>gate.promise;
  const a=h.getIntelligencePrefix(7,ref),b=h.getIntelligencePrefix(7,ref);await h.waitFor(()=>h.calls[source].length>0);
  gate.resolve('CURRENT_SHARED');const [x,y]=await Promise.all([a,b]);assert.equal(x,y);assert.match(x,/CURRENT_SHARED/);assert.equal(h.calls[source].length,1);
  if(ref!==undefined){assert.equal(h.calls.objective.length,1);assert.equal(h.calls.wisdom.length,1);}assert.equal(h.timers.size,0);
});
for(const source of ['client','project','objective','wisdom']) test(`invalidating an in-flight ${source} prevents retired text returning or caching`,async()=>{
  const h=harness(),gate=deferred(),ref=source==='client'?undefined:42;
  const fresh=h.handlers[source];h.handlers[source]=()=>gate.promise;
  const old=h.getIntelligencePrefix(7,ref);await h.waitFor(()=>h.calls[source].length===1);h.invalidateIntelligencePrefix(7,ref);h.handlers[source]=fresh;
  gate.resolve(source==='wisdom'?{projectRisks:[],projectLesson:'RETIRED_LESSON',engineVersion:1}:'RETIRED_SOURCE');
  noOld(await old);const next=await h.getIntelligencePrefix(7,ref);assert.doesNotMatch(next,/RETIRED_/);assert.equal(h.calls[source].length,2);
});
for(const source of ['client','project','objective']) test(`late ${source} cannot replace a newer successful snapshot`,async()=>{
  const h=harness(),gate=deferred(),ref=source==='client'?undefined:42;const fresh=h.handlers[source];h.handlers[source]=()=>gate.promise;
  const old=h.getIntelligencePrefix(7,ref);await h.waitFor(()=>h.calls[source].length===1);h.invalidateIntelligencePrefix(7,ref);h.handlers[source]=fresh;
  const current=await h.getIntelligencePrefix(7,ref);gate.resolve('RETIRED_SOURCE');noOld(await old);
  assert.equal(await h.getIntelligencePrefix(7,ref),current);assert.equal(h.calls[source].length,2);
});
test('invalidation during project resolution does not start dependent source reads',async()=>{
  const h=harness(),gate=deferred();h.handlers.resolve=()=>gate.promise;const old=h.getIntelligencePrefix(7,PROGRAM);
  await h.waitFor(()=>h.calls.resolve.length===1);h.invalidateIntelligencePrefix(7,PROGRAM);gate.resolve(42);noOld(await old);
  assert.equal(h.calls.project.length,0);assert.equal(h.calls.objective.length,0);assert.equal(h.calls.wisdom.length,0);assert.equal(h.calls.client.length,0);
});
test('two successive invalidations cannot revive either retired attempt',async()=>{
  const h=harness(),a=deferred(),b=deferred();h.handlers.project=()=>a.promise;
  const p1=h.getIntelligencePrefix(7,42);await h.waitFor(()=>h.calls.project.length===1);h.invalidateIntelligencePrefix(7,42);h.handlers.project=()=>b.promise;
  const p2=h.getIntelligencePrefix(7,42);await h.waitFor(()=>h.calls.project.length===2);h.invalidateIntelligencePrefix(7,42);h.handlers.project=async()=> 'LATEST';
  const current=await h.getIntelligencePrefix(7,42);b.resolve('RETIRED_SECOND');a.resolve('RETIRED_FIRST');noOld(await p1);noOld(await p2);
  assert.equal(await h.getIntelligencePrefix(7,42),current);assert.match(current,/LATEST/);assert.equal(h.calls.project.length,3);
});
test('an invalidated malformed source cannot delete the replacement cache',async()=>{
  const h=harness(),gate=deferred();h.handlers.wisdom=()=>gate.promise;const old=h.getIntelligencePrefix(7,42);await h.waitFor(()=>h.calls.wisdom.length===1);
  h.invalidateIntelligencePrefix(7,42);h.handlers.wisdom=async()=>null;const current=await h.getIntelligencePrefix(7,42);
  gate.resolve({projectRisks:null,privateMessage:'RETIRED_PRIVATE'});noOld(await old);assert.equal(await h.getIntelligencePrefix(7,42),current);assert.equal(h.calls.project.length,2);
});
test('failed replacement recall cannot make an older result current again',async()=>{
  const h=harness(),gate=deferred();h.handlers.project=()=>gate.promise;const old=h.getIntelligencePrefix(7,42);await h.waitFor(()=>h.calls.project.length===1);
  h.invalidateIntelligencePrefix(7,42);h.handlers.project=async()=>{throw Error('synthetic source error');};
  assert.match(await h.getIntelligencePrefix(7,42),/Intelligence recall unavailable/);gate.resolve('RETIRED_SOURCE');noOld(await old);
  h.handlers.project=async()=> 'RECOVERED';assert.match(await h.getIntelligencePrefix(7,42),/RECOVERED/);assert.equal(h.calls.project.length,3);
});
for(const blank of ['   ','\t','\n']) test(`explicit whitespace ${JSON.stringify(blank)} never reuses warm organization recall`,async()=>{
  const h=harness();await h.getIntelligencePrefix(7);const invalid=await h.getIntelligencePrefix(7,blank);
  assert.doesNotMatch(invalid,/CLIENT_7/);assert.equal(h.calls.client.length,1);assert.equal(h.calls.project.length,0);
});
test('a whitespace-project result cannot suppress later organization recall',async()=>{
  const h=harness();await h.getIntelligencePrefix(7,'  ');assert.match(await h.getIntelligencePrefix(7),/CLIENT_7/);assert.equal(h.calls.client.length,1);
});
test('invalidating whitespace-project scope does not delete the organization snapshot',async()=>{
  const h=harness();await h.getIntelligencePrefix(7);h.invalidateIntelligencePrefix(7,'  ');await h.getIntelligencePrefix(7);assert.equal(h.calls.client.length,1);
});
test('omitted and existing empty-string sentinels still mean organization context',async()=>{
  const h=harness();const result=await h.getIntelligencePrefix(7);assert.equal(await h.getIntelligencePrefix(7,''),result);assert.equal(await h.getIntelligencePrefix(7,null),result);assert.equal(h.calls.client.length,1);
});
test('invalidating one project leaves another project and organization snapshot intact',async()=>{
  const h=harness();await h.getIntelligencePrefix(7);await h.getIntelligencePrefix(7,42);await h.getIntelligencePrefix(7,43);
  h.invalidateIntelligencePrefix(7,42);await h.getIntelligencePrefix(7);await h.getIntelligencePrefix(7,43);await h.getIntelligencePrefix(7,42);
  assert.equal(h.calls.client.length,1);assert.deepEqual(h.calls.project.map(c=>c[0]),[42,43,42]);
});
test('organization-only invalidation preserves the existing project-specific semantics',async()=>{
  const h=harness();await h.getIntelligencePrefix(7);await h.getIntelligencePrefix(7,42);h.invalidateIntelligencePrefix(7);
  await h.getIntelligencePrefix(7);await h.getIntelligencePrefix(7,42);assert.equal(h.calls.client.length,2);assert.equal(h.calls.project.length,1);
});
test('invalidation remains isolated between organizations with the same project reference',async()=>{
  const h=harness(),gate=deferred();h.handlers.project=(id,org)=>org===7?gate.promise:Promise.resolve('OTHER_ORG');
  const old=h.getIntelligencePrefix(7,42);await h.waitFor(()=>h.calls.project.length===1);const other=await h.getIntelligencePrefix(8,42);
  h.invalidateIntelligencePrefix(7,42);gate.resolve('RETIRED_ORG');noOld(await old);assert.equal(await h.getIntelligencePrefix(8,42),other);
});
test('cache size remains bounded to 200 completed entries',async()=>{
  const h=harness();for(let id=1;id<=201;id++) await h.getIntelligencePrefix(7,id);
  await h.getIntelligencePrefix(7,1);assert.equal(h.calls.project.length,202);
});
test('evicted pending read cannot reinsert itself or evict a newer entry',async()=>{
  const h=harness(),gate=deferred();h.handlers.project=id=>id===1?gate.promise:Promise.resolve(`P_${id}`);
  const old=h.getIntelligencePrefix(7,1);await h.waitFor(()=>h.calls.project.length===1);
  for(let id=2;id<=201;id++) await h.getIntelligencePrefix(7,id);
  gate.resolve('RETIRED_EVICTED');noOld(await old);const count=h.calls.project.length;await h.getIntelligencePrefix(7,2);assert.equal(h.calls.project.length,count);
});
test('timeout keeps healthy context, clears the pending entry, and permits recovery',async()=>{
  const h=harness(),gate=deferred();h.handlers.project=()=>gate.promise;const first=h.getIntelligencePrefix(7,42);await h.waitFor(()=>h.calls.project.length===1);
  await h.advance(3000);const degraded=await first;assert.match(degraded,/Intelligence recall unavailable/);assert.match(degraded,/OBJECTIVE_42_ORG_7/);
  h.handlers.project=async()=> 'RECOVERED';const current=await h.getIntelligencePrefix(7,42);gate.resolve('RETIRED_LATE');await flush();assert.equal(await h.getIntelligencePrefix(7,42),current);assert.match(current,/RECOVERED/);assert.equal(h.timers.size,0);
});
test('the dependent recalls share the original three-second deadline',async()=>{
  const h=harness(),anchor=deferred(),project=deferred();h.handlers.resolve=()=>anchor.promise;h.handlers.project=()=>project.promise;
  let settled=false;const pending=h.getIntelligencePrefix(7,PROGRAM).then(v=>{settled=true;return v;});await h.waitFor(()=>h.calls.resolve.length===1);
  await h.advance(2000);anchor.resolve(42);await h.waitFor(()=>h.calls.project.length===1);await h.advance(999);assert.equal(settled,false);
  await h.advance(1);assert.equal(settled,true);assert.match(await pending,/Intelligence recall unavailable/);project.resolve('RETIRED_LATE');await flush();assert.equal(h.timers.size,0);
});
test('invalidation of stalled recall preserves the deadline and withholds retired partial context',async()=>{
  const h=harness(),gate=deferred();h.handlers.project=()=>gate.promise;const old=h.getIntelligencePrefix(7,42);await h.waitFor(()=>h.calls.project.length===1);
  h.invalidateIntelligencePrefix(7,42);await h.advance(3000);noOld(await old);gate.resolve('RETIRED_LATE');await flush();assert.equal(h.timers.size,0);
});
test('malformed wisdom fails visibly without caching failure or logging raw source error details',async()=>{
  const h=harness();h.handlers.wisdom=async()=>({get projectRisks(){throw Error('RETIRED_PRIVATE_DSN');}});
  assert.match(await h.getIntelligencePrefix(7,42),/Intelligence recall unavailable/);
  assert.ok(h.logs.every(args=>args.length===1 && typeof args[0]==='string' && !args[0].includes('RETIRED_PRIVATE_DSN')));
  h.handlers.wisdom=async()=>null;assert.match(await h.getIntelligencePrefix(7,42),/PROJECT_42_ORG_7/);assert.equal(h.calls.project.length,2);
});
test('source rejection retains healthy project objective and is retried next turn',async()=>{
  const h=harness();h.handlers.project=async()=>{throw Error('unavailable');};const result=await h.getIntelligencePrefix(7,42);
  assert.match(result,/OBJECTIVE_42_ORG_7/);assert.match(result,/project intelligence/);h.handlers.project=async()=> 'RECOVERED';assert.match(await h.getIntelligencePrefix(7,42),/RECOVERED/);
});
