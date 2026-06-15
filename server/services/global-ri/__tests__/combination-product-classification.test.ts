/**
 * Combination-product / drug-device classification expert — FDA & EU.
 */

import { describe, it, expect } from 'vitest';
import {
  getCombinationFramework,
  classifyCombinationProduct,
  COMBINATION_REGIONS,
  type CombinationRegion,
  type FdaCombinationClassification,
  type EuCombinationClassification,
} from '../combination-product-classification';

describe('combination-product framework catalog', () => {
  it('models a framework for FDA and EU with a citation', () => {
    for (const region of COMBINATION_REGIONS) {
      const f = getCombinationFramework(region);
      expect(f.region).toBe(region);
      expect(f.citation).toBeTruthy();
      expect(f.basis).toBeTruthy();
      expect(f.decisionFactor).toBeTruthy();
      expect(f.notes.length).toBeTruthy();
    }
  });

  it('FDA framework uses a lead-center / PMOA concept; EU does not', () => {
    expect(getCombinationFramework('FDA').decisionFactor).toContain('PMOA');
    expect(getCombinationFramework('EU').leadAuthorityConcept).toContain('No single lead-center');
  });
});

describe('classifyCombinationProduct — FDA', () => {
  it('drug PMOA → CDER', () => {
    const r = classifyCombinationProduct({ region: 'FDA', primaryModeOfAction: 'drug' }) as FdaCombinationClassification;
    expect(r.leadCenter).toBe('CDER');
  });

  it('biologic PMOA → CBER', () => {
    const r = classifyCombinationProduct({ region: 'FDA', primaryModeOfAction: 'biologic' }) as FdaCombinationClassification;
    expect(r.leadCenter).toBe('CBER');
  });

  it('device PMOA → CDRH', () => {
    const r = classifyCombinationProduct({ region: 'FDA', primaryModeOfAction: 'device' }) as FdaCombinationClassification;
    expect(r.leadCenter).toBe('CDRH');
  });

  it('omitted/unclear PMOA → OCP (RFD) with an RFD note', () => {
    const r = classifyCombinationProduct({ region: 'FDA' }) as FdaCombinationClassification;
    expect(r.leadCenter).toBe('OCP (RFD)');
    expect(r.notes.some((n) => n.includes('Request for Designation'))).toBe(true);
  });

  it('carries the agency caveat', () => {
    const r = classifyCombinationProduct({ region: 'FDA', primaryModeOfAction: 'drug' });
    expect(r.notes.some((n) => n.includes('rests with the agency'))).toBe(true);
  });
});

describe('classifyCombinationProduct — EU', () => {
  it('integral → Art 117 medicinal route (route mentions 117)', () => {
    const r = classifyCombinationProduct({ region: 'EU', integral: true }) as EuCombinationClassification;
    expect(r.regulatoryRoute).toContain('117');
    expect(r.deviceObligation).toContain('GSPR');
  });

  it('defaults integral=true when omitted', () => {
    const r = classifyCombinationProduct({ region: 'EU' }) as EuCombinationClassification;
    expect(r.regulatoryRoute).toContain('117');
  });

  it('non-integral → separately CE-marked device route', () => {
    const r = classifyCombinationProduct({ region: 'EU', integral: false }) as EuCombinationClassification;
    expect(r.regulatoryRoute).toContain('non-integral');
    expect(r.deviceObligation).toContain('CE-marked');
  });
});

describe('classifyCombinationProduct — errors + determinism', () => {
  it('classify throws for an unmodeled region', () => {
    expect(() => classifyCombinationProduct({ region: 'XYZ' as CombinationRegion })).toThrow();
  });

  it('getCombinationFramework throws for an unmodeled region', () => {
    expect(() => getCombinationFramework('XYZ' as CombinationRegion)).toThrow();
  });

  it('is deterministic', () => {
    expect(classifyCombinationProduct({ region: 'FDA', primaryModeOfAction: 'device' })).toEqual(
      classifyCombinationProduct({ region: 'FDA', primaryModeOfAction: 'device' }),
    );
    expect(classifyCombinationProduct({ region: 'EU', integral: false })).toEqual(
      classifyCombinationProduct({ region: 'EU', integral: false }),
    );
  });
});
