/**
 * Anthropic-hosted tools are offered only to a tenant whose placement policy
 * opts in (D6, plan WS2, OQ-PL-06).
 *
 * Until 2026-09-26 three environment flags decided, for every tenant on the
 * deployment alike, whether AnA was offered web search, web fetch and code
 * execution, all of which Anthropic runs on its own infrastructure. A
 * private-lane or zero-retention tenant was offered them like anyone else.
 * The gateway now withholds them per lane at dispatch as well
 * (server-tool-placement.test.ts); this pins that the toolset never offers
 * what the tenant has not opted into.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAllEnabledTools = vi.hoisted(() =>
  vi.fn(() => [
    { name: 'search_guidance', description: 'x', input_schema: { type: 'object' } },
    { type: 'web_search_20260209', name: 'web_search' },
    { type: 'web_fetch_20260209', name: 'web_fetch' },
    { type: 'code_execution_20260120', name: 'code_execution' },
  ]),
);
vi.mock('../AnaToolDefinitions.js', () => ({ getAllEnabledTools }));
vi.mock('../../vault/document-catalog.service.js', () => ({ isDocumentCatalogEnabled: async () => true }));

import { governedToolsetFor } from '../governed-toolset';
import {
  resetOrgPlacementResolver,
  setOrgPlacementResolver,
  type OrgPlacementPolicy,
} from '../../ai-gateway/providers/org-placement';

const pool = { query: vi.fn(async () => ({ rows: [] })) };
const names = (tools: Array<{ name: string }>) => tools.map(t => t.name);

function useTenantPolicy(policy: OrgPlacementPolicy | null | Error) {
  setOrgPlacementResolver({
    async resolve() {
      if (policy instanceof Error) throw policy;
      return policy;
    },
  });
}

beforeEach(() => pool.query.mockClear());
afterEach(() => resetOrgPlacementResolver());

describe('governedToolsetFor — Anthropic-hosted tools', () => {
  it('a tenant with no placement policy is offered none of them', async () => {
    useTenantPolicy(null);
    expect(names(await governedToolsetFor(pool, 42))).toEqual(['search_guidance']);
  });

  it('an opted-in tenant is offered web search and web fetch, never code execution', async () => {
    useTenantPolicy({ publicSourceFrontier: true, publicSourceEgress: true });
    expect(names(await governedToolsetFor(pool, 42))).toEqual(['search_guidance', 'web_search', 'web_fetch']);
  });

  it('a private-lane tenant is offered none, whatever its opt-in says', async () => {
    useTenantPolicy({ publicSourceFrontier: true, publicSourceEgress: true, allowedSubstrates: ['frontier_private'] });
    expect(names(await governedToolsetFor(pool, 42))).toEqual(['search_guidance']);
  });

  it('a zero-retention or residency-bound tenant is offered none', async () => {
    useTenantPolicy({ publicSourceFrontier: true, publicSourceEgress: true, zeroDataRetention: true });
    expect(names(await governedToolsetFor(pool, 42))).toEqual(['search_guidance']);
    useTenantPolicy({ publicSourceFrontier: true, publicSourceEgress: true, residency: 'eu' });
    expect(names(await governedToolsetFor(pool, 42))).toEqual(['search_guidance']);
  });

  it('a policy that cannot be read offers none (fail closed)', async () => {
    useTenantPolicy(new Error('connection reset'));
    expect(names(await governedToolsetFor(pool, 42))).toEqual(['search_guidance']);
  });

  it('an org-less turn is offered none', async () => {
    useTenantPolicy({ publicSourceFrontier: true, publicSourceEgress: true });
    expect(names(await governedToolsetFor(pool, null))).toEqual(['search_guidance']);
  });
});
