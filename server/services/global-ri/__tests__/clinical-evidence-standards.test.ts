/**
 * Standard of evidence for efficacy ("substantial evidence") — FDA & EU.
 */

import { describe, it, expect } from 'vitest';
import {
  getEvidenceStandard,
  getControlTypes,
  EVIDENCE_REGIONS,
  type EvidenceRegion,
} from '../clinical-evidence-standards';

describe('getEvidenceStandard — FDA', () => {
  it('uses the "adequate and well-controlled" substantial-evidence standard', () => {
    const r = getEvidenceStandard('FDA');
    expect(r.region).toBe('FDA');
    expect(r.standard.toLowerCase()).toContain('substantial evidence');
    expect(r.standard.toLowerCase()).toContain('adequate and well-controlled');
    expect(r.citation).toBeTruthy();
    expect(r.citation).toContain('314.126');
  });

  it('accepts a single study with confirmatory evidence', () => {
    const r = getEvidenceStandard('FDA');
    expect(r.singleStudyAcceptable).toBe(true);
    expect(r.singleStudyCriteria.length).toBeGreaterThan(0);
    const blob = r.singleStudyCriteria.join(' ').toLowerCase();
    expect(blob).toContain('confirmatory evidence');
  });

  it('lists adequate-and-well-controlled features (randomization, blinding, endpoints)', () => {
    const r = getEvidenceStandard('FDA');
    expect(r.wellControlledFeatures.length).toBeGreaterThanOrEqual(5);
    const blob = r.wellControlledFeatures.join(' ').toLowerCase();
    expect(blob).toContain('randomization');
    expect(blob).toContain('bias');
  });
});

describe('getEvidenceStandard — EU', () => {
  it('demonstrates efficacy via pivotal trial(s)', () => {
    const r = getEvidenceStandard('EU');
    expect(r.region).toBe('EU');
    const blob = (r.standard + ' ' + r.defaultStudyRequirement).toLowerCase();
    expect(blob).toContain('pivotal');
    expect(r.citation).toBeTruthy();
    expect(r.citation).toContain('2001/83/EC');
  });

  it('accepts one pivotal study under persuasiveness/consistency/relevance conditions', () => {
    const r = getEvidenceStandard('EU');
    expect(r.singleStudyAcceptable).toBe(true);
    const blob = r.singleStudyCriteria.join(' ').toLowerCase();
    expect(blob).toContain('pivotal');
    expect(blob).toContain('persuasive');
    expect(blob).toContain('consisten');
    expect(blob).toContain('relevant');
  });
});

describe('getControlTypes', () => {
  it('returns the five 314.126(b)(2) control types', () => {
    const c = getControlTypes();
    expect(c.controlTypes).toHaveLength(5);
    expect(c.citation).toContain('314.126(b)(2)');
    const ids = c.controlTypes.map((t) => t.id);
    expect(ids).toContain('placebo_concurrent');
    expect(ids).toContain('active_concurrent');
    expect(ids).toContain('dose_comparison');
    expect(ids).toContain('no_treatment_concurrent');
    expect(ids).toContain('historical_external');
  });

  it('every control type has a name and description', () => {
    for (const t of getControlTypes().controlTypes) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });
});

describe('EVIDENCE_REGIONS + errors + determinism', () => {
  it('exposes the modeled regions', () => {
    expect([...EVIDENCE_REGIONS].sort()).toEqual(['EU', 'FDA']);
  });

  it('models a standard for every region with a truthy citation', () => {
    for (const region of EVIDENCE_REGIONS) {
      const r = getEvidenceStandard(region);
      expect(r.citation).toBeTruthy();
    }
  });

  it('throws for an unmodeled region', () => {
    expect(() => getEvidenceStandard('PMDA' as EvidenceRegion)).toThrow();
  });

  it('is deterministic', () => {
    expect(getEvidenceStandard('FDA')).toEqual(getEvidenceStandard('FDA'));
    expect(getControlTypes()).toEqual(getControlTypes());
  });
});
