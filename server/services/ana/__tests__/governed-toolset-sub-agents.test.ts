/**
 * run_agent is offered only to a turn that hosts sub-agents, and hosting reads
 * the tenant policy strictly (row 74, S5c; brief T6, D25).
 *
 * Every chat door composes governedToolsetFor. Only the SSE stream can lend a
 * child its host, so every other door must never be offered run_agent. And the
 * soft policy read answers "allow everything" on a settings read error: the
 * parent turn is attended, its children are not, so on that error no child may
 * be offered — the rest of the set is exactly what the soft read gives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAllEnabledTools = vi.hoisted(() =>
  vi.fn(() => [{ name: 'search_literature' }, { name: 'run_agent' }, { name: 'draft_section' }]),
);
const loadAnaToolPolicy = vi.hoisted(() => vi.fn());
const loadAnaToolPolicyStrict = vi.hoisted(() => vi.fn());

vi.mock('../AnaToolDefinitions.js', () => ({ getAllEnabledTools }));
vi.mock('../../vault/document-catalog.service.js', () => ({ isDocumentCatalogEnabled: async () => true }));
vi.mock('../../ana-ri/mdx-tool-policy.js', async () => {
  const actual = await vi.importActual<typeof import('../../ana-ri/mdx-tool-policy.js')>('../../ana-ri/mdx-tool-policy.js');
  return { ...actual, loadAnaToolPolicy, loadAnaToolPolicyStrict };
});

import { governedToolsetFor } from '../governed-toolset';

const pool = { query: vi.fn(async () => ({ rows: [] })) };
const names = (tools: Array<{ name: string }>) => tools.map(t => t.name);

beforeEach(() => {
  loadAnaToolPolicy.mockReset().mockResolvedValue({});
  loadAnaToolPolicyStrict.mockReset().mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe('who is offered run_agent', () => {
  it('a door that does not host agents is never offered it', async () => {
    expect(names(await governedToolsetFor(pool, 42))).toEqual(['search_literature', 'draft_section']);
  });
  it('a hosting turn is offered it', async () => {
    expect(names(await governedToolsetFor(pool, 42, { hostsSubAgents: true }))).toContain('run_agent');
  });
  it('the kill switch withholds it even from a hosting turn', async () => {
    vi.stubEnv('ANA_ENABLE_SUB_AGENTS', 'false');
    expect(names(await governedToolsetFor(pool, 42, { hostsSubAgents: true }))).not.toContain('run_agent');
  });
  it('in production it is withheld unless switched on (ADR-0015 §2)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'off');
    expect(names(await governedToolsetFor(pool, 42, { hostsSubAgents: true }))).not.toContain('run_agent');
    vi.stubEnv('ANA_ENABLE_SUB_AGENTS', 'true');
    expect(names(await governedToolsetFor(pool, 42, { hostsSubAgents: true }))).toContain('run_agent');
  });
  it('an org-less turn is never offered it', async () => {
    expect(names(await governedToolsetFor(pool, null, { hostsSubAgents: true }))).not.toContain('run_agent');
  });
});

describe('hosting reads the tenant policy strictly (D25)', () => {
  it('a strict read error withholds run_agent; the rest is what the soft read gives', async () => {
    loadAnaToolPolicyStrict.mockRejectedValue(new Error('settings unreadable'));
    const hosted = names(await governedToolsetFor(pool, 42, { hostsSubAgents: true }));
    expect(hosted).not.toContain('run_agent');
    expect(hosted).toEqual(names(await governedToolsetFor(pool, 42)));
  });
  it('a strict read that resolves applies the deny list to the whole set', async () => {
    loadAnaToolPolicyStrict.mockResolvedValue({ deny: ['search_literature'] });
    const hosted = names(await governedToolsetFor(pool, 42, { hostsSubAgents: true }));
    expect(hosted).toEqual(['run_agent', 'draft_section']);
    expect(loadAnaToolPolicy).not.toHaveBeenCalled();
  });
  it('a tenant that denies run_agent is never offered it', async () => {
    loadAnaToolPolicyStrict.mockResolvedValue({ deny: ['run_agent'] });
    expect(names(await governedToolsetFor(pool, 42, { hostsSubAgents: true }))).not.toContain('run_agent');
  });
  it('a door that does not host keeps the soft read, untouched', async () => {
    await governedToolsetFor(pool, 42);
    expect(loadAnaToolPolicy).toHaveBeenCalledTimes(1);
    expect(loadAnaToolPolicyStrict).not.toHaveBeenCalled();
  });
});
