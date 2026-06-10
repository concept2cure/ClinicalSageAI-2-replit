/**
 * Tests for the global device strategy map — proves the shared-vs-region-specific
 * evidence split and the per-region pathways are deterministic and kind-aware.
 */
import { describe, it, expect } from 'vitest';
import { DEVICE_EVIDENCE_CATEGORIES, regionsForKind, buildGlobalDeviceStrategy } from '../device-global-strategy';

describe('device global strategy — evidence categories', () => {
  it('marks recognised standards as shared and clinical/labelling/UDI as region-specific', () => {
    const byId = Object.fromEntries(DEVICE_EVIDENCE_CATEGORIES.map((c) => [c.id, c]));
    expect(byId['risk_management'].reuse).toBe('shared');
    expect(byId['biocompatibility'].reuse).toBe('shared');
    expect(byId['software'].reuse).toBe('shared');
    expect(byId['clinical_evidence'].reuse).toBe('region_specific');
    expect(byId['labeling'].reuse).toBe('region_specific');
    expect(byId['udi_registration'].reuse).toBe('region_specific');
  });
});

describe('device global strategy — regions by kind', () => {
  it('devices map to fda/eu_mdr/pmda; IVDs map to fda/eu_ivdr/pmda', () => {
    expect(regionsForKind('device')).toEqual(expect.arrayContaining(['fda', 'eu_mdr', 'pmda']));
    expect(regionsForKind('device')).not.toContain('eu_ivdr');
    expect(regionsForKind('ivd')).toEqual(expect.arrayContaining(['fda', 'eu_ivdr', 'pmda']));
    expect(regionsForKind('ivd')).not.toContain('eu_mdr');
  });
});

describe('device global strategy — build', () => {
  it('builds a device strategy with the right per-region clinical document', () => {
    const s = buildGlobalDeviceStrategy('device');
    const eu = s.regions.find((r) => r.region === 'eu_mdr')!;
    expect(eu.clinicalEvidenceDoc).toMatch(/Clinical Evaluation Report/);
    const fda = s.regions.find((r) => r.region === 'fda')!;
    expect(fda.clinicalEvidenceDoc).toMatch(/Substantial Equivalence/);
    expect(s.sharedAcrossAll).toEqual(expect.arrayContaining(['risk_management', 'biocompatibility', 'software']));
    // Biocompatibility is a device category, present in the device strategy.
    expect(s.regions[0].sharedEvidence).toContain('biocompatibility');
  });

  it('builds an IVD strategy with the PER as the EU evidence and analytical performance shared', () => {
    const s = buildGlobalDeviceStrategy('ivd');
    const eu = s.regions.find((r) => r.region === 'eu_ivdr')!;
    expect(eu.clinicalEvidenceDoc).toMatch(/Performance Evaluation Report/);
    expect(s.sharedAcrossAll).toContain('analytical_performance');
    // Biocompatibility (device-only) is not in an IVD strategy.
    expect(s.regions[0].sharedEvidence).not.toContain('biocompatibility');
  });

  it('filters to the requested regions and ignores ones not applicable to the kind', () => {
    const s = buildGlobalDeviceStrategy('device', ['fda', 'eu_ivdr'] as never);
    expect(s.regions.map((r) => r.region)).toEqual(['fda']); // eu_ivdr dropped (IVD-only)
  });

  it('always carries the strategic notes (shared once; clinical is region-specific)', () => {
    const s = buildGlobalDeviceStrategy('device');
    expect(s.notes.some((n) => /510\(k\).*does NOT satisfy/i.test(n))).toBe(true);
  });
});
