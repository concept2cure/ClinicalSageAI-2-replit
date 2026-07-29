/**
 * Establishment registration & drug listing expert — framework + readiness assessment.
 */

import { describe, it, expect } from 'vitest';
import {
  getEstablishmentFramework,
  getEstablishmentElements,
  assessEstablishmentReadiness,
  ESTABLISHMENT_REGIONS,
  type EstablishmentRegion,
} from '../establishment-registration';

describe('establishment framework — catalog', () => {
  it('models each region with at least 5 elements, each with a citation', () => {
    for (const region of ESTABLISHMENT_REGIONS) {
      const fw = getEstablishmentFramework(region);
      expect(fw.region).toBe(region);
      expect(fw.scheme).toBeTruthy();
      expect(fw.citation).toBeTruthy();
      expect(fw.elements.length).toBeGreaterThanOrEqual(5);
      for (const el of fw.elements) {
        expect(el.id).toBeTruthy();
        expect(el.title).toBeTruthy();
        expect(el.requirement).toBeTruthy();
        expect(el.citation).toBeTruthy();
      }
    }
  });

  it('FDA includes establishment_registration + drug_listing + us_agent', () => {
    const ids = getEstablishmentElements('FDA');
    expect(ids).toContain('establishment_registration');
    expect(ids).toContain('drug_listing');
    expect(ids).toContain('us_agent');
  });

  it('EU includes manufacturing_import_authorisation + qualified_person', () => {
    const ids = getEstablishmentElements('EU');
    expect(ids).toContain('manufacturing_import_authorisation');
    expect(ids).toContain('qualified_person');
  });

  it('FDA cites FD&C §510 / 21 CFR Part 207; EU cites Directive 2001/83/EC', () => {
    expect(getEstablishmentFramework('FDA').citation).toContain('510');
    expect(getEstablishmentFramework('FDA').citation).toContain('207');
    expect(getEstablishmentFramework('EU').citation).toContain('2001/83/EC');
  });
});

describe('assessEstablishmentReadiness', () => {
  it('ready=false with correct missing when an element is omitted', () => {
    const all = getEstablishmentElements('FDA');
    const provided = all.filter((id) => id !== 'us_agent');
    const r = assessEstablishmentReadiness({ region: 'FDA', providedElements: provided });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['us_agent']);
    expect(r.provided).toEqual(provided);
    expect(r.coverage).toBeLessThan(1);
    expect(r.coverage).toBeGreaterThan(0);
  });

  it('ready=true with coverage 1 when all elements provided', () => {
    const all = getEstablishmentElements('EU');
    const r = assessEstablishmentReadiness({ region: 'EU', providedElements: all });
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.coverage).toBe(1);
  });

  it('partial coverage strictly between 0 and 1', () => {
    const all = getEstablishmentElements('FDA');
    const half = all.slice(0, Math.floor(all.length / 2));
    const r = assessEstablishmentReadiness({ region: 'FDA', providedElements: half });
    expect(r.ready).toBe(false);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThan(1);
    // coverage rounded to 2 decimals
    expect(Math.round(r.coverage * 100) / 100).toBe(r.coverage);
  });

  it('ignores unknown provided ids (no false coverage)', () => {
    const r = assessEstablishmentReadiness({
      region: 'EU',
      providedElements: ['not_a_real_element'],
    });
    expect(r.provided).toEqual([]);
    expect(r.coverage).toBe(0);
    expect(r.ready).toBe(false);
  });
});

describe('unmodeled regions', () => {
  it('getEstablishmentElements returns [] for an unmodeled region', () => {
    expect(getEstablishmentElements('XX' as EstablishmentRegion)).toEqual([]);
  });

  it('getEstablishmentFramework throws for an unmodeled region', () => {
    expect(() => getEstablishmentFramework('XX' as EstablishmentRegion)).toThrow();
  });

  it('assessEstablishmentReadiness throws for an unmodeled region', () => {
    expect(() =>
      assessEstablishmentReadiness({ region: 'XX' as EstablishmentRegion, providedElements: [] }),
    ).toThrow();
  });
});

describe('determinism', () => {
  it('returns identical framework on repeated calls', () => {
    expect(getEstablishmentFramework('FDA')).toEqual(getEstablishmentFramework('FDA'));
  });

  it('returns identical assessment on repeated calls', () => {
    const provided = getEstablishmentElements('EU').slice(0, 3);
    expect(assessEstablishmentReadiness({ region: 'EU', providedElements: provided })).toEqual(
      assessEstablishmentReadiness({ region: 'EU', providedElements: provided }),
    );
  });
});
