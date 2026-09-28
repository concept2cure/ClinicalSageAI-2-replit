/**
 * The one rule for where an Anthropic-hosted tool may run (D6, plan WS2).
 * Pure: the gateway and the toolset both call it, so it is pinned once here.
 */
import { describe, expect, it } from 'vitest';
import { governServerTools, isServerTool, serverToolWithheldReason } from '../server-tool-policy';
import type { GatewayRequest } from '../types';

const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search' };
const CODE = { type: 'code_execution_20260120', name: 'code_execution' };
const OPTED_IN: GatewayRequest['sensitiveTenantPolicy'] = {
  resolution: 'resolved',
  organizationId: 42,
  publicSourceFrontier: true,
  publicSourceEgress: true,
};

describe('isServerTool', () => {
  it('is a typed tool without an input schema', () => {
    expect(isServerTool(WEB_SEARCH)).toBe(true);
    expect(isServerTool({ name: 'lookup', input_schema: { type: 'object' } })).toBe(false);
    expect(isServerTool({ type: 'custom', name: 'lookup' })).toBe(false);
    expect(isServerTool(null)).toBe(false);
  });
});

describe('serverToolWithheldReason', () => {
  it('withholds on every lane but first-party Anthropic', () => {
    for (const provider of ['bedrock', 'vertex', 'openai', 'azure', 'moonshot', 'local'] as const) {
      expect(serverToolWithheldReason(WEB_SEARCH, { provider, tenant: OPTED_IN })).toBe('not_first_party');
    }
    expect(serverToolWithheldReason(WEB_SEARCH, { provider: 'anthropic', tenant: OPTED_IN })).toBeNull();
  });

  it('never runs a tenant payload in hosted code execution; a public one may', () => {
    expect(serverToolWithheldReason(CODE, { provider: 'anthropic', tenant: OPTED_IN })).toBe(
      'tenant_data_to_hosted_execution',
    );
    expect(
      serverToolWithheldReason(CODE, { provider: 'anthropic', tenant: OPTED_IN, payloadProvenance: 'public' }),
    ).toBeNull();
  });

  it('needs the tenant opt-in, and reads an unreadable policy as no opt-in', () => {
    const at = (tenant: GatewayRequest['sensitiveTenantPolicy']) =>
      serverToolWithheldReason(WEB_SEARCH, { provider: 'anthropic', tenant });
    expect(at({ resolution: 'absent', organizationId: 42 })).toBe('tenant_not_opted_in');
    expect(at({ resolution: 'unknown', unknownReason: 'lookup_failed', organizationId: 42 })).toBe(
      'tenant_policy_unknown',
    );
    expect(at({ ...OPTED_IN, publicSourceFrontier: false })).toBe('tenant_not_opted_in');
    expect(at({ ...OPTED_IN, publicSourceEgress: false })).toBe('tenant_not_opted_in');
    expect(at({ ...OPTED_IN, zeroDataRetention: true })).toBe('tenant_not_opted_in');
    expect(at({ ...OPTED_IN, residency: 'us' })).toBe('tenant_not_opted_in');
    expect(at({ ...OPTED_IN, allowedProviders: ['bedrock'] })).toBe('tenant_not_opted_in');
    expect(at({ ...OPTED_IN, allowedSubstrates: ['frontier_private'] })).toBe('tenant_not_opted_in');
  });

  it('does not hold back work that carries no tenant', () => {
    expect(
      serverToolWithheldReason(WEB_SEARCH, {
        provider: 'anthropic',
        tenant: { resolution: 'absent', boundFrom: 'platform_scope' },
      }),
    ).toBeNull();
  });
});

describe('governServerTools', () => {
  const request = (tools: unknown[], toolChoice?: GatewayRequest['toolChoice']): GatewayRequest => ({
    taskType: 'chat',
    messages: [{ role: 'user', content: 'x' }],
    tools: tools as GatewayRequest['tools'],
    toolChoice,
    sensitiveTenantPolicy: OPTED_IN,
  });

  it('returns the same request when nothing is withheld', () => {
    const r = request([WEB_SEARCH]);
    expect(governServerTools('anthropic', r)).toEqual({ request: r, withheld: [] });
  });

  it('keeps custom tools and a tool choice that names one of them', () => {
    const lookup = { name: 'lookup', input_schema: { type: 'object' } };
    const { request: out, withheld } = governServerTools(
      'bedrock',
      request([lookup, WEB_SEARCH], { type: 'tool', name: 'lookup' }),
    );
    expect(out.tools).toEqual([lookup]);
    expect(out.toolChoice).toEqual({ type: 'tool', name: 'lookup' });
    expect(withheld).toEqual([{ name: 'web_search', reason: 'not_first_party' }]);
  });

  it('drops the tool choice when no tool is left to choose', () => {
    const { request: out } = governServerTools('vertex', request([WEB_SEARCH], 'any'));
    expect(out.tools).toBeUndefined();
    expect(out.toolChoice).toBeUndefined();
  });
});
