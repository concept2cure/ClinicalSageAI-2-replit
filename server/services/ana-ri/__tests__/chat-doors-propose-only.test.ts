/**
 * The doors that already held at HEAD 66e82a6d, pinned with a control each
 * (P0-12 residual, 2026-10-01; audit DP-08).
 *
 * Every chat path reaches a write one of three ways: a ```command block in
 * AnA's reply (processCommandsInResponse — the stream's post-processing), the
 * agentic loop's `execute_platform_command` tool (POST /api/chat, the /ana
 * socket, POST /api/claude/agent, deep investigation), or a tool that writes on
 * its own handler (the registry wrapper; tool-authorization-enforcement.test.ts
 * pins that one). The fourth — the ```ana-action block — was open and is pinned
 * in ana-action-block-proposal.test.ts.
 *
 * Each case below asserts that nothing is written, and each has a CONTROL: the
 * same dispatch with a person's confirmation on the context reaches the
 * handler. So the assertion is live — it would fail on the defect it exists to
 * catch (a chat path that ran writes unconfirmed) — rather than passing
 * because nothing could have run anyway.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rbac = vi.hoisted(() => ({ hasRole: vi.fn(async () => true) }));
vi.mock('../../roleBasedAccess', () => ({
  default: { hasRole: (...a: unknown[]) => (rbac.hasRole as any)(...a), getUserRoles: async () => [] },
}));

const writes = vi.hoisted(() => ({
  governed: vi.fn(async () => ({
    persistenceStatus: 'persisted',
    artifactMutation: { artifactId: 777, isNew: true, sectionCode: '2.5' },
  })),
  connect: vi.fn(async () => {
    throw new Error('a write transaction was opened');
  }),
}));
vi.mock('../../governed-ana-execution.js', () => ({ executeGovernedAnaOperation: writes.governed }));
const poolStub = vi.hoisted(() => ({
  // Tenant policy and Part 11 settings read as "none": the partition decides.
  query: async () => ({ rows: [] as any[], rowCount: 0 }),
  connect: (...a: unknown[]) => (writes.connect as any)(...a),
}));
vi.mock('../../../db', () => ({
  db: {},
  pool: poolStub,
  getPool: () => poolStub,
  getDb: () => ({}),
}));

import { processCommandsInResponse } from '../command-executor';
import { pendingSignoffFromToolResult } from '../../ana-guidance-executor';

const CONTENT = [
  '## Clinical Overview',
  'The pivotal study met its primary endpoint with a clinically meaningful reduction in exacerbation rate, and the safety profile is consistent with the class.',
  '## Evidence',
  '[KNOWN] Annualised exacerbation rate ratio 0.62 versus placebo in the pivotal study. [INFERRED] Benefit is consistent across prespecified subgroups.',
  '## Conclusion',
  'The benefit-risk balance supports the proposed indication in adults with moderate to severe disease, subject to the monitoring set out in the risk management plan.',
].join('\n');

const block = (command: string, params: Record<string, unknown>) =>
  '```command\n' + JSON.stringify({ command, params }) + '\n```';

const REPLY = [
  'I can make those changes for you.',
  block('create_artifact', { projectId: 5, title: 'Clinical Overview', content: CONTENT, type: 'memo', ctdSection: '2.5' }),
  block('create_task', { projectId: 5, title: 'Re-run the subgroup analysis' }),
  block('erase_personal_data', { dataSubjectId: 99, reason: 'requested' }),
].join('\n\n');

const ctx = (over: Record<string, unknown> = {}) => ({ userId: 7, organizationId: 61, activeProjectId: 5, ...over }) as any;

beforeEach(() => {
  rbac.hasRole.mockReset();
  rbac.hasRole.mockResolvedValue(true);
  writes.governed.mockClear();
  writes.connect.mockClear();
});

describe('a ```command block in AnA’s reply (the stream’s post-processing)', () => {
  it('every write is a proposal; nothing is written, the erasure included', async () => {
    const { executedCommands, cleanedText } = await processCommandsInResponse(REPLY, ctx());

    expect(executedCommands.map((r) => [r.action, r.error, (r.data as any)?.tier])).toEqual([
      ['create_artifact', 'HUMAN_CONFIRMATION_REQUIRED', 'confirm'],
      ['create_task', 'HUMAN_CONFIRMATION_REQUIRED', 'confirm'],
      // The GDPR erasure: the e-signature tier — a reason and re-authentication.
      ['erase_personal_data', 'HUMAN_CONFIRMATION_REQUIRED', 'esignature'],
    ]);
    expect(writes.governed, 'an artifact was written on the model’s word').not.toHaveBeenCalled();
    expect(writes.connect, 'a write transaction was opened on the model’s word').not.toHaveBeenCalled();
    expect(cleanedText).toBe('I can make those changes for you.');
  });

  it('a confirmation the model writes into params is not a confirmation', async () => {
    const reply = block('create_artifact', { projectId: 5, title: 'X', content: CONTENT, confirm: true, humanConfirmed: true });
    const { executedCommands } = await processCommandsInResponse(reply, ctx());
    expect(executedCommands[0]).toMatchObject({ error: 'HUMAN_CONFIRMATION_REQUIRED' });
    expect(writes.governed).not.toHaveBeenCalled();
  });

  it('CONTROL: the same block with a person’s confirmation on the context reaches the handler', async () => {
    // What POST /api/ana-ri/governed-action does — the one writer of the flag.
    const { executedCommands } = await processCommandsInResponse(REPLY.split('\n\n').slice(0, 2).join('\n\n'), ctx({ humanConfirmed: true }));
    expect(executedCommands[0]).toMatchObject({ success: true, action: 'create_artifact' });
    expect(writes.governed).toHaveBeenCalledTimes(1);
  });
});

describe('the agentic loop’s execute_platform_command (/api/chat, the /ana socket, /api/claude/agent)', () => {
  async function bridge(input: Record<string, unknown>, toolCtx: Record<string, unknown>) {
    const { getToolHandler } = await import('../../ana/AnaToolExecutor.js');
    return getToolHandler('execute_platform_command')!(input, toolCtx as any);
  }
  const call = { command: 'create_artifact', params: { projectId: 5, title: 'Clinical Overview', content: CONTENT, type: 'memo' } };

  it('a write comes back as the proposal, and the /api/chat response can lift it for the person', async () => {
    const raw = await bridge(call, { organizationId: 61, userId: 7, projectId: 5 });
    const out = JSON.parse(raw);
    expect(out.status).toBe('failed');
    expect(out.result).toMatchObject({ error: 'HUMAN_CONFIRMATION_REQUIRED', data: { tier: 'confirm', retry: { command: 'create_artifact' } } });
    expect(writes.governed).not.toHaveBeenCalled();
    expect(pendingSignoffFromToolResult('execute_platform_command', raw)).toEqual(out.result);
  });

  it('a confirmation on the TOOL context is not passed to the command: the command is still proposed', async () => {
    // The loop never sets it; this pins that the bridge could not launder one
    // into a command confirmation if a caller did.
    const out = JSON.parse(await bridge(call, { organizationId: 61, userId: 7, projectId: 5, humanConfirmed: true }));
    expect(out.result).toMatchObject({ error: 'HUMAN_CONFIRMATION_REQUIRED' });
    expect(writes.governed).not.toHaveBeenCalled();
  });

  it('CONTROL: a read runs through the same bridge', async () => {
    const out = JSON.parse(await bridge({ command: 'list_projects', params: {} }, { organizationId: 61, userId: 7 }));
    expect(out.result?.error).not.toBe('HUMAN_CONFIRMATION_REQUIRED');
    expect(out.result?.action).toBe('list_projects');
  });
});
