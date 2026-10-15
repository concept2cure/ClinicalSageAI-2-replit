/**
 * The production provider election as stored and as written — ADR-0014 §1, P1-45.
 *
 * The resolver keeps reporting what is stored (an absent row is null, a NULL
 * column is undefined); the election is the gateway's reading of it, through
 * providerElectionRefusal. The writer validates against the same reading, so an
 * administrator can elect OpenAI explicitly, and cannot store an election of
 * Moonshot that production would never honour.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  effectiveAllowedProviders,
  providerElectionRefusal,
  PRODUCTION_DEFAULT_PROVIDERS,
} from '../org-placement';
import { parsePlacementPolicyInput } from '../org-placement-writer';

const PROD = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
const DEV = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

describe('providerElectionRefusal', () => {
  it('in production with no election, allows exactly anthropic, bedrock and local', () => {
    expect([...PRODUCTION_DEFAULT_PROVIDERS].sort()).toEqual(['anthropic', 'bedrock', 'local']);
    for (const p of ['anthropic', 'bedrock', 'local'] as const) {
      expect(providerElectionRefusal(p, undefined, PROD)).toBeNull();
    }
    for (const p of ['openai', 'azure', 'vertex', 'moonshot'] as const) {
      expect(providerElectionRefusal(p, undefined, PROD)).toMatch(/ADR-0014 §1/);
    }
  });

  it('in production, openai / azure / vertex are allowed once named', () => {
    expect(providerElectionRefusal('openai', ['anthropic', 'openai'], PROD)).toBeNull();
    expect(providerElectionRefusal('azure', ['azure'], PROD)).toBeNull();
    expect(providerElectionRefusal('vertex', ['vertex'], PROD)).toBeNull();
    expect(providerElectionRefusal('openai', ['anthropic'], PROD)).toMatch(/not an AI service the organization has elected/);
  });

  it('in production, moonshot is refused even when named', () => {
    expect(providerElectionRefusal('moonshot', ['moonshot'], PROD)).toMatch(/not a production AI service/);
  });

  it('reads NODE_ENV the way config load does (trimmed, any case)', () => {
    expect(providerElectionRefusal('openai', undefined, { NODE_ENV: ' Production ' } as NodeJS.ProcessEnv)).not.toBeNull();
  });

  it('outside production refuses nothing', () => {
    for (const p of ['openai', 'azure', 'vertex', 'moonshot'] as const) {
      expect(providerElectionRefusal(p, undefined, DEV)).toBeNull();
    }
  });
});

describe('effectiveAllowedProviders', () => {
  it('production: absent → the default set; a list → that list without moonshot', () => {
    expect(effectiveAllowedProviders(null, PROD)?.sort()).toEqual(['anthropic', 'bedrock', 'local']);
    expect(effectiveAllowedProviders(['anthropic', 'openai', 'moonshot'], PROD)).toEqual(['anthropic', 'openai']);
  });

  it('outside production: absent → no constraint; a list → that list', () => {
    expect(effectiveAllowedProviders(null, DEV)).toBeNull();
    expect(effectiveAllowedProviders(['moonshot'], DEV)).toEqual(['moonshot']);
  });
});

describe('the placement-policy writer and the election', () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = saved;
  });

  const body = (allowedProviders: unknown, extra: Record<string, unknown> = {}) => ({
    residency: null,
    zeroDataRetention: false,
    allowedSubstrates: null,
    allowedProviders,
    publicSourceFrontier: false,
    publicSourceEgress: true,
    reasonForChange: 'Order Form 2026-10 lists OpenAI as a second provider.',
    ...extra,
  });

  it('production: an administrator can elect openai explicitly', () => {
    process.env.NODE_ENV = 'production';
    const parsed = parsePlacementPolicyInput(body(['anthropic', 'openai']));
    expect(parsed).toMatchObject({ ok: true, policy: { allowedProviders: ['anthropic', 'openai'] } });
  });

  it('production: a list that names moonshot is refused, naming ADR-0014 §1', () => {
    process.env.NODE_ENV = 'production';
    const parsed = parsePlacementPolicyInput(body(['anthropic', 'moonshot']));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toMatch(/moonshot.*ADR-0014 §1/);
  });

  it('production: NULL providers with a shared-only substrate list is satisfiable by the default set', () => {
    process.env.NODE_ENV = 'production';
    expect(parsePlacementPolicyInput(body(null, { allowedSubstrates: ['frontier_shared'] }))).toMatchObject({ ok: true });
  });

  it('outside production: moonshot may still be elected (development lane)', () => {
    process.env.NODE_ENV = 'development';
    expect(parsePlacementPolicyInput(body(['anthropic', 'moonshot']))).toMatchObject({ ok: true });
  });
});
