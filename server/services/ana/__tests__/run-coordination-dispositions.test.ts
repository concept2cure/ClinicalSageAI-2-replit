/**
 * Expanded spike check 1 (§14.4): a parent's decision on a worker's report is
 * rebuilt from the decision audit alone, without conversation text. Acceptance
 * is proven in turn-plan-and-context.test.ts ("reconstructs assignment, peer
 * request, report, refusal and explicit parent assessment"); these are the
 * other two decisions, rework and rejection, on the same canonical tables
 * (support/coordination-fixture.ts).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { coordinationSha256, readRunCoordination, coordinationRefusalReceipt } from '../run-events';
import type { WorkerEstimate, WorkerPhase, WorkerSnapshot } from '@shared/ana/turn-timeline';
import { runWithTenantScope } from '../../../db/tenantStore';
import { syntheticCurrentPolicyClient } from './support/source-read-tool-fixture';
import { assignment, fixture, pool, seedCoordinationMember, setupCoordinationFixture, subject } from './support/coordination-fixture';
import { draftSourceIdentityForText } from '../draft-source-identity';
import type { DraftSource } from '../draft-project-sources';

// The check handlers and advisory gateway are controlled transport premises;
// the actual runSubAgent host, counters, coordinator and audited replay run.
const agentClock = vi.hoisted(() => ({ now: 0,held: 0,modelCalls: 0,advisoryFails:false,advisoryAt:0,sourceLoads:0,sourceRechecks:0,
  moduleLoadMs:0,samples:Array<number|null>() }));
// Observe the actual measurement helper's result without supplying timings.
vi.mock('../sub-agent-stream',async importOriginal => {
  const actual=await importOriginal<typeof import('../sub-agent-stream')>();
  return {...actual,executeMeasuredAgentCheck:async (...args:Parameters<typeof actual.executeMeasuredAgentCheck>) => {
    const measured=await actual.executeMeasuredAgentCheck(...args);
    agentClock.samples.push(measured.elapsedMs);return measured;
  }};
});
vi.mock('../../ai-gateway/gateway', async () => {
  const { modelCallRefusal } = await import('../../ai-gateway/model-call-scope');
  return { getGateway: () => ({ route: async () => {
    if (modelCallRefusal()) throw new Error('fixture model scope refuses a check');
    agentClock.advisoryAt=agentClock.now; agentClock.modelCalls++; agentClock.now += 10_000;
    if (agentClock.advisoryFails) throw new Error('Scripted advisory transport unavailable');
    return { content:'Advisory report only.',toolUses:[],usage:{},provider:'anthropic',model:'fixture-advisory',requestId:'fixture-request' };
  } }) };
});
// Controlled source-loader/current-read premises measure the whole optional
// aggregate. Source authorization is covered by the adjacent verifier suites.
vi.mock('../draft-project-sources',async importOriginal => {
  const actual=await importOriginal<typeof import('../draft-project-sources')>();
  const {modelCallRefusal}=await import('../../ai-gateway/model-call-scope');
  agentClock.now+=100_000;agentClock.moduleLoadMs+=100_000; // Outside every check sample.
  return {...actual,loadDraftProjectSources:async () => {
    expect(modelCallRefusal()).toMatchObject({tool:'read_project_document'});
    agentClock.sourceLoads++;agentClock.now+=50;
    return {status:'loaded',sources:[measuredSource()]};
  },assertDraftSourceContextCurrent:async () => {agentClock.sourceRechecks++;agentClock.now+=7;},
  draftSourceSensitivityTiers:() => [3]};
});

describe('run coordination decisions (spike check 1)', () => {
  beforeAll(() => setupCoordinationFixture(), 180_000);
  afterAll(async () => { await fixture?.close(); });
  beforeEach(seedCoordinationMember);
  registerMeasuredWorkerCases();
  registerEstimateLedgerCases();
  registerRecipientLifecycleCases();

  it('records a measured checking estimate before projection and reconstructs the exact immutable basis', async () => {
    const broadcastReads: Array<Promise<void>> = [];
    const { scope,host } = await subject(pool,projection => {
      broadcastReads.push(pool.query("SELECT new_values FROM audit_logs WHERE record_id=$1 AND new_values->>'eventId'=$2",
        [scope.runId,projection.receipt.eventId]).then(result => {
        expect(result.rows).toHaveLength(1);
      }));
    });
    const worker = await host.assign({ ...assignment('eta-verifier'),role:'verify' });
    const estimate: WorkerEstimate = { basis:'observed_check_durations',scope:'remaining_checks',lowerMs:200,upperMs:600,
      sampleCount:3,at:'2026-11-13T12:00:00.000Z' };
    const input = { intentId:'measured-checks',completed:3,total:5,basisKind:'deterministic_checks' as const,estimate };
    const progress = await host.progress(worker.handle,'checking',input);
    expect(progress.snapshot.estimate).toEqual(estimate);
    expect((await readRunCoordination(pool,scope)).workers[0].estimate).toEqual(estimate);
    expect((await host.progress(worker.handle,'checking',input)).receipt).toEqual(progress.receipt);
    await expect(host.progress(worker.handle,'checking',{ ...input,estimate:{...estimate,upperMs:601} }))
      .rejects.toMatchObject({code:'COORDINATION_INTENT_CHANGED'});
    await expect(host.progress(worker.handle,'checking',{ ...input,estimate:{...estimate,at:'2026-11-13T12:00:01.000Z'} }))
      .rejects.toMatchObject({code:'COORDINATION_INTENT_CHANGED'});
    expect(Object.isFrozen(progress.snapshot.estimate)).toBe(true);
    estimate.upperMs=900;
    expect(progress.snapshot.estimate?.upperMs).toBe(600);
    expect((await readRunCoordination(pool,scope)).workers[0].estimate?.upperMs).toBe(600);
    await Promise.all(broadcastReads);
  });

  it('reconstructs rework and rejection, each bound to its report, from the audit alone without the reasons', async () => {
    const { scope, source, host } = await subject();
    const drafter = await host.assign({ ...assignment('rework-draft'), source });
    const verifier = await host.assign({ ...assignment('reject-verify'), role: 'verify', parentStep: 's2', source });
    const shaOf = (kind: string) => coordinationSha256(JSON.stringify({ kind, semanticVerified: false }));
    const draftReport = await host.report(drafter.handle, { intentId: 'draft-report', reportSha256: shaOf('draft'), source,
      outcome: 'completed', completed: 2, total: 2, basisKind: 'deterministic_checks' });
    const verifyReport = await host.report(verifier.handle, { intentId: 'verify-report', reportSha256: shaOf('verify'), source,
      outcome: 'completed', completed: 1, total: 1, basisKind: 'deterministic_checks' });
    await host.assess({ intentId: 'send-back', worker: 'w1', reportEventId: draftReport.receipt.eventId, reportSha256: shaOf('draft'),
      decision: 'rework', reason: 'Section 2.7.3 omits the per-protocol population.' });
    await host.assess({ intentId: 'decline', worker: 'w2', reportEventId: verifyReport.receipt.eventId, reportSha256: shaOf('verify'),
      decision: 'rejected', reason: 'The check ran against a superseded source version.' });
    // A decision cannot be attached to a report it was not taken on.
    await expect(host.assess({ intentId: 'cross-wired', worker: 'w2', reportEventId: draftReport.receipt.eventId, reportSha256: shaOf('draft'),
      decision: 'rejected', reason: 'Bound to the other worker report.' })).rejects.toMatchObject({ code: 'COORDINATION_REPORT_CHANGED' });

    const replay = await readRunCoordination(pool, scope);
    expect(Object.fromEntries(replay.workers.map(worker => [worker.worker, worker.parentDisposition]))).toEqual({ w1: 'rework', w2: 'rejected' });
    const rows = (await pool.query("SELECT new_values FROM audit_logs WHERE record_id=$1 ORDER BY chain_seq", [scope.runId])).rows
      .map(row => row.new_values as { operation: string; worker?: string; reasonSha256?: string;
        snapshot?: { parentDisposition?: string }; basis?: Array<{ kind: string; ref: string; sha256?: string }> });
    expect(rows.map(row => row.operation)).toEqual(['assigned', 'assigned', 'report', 'report', 'disposition', 'disposition', 'refused']);
    // Each decision names the worker, the decision and the exact report it was taken on (event id and hash).
    const decisions = rows.filter(row => row.operation === 'disposition');
    expect(decisions.map(row => [row.worker, row.snapshot?.parentDisposition, row.basis?.find(b => b.kind === 'report')])).toEqual([
      ['w1', 'rework', { kind: 'report', ref: draftReport.receipt.eventId, sha256: shaOf('draft') }],
      ['w2', 'rejected', { kind: 'report', ref: verifyReport.receipt.eventId, sha256: shaOf('verify') }]]);
    expect(decisions.every(row => /^[a-f0-9]{64}$/.test(row.reasonSha256 ?? ''))).toBe(true);
    const audit = JSON.stringify(rows);
    expect(audit).not.toContain('per-protocol population');
    expect(audit).not.toContain('superseded source version');
  });
});

function registerRecipientLifecycleCases() {
  const terminalCases=(['completed','incomplete','cancelled','failed'] as const).flatMap(outcome =>
    [{actor:'parent' as const,outcome},{actor:'child' as const,outcome}]);
  it.each(terminalCases)('refuses a new $actor request to a $outcome recipient with one immutable replayable refusal',async ({actor,outcome}) => {
    const projected:WorkerSnapshot[]=[];
    const {scope,source,host}=await subject(pool,projection => projected.push(projection.snapshot));
    const sender=await host.assign({...assignment('sender'),source});
    const recipient=await host.assign({...assignment('recipient'),parentStep:'s2',source});
    await host.report(recipient.handle,{intentId:'recipient-report',reportSha256:coordinationSha256('Recipient report'),outcome,source});
    const before=(await readRunCoordination(pool,scope)).workers,projectionsBefore=projected.length;
    expect(before.find(worker => worker.worker===recipient.handle.worker)?.phase).toBe(
      ['cancelled','failed'].includes(outcome)?'stopped':'reported');
    const request={intentId:'late-review-request',recipient:recipient.handle.worker,messageKind:'review' as const};
    const attempt=() => host.message(actor==='parent'?null:sender.handle,request);
    const firstError=await attempt().then(() => null,error => error);
    expect(firstError).toMatchObject({code:'COORDINATION_WORKER_STOPPED'});
    const firstReceipt=coordinationRefusalReceipt(firstError);
    expect(firstReceipt).toMatchObject({eventId:expect.any(String),eventHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
    const secondError=await attempt().then(() => null,error => error);
    expect(secondError).toMatchObject({code:'COORDINATION_WORKER_STOPPED'});
    expect(coordinationRefusalReceipt(secondError)).toEqual(firstReceipt);
    expect((await readRunCoordination(pool,scope)).workers).toEqual(before);
    expect(projected).toHaveLength(projectionsBefore);
    const refused=await pool.query("SELECT new_values FROM audit_logs WHERE record_id=$1 AND new_values->>'operation'='refused'",[scope.runId]);
    expect(refused.rows).toMatchObject([{new_values:{operation:'refused',refusal:'COORDINATION_WORKER_STOPPED'}}]);
    expect((await pool.query("SELECT 1 FROM audit_logs WHERE record_id=$1 AND new_values->>'operation'='message'",[scope.runId])).rows).toEqual([]);
    await expect(pool.query("UPDATE audit_logs SET action='changed' WHERE record_id=$1 AND new_values->>'operation'='refused'",[scope.runId])).rejects.toThrow();
  });
  const activeCases=(['assigned','started','checking','waiting','held'] as const).flatMap(phase =>
    [{actor:'parent' as const,phase},{actor:'child' as const,phase}]);
  it.each(activeCases)('retains $actor messages to $phase recipients and exact historical success replay after stop',async ({actor,phase}) => {
    const {scope,source,host}=await subject();
    const sender=await host.assign({...assignment('sender'),source});
    const recipient=await host.assign({...assignment('recipient'),parentStep:'s2',source});
    if(phase!=='assigned')await host.progress(recipient.handle,phase,{intentId:'recipient-progress',completed:null,total:null});
    const request={intentId:'live-help-request',recipient:recipient.handle.worker,messageKind:'help' as const};
    const handle=actor==='parent'?null:sender.handle;
    const committed=await host.message(handle,request);
    expect((await host.message(handle,request)).receipt).toEqual(committed.receipt);
    await host.report(recipient.handle,{intentId:'recipient-stopped',reportSha256:coordinationSha256('Stopped after request'),outcome:'cancelled'});
    const stopped=(await readRunCoordination(pool,scope)).workers;
    expect((await host.message(handle,request)).receipt).toEqual(committed.receipt);
    expect((await readRunCoordination(pool,scope)).workers).toEqual(stopped);
    const messages=await pool.query("SELECT new_values FROM audit_logs WHERE record_id=$1 AND new_values->>'operation'='message'",[scope.runId]);
    expect(messages.rows).toHaveLength(1);
  });
}

function registerMeasuredWorkerCases() {
  it('measures the five declared aggregates with both optional checks and updates only the remaining-check range',async () => {
    const {wired,scope,output}=await measuredWorker('both_optionals');
    expect(wired.filter(worker => worker.estimate!==null)).toMatchObject([
      {completed:3,total:5,estimate:{lowerMs:20,upperMs:60,sampleCount:3}},
      {completed:4,total:5,estimate:{lowerMs:10,upperMs:40,sampleCount:4}},
    ]);
    expect(JSON.parse(output).checks).toHaveLength(5);
    expect(wired.at(-1)).toMatchObject({phase:'reported',completed:5,total:5,estimate:null});
    expect(agentClock.sourceLoads).toBe(1);
    expect(agentClock.sourceRechecks).toBe(2);
    expect(agentClock.samples).toEqual([10,20,30,40,57]);
    // 10+20+30+40ms whole handlers/reads + 50ms source load + 7ms scoped
    // current-source read; ledger callbacks and advisory latency are excluded.
    expect(agentClock.advisoryAt-agentClock.moduleLoadMs-1_000*(wired.length-1)).toBe(157);
    expect((await readRunCoordination(pool,scope)).workers[0].estimate).toBeNull();
  });
  it('produces an estimate from three actual aggregate checks, excluding ledger and advisory time', async () => {
    const {wired,scope,output}=await measuredWorker();
    expect(JSON.parse(output)).toHaveProperty('checks');
    expect(wired.filter(worker => worker.estimate !== null)).toHaveLength(1);
    expect(wired.find(worker => worker.estimate)).toMatchObject({phase:'checking',completed:3,total:4,estimate:{lowerMs:10,upperMs:30,sampleCount:3}});
    expect(wired.at(-1)).toMatchObject({phase:'reported',estimate:null,completed:4,total:4});
    expect((await readRunCoordination(pool,scope)).workers[0].estimate).toBeNull();
    expect(agentClock.modelCalls).toBe(1);
  });
  it.each(['not_assessed','error','held','pause_between','backwards','nonfinite','only_three'] as const)(
    'does not extrapolate %s observations from the actual aggregate check host',async mode => {
      const {wired,scope}=await measuredWorker(mode);
      expect(wired.every(worker => worker.estimate===null)).toBe(true);
      expect((await readRunCoordination(pool,scope)).workers[0].estimate).toBeNull();
    });
  it.each(['assessed_fail','fractional','advisory_error','source_unavailable','abort'] as const)(
    'keeps the estimate bounded to measured checks and clears it after %s',async mode => {
      const {wired,scope}=await measuredWorker(mode);
      const estimated=wired.filter(worker => worker.estimate!==null);
      expect(estimated).toHaveLength(1);
      expect(estimated[0].estimate).toMatchObject({lowerMs:10,upperMs:mode==='fractional'?31:30,sampleCount:3});
      expect(wired.at(-1)?.estimate).toBeNull();
      expect((await readRunCoordination(pool,scope)).workers[0].estimate).toBeNull();
      const advisory=wired.findIndex(worker => worker.phase==='started'&&worker.completed!==null);
      if(advisory>=0)expect(wired[advisory].estimate).toBeNull();
    });
}

type MeasurementMode='ordinary'|'not_assessed'|'error'|'held'|'pause_between'|'backwards'|'nonfinite'|'only_three'|
  'assessed_fail'|'fractional'|'advisory_error'|'source_unavailable'|'abort'|'both_optionals';
async function measuredWorker(mode:MeasurementMode='ordinary') {
  const [{registerToolHandler},{runSubAgent},{newAgentTurnCounters}]=await Promise.all([
    import('../AnaToolExecutor'),import('../sub-agent'),import('../sub-agent-limits')]);
  const wired:WorkerSnapshot[]=[],abort=new AbortController();
  const {scope,host}=await subject(pool,projection => {
    wired.push(projection.snapshot); agentClock.now+=1_000;
    if(mode==='pause_between'&&projection.snapshot.completed===1)agentClock.held+=100;
  });
  agentClock.now=0;agentClock.held=0;agentClock.modelCalls=0;agentClock.advisoryFails=mode==='advisory_error';
  agentClock.sourceLoads=0;agentClock.sourceRechecks=0;agentClock.advisoryAt=0;
  agentClock.moduleLoadMs=0;agentClock.samples=[];
  registerToolHandler('check_grounding',async () => {
    agentClock.now+=mode==='fractional'?10.2:10;
    if(mode==='error')throw new Error('Scripted check unavailable');
    return JSON.stringify({totalClaims:mode==='not_assessed'?0:1,ungroundedClaims:mode==='assessed_fail'?[{sentence:'Response 42%.'}]:[],elapsedMs:1});
  });
  registerToolHandler('check_numerical_integrity',async () => {
    agentClock.now+=mode==='backwards'?-20:mode==='fractional'?20.2:20;
    if(mode==='nonfinite')agentClock.now=NaN;if(mode==='held')agentClock.held+=100;
    return JSON.stringify({verdict:'clean',factsExtracted:2,labelsCompared:1});
  });
  registerToolHandler('check_dossier_consistency',async () => {
    agentClock.now+=mode==='fractional'?30.2:30;
    return JSON.stringify({verdict:'clean',artifactsCompared:1,draftFactsExtracted:1,recommendation:'Compared one actual fixture record.'});
  });
  registerToolHandler('read_vault_document',async () => {
    agentClock.now+=40;if(mode==='abort')abort.abort();
    return JSON.stringify(mode==='source_unavailable'?{error:'Scripted source unavailable'}:{ok:true,content:'Response 42%.'});
  });
  const tools=['check_grounding','check_numerical_integrity','check_dossier_consistency','read_vault_document','read_project_document']
    .map(name => ({name,description:name,input_schema:{type:'object' as const,properties:{}}}));
  const clock=vi.spyOn(performance,'now').mockImplementation(() => agentClock.now);
  try {
    const output=await runWithTenantScope({tenantId:String(scope.organizationId),accountId:scope.userId,source:'request',caller:'eta-producer-fixture'},
      () => runSubAgent({role:'verify',objective:'Check the selected quotation',instructions:'Compare the exact stored span.',
        text_to_check:'Response 42%.',elapsedMs:1,estimate:{lowerMs:1,upperMs:1},
        ...(mode==='both_optionals'?{source_document_ids:['10000000-0000-4000-8000-000000000001']}:{}),
        ...(mode==='only_three'?{}:{source_spans:[{artifact_id:'source-1',source_start:0,source_end:13,draft_start:0,draft_end:13}]})},
      {organizationId:scope.organizationId,userId:scope.userId,projectId:42,sqlClient:syntheticCurrentPolicyClient,signal:abort.signal},
      {organizationId:scope.organizationId,parentRunId:scope.runId,round:1,parentStep:'s1',governedTools:tools,agents:newAgentTurnCounters(),
        hold:async () => 'running',heldMs:() => agentClock.held,expiredSignal:new AbortController().signal,emit(){},coordination:async () => host}));
    return {wired,scope,output};
  } finally {clock.mockRestore();}
}

function measuredSource():DraftSource {
  const text='Response 42%.',span={start:0,end:text.length,totalChars:text.length};
  return {...draftSourceIdentityForText(text,span),span,text,documentId:'10000000-0000-4000-8000-000000000001',
    programId:'20000000-0000-4000-8000-000000000002',contentHash:coordinationSha256(text),title:'Controlled timing fixture',
    extractionMethod:'pdf-text',extractionConfidence:null,originalFileAvailable:true,disposition:null,
    sourceAvailability:'available',completeText:true,sensitivityTier:3};
}

const ledgerEstimate:WorkerEstimate={basis:'observed_check_durations',scope:'remaining_checks',lowerMs:10,upperMs:30,sampleCount:3,at:'2026-11-13T12:00:00.000Z'};
function registerEstimateLedgerCases() {
  it.each(['started','waiting','held','stopped'] satisfies WorkerPhase[])('clears a prior estimate on durable %s progress',async phase => {
    const {scope,host}=await subject(),worker=await host.assign({...assignment('clear-estimate'),role:'verify'});
    await host.progress(worker.handle,'checking',{intentId:'checking',completed:3,total:4,basisKind:'deterministic_checks',estimate:ledgerEstimate});
    const cleared=await host.progress(worker.handle,phase,{intentId:'clear',completed:3,total:4,basisKind:'deterministic_checks',estimate:ledgerEstimate});
    expect(cleared.snapshot.estimate).toBeNull();
    expect((await readRunCoordination(pool,scope)).workers[0].estimate).toBeNull();
  });
  it.each([
    {lowerMs:-1},{lowerMs:31},{upperMs:30.5},{upperMs:Infinity},{sampleCount:2},{sampleCount:4},{at:'invalid'},
  ])('normalizes unsupported estimate metadata without emitting an invalid worker projection: %o',async invalid => {
    const {scope,host}=await subject(),worker=await host.assign({...assignment('invalid-estimate'),role:'verify'});
    const result=await host.progress(worker.handle,'checking',{intentId:'invalid',completed:3,total:4,basisKind:'deterministic_checks',estimate:{...ledgerEstimate,...invalid}});
    expect(result.snapshot.estimate).toBeNull();
    expect((await readRunCoordination(pool,scope)).workers[0].estimate).toBeNull();
  });
  it.each(['unknown_total','observed_steps','complete','too_few','failed','research'] as const)(
    'does not apply an estimate to %s work',async mode => {
    const {scope,host}=await subject(),worker=await host.assign({...assignment('unsupported-work'),role:mode==='research'?'research':'verify'});
    const result=await host.progress(worker.handle,'checking',{intentId:'unsupported',
      completed:mode==='complete'?4:mode==='too_few'?2:3,total:mode==='unknown_total'?null:4,
      basisKind:mode==='observed_steps'?'observed_steps':'deterministic_checks',estimate:ledgerEstimate,
      ...(mode==='failed'?{outcome:'failed'}:{})});
    expect(result.snapshot.estimate).toBeNull();
    expect((await readRunCoordination(pool,scope)).workers[0].estimate).toBeNull();
  });
  it('does not reuse an estimate after a declared-total change or a count regression',async () => {
    const {host}=await subject(),verify=await host.assign({...assignment('known-checks'),role:'verify'});
    const base={completed:3,total:4,basisKind:'deterministic_checks' as const,estimate:ledgerEstimate};
    expect((await host.progress(verify.handle,'checking',{...base,intentId:'known'})).snapshot.estimate).not.toBeNull();
    expect((await host.progress(verify.handle,'checking',{...base,total:5,intentId:'changed-total'})).snapshot.estimate).toBeNull();
    expect((await host.progress(verify.handle,'checking',{...base,total:5,completed:2,intentId:'regressed-count'})).snapshot.estimate).toBeNull();
  });
  it('clears the last estimate through report, rework and a report-bound revision in audited replay',async () => {
    const {scope,host}=await subject(),worker=await host.assign({...assignment('report-estimate'),role:'verify'});
    await host.progress(worker.handle,'checking',{intentId:'checking',completed:3,total:4,basisKind:'deterministic_checks',estimate:ledgerEstimate});
    const sha=coordinationSha256('actual fixture report');
    const report=await host.report(worker.handle,{intentId:'report',reportSha256:sha,completed:3,total:4,basisKind:'deterministic_checks'});
    expect(report.snapshot.estimate).toBeNull();
    const decision=await host.assess({intentId:'rework',worker:'w1',reportEventId:report.receipt.eventId,reportSha256:sha,decision:'rework',reason:'Recheck the current selected source.'});
    expect(decision.snapshot.estimate).toBeNull();
    const revised=await host.revise(worker.handle,{intentId:'revision',reportSha256:sha,basis:[{kind:'report',ref:report.receipt.eventId,sha256:sha}]});
    expect(revised.snapshot.estimate).toBeNull();
    expect((await readRunCoordination(pool,scope)).workers[0].estimate).toBeNull();
  });
}
