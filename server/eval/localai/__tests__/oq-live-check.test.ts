/**
 * OQ live-check — offline invariants (CI-safe).
 *
 * Exercises the pure, network-free parts of the OQ runner: the on-prem/ZDR
 * routing invariants and the endpoint-configuration / client-activation
 * predicates. No live server is required; importing the runner must not dial
 * anything. The live probe (probeLocalEndpoint) is intentionally NOT called
 * here — it only runs against a configured endpoint.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  assertOnPremRoutingInvariants,
  isLocalEndpointConfigured,
  localClientActive,
  localQualificationReadiness,
  probeLocalEndpoint,
} from '../oq-live-check';
import { resetPlacementRegistry } from '../../../services/ai-gateway/providers/placement';
import * as providers from '../../../services/ai-gateway/providers/clients';
import { CLOUD_MODELS } from '../../../services/ai-gateway/providers/cloud-models';
import { APPROVED_MODELS } from '../../../services/ai-governance/approved-models';

const ENV_KEYS = [
  'AI_LOCAL_ENABLED',
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
  vi.restoreAllMocks();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetPlacementRegistry();
});

function localFixture() {
  const version = `fixture-weights@sha256:${'a'.repeat(64)}`;
  const row = CLOUD_MODELS.find(model => model.provider === 'local')!;
  const entry = APPROVED_MODELS.find(model => model.id === row.id)!;
  return { env: { AI_LOCAL_ENABLED: 'true', LOCAL_AI_BASE_URL: 'http://fixture-local.invalid/v1' },
    registry: [{ ...row, model: version }], entries: [{ ...entry, pinnedVersion: version,
      pq: { ...entry.pq, pinKind: 'weights_sha256' as const } }] };
}

describe('local qualification identity and deployment readiness', () => {
  it('reports the actual unconfigured placeholder without contacting any provider', () => {
    const factory = vi.spyOn(providers, 'createLocalClient');
    const result = localQualificationReadiness();
    expect(result).toMatchObject({ status: 'blocked', readyToEvaluate: false, qualifiesModel: false,
      endpointConfigured: false, routingEnabled: false, expectedModel: { immutablePin: false },
      runtimeIdentity: { status: 'not_probed' }, weightsVerification: 'not_independently_verified' });
    expect(result.blockers.map(blocker => blocker.code)).toContain('LOCAL_PIN_NOT_CONCRETE');
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not probe a disabled or nominal local lane', async () => {
    const factory = vi.spyOn(providers, 'createLocalClient');
    const fixture = localFixture();
    await expect(probeLocalEndpoint({ ...fixture, env: { ...fixture.env, AI_LOCAL_ENABLED: 'false' } })).resolves.toMatchObject({ ok: false });
    await expect(probeLocalEndpoint({ env: fixture.env })).resolves.toMatchObject({ ok: false });
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([{ ids: [] }, { ids: ['local-default'] }, { ids: [`other@sha256:${'b'.repeat(64)}`] }])('refuses reachable inventory without the exact immutable identity: %j', async ({ ids }) => {
    const list = vi.fn().mockResolvedValue({ data: ids.map(id => ({ id })) });
    vi.spyOn(providers, 'createLocalClient').mockReturnValue({ models: { list } });
    const result = await probeLocalEndpoint(localFixture());
    expect(result).toMatchObject({ ok: false, error: 'LOCAL_IDENTITY_NOT_REPORTED', models: [],
      readiness: { qualifiesModel: false, runtimeIdentity: { status: 'mismatched', reportedModelCount: ids.length } } });
    expect(list).toHaveBeenCalledOnce();
  });

  it('keeps an exact runtime identity declaration separate from independently measured weights and PQ', async () => {
    const fixture = localFixture();
    const version = fixture.registry[0].model;
    vi.spyOn(providers, 'createLocalClient').mockReturnValue({ models: { list: vi.fn().mockResolvedValue({ data: [{ id: version }] }) } });
    const result = await probeLocalEndpoint(fixture);
    expect(result).toMatchObject({ ok: false, error: 'LOCAL_DEPLOYMENT_EVIDENCE_REQUIRED', models: [version],
      readiness: { readyToEvaluate: false, qualifiesModel: false, weightsVerification: 'not_independently_verified',
        runtimeIdentity: { status: 'matched', matchedModel: version } } });
  });

  it('keeps arbitrary discovery errors and unknown model identifiers out of diagnostic output', async () => {
    vi.spyOn(providers, 'createLocalClient').mockReturnValue({ models: { list: vi.fn().mockRejectedValue(new Error('PRIVATE_LOCAL_KEY_CANARY')) } });
    const result = await probeLocalEndpoint(localFixture());
    expect(result.error).toBe('LOCAL_DISCOVERY_FAILED');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_LOCAL_KEY_CANARY');
    const assessment = localQualificationReadiness({ ...localFixture(), reportedModels: ['PRIVATE_LOCAL_KEY_CANARY'] });
    expect(JSON.stringify(assessment)).not.toContain('PRIVATE_LOCAL_KEY_CANARY');
  });
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
