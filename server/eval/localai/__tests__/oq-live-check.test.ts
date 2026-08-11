/**
 * OQ live-check — offline invariants (CI-safe).
 *
 * Exercises the pure, network-free parts of the OQ runner: the on-prem/ZDR
 * routing invariants and the endpoint-configuration / client-activation
 * predicates. No live server is required; importing the runner must not dial
 * anything. The live probe (probeLocalEndpoint) is intentionally NOT called
 * here — it only runs against a configured endpoint.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertOnPremRoutingInvariants,
  isLocalEndpointConfigured,
  localClientActive,
} from '../oq-live-check';
import { resetPlacementRegistry } from '../../../services/ai-gateway/providers/placement';

const ENV_KEYS = [
  'LOCAL_AI_BASE_URL',
  'LITELLM_BASE_URL',
  'LOCAL_AI_API_KEY',
  'LITELLM_API_KEY',
  'OPENAI_ZERO_RETENTION',
  'ANTHROPIC_ZERO_RETENTION',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetPlacementRegistry();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetPlacementRegistry();
});

describe('assertOnPremRoutingInvariants', () => {
  it('passes: on-prem/ZDR routes only to the local substrate', () => {
    const result = assertOnPremRoutingInvariants();
    expect(result.ok).toBe(true);
    // Every required check must pass.
    for (const c of result.checks.filter(c => c.required)) {
      expect(c.pass, `${c.name}: ${c.detail}`).toBe(true);
    }
  });

  it('classifies local as self-hosted / on-prem / zero-retention', () => {
    const { checks } = assertOnPremRoutingInvariants();
    const byName = (n: string) => checks.find(c => c.name === n);
    expect(byName('local-substrate-self-hosted')?.pass).toBe(true);
    expect(byName('local-region-on-prem')?.pass).toBe(true);
    expect(byName('local-zero-data-retention')?.pass).toBe(true);
    expect(byName('local-satisfies-on-prem')?.pass).toBe(true);
    expect(byName('local-satisfies-zdr')?.pass).toBe(true);
  });

  it('excludes every frontier substrate from an on-prem residency requirement', () => {
    const { checks } = assertOnPremRoutingInvariants();
    const frontierChecks = checks.filter(c =>
      c.name.startsWith('frontier-') && c.name.endsWith('-excluded-from-on-prem'),
    );
    // openai, anthropic, moonshot, bedrock, vertex, azure.
    expect(frontierChecks).toHaveLength(6);
    for (const c of frontierChecks) {
      expect(c.required).toBe(true);
      expect(c.pass, c.detail).toBe(true);
    }
  });

  it('marks shared-frontier ZDR exclusion as informational (env-dependent)', () => {
    const { checks } = assertOnPremRoutingInvariants();
    const zdrChecks = checks.filter(c => c.name.includes('excluded-from-zdr-by-default'));
    expect(zdrChecks).toHaveLength(3);
    for (const c of zdrChecks) {
      expect(c.required).toBe(false);
      // With the ZDR env flags unset, shared frontier is not ZDR-compliant.
      expect(c.pass).toBe(true);
    }
  });
});

describe('endpoint configuration predicates', () => {
  it('reports no endpoint and no active client when unconfigured (CI default)', () => {
    expect(isLocalEndpointConfigured()).toBe(false);
    expect(localClientActive()).toBe(false);
  });

  it('reports a configured endpoint and an active client once a base URL is set', () => {
    process.env.LOCAL_AI_BASE_URL = 'http://vllm:8000/v1';
    expect(isLocalEndpointConfigured()).toBe(true);
    expect(localClientActive()).toBe(true);
  });

  it('honors the LITELLM_BASE_URL fallback', () => {
    process.env.LITELLM_BASE_URL = 'http://litellm:4000';
    expect(isLocalEndpointConfigured()).toBe(true);
    expect(localClientActive()).toBe(true);
  });
});
