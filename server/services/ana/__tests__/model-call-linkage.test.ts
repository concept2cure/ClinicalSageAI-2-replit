/**
 * A record AnA's model produced traces to the model call that produced it
 * (D6, plan WS3).
 *
 * Until 2026-09-26:
 *  - an agent mutation's Part 11 audit row (agentAuditDetails) named the agent's
 *    reason and the chat thread, but not the gateway request or the model, so
 *    it could not be joined to its ai.gateway_audit_log row;
 *  - every AnA run was closed as ending for want of tools, including one stopped
 *    at its round ceiling or by the thrash guard, because the stream discarded
 *    the loop's result;
 *  - every council execution row said 'gpt-4-turbo', whatever served it.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const S = vi.hoisted(() => ({ ctx: undefined as unknown }));
vi.mock('../../ana-ri/command-executor.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../ana-ri/command-executor.js')>();
  return {
    ...actual,
    executeCommands: async (_commands: unknown, ctx: unknown) => {
      S.ctx = ctx;
      return [{ success: true, action: 'list_projects', message: 'ok' }];
    },
  };
});

import { getToolHandler, servedModelOf } from '../AnaToolExecutor.js';
import { commandBlockProposer } from '../command-attribution.js';
import { agentAuditDetails } from '../../ana-ri/mdx-tool-policy.js';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('an agent mutation’s audit row names the model call', () => {
  it('servedModelOf carries the gateway request id', () => {
    expect(servedModelOf({ provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-9' })).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      requestId: 'req-9',
    });
  });

  it('agentAuditDetails records the gateway request id and the serving model', () => {
    const details = agentAuditDetails(
      {
        userId: 1,
        organizationId: 42,
        threadId: 't-1',
        servingModel: { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-9' },
      },
      { allowed: true, reason: 'User asked to create the project.' } as never,
    );
    expect(details).toMatchObject({
      actorKind: 'agent:ana',
      gatewayRequestId: 'req-9',
      servingModel: { provider: 'anthropic', model: 'claude-opus-5-5' },
    });
  });

  it('a command a person typed has no model call, and says so', () => {
    const details = agentAuditDetails({ userId: 1, organizationId: 42 }, { allowed: true, reason: 'x' } as never);
    expect(details).toMatchObject({ gatewayRequestId: null, servingModel: { provider: null, model: null } });
  });

  it('execute_platform_command hands the serving model to the command context', async () => {
    const served = { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-9' };
    await getToolHandler('execute_platform_command')!(
      { command: 'list_projects' },
      { organizationId: 42, userId: 1, servingModel: served },
    );
    expect(S.ctx).toMatchObject({ organizationId: 42, servingModel: served });
  });

  it('the streamed answer’s command blocks carry the model call that wrote them', () => {
    // post-processing runs the command blocks of the whole answer, which joins
    // every round's text; the stream passes the round that wrote them.
    expect(read('server/routes/ana-ri/post-processing.ts')).toMatch(/servingModel: servingModel \?\? null/);
    const stream = read('server/routes/ana-ri/stream.ts');
    expect(stream).toMatch(/runStreamPostProcessing\(\{[\s\S]{0,4000}?servingModel: commandBlockProposer\(commandRounds, lastServedModel\),/);
    expect(stream).toMatch(/const commandRounds = commandRoundOf\(fullContent, lastServedModel\);/);
    expect(stream).toMatch(/commandRounds\.push\(\.\.\.commandRoundOf\(roundText, lastServedModel\)\);/);
  });

  it('a command block is attributed to the round that wrote it, and to no one when rounds disagree', () => {
    const round1 = { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-1' };
    const round3 = { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-3' };
    const last = { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req-4' };
    // Round 1 wrote the block, round 4 wrote the rest of the answer.
    expect(commandBlockProposer([round1], last)).toEqual(round1);
    // Two rounds wrote blocks: which call proposed which cannot be said.
    expect(commandBlockProposer([round1, round3], last)).toEqual({ provider: null, model: null, requestId: null });
  });

  it('a held action records the model call that proposed it, which governed-action runs it with', () => {
    // Agent write commands are propose-only: they run only through
    // POST /governed-action, from the held row (governedActionConfirmTier.test.ts).
    expect(read('server/routes/ana-ri/stream.ts')).toMatch(/requestApproval\(getPool\(\), runId, \{[\s\S]{0,800}?proposedBy: lastServedModel,/);
    expect(read('server/routes/ana-ri/utility.ts')).toMatch(/servingModel: pendingForRun\?\.proposedBy \?\? null,/);
  });

  it('both AnA dispatches carry the run id to the ledger', () => {
    const src = read('server/routes/ana-ri/stream.ts');
    const dispatches = [...src.matchAll(/gw\.route\(\{/g)].map(m => src.slice(m.index, (m.index ?? 0) + 900));
    expect(dispatches.length).toBeGreaterThanOrEqual(2);
    for (const d of dispatches) expect(d).toMatch(/runId: runId \|\| undefined,/);
  });
});

describe('a run is closed with the reason its loop stopped', () => {
  it('the stream keeps the loop result and passes its stop reason to endRun', () => {
    const src = read('server/routes/ana-ri/stream.ts');
    expect(src).toMatch(/const loopResult = await runAgenticToolLoop\(/);
    expect(src).toMatch(/loopStoppedReason = loopResult\.stoppedReason;/);
    expect(src).toMatch(/streamFailed \? 'error' : loopStoppedReason/);
    expect(src).not.toMatch(/streamFailed \? 'error' : 'no_more_tools'/);
  });

  it('a turn that ends before the loop is closed failed when it failed, not finished for want of tools', () => {
    const src = read('server/routes/ana-ri/stream.ts');
    // The fast-path answer that came back as an error.
    expect(src).toMatch(/streamFailed = fastOutcome === 'failed';\s*await closeFastPath\(fastOutcome\);/);
    // The refused thread.
    expect(src).toMatch(/belongs to another user\.'\);\s*streamFailed = true;\s*const turnRecord = await fileTurnRecord\('failed'\);/);
  });
});

describe('a council execution row names the model that served it', () => {
  it('records provider/model as reported, not a constant', async () => {
    const { MultiAgentCouncilService } = await import('../../multi-agent-council');
    const inserts: unknown[][] = [];
    const svc = new MultiAgentCouncilService({
      query: async (_sql: string, params: unknown[]) => {
        inserts.push(params);
        return { rows: [] };
      },
    } as never);
    await (svc as any).logExecution('s-1', 'a-1', 'DRAFTER', 1, {
      outputText: 'draft',
      llmProvider: 'anthropic',
      llmModel: 'claude-opus-5-5',
      status: 'COMPLETED',
    });
    expect(inserts[0][11]).toBe('anthropic/claude-opus-5-5');
  });

  it('every agent passes the served model to its execution row', () => {
    const src = read('server/services/multi-agent-council.ts');
    expect(src.match(/llmModel: llmResponse\.model,/g)).toHaveLength(4);
    expect(src).not.toMatch(/^\s*'gpt-4-turbo',\s*$/m);
  });
});
