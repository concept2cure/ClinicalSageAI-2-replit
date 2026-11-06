/**
 * run_agent end to end through the stream (row 74, S5c; brief T11 (m)).
 *
 * The real run_agent handler and runSubAgent, the real child loop, the real
 * model-call refusal scope, and the request inside a tenant scope as the auth
 * boundary opens one. Only the model is scripted, and one gateway serves the
 * parent's calls and the child's.
 *
 * Stubs alone would not prove reachability: a stubbed run_agent leaves the
 * child-call assertions below with nothing to read. That is this file's red
 * (the named mutation "stub run_agent in the end-to-end test").
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import * as nativeDb from '../../../db.js';
import { runWithTenantScope } from '../../../db/tenantStore';
import { createRunSourceAuthority, runWithSourceAuthority, captureCurrentRunSourceGate } from '../../../services/ai-gateway/model-call-scope';
import { openRunCoordination, readRunCoordination, coordinationSha256, type CoordinationPool, type WorkerCoordinationHandle } from '../../../services/ana/run-events';
import { runOwnerInstance } from '../../../services/ana/run-control';
import { newAgentTurnCounters } from '../../../services/ana/sub-agent-limits';
import { TurnTimeline } from '../../../services/ana/turn-timeline-emitter';
import type { GatewayRequest } from '../../../services/ai-gateway/types';
import type { SubAgentHost } from '../../../services/ana/sub-agent';


const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
// The REAL executor — so executeAgenticLoop, the dispatch allowlist, the
// read-only wrapper rule and the model-call refusal scope are all real — with
// only run_agent taken from it; every other tool stays the harness's stub.
vi.mock('../../../services/ana/AnaToolExecutor.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/AnaToolExecutor.js')>();
  const { harness } = await harnessModule();
  return { ...real, getToolHandler: (n: string) => (n === 'run_agent' ? real.getToolHandler(n) : harness.handlers[n]) };
});
// The child's own model calls reach the same scripted gateway the parent's do.
vi.mock('../../../services/ai-gateway/gateway.js', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const { harness } = await harnessModule();
  return { ...real, getGateway: () => harness.gateway };
});
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../../services/ana/run-control.js')>();
  return { ...(await harnessModule()).mocks.runControl(real),
    runOwnerInstance: real.runOwnerInstance, admitRunCoordination: real.admitRunCoordination };
});
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal =>
  (await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', async () => (await harnessModule()).mocks.memory());
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', async () => (await harnessModule()).mocks.sessionBootstrap());
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async original => {
  const real = await original<typeof import('../../../services/auditService.js')>();
  return { ...(await harnessModule()).mocks.audit(), writeChainedAuditRow: real.writeChainedAuditRow };
});

vi.mock('../../../services/toolRegistry.js', async () => (await harnessModule()).mocks.toolRegistry());
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
// The real executor records each tool's outcome; only the health read is stubbed.
vi.mock('../../../services/ana/tool-telemetry.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...(await harnessModule()).mocks.toolTelemetry(),
  recordToolOutcome: () => {},
}));
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());
// Current disposition is separately qualified; these tests exercise actual
// actor/source SQL, coordination append/chain and registered child boundaries.
vi.mock('../../../services/document-data-disposition/eligibility.js', async original => ({
  ...(await original<typeof import('../../../services/document-data-disposition/eligibility.js')>()),
  artifactDataEligibleSql: () => 'TRUE', artifactOriginalFileAvailableSql: () => 'TRUE',
}));
import { mountStreamRoute } from '../stream.js';
import { harness as h, resetHarness, streamApp, turn as streamTurn, type ToolUse } from './support/stream-route-harness.js';


const app = streamApp(mountStreamRoute, { tenantScope: '7' });
const call: ToolUse = {
  id: 'tu_agent',
  name: 'run_agent',
  input: { role: 'research', objective: 'trials', instructions: 'Find the pivotal trial of drug X.' },
};
const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => {
  process.env.ENTITLEMENTS_ENFORCE = 'off';
});
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
  delete h.handlers.run_agent;
});
beforeEach(() => {
  resetHarness();
  // Named so the harness's toolset offers it; the executor serves the real one.
  h.handlers.run_agent = async () => {
    throw new Error('the stub must not run here');
  };
  h.state.script = [
    [call],
    'No pivotal trial was found in the sources searched.',
    'The agent found no pivotal trial.',
  ];
});
afterEach(() => vi.restoreAllMocks());

describe('run_agent, real, through the stream', () => {
  it("the child's model call is governed and linked to the parent run, and its finished frame precedes the result", async () => {
    const events = await streamTurn(app, { message: 'research the pivotal trial' });
    const child = h.state.requests.find(r => r.callerModule === 'ana-sub-agent');
    expect(child, 'no child model call was made').toBeDefined();
    expect(child!.parentRunId).toBe('run_test');
    expect(child!.organizationId).toBe(7);
    expect(child!.runId).toMatch(/^agent_[0-9a-f-]{36}$/);
    expect(child!.riskTier).toBe('high');
    // No recursion: a child is never offered the delegation tool.
    expect(child!.tools ?? []).not.toContain('run_agent');

    const result = events.find(e => e.type === 'tool_result' && e.toolUseId === 'tu_agent')!;
    expect(result.status, result.result).toBe('success');
    expect(JSON.parse(result.result)).toMatchObject({ status: 'completed', agent: { role: 'research' } });
    const dispatched = events.find(e => e.type === 'tool_use' && e.toolUseId === 'tu_agent')!;
    expect(dispatched.input).toMatchObject({ action: 'spawn', assignment: 's1', role: 'research' });
    expect(JSON.stringify(dispatched)).not.toContain('pivotal trial of drug X');
    const finished = events.find(e => e.type === 'agent_event' && e.phase === 'finished');
    expect(finished).toMatchObject({ toolUseId: 'tu_agent', status: 'completed' });
    expect(events.indexOf(finished!)).toBeLessThan(events.indexOf(result));
  });
});

async function nativeCoordinationFixture(program: string) {
  const pg = new PGlite();
    await pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,status text DEFAULT 'active');
      CREATE TABLE users(id integer PRIMARY KEY,status text DEFAULT 'active');
      CREATE TABLE organization_users(organization_id integer,user_id integer,role text);
      CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,deleted_at timestamptz);
      CREATE TABLE projects(id integer PRIMARY KEY,organization_id integer,regulatory_program_id uuid,client_workspace_id integer,
        code text,name text,owner_id integer,created_by_id integer,settings jsonb DEFAULT '{}',status text DEFAULT 'active');
      CREATE TABLE client_workspaces(id integer,organization_id integer,name text);
      CREATE TABLE project_visibility_settings(organization_id integer,project_id integer,visibility text);
      CREATE TABLE project_members(organization_id integer,project_id integer,user_id integer,role text,status text);
      CREATE TABLE concept2cure_review_assignments(organization_id integer,artifact_id integer,reviewer_id integer,status text);
      CREATE TABLE account_skill_bundles(id serial,bundle_id text,organization_id integer,project_id integer,status text,
        version integer,policy_bindings jsonb,metadata jsonb DEFAULT '{}');
      CREATE TABLE user_intelligence_profiles(id serial,user_id integer,organization_id integer,workflow_preferences jsonb DEFAULT '{}');
      CREATE TABLE concept2cure_artifacts(id serial,artifact_id text,organization_id integer,project_id integer,title text,
        type text,category text,ctd_section text,status text,version integer,content text,content_hash text,
        created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),locked_at timestamptz);
      CREATE TABLE cre_evidence_sources(id integer,organization_id integer,metadata jsonb,checksum text,
        client_program_id uuid,provenance jsonb,source_type text,deleted_at timestamptz);
      CREATE TABLE document_data_dispositions(organization_id integer,program_id uuid,captured_source_id integer,
        linked_ids jsonb,source_sha256 text,choice text);
      CREATE TABLE file_uploads(id text,organization_id integer,checksum_sha256 text,storage_path text);
      CREATE TABLE ana_runs(id text PRIMARY KEY,organization_id integer,user_id integer,project_id text,status text,owner_instance text,thread_id text);
      INSERT INTO organizations VALUES(7,'active'); INSERT INTO users VALUES(3,'active');
      INSERT INTO organization_users VALUES(7,3,'member');
      INSERT INTO regulatory_programs VALUES('${program}',7,NULL);
      INSERT INTO projects(id,organization_id,regulatory_program_id,code,name,owner_id,created_by_id) VALUES(11,7,'${program}','NATIVE','Native project',3,3);
      INSERT INTO project_visibility_settings VALUES(7,11,'org_public');
      INSERT INTO concept2cure_artifacts(artifact_id,organization_id,project_id,title,version,content,content_hash)
        VALUES('native-source',7,11,'Recorded native source',1,'Observed result was 42%.','source-file-hash');
      SELECT set_config('app.current_tenant_id','7',false),set_config('app.current_account_id','3',false);`);
    await pg.exec(AUDIT_LOGS_PGLITE_DDL);
    await pg.exec(readFileSync(new URL('../../../../migrations/20260921_audit_logs_chain_seq.sql', import.meta.url), 'utf8'));
    // One PGlite session cannot host concurrent transactions. Model/tool work
    // runs in parallel; lending a transaction is serialized like a pool lease.
    let lease = Promise.resolve();
    const queryFailures: string[] = [];
    const query: CoordinationPool['query'] = async (sql, args) => {
      try { return await pg.query<Record<string, unknown>>(sql, args); }
      catch (error) { queryFailures.push(`${sql}: ${String(error)}`); throw error; }
    };
    const pool: CoordinationPool = { query, connect: async () => {
      const previous = lease; let unlock: () => void = () => {};
      lease = new Promise<void>(resolve => { unlock = resolve; }); await previous;
      let released = false; return { query, release: () => { if (!released) { released = true; unlock(); } } };
    } };
    const audit = await vi.importActual<typeof import('../../../services/auditService.js')>('../../../services/auditService.js');
    await pg.exec('BEGIN');
    await audit.writeChainedAuditRow(pool, { tenantId: 7, userId: 3, action: 'ana_skill.library_disabled',
      resourceType: 'organization_skill_settings', resourceId: 'native-rule', details: { skillKey: 'native-rule', enabled: false } });
    await pg.exec('COMMIT');
    const source = await pg.query<{ id: string }>("SELECT id FROM audit_logs WHERE action='ana_skill.library_disabled'");
    await pg.query(`INSERT INTO account_skill_bundles(bundle_id,organization_id,status,version,policy_bindings,metadata)
      VALUES('native-hard-gate',7,'active',1,$1,$2)`, [JSON.stringify([{ toolName: 'search_literature', policyType: 'requires_approval', enforcement: 'mandatory', description: 'A person must decide.' }]),
      JSON.stringify({ standingRule: { sourceAuditEventId: source.rows[0].id } })]);
  return {pg,pool,queryFailures};
}

const TOOL_READ = { name: 'read_vault_document', description: 'Read actual stored source', input_schema: { type: 'object' as const, properties: {} } };
const TOOL_DELEGATE = { name: 'run_agent', description: 'Existing delegation/coordination tool', input_schema: { type: 'object' as const, properties: {} } };
const TOOL_SEARCH = { name: 'search_literature', description: 'Existing read with mandatory human gate', input_schema: { type: 'object' as const, properties: {} } };

function nextNativeModelCall(calls: Map<string, number>, id: string): number {
  const count = calls.get(id) ?? 0; calls.set(id, count + 1); return count;
}

async function nativeRun(cancel: boolean, {pg,pool,queryFailures}: Awaited<ReturnType<typeof nativeCoordinationFixture>>) {
  const program = '11111111-1111-4111-8111-111111111111';
  const runId = cancel ? 'native-cancel-run' : 'native-parallel-run';
  await pg.query('INSERT INTO ana_runs(id,organization_id,user_id,project_id,status,owner_instance) VALUES($1,7,3,$2,$3,$4)', [runId, program, 'running', runOwnerInstance()]);
  const executor = await vi.importActual<typeof import('../../../services/ana/AnaToolExecutor.js')>('../../../services/ana/AnaToolExecutor.js');
  const io = vi.spyOn(nativeDb as unknown as { getPool(): CoordinationPool }, 'getPool').mockReturnValue(pool);
  const sharedQuery = vi.spyOn(nativeDb.pool as unknown as Pick<CoordinationPool, 'query'>, 'query').mockImplementation(pool.query);
  const blockedRead = vi.fn(async () => JSON.stringify({ results: [] }));
  executor.registerToolHandler('search_literature', blockedRead);
  const controller = new AbortController(), counts = newAgentTurnCounters(), frames: unknown[] = [], calls = new Map<string, number>();
  const timeline = new TurnTimeline({ write: frame => frames.push(JSON.parse(frame.slice(6))), recorder: () => null });
  const checkpointCalls: number[] = [];
  let both: () => void = () => {}, firstCalls = 0;
  const concurrent = new Promise<void>(resolve => { both = resolve; });
  let exchanged: () => void = () => {}, messageReceipts = 0;
  const messagesCommitted = new Promise<void>(resolve => { exchanged = resolve; });
  const route = vi.spyOn(h.gateway, 'route').mockImplementation(async (request: GatewayRequest) => {
    const id = String(request.runId), count = nextNativeModelCall(calls, id);
    const gate = captureCurrentRunSourceGate(request); if (!gate) throw new Error('Native source authority missing'); expect(gate.tiers).toContain(3);
    await request.beforeDispatch?.(); await gate.recheck(); checkpointCalls.push(count);
    const isA = JSON.stringify(request.messages[1]).includes('Native worker A');
    let use: { name: string; input: Record<string, unknown> } | null = null;
    if (count === 0) { if (++firstCalls === 2 || cancel) both(); await concurrent; use = { name: 'read_vault_document', input: { artifact_id: 'native-source' } }; }
    else if (count === 1 && cancel) controller.abort();
    else if (count === 1) {
      const peer = isA ? { intent_id: 'A-request', recipient: 'w2' } : { intent_id: 'B-request', recipient: 'w1' };
      use = { name: 'run_agent', input: { action: 'message', ...peer, message_kind: 'source' } };
    }
    else if (count === 2) {
      if (++messageReceipts === 2) exchanged(); await messagesCommitted;
      use = { name: 'run_agent', input: { action: 'team' } };
    }
    else if (count === 3) {
      expect(request.messages.map(message => typeof message.content === 'string' ? message.content : '').join('\n')).toContain('"kind":"source"');
      use = { name: 'search_literature', input: { query: 'Needs a current human decision' } };
    }
    else if (count === 4) {
      use = { name: 'run_agent', input: { action: 'spawn', role: 'research', objective: 'Forbidden nested child', instructions: 'Do not run.' } };
    }
    return { content: 'Operational proposal only.', toolUses: use ? [{ ...use, id: `${id}:${count}` }] : [],
      provider: 'anthropic', model: 'fixture-advisory', requestId: `${id}:model:${count}`,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 }, latencyMs: 1, cached: false, deterministic: false };
  });
  try {
    return await runWithTenantScope({ tenantId: '7', accountId: 3, source: 'request' }, () =>
      runWithSourceAuthority(createRunSourceAuthority({ organizationId: 7, userId: 3, projectId: 11, programId: program }), async () => {
        const coordination = await openRunCoordination({ pool, runId, organizationId: 7, userId: 3, projectId: 11,
          onProjection: projection => timeline.worker(1, projection) });
        const originalReport = coordination.report.bind(coordination), reportFailures: string[] = [];
        const originalProgress = coordination.progress.bind(coordination), progressFailures: string[] = [];
        vi.spyOn(coordination, 'progress').mockImplementation(async (handle, phase, input) => {
          try { return await originalProgress(handle, phase, input); } catch (error) { progressFailures.push(String(error)); throw error; }
        });
        const originalAssign = coordination.assign.bind(coordination), assignedHandles: WorkerCoordinationHandle[] = [];
        vi.spyOn(coordination, 'assign').mockImplementation(async input => {
          const assigned = await originalAssign(input); assignedHandles.push(assigned.handle); return assigned;
        });
        vi.spyOn(coordination, 'report').mockImplementation(async (handle, input) => {
          try { return await originalReport(handle, input); } catch (error) { reportFailures.push(String(error)); throw error; }
        });
        const subjects = cancel ? ['A'] : ['A', 'B'];
        const results = await Promise.all(subjects.map(subject => {
          const call = { id: `native-${subject}`, name: 'run_agent' };
          timeline.announced(1, call, { label: 'Delegating assigned work', source: 'engine', preview: null });
          const binding = timeline.workerBinding(call);
          const host: SubAgentHost = { organizationId: 7, parentRunId: runId, round: 1, governedTools: [TOOL_READ, TOOL_DELEGATE, TOOL_SEARCH],
            agents: counts, hold: async () => 'running', expiredSignal: new AbortController().signal, heldMs: () => 0,
            emit: frame => frames.push(frame), ...binding, coordination: async () => coordination };
          return executor.getToolHandler('run_agent')!({ role: 'research', objective: `Native worker ${subject}`, instructions: 'Read the recorded source and coordinate operationally.' },
            { organizationId: 7, userId: 3, projectId: 11, projectRef: program, sqlClient: pool, signal: controller.signal, subAgentHost: host });
        }));
        const board = await readRunCoordination(pool, { runId, organizationId: 7, userId: 3, projectId: 11 });
        if (cancel) {
          const handle = assignedHandles[0], report = board.workers[0];
          await expect(coordination.message(handle, { intentId: 'cancel-message', recipient: 'anna', messageKind: 'help' })).rejects.toThrow('COORDINATION_WORKER_STOPPED');
          await expect(coordination.progress(handle, 'started', { intentId: 'cancel-restart', completed: 0, total: null })).rejects.toThrow('COORDINATION_WORKER_STOPPED');
          await expect(coordination.revise(handle, { intentId: 'cancel-revision', reportSha256: coordinationSha256(results[0]) })).rejects.toThrow('COORDINATION_WORKER_STOPPED');
          await expect(coordination.assess({ intentId: 'cancel-accept', worker: handle.worker,
            reportEventId: report.receipt.eventId, reportSha256: coordinationSha256(results[0]),
            decision: 'accepted_as_proposal', reason: 'A cancelled worker cannot be accepted.' })).rejects.toThrow('COORDINATION_WORKER_STOPPED');
        }
        expect(blockedRead).not.toHaveBeenCalled();
        return { results: results.map(result => JSON.parse(result)), frames, board, firstCalls, checkpointCalls, reportFailures, progressFailures, queryFailures };
      }));
  } finally { io.mockRestore(); sharedQuery.mockRestore(); route.mockRestore(); }
}

describe('registered parallel workers with actual durable coordination and source SQL', () => {
  const program = '11111111-1111-4111-8111-111111111111';
  let fixture: Awaited<ReturnType<typeof nativeCoordinationFixture>>;
  beforeAll(async () => { fixture = await nativeCoordinationFixture(program); });
  afterAll(async () => { await fixture.pg.close(); });
  it('runs two actual registered child loops, exchanges durable requests, refuses nested delegation and retains source-bound checkpoints', async () => {
    const result = await nativeRun(false, fixture);
    expect(result.firstCalls, JSON.stringify(result.results)).toBe(2); expect(result.results).toHaveLength(2);
    expect(result.results.every(item => item.status === 'completed'), JSON.stringify(result.results)).toBe(true);
    expect(result.results.every(item => item.trace.steps.some((step: { result: string }) => step.result.includes('SUB_AGENT_READ_ONLY')))).toBe(true);
    expect(result.board.workers).toHaveLength(2);
    expect(result.board.workers.every(worker => worker.parentDisposition === 'pending' && worker.outcome === 'completed' && worker.total === null)).toBe(true);
    const messages = await fixture.pg.query<{ count: number }>("SELECT count(*)::int AS count FROM audit_logs WHERE new_values->>'operation'='message' AND record_id='native-parallel-run'");
    expect(messages.rows[0].count).toBe(2); expect(result.checkpointCalls.length).toBeGreaterThanOrEqual(10);
    expect(JSON.stringify(result.frames)).not.toContain('Native worker A');
    const replay = new TurnTimeline({ write: () => { throw new Error('Forged projection reached the wire'); }, recorder: () => null });
    replay.workerBinding({ id: 'replay', name: 'run_agent' });
    const worker = result.board.workers[0];
    expect(() => replay.worker(1, JSON.parse(JSON.stringify({ receipt: worker.receipt, snapshot: worker })))).toThrow('RUN_COORDINATION_UNAVAILABLE');
  }, 60000);
  it('records cancellation without completion or accepting a proposal', async () => {
    const result = await nativeRun(true, fixture);
    expect(result.results[0].status, JSON.stringify({ failures: result.reportFailures, progress: result.progressFailures, queries: result.queryFailures })).toBe('cancelled');
    expect(result.board.workers[0]).toMatchObject({ phase: 'stopped', outcome: 'cancelled', parentDisposition: 'pending', total: null });
  }, 60000);
  it('holds private external requests and writes before any handler or approval persistence, while an admitted internal source still reads', async () => {
    const executor = await vi.importActual<typeof import('../../../services/ana/AnaToolExecutor.js')>('../../../services/ana/AnaToolExecutor.js');
    const external = vi.fn(async () => 'external side effect'), write = vi.fn(async () => 'record changed');
    executor.registerToolHandler('search_literature', external); executor.registerToolHandler('execute_platform_command', write);
    vi.spyOn(nativeDb as unknown as { getPool(): CoordinationPool }, 'getPool').mockReturnValue(fixture.pool);
    vi.spyOn(nativeDb.pool as unknown as Pick<CoordinationPool, 'query'>, 'query').mockImplementation(fixture.pool.query);
    const query = vi.fn(fixture.pool.query), context = { organizationId: 7, userId: 3, projectId: 11, projectRef: program,
      sqlClient: { query }, humanConfirmed: true };
    executor.requireOwnerPrivateToolLane(context);
    for (const name of ['search_literature', 'execute_platform_command']) {
      const result = JSON.parse(await executor.getToolHandler(name)!({ query: 'PRIVATE_CANARY_384', command: 'freeze_document' }, context));
      expect(result).toMatchObject({ success: false, error: 'OWNER_PRIVATE_TOOL_HELD' });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_CANARY_384');
    }
    expect(external).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
    await runWithTenantScope({ tenantId: '7', accountId: 3, source: 'request' }, () =>
      runWithSourceAuthority(createRunSourceAuthority(context), async () => {
        expect(JSON.parse(await executor.getToolHandler('read_vault_document')!({ artifact_id: 'native-source' }, context))).toMatchObject({ ok: true });
      }));
  });
});
