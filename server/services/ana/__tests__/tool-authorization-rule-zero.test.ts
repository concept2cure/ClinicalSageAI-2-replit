/**
 * Rule 0 of the handler wrapper: below the parent, AnA's tools only read
 * (row 74, slice S3).
 *
 * A sub-agent (a later slice) runs tools on its own, with no person watching
 * and no way to ask one. So at `agentDepth >= 1` the wrapper refuses every tool
 * the register does not class `read` — BEFORE rules 1-3. The ordering is the
 * point: after rule 3, a confirm-class write would come back as
 * HUMAN_CONFIRMATION_REQUIRED carrying a ready-to-run proposal, and a child has
 * nobody to put it to. Refused first, it produces no proposal at all.
 *
 * Inert until something sets agentDepth: nothing in S3 does, and the depth-0
 * cases below pin the wrapper exactly as tool-authorization-enforcement.test.ts
 * (run unchanged) does.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

/* The proposal builder rule 3 uses, spied: a child must never reach it. */
const proposals = vi.hoisted(() => ({ built: [] as string[] }));
vi.mock('../../ana-ri/part11-governance.js', async importOriginal => {
  const real = await importOriginal<typeof import('../../ana-ri/part11-governance.js')>();
  return {
    ...real,
    buildHumanConfirmationRequiredResult: (name: string, input: Record<string, unknown>) => {
      proposals.built.push(name);
      return real.buildHumanConfirmationRequiredResult(name, input);
    },
  };
});

/* Probe tools standing for each register class, so "the handler did not run" can be seen. */
vi.mock('../tool-authorization.js', async importOriginal => {
  const real = await importOriginal<typeof import('../tool-authorization.js')>();
  const probeClass: Record<string, string> = {
    zz_rule0_read: 'read',
    zz_rule0_self: 'self',
    zz_rule0_confirm: 'confirm',
    zz_rule0_command: 'command',
  };
  return {
    ...real,
    toolAuthorizationOf: (name: string, input: unknown) =>
      probeClass[name] ? ({ class: probeClass[name] } as ReturnType<typeof real.toolAuthorizationOf>) : real.toolAuthorizationOf(name, input),
  };
});

import { getToolHandler, registerToolHandler } from '../AnaToolExecutor.js';

const CTX = { organizationId: 1, userId: 2 };
const run = async (tool: string, input: Record<string, unknown>, ctx: Record<string, unknown>) =>
  JSON.parse(await getToolHandler(tool)!(input, ctx as any));

const probes = {
  zz_rule0_read: vi.fn(async () => JSON.stringify({ ok: 'read' })),
  zz_rule0_self: vi.fn(async () => JSON.stringify({ ok: 'self' })),
  zz_rule0_confirm: vi.fn(async () => JSON.stringify({ ok: 'confirm' })),
  zz_rule0_command: vi.fn(async () => JSON.stringify({ ok: 'command' })),
};
for (const [name, fn] of Object.entries(probes)) registerToolHandler(name, fn);

beforeEach(() => {
  proposals.built = [];
  for (const fn of Object.values(probes)) fn.mockClear();
  resolveSignerOrgRole.mockClear();
});

const READ_ONLY = (tool: string) => ({
  error: 'SUB_AGENT_READ_ONLY',
  tool,
  message: 'A sub-agent can only read; nothing was run.',
});

describe('rule 0: at depth 1, anything but a read is refused before it is proposed', () => {
  it.each([
    ['save_document_to_vault', 'confirm', { title: 'x', content: 'y' }],
    ['approve_qms_document', 'refuse', { document_id: 1 }],
    ['convene_drafting_council', 'self', { section_path: '2.5' }],
    ['execute_platform_command', 'command', { command: 'list_projects' }],
  ])('%s (%s) → SUB_AGENT_READ_ONLY, and no proposal is built', async (tool, _cls, input) => {
    expect(await run(tool, input, { ...CTX, agentDepth: 1 })).toEqual(READ_ONLY(tool));
    expect(proposals.built, 'a child produced a confirmation proposal').toEqual([]);
  });

  it.each(['zz_rule0_self', 'zz_rule0_confirm', 'zz_rule0_command'] as const)(
    '%s: the handler never runs, not even with a confirmation in the context',
    async tool => {
      expect(await run(tool, { a: 1 }, { ...CTX, agentDepth: 1, humanConfirmed: true })).toEqual(READ_ONLY(tool));
      expect(probes[tool]).not.toHaveBeenCalled();
      expect(resolveSignerOrgRole, 'the role check ran for a refused child call').not.toHaveBeenCalled();
    },
  );

  it('a tool nobody classified is refused as not-a-read, not proposed', async () => {
    const unclassified = vi.fn(async () => 'ran');
    registerToolHandler('zz_rule0_unclassified', unclassified);
    expect(await run('zz_rule0_unclassified', {}, { ...CTX, agentDepth: 1 })).toEqual(READ_ONLY('zz_rule0_unclassified'));
    expect(unclassified).not.toHaveBeenCalled();
    expect(proposals.built).toEqual([]);
  });

  it('a read runs', async () => {
    expect(await run('zz_rule0_read', {}, { ...CTX, agentDepth: 1 })).toEqual({ ok: 'read' });
    expect(probes.zz_rule0_read).toHaveBeenCalledTimes(1);
  });

  it('a real read tool runs (check_numerical_integrity)', async () => {
    const out = await run(
      'check_numerical_integrity',
      { content: 'The sample size was N = 120. Later, N = 120 subjects were randomized.' },
      { ...CTX, agentDepth: 1 },
    );
    expect(out.error).not.toBe('SUB_AGENT_READ_ONLY');
  });

  it('deeper still is refused the same way', async () => {
    expect(await run('zz_rule0_self', {}, { ...CTX, agentDepth: 2 })).toEqual(READ_ONLY('zz_rule0_self'));
  });
});

describe('at depth 0, or with no depth, nothing changes', () => {
  it.each([undefined, 0])('agentDepth %s: a confirm tool is still proposed, not refused', async depth => {
    const out = await run('save_document_to_vault', { title: 'x', content: 'y' }, {
      ...CTX,
      ...(depth === undefined ? {} : { agentDepth: depth }),
      servingModel: { provider: 'anthropic', model: 'claude-opus-4-8' },
    });
    expect(out.error).not.toBe('SUB_AGENT_READ_ONLY');
  });

  it.each([undefined, 0])('agentDepth %s: an unclassified probe is proposed as before', async depth => {
    const out = await run('zz_rule0_confirm', { a: 1 }, { ...CTX, ...(depth === undefined ? {} : { agentDepth: depth }) });
    expect(out).toMatchObject({ error: 'HUMAN_CONFIRMATION_REQUIRED' });
    expect(proposals.built).toEqual(['zz_rule0_confirm']);
    expect(probes.zz_rule0_confirm).not.toHaveBeenCalled();
  });

  it('a self-class tool runs at depth 0', async () => {
    expect(await run('zz_rule0_self', {}, { ...CTX, agentDepth: 0 })).toEqual({ ok: 'self' });
  });
});
