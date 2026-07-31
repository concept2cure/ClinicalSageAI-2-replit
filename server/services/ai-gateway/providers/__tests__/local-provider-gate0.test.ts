/**
 * LocalAI on-prem inference — Gate 0 OQ smoke test.
 *
 * Operational Qualification for the *generation lane* of the air-gapped /
 * on-prem inference capability (see LOCALAI_ONPREM_INFERENCE_PILOT_PLAN). This
 * is the runnable, CI-safe portion of OQ — it needs no live model server. It
 * qualifies two invariants that must hold before any residency-constrained
 * paying client is served on-prem:
 *
 *   1. No accidental activation — the local generation client only exists when
 *      an operator explicitly configures a base URL. A missing config must
 *      yield `null` (the gateway then simply has no local provider), never a
 *      half-wired client pointed at a default.
 *   2. Correct residency/ZDR routing — the `local` substrate is the only one
 *      that satisfies an on-prem / zero-data-retention requirement, and shared
 *      frontier providers are excluded from it. This is what guarantees a
 *      tenant who "cannot send data to any third party" is routed to on-prem
 *      inference and never silently falls back to a frontier API.
 *
 * The live-server parts of OQ (air-gap egress capture, audit-trail row per
 * call, PII-screen enforcement) run against a deployed endpoint and are tracked
 * in the pilot plan's OQ checklist, not here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLocalClient } from '../clients';
import {
  resolvePlacement,
  resetPlacementRegistry,
  isPlacementCompliant,
  buildPlacementRegistry,
} from '../placement';

const LOCAL_ENV_KEYS = [
  'LOCAL_AI_BASE_URL',
  'LITELLM_BASE_URL',
  'LOCAL_AI_API_KEY',
  'LITELLM_API_KEY',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of LOCAL_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetPlacementRegistry();
});

afterEach(() => {
  for (const k of LOCAL_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetPlacementRegistry();
});

describe('Gate 0 — local generation client activation', () => {
  it('returns null when no local base URL is configured (no accidental activation)', () => {
    expect(createLocalClient()).toBeNull();
  });

  it('returns a client when LOCAL_AI_BASE_URL is set', () => {
    process.env.LOCAL_AI_BASE_URL = 'http://vllm:8000/v1';
    const client = createLocalClient();
    expect(client).toBeTruthy();
    // OpenAI-compatible surface the gateway's executeOpenAI path relies on.
    expect(typeof client.chat?.completions?.create).toBe('function');
  });

  it('falls back to LITELLM_BASE_URL when LOCAL_AI_BASE_URL is absent', () => {
    process.env.LITELLM_BASE_URL = 'http://litellm:4000';
    expect(createLocalClient()).toBeTruthy();
  });
});

describe('Gate 0 — on-prem / ZDR residency routing', () => {
  it('classifies the local substrate as self-hosted, on-prem, zero-retention', () => {
    const local = resolvePlacement('local');
    expect(local.substrate).toBe('self_hosted');
    expect(local.regions).toEqual(['on_prem']);
    expect(local.zeroDataRetention).toBe(true);
  });

  it('routes an on-prem-residency requirement ONLY to the local substrate', () => {
    const reg = buildPlacementRegistry();
    expect(isPlacementCompliant(reg.local, { residency: 'on_prem' })).toBe(true);
    // Every frontier substrate must be excluded — no silent fallback off-prem.
    expect(isPlacementCompliant(reg.openai, { residency: 'on_prem' })).toBe(false);
    expect(isPlacementCompliant(reg.anthropic, { residency: 'on_prem' })).toBe(false);
    expect(isPlacementCompliant(reg.bedrock, { residency: 'on_prem' })).toBe(false);
    expect(isPlacementCompliant(reg.azure, { residency: 'on_prem' })).toBe(false);
  });

  it('satisfies a zero-data-retention requirement while shared frontier does not', () => {
    const reg = buildPlacementRegistry();
    expect(isPlacementCompliant(reg.local, { zeroDataRetention: true })).toBe(true);
    expect(isPlacementCompliant(reg.openai, { zeroDataRetention: true })).toBe(false);
  });
});
