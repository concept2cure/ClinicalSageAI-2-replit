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

  it('the streamed answer’s command blocks carry the last round’s serving model', () => {
    // post-processing builds the command context for command blocks in the final
    // answer; the stream passes it the model that wrote that answer.
    expect(read('server/routes/ana-ri/post-processing.ts')).toMatch(/servingModel: servingModel \?\? null/);
    expect(read('server/routes/ana-ri/stream.ts')).toMatch(/servingModel: lastServedModel,/);
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
