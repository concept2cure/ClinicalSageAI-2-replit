import { describe, it, expect, afterEach } from 'vitest';
import {
  resolvePlacement,
  resetPlacementRegistry,
  isPlacementCompliant,
  buildPlacementRegistry,
} from '../placement';

afterEach(() => {
  resetPlacementRegistry();
});

describe('provider placement registry', () => {
  it('marks shared frontier providers as multi-tenant without ZDR by default', () => {
    const openai = resolvePlacement('openai');
    expect(openai.substrate).toBe('frontier_shared');
    expect(openai.zeroDataRetention).toBe(false);
    expect(openai.regions).toContain('global');
  });

  it('marks private-cloud Claude (bedrock) as frontier_private with ZDR by default', () => {
    const bedrock = resolvePlacement('bedrock');
    expect(bedrock.substrate).toBe('frontier_private');
    expect(bedrock.zeroDataRetention).toBe(true);
  });

  it('marks local as the only self-hosted, on-prem, air-gappable substrate', () => {
    const local = resolvePlacement('local');
    expect(local.substrate).toBe('self_hosted');
    expect(local.regions).toEqual(['on_prem']);
    expect(local.zeroDataRetention).toBe(true);
  });
});

describe('placement compliance', () => {
  const reg = buildPlacementRegistry();

  it('allows any provider when no requirements are set', () => {
    expect(isPlacementCompliant(reg.openai, {})).toBe(true);
    expect(isPlacementCompliant(reg.openai, { residency: 'any' })).toBe(true);
  });

  it('excludes shared frontier when zero data retention is required', () => {
    expect(isPlacementCompliant(reg.openai, { zeroDataRetention: true })).toBe(false);
    expect(isPlacementCompliant(reg.bedrock, { zeroDataRetention: true })).toBe(true);
    expect(isPlacementCompliant(reg.local, { zeroDataRetention: true })).toBe(true);
  });

  it('requires a self-hosted substrate for on-prem residency', () => {
    expect(isPlacementCompliant(reg.local, { residency: 'on_prem' })).toBe(true);
    expect(isPlacementCompliant(reg.bedrock, { residency: 'on_prem' })).toBe(false);
    expect(isPlacementCompliant(reg.openai, { residency: 'on_prem' })).toBe(false);
  });

  it('enforces regional residency against the provider region list', () => {
    // Vertex defaults to us+eu; bedrock defaults to us only.
    expect(isPlacementCompliant(reg.vertex, { residency: 'eu' })).toBe(true);
    expect(isPlacementCompliant(reg.bedrock, { residency: 'eu' })).toBe(false);
    // Self-hosted trivially satisfies a single-region requirement.
    expect(isPlacementCompliant(reg.local, { residency: 'eu' })).toBe(true);
  });

  it('combines residency and ZDR (both must hold)', () => {
    expect(
      isPlacementCompliant(reg.vertex, { residency: 'eu', zeroDataRetention: true }),
    ).toBe(true);
    expect(
      isPlacementCompliant(reg.openai, { residency: 'eu', zeroDataRetention: true }),
    ).toBe(false);
  });
});
