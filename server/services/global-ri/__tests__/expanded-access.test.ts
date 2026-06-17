/**
 * Pre-approval access expert — expanded access / compassionate use / named patient.
 */

import { describe, it, expect } from 'vitest';
import {
  getExpandedAccessFramework,
  recommendExpandedAccessMechanism,
  EXPANDED_ACCESS_REGIONS,
  POPULATION_SIZES,
  type ExpandedAccessRegion,
} from '../expanded-access';

describe('expanded-access framework catalog', () => {
  it('models a framework with a truthy citation for every region', () => {
    for (const region of EXPANDED_ACCESS_REGIONS) {
      const fw = getExpandedAccessFramework(region);
      expect(fw.region).toBe(region);
      expect(fw.citation).toBeTruthy();
      expect(fw.mechanisms.length).toBeGreaterThan(0);
      expect(fw.generalCriteria.length).toBeGreaterThan(0);
      for (const m of fw.mechanisms) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect(m.scope).toBeTruthy();
        expect(m.citation).toBeTruthy();
        expect(m.criteria.length).toBeGreaterThan(0);
      }
    }
  });

  it('FDA has three mechanisms including a treatment IND', () => {
    const fw = getExpandedAccessFramework('FDA');
    expect(fw.mechanisms.length).toBe(3);
    const treatment = fw.mechanisms.find((m) => /treatment ind/i.test(m.name));
    expect(treatment).toBeTruthy();
    expect(fw.citation).toContain('312');
  });

  it('EU criteria mention a "group" of patients', () => {
    const fw = getExpandedAccessFramework('EU');
    const mentionsGroup = fw.generalCriteria.some((c) => /group/i.test(c));
    expect(mentionsGroup).toBe(true);
    expect(fw.citation).toContain('726/2004');
  });

  it('exposes the modeled region and population-size sets', () => {
    expect(EXPANDED_ACCESS_REGIONS).toEqual(['FDA', 'EU', 'JP']);
    expect(POPULATION_SIZES).toEqual(['individual', 'intermediate', 'widespread']);
  });
});

describe('recommendExpandedAccessMechanism — FDA scales with population', () => {
  it('individual → Individual Patient Expanded Access IND/protocol', () => {
    const r = recommendExpandedAccessMechanism({ region: 'FDA', populationSize: 'individual' });
    expect(r.mechanism).toBe('Individual Patient Expanded Access IND/protocol');
  });

  it('intermediate → Intermediate-Size Patient Population IND/protocol', () => {
    const r = recommendExpandedAccessMechanism({ region: 'FDA', populationSize: 'intermediate' });
    expect(r.mechanism).toBe('Intermediate-Size Patient Population IND/protocol');
  });

  it('widespread → Treatment IND / Treatment Protocol', () => {
    const r = recommendExpandedAccessMechanism({ region: 'FDA', populationSize: 'widespread' });
    expect(r.mechanism).toBe('Treatment IND / Treatment Protocol');
    expect(r.mechanism).toContain('Treatment IND');
  });
});

describe('recommendExpandedAccessMechanism — EU split', () => {
  it('individual → named-patient supply (mentions Art 5)', () => {
    const r = recommendExpandedAccessMechanism({ region: 'EU', populationSize: 'individual' });
    expect(r.mechanism).toMatch(/named-patient/i);
    expect(r.mechanism).toContain('Art 5');
  });

  it('widespread → compassionate use (mentions Art 83)', () => {
    const r = recommendExpandedAccessMechanism({ region: 'EU', populationSize: 'widespread' });
    expect(r.mechanism).toMatch(/compassionate use/i);
    expect(r.mechanism).toContain('Art 83');
  });

  it('intermediate → compassionate use programme', () => {
    const r = recommendExpandedAccessMechanism({ region: 'EU', populationSize: 'intermediate' });
    expect(r.mechanism).toContain('Art 83');
  });
});

describe('recommendExpandedAccessMechanism — JP single system', () => {
  it('any population size → the Japanese expanded-access system', () => {
    for (const size of POPULATION_SIZES) {
      const r = recommendExpandedAccessMechanism({ region: 'JP', populationSize: size });
      expect(r.mechanism).toBe('Japanese expanded-access (compassionate use) system');
    }
  });
});

describe('errors + determinism', () => {
  it('getExpandedAccessFramework throws for an unmodeled region', () => {
    expect(() => getExpandedAccessFramework('MHRA' as ExpandedAccessRegion)).toThrow();
  });

  it('recommend throws for an unmodeled region', () => {
    expect(() =>
      recommendExpandedAccessMechanism({ region: 'MHRA' as ExpandedAccessRegion, populationSize: 'individual' }),
    ).toThrow();
  });

  it('recommend throws for an unknown population size', () => {
    expect(() =>
      recommendExpandedAccessMechanism({ region: 'FDA', populationSize: 'global' as any }),
    ).toThrow();
  });

  it('is deterministic', () => {
    expect(recommendExpandedAccessMechanism({ region: 'FDA', populationSize: 'intermediate' })).toEqual(
      recommendExpandedAccessMechanism({ region: 'FDA', populationSize: 'intermediate' }),
    );
    expect(getExpandedAccessFramework('EU')).toEqual(getExpandedAccessFramework('EU'));
  });
});
