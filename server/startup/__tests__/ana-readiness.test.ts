/**
 * Regression tests for the AnA readiness gate.
 *
 * The defect these exist to catch: a process with no AI provider configured
 * booted clean, reported `ready: true` on /readyz, took live traffic, and then
 * returned 503 GATEWAY_UNAVAILABLE on every single AnA turn. The platform was
 * up; the product was dead; nothing said so until a human typed a question.
 *
 * Per the repo working agreement, a gate that has only been seen to pass has
 * not been tested. The load-bearing case here is the LAST describe block:
 * every other dependency healthy, AnA down, and /readyz must still go red. If
 * the AnA check is ever removed from /readyz, that block fails and nothing
 * else does.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateAnaReadiness,
  getAnaReadiness,
  getAnaReadinessDetail,
  isAnaReadinessServing,
  logAnaReadinessBanner,
  resetAnaReadinessForTests,
  setAnaReadiness,
} from '../ana-readiness-state';
import { setSchemaReadiness, resetSchemaReadinessForTests } from '../readiness-state';
import { mountFastPathHealthEndpoints } from '../inline-endpoints';

// The gateway is stubbed so each provider posture can be reproduced exactly.
// `gatewayStub` is reassigned per test; `getGateway` reads it at call time.
let gatewayStub: unknown;
let getGatewayThrows: Error | null = null;

vi.mock('../../services/ai-gateway/index.js', () => ({
  getGateway: () => {
    if (getGatewayThrows) throw getGatewayThrows;
    return gatewayStub;
  },
}));

function gateway(opts: { providers: string[]; deterministic?: boolean }) {
  return {
    getEnabledProviders: () => opts.providers,
    isDeterministic: () => Boolean(opts.deterministic),
  };
}

beforeEach(() => {
  resetAnaReadinessForTests();
  resetSchemaReadinessForTests();
  gatewayStub = gateway({ providers: ['anthropic'] });
  getGatewayThrows = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAnaReadiness', () => {
  it('reports no_provider — the incident — when the gateway has zero providers', async () => {
    gatewayStub = gateway({ providers: [] });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('no_provider');
    expect(isAnaReadinessServing(state)).toBe(false);
    // The detail has to name the fix. An operator reading a red probe at 2am
    // should not have to grep the source to learn which variable is missing.
    expect(getAnaReadinessDetail()).toContain('ANTHROPIC_API_KEY');
  });

  it('reports ready and names the providers when at least one is enabled', async () => {
    gatewayStub = gateway({ providers: ['anthropic', 'openai'] });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('ready');
    expect(isAnaReadinessServing(state)).toBe(true);
    expect(getAnaReadinessDetail()).toContain('anthropic');
  });

  it('reports deterministic — never ready — when the fixture mode is opted into', async () => {
    // Deterministic mode has no providers by design. Reporting it as
    // `no_provider` would call a deliberate test posture an outage; reporting
    // it as `ready` would let canned fixtures pass for live model output.
    gatewayStub = gateway({ providers: [], deterministic: true });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('deterministic');
    expect(state).not.toBe('ready');
    expect(isAnaReadinessServing(state)).toBe(true);
  });

  it('reports error rather than throwing when the gateway cannot be constructed', async () => {
    getGatewayThrows = new Error('provider config is malformed');

    const state = await evaluateAnaReadiness();

    expect(state).toBe('error');
    expect(isAnaReadinessServing(state)).toBe(false);
    expect(getAnaReadinessDetail()).toContain('provider config is malformed');
  });

  it('reports error when getGateway returns nothing', async () => {
    gatewayStub = null;

    expect(await evaluateAnaReadiness()).toBe('error');
  });

  it('defaults to unknown, and unknown does not serve', async () => {
    // 'unknown' means no boot path recorded a verdict. That is not a yes.
    expect(getAnaReadiness()).toBe('unknown');
    expect(isAnaReadinessServing()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('logAnaReadinessBanner', () => {
  it('prints to console.error when AnA cannot answer', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAnaReadiness('no_provider', 'No AI provider is configured.');

    logAnaReadinessBanner();

    expect(spy).toHaveBeenCalledOnce();
    // The banner is the half of the fix aimed at a human at a terminal, so its
    // job is to be unskimmable. Assert the words that carry the meaning.
    expect(spy.mock.calls[0][0]).toContain('AnA CANNOT ANSWER');
    expect(spy.mock.calls[0][0]).toContain('503 GATEWAY_UNAVAILABLE');
  });

  it('warns — not errors — that responses are fixtures in deterministic mode', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setAnaReadiness('deterministic', 'AI_GATEWAY_DETERMINISTIC is set');

    logAnaReadinessBanner();

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('DETERMINISTIC');
  });

  it('stays quiet on the happy path', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setAnaReadiness('ready', 'AnA has 1 provider(s): anthropic');

    logAnaReadinessBanner();

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('/readyz — AnA is load-bearing', () => {
  /** A pool whose `select 1` succeeds, so `database` is never the failing dep. */
  const livePool = { query: async () => ({ rows: [{ '?column?': 1 }] }) } as never;

  function app() {
    const a = express();
    mountFastPathHealthEndpoints(a, livePool);
    return a;
  }

  beforeEach(() => {
    // Everything except AnA is healthy for every case below, so AnA is the
    // only variable. Redis is unconfigured, which /readyz skips by design.
    setSchemaReadiness('ready', '');
    delete process.env.REDIS_URL;
    delete process.env.REDIS_TLS_URL;
  });

  it('is NOT ready when AnA has no provider, with every other dependency green', async () => {
    // ── The regression. This is the exact production posture that shipped: a
    // healthy database, a verified schema, all routes mounted — and an AnA who
    // 503s on every turn. It used to answer 200 ready:true.
    setAnaReadiness('no_provider', 'No AI provider is configured. Set ANTHROPIC_API_KEY');

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.failed).toEqual(['ana']);
    expect(res.body.dependencies.database).toBe('ok');
    expect(res.body.dependencies.schema).toBe('ok');
    expect(res.body.dependencies.ana).toBe('down');
    expect(res.body.anaDetail).toContain('ANTHROPIC_API_KEY');
  });

  it('is NOT ready when AnA readiness was never evaluated', async () => {
    // 'unknown' is the default. If a boot path ever returns without recording
    // a verdict, the probe must fail rather than assume the best.
    resetAnaReadinessForTests();

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.failed).toContain('ana');
    expect(res.body.anaDetail).toContain('never verified');
  });

  it('is NOT ready when the gateway failed to construct', async () => {
    setAnaReadiness('error', 'AI gateway could not be constructed: bad config');

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.failed).toContain('ana');
  });

  it('is ready when AnA has a live provider', async () => {
    setAnaReadiness('ready', 'AnA has 1 provider(s): anthropic');

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.dependencies.ana).toBe('ok');
    expect(res.body.anaState).toBe('ready');
  });

  it('serves in deterministic mode but says so on the success path', async () => {
    // A 200 that hides the fixture posture is how "it looked fine in staging"
    // happens. The distinction has to survive onto the healthy response.
    setAnaReadiness('deterministic', 'AI_GATEWAY_DETERMINISTIC is set — fixed responses');

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(200);
    expect(res.body.anaState).toBe('deterministic');
    expect(res.body.anaDetail).toContain('AI_GATEWAY_DETERMINISTIC');
  });
});
