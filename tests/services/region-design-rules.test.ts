/**
 * Tests for region-specific design rules
 * (server/services/region-design-rules.ts).
 *
 * GA bar: region rules unit-tested; guidance retrievable. Also checks honesty
 * (not-applicable rules excluded), severity mapping, and reproducibility.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateRegionRules,
  listRegionRules,
  getRegionGuidance,
  PROJECT_ORBIS_AGENCIES,
  type RegionDesignInput,
} from '../../server/services/region-design-rules';

describe('evaluateRegionRules — PMDA', () => {
  it('flags a missing bridging strategy as an error when no Japanese subjects', () => {
    const r = evaluateRegionRules({ targetAgencies: ['PMDA'] });
    const bridging = r.findings.find(f => f.ruleId === 'PMDA-E5-BRIDGING');
    expect(bridging?.status).toBe('unmet');
    expect(bridging?.severity).toBe('error');
    expect(r.errorCount).toBeGreaterThanOrEqual(1);
    expect(r.allClear).toBe(false);
    expect(r.recommendations.join(' ')).toMatch(/bridging study or include Japanese/);
  });

  it('is met when Japanese subjects are included and ethnic sensitivity is assessed', () => {
    const r = evaluateRegionRules({
      targetAgencies: ['PMDA'],
      localRepresentation: { PMDA: { included: true, fraction: 0.2 } },
      ethnicSensitivityAssessed: true,
    });
    expect(r.findings.find(f => f.ruleId === 'PMDA-E5-BRIDGING')?.status).toBe('met');
  });

  it('downgrades to attention (warning) when Japanese subjects are present but no E5 assessment', () => {
    const r = evaluateRegionRules({
      targetAgencies: ['PMDA'],
      localRepresentation: { PMDA: { included: true } },
    });
    const bridging = r.findings.find(f => f.ruleId === 'PMDA-E5-BRIDGING');
    expect(bridging?.status).toBe('attention');
    expect(bridging?.severity).toBe('warning'); // error default → warning for attention
  });
});

describe('evaluateRegionRules — NMPA', () => {
  it('requires Chinese subject data (error when absent)', () => {
    const r = evaluateRegionRules({ targetAgencies: ['NMPA'] });
    expect(r.findings.find(f => f.ruleId === 'NMPA-LOCAL-DATA')?.severity).toBe('error');
  });

  it('is satisfied when Chinese subjects are represented', () => {
    const r = evaluateRegionRules({
      targetAgencies: ['NMPA'],
      localRepresentation: { NMPA: { included: true } },
      ethnicSensitivityAssessed: true,
    });
    expect(r.findings.find(f => f.ruleId === 'NMPA-LOCAL-DATA')?.status).toBe('met');
    expect(r.findings.find(f => f.ruleId === 'NMPA-ETHNIC')?.status).toBe('met');
  });
});

describe('evaluateRegionRules — MHRA / Swissmedic / ANVISA', () => {
  it('notes UK and Swiss separate-jurisdiction rules as informational', () => {
    const r = evaluateRegionRules({ targetAgencies: ['MHRA', 'Swissmedic'] });
    expect(r.findings.find(f => f.ruleId === 'MHRA-POST-BREXIT')?.status).toBe('attention');
    expect(r.findings.find(f => f.ruleId === 'SWISSMEDIC-SEPARATE')?.status).toBe('attention');
    // Both are info-severity, so they do not block allClear on their own.
    expect(r.errorCount).toBe(0);
  });

  it('reliance pathway satisfies the UK and Swiss jurisdiction rules', () => {
    const r = evaluateRegionRules({
      targetAgencies: ['MHRA', 'Swissmedic'],
      usesReliancePathway: true,
    });
    expect(r.findings.find(f => f.ruleId === 'MHRA-POST-BREXIT')?.status).toBe('met');
    expect(r.findings.find(f => f.ruleId === 'SWISSMEDIC-SEPARATE')?.status).toBe('met');
    expect(r.allClear).toBe(true);
  });

  it('requires a Brazilian local representative (warning when absent)', () => {
    const absent = evaluateRegionRules({ targetAgencies: ['ANVISA'] });
    expect(absent.findings.find(f => f.ruleId === 'ANVISA-LOCAL')?.status).toBe('unmet');
    expect(absent.warningCount).toBeGreaterThanOrEqual(1);

    const present = evaluateRegionRules({
      targetAgencies: ['ANVISA'],
      localSponsorRepresentative: { ANVISA: true },
    });
    expect(present.findings.find(f => f.ruleId === 'ANVISA-LOCAL')?.status).toBe('met');
  });
});

describe('evaluateRegionRules — MRCT, Orbis, diversity', () => {
  it('requires an ICH E17 consistency plan for a multi-agency MRCT', () => {
    const r = evaluateRegionRules({
      targetAgencies: ['FDA', 'EMA', 'PMDA'],
      multiRegional: true,
      localRepresentation: { PMDA: { included: true } },
      ethnicSensitivityAssessed: true,
    });
    expect(r.findings.find(f => f.ruleId === 'ICH-E17-CONSISTENCY')?.status).toBe('unmet');

    const planned = evaluateRegionRules({
      targetAgencies: ['FDA', 'EMA', 'PMDA'],
      multiRegional: true,
      regionalConsistencyPlan: true,
      localRepresentation: { PMDA: { included: true } },
      ethnicSensitivityAssessed: true,
    });
    expect(planned.findings.find(f => f.ruleId === 'ICH-E17-CONSISTENCY')?.status).toBe('met');
    expect(planned.findings.find(f => f.ruleId === 'PMDA-E17-MRCT')?.status).toBe('met');
  });

  it('suggests Project Orbis for an oncology product with ≥2 partner agencies', () => {
    const r = evaluateRegionRules({
      targetAgencies: ['FDA', 'MHRA'],
      oncology: true,
      usesReliancePathway: true, // satisfies MHRA jurisdiction too
    });
    const orbis = r.findings.find(f => f.ruleId === 'ORBIS-ELIGIBILITY');
    expect(orbis).toBeDefined();
    expect(orbis?.status).toBe('met');
    expect(PROJECT_ORBIS_AGENCIES).toContain('FDA');
  });

  it('does not raise Orbis for a non-oncology product', () => {
    const r = evaluateRegionRules({ targetAgencies: ['FDA', 'MHRA'], oncology: false });
    expect(r.findings.find(f => f.ruleId === 'ORBIS-ELIGIBILITY')).toBeUndefined();
  });

  it('flags a missing FDA diversity plan only for phase 3', () => {
    const ph3 = evaluateRegionRules({ targetAgencies: ['FDA'], phase: '3' });
    expect(ph3.findings.find(f => f.ruleId === 'FDA-DIVERSITY')?.status).toBe('unmet');
    const ph1 = evaluateRegionRules({ targetAgencies: ['FDA'], phase: '1' });
    expect(ph1.findings.find(f => f.ruleId === 'FDA-DIVERSITY')).toBeUndefined();
  });
});

describe('honesty and reproducibility', () => {
  it('only includes rules that apply to the targeted agencies (no fabrication)', () => {
    const r = evaluateRegionRules({ targetAgencies: ['FDA'], phase: '1' });
    // No PMDA/NMPA/MHRA/Swiss/ANVISA findings should appear for an FDA-only phase 1 design.
    expect(r.findings.every(f => f.agency === 'FDA' || f.agency === 'ALL')).toBe(true);
  });

  it('requires at least one target agency', () => {
    expect(() => evaluateRegionRules({ targetAgencies: [] } as RegionDesignInput)).toThrow(
      /at least one agency/,
    );
  });

  it('is deterministic with a stable provenance hash', () => {
    const input: RegionDesignInput = {
      targetAgencies: ['PMDA', 'NMPA'],
      multiRegional: true,
      ethnicSensitivityAssessed: true,
    };
    const a = evaluateRegionRules(input);
    const b = evaluateRegionRules(input);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.issues.map(i => i.ruleId)).toEqual(b.issues.map(i => i.ruleId));
    expect(a.provenance.method).toBe('regionDesignRules:evaluate');
  });
});

describe('guidance is retrievable', () => {
  it('lists the full catalog and per-agency rules with citations', () => {
    const all = listRegionRules();
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(all.every(r => r.guidance.reference.length > 0)).toBe(true);

    const pmda = listRegionRules('PMDA');
    // PMDA-specific plus the ALL (MRCT/Orbis) rules.
    expect(pmda.some(r => r.id === 'PMDA-E5-BRIDGING')).toBe(true);
    expect(pmda.some(r => r.agency === 'ALL')).toBe(true);
    expect(pmda.every(r => r.agency === 'PMDA' || r.agency === 'ALL')).toBe(true);
  });

  it('returns guidance citations for an agency', () => {
    const g = getRegionGuidance('NMPA');
    expect(g.length).toBeGreaterThanOrEqual(2);
    expect(g.some(ref => /ICH E5/.test(ref.reference))).toBe(true);
  });
});
