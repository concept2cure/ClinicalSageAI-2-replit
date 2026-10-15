/**
 * Deterministic mode must not serve fixed responses in production unless the
 * operator has accepted exactly that risk by name.
 *
 * `AI_GATEWAY_DETERMINISTIC=true` makes the gateway answer every request with
 * a canned response ("Deterministic mode active…", `[KNOWN]` placeholders).
 * Until 2026-09-28 nothing refused it in production, and `/readyz` reported
 * the process ready (startup/ana-readiness-state.ts names the state
 * 'deterministic' and lets it pass). A production deployment carrying the
 * flag would have written placeholder text into governed drafts while every
 * health check read green — fixture content reachable in production
 * (docs/LAUNCH_DEFINITION_OF_DONE.md row D2).
 *
 * The acceptance is its own variable, not AI_GOVERNANCE_ACCEPT_PERMISSIVE: an
 * operator who accepted a permissive PII screen for a synthetic-data pilot has
 * not thereby accepted fabricated drafting.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AIGateway } from '../gateway';
import {
  acceptsDeterministicMode,
  assertDeterministicServingAllowed,
  isDeterministicModeRequested,
} from '../deterministic-mode';

const env = (o: Record<string, string>) => o as NodeJS.ProcessEnv;

function deterministicGateway(): AIGateway {
  return new AIGateway({ deterministicMode: true, auditEnabled: false, providers: [] });
}

/* Bound to a tenant, so each case tests the deterministic acceptance and not
   ADR-0015 §5's refusal of an unbound call in production, which would
   otherwise answer first (added 2026-09-29, row 74, when the two production
   refusals met in one tree). The last case pins that ordering. */
const TENANT = { organizationId: 7 };

describe('deterministic mode — the gateway at request time (defence in depth)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.AI_GATEWAY_ACCEPT_DETERMINISTIC;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses to serve a fixed response in production without the acceptance', async () => {
    process.env.NODE_ENV = 'production';
    await expect(deterministicGateway().complete('Draft section 2.7.3', TENANT)).rejects.toThrow(
      /AI_GATEWAY_ACCEPT_DETERMINISTIC/,
    );
  });

  it('serves it in production only when AI_GATEWAY_ACCEPT_DETERMINISTIC=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_GATEWAY_ACCEPT_DETERMINISTIC = 'true';
    await expect(deterministicGateway().complete('Draft section 2.7.3', TENANT)).resolves.toEqual(expect.any(String));
  });

  it('does not treat the permissive-governance acceptance as accepting fixed responses', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_GOVERNANCE_ACCEPT_PERMISSIVE = 'true';
    await expect(deterministicGateway().complete('Draft section 2.7.3', TENANT)).rejects.toThrow(
      /AI_GATEWAY_ACCEPT_DETERMINISTIC/,
    );
  });

  it('an unbound call in production is refused for its missing tenant before any fixed response is considered', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_GATEWAY_ACCEPT_DETERMINISTIC = 'true';
    await expect(deterministicGateway().complete('Draft section 2.7.3')).rejects.toMatchObject({
      reasonCode: 'DENY_NO_TENANT_BINDING',
    });
  });

  it('is unchanged outside production (tests and development rely on it)', async () => {
    process.env.NODE_ENV = 'test';
    await expect(deterministicGateway().complete('Draft section 2.7.3', TENANT)).resolves.toEqual(expect.any(String));
  });
});

describe('deterministic mode — the shared predicates', () => {
  it('reads the flag exactly as the gateway config does, legacy alias included', () => {
    expect(isDeterministicModeRequested(env({}))).toBe(false);
    expect(isDeterministicModeRequested(env({ AI_GATEWAY_DETERMINISTIC: 'true' }))).toBe(true);
    expect(isDeterministicModeRequested(env({ DETERMINISTIC_MODE: 'true' }))).toBe(true);
    expect(isDeterministicModeRequested(env({ AI_GATEWAY_DETERMINISTIC: '1' }))).toBe(false);
  });

  it('accepts only the literal "true"', () => {
    expect(acceptsDeterministicMode(env({ AI_GATEWAY_ACCEPT_DETERMINISTIC: 'true' }))).toBe(true);
    expect(acceptsDeterministicMode(env({ AI_GATEWAY_ACCEPT_DETERMINISTIC: '1' }))).toBe(false);
    expect(acceptsDeterministicMode(env({ AI_GATEWAY_ACCEPT_DETERMINISTIC: 'TRUE ' }))).toBe(false);
  });

  it('assertDeterministicServingAllowed throws only in unaccepted production', () => {
    expect(() => assertDeterministicServingAllowed(env({ NODE_ENV: 'production' }))).toThrow(
      /AI_GATEWAY_ACCEPT_DETERMINISTIC/,
    );
    expect(() =>
      assertDeterministicServingAllowed(env({ NODE_ENV: 'production', AI_GATEWAY_ACCEPT_DETERMINISTIC: 'true' })),
    ).not.toThrow();
    expect(() => assertDeterministicServingAllowed(env({ NODE_ENV: 'development' }))).not.toThrow();
  });
});

/**
 * WO-16 #101 (a): a fixed response asserted [KNOWN] findings about a document
 * no model had read. Every task type is checked through the real gateway, not a
 * copy of the strings, so the fixtures cannot drift from what this pins.
 */
describe('deterministic mode — fixed responses claim nothing about the input', () => {
  const TASK_TYPES = [
    'chat',
    'document_analysis',
    'document_drafting',
    'structured_output',
    'regulatory_review',
    'code_generation',
    'summarization',
    'embedding',
    'general',
  ] as const;

  it.each(TASK_TYPES)('%s: no [KNOWN] or [INFERRED] marker', async (taskType) => {
    const content = await new AIGateway({ deterministicMode: true, auditEnabled: false, providers: [] }).complete(
      'Review the attached Module 3 specification',
      { taskType },
    );
    expect(content).not.toMatch(/\[KNOWN\]|\[INFERRED\]/);
  });

  it('structured_output does not report success', async () => {
    const content = await new AIGateway({ deterministicMode: true, auditEnabled: false, providers: [] }).complete(
      'Return the readiness verdict as JSON',
      { taskType: 'structured_output' },
    );
    expect(JSON.parse(content).status).not.toBe('success');
  });
});
