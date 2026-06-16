/**
 * Good Distribution Practice (GDP) & supply-chain security expert — tests.
 */

import { describe, it, expect } from 'vitest';
import {
  getGdpFramework,
  getGdpElements,
  assessGdpReadiness,
  GDP_REGIONS,
  type GdpRegion,
} from '../gdp-distribution';

describe('GDP_REGIONS', () => {
  it('models EU and US', () => {
    expect(GDP_REGIONS).toEqual(['EU', 'US']);
  });
});

describe('getGdpFramework — frameworks present', () => {
  it('EU framework has ≥6 elements, each with a citation', () => {
    const fw = getGdpFramework('EU');
    expect(fw.region).toBe('EU');
    expect(fw.scheme).toBeTruthy();
    expect(fw.citation).toBeTruthy();
    expect(fw.elements.length).toBeGreaterThanOrEqual(6);
    for (const e of fw.elements) {
      expect(e.id).toBeTruthy();
      expect(e.title).toBeTruthy();
      expect(e.requirement).toBeTruthy();
      expect(e.citation).toBeTruthy();
    }
  });

  it('EU includes responsible_person and falsified_medicines_safety_features', () => {
    const ids = getGdpFramework('EU').elements.map((e) => e.id);
    expect(ids).toContain('responsible_person');
    expect(ids).toContain('falsified_medicines_safety_features');
  });

  it('US framework has ≥6 elements, each with a citation', () => {
    const fw = getGdpFramework('US');
    expect(fw.region).toBe('US');
    expect(fw.scheme).toBeTruthy();
    expect(fw.citation).toBeTruthy();
    expect(fw.elements.length).toBeGreaterThanOrEqual(6);
    for (const e of fw.elements) {
      expect(e.id).toBeTruthy();
      expect(e.title).toBeTruthy();
      expect(e.requirement).toBeTruthy();
      expect(e.citation).toBeTruthy();
    }
  });

  it('US includes product_identifier and transaction_information', () => {
    const ids = getGdpFramework('US').elements.map((e) => e.id);
    expect(ids).toContain('product_identifier');
    expect(ids).toContain('transaction_information');
  });
});

describe('getGdpElements', () => {
  it('returns the element ids for a modeled region', () => {
    const ids = getGdpElements('US');
    expect(ids).toContain('interoperable_tracing');
    expect(ids).toEqual(getGdpFramework('US').elements.map((e) => e.id));
  });

  it('returns [] for an unmodeled region', () => {
    expect(getGdpElements('JP' as GdpRegion)).toEqual([]);
  });
});

describe('assessGdpReadiness', () => {
  it('ready=false with correct missing when an element is omitted', () => {
    const all = getGdpElements('EU');
    const provided = all.filter((id) => id !== 'recall_returns');
    const r = assessGdpReadiness({ region: 'EU', providedElements: provided });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['recall_returns']);
    expect(r.coverage).toBeLessThan(1);
    expect(r.coverage).toBeGreaterThan(0);
  });

  it('ready=true and coverage=1 when all elements are provided', () => {
    const all = getGdpElements('US');
    const r = assessGdpReadiness({ region: 'US', providedElements: all });
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.coverage).toBe(1);
    expect(r.provided).toEqual(all);
  });

  it('partial coverage strictly between 0 and 1', () => {
    const all = getGdpElements('US');
    const half = all.slice(0, Math.floor(all.length / 2));
    const r = assessGdpReadiness({ region: 'US', providedElements: half });
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThan(1);
    expect(r.ready).toBe(false);
  });

  it('coverage=0 when nothing is provided', () => {
    const r = assessGdpReadiness({ region: 'EU', providedElements: [] });
    expect(r.coverage).toBe(0);
    expect(r.ready).toBe(false);
  });
});

describe('errors + determinism', () => {
  it('getGdpFramework throws for an unmodeled region', () => {
    expect(() => getGdpFramework('JP' as GdpRegion)).toThrow();
  });

  it('assessGdpReadiness throws for an unmodeled region', () => {
    expect(() => assessGdpReadiness({ region: 'JP' as GdpRegion, providedElements: [] })).toThrow();
  });

  it('is deterministic', () => {
    const all = getGdpElements('EU').slice(0, 4);
    expect(assessGdpReadiness({ region: 'EU', providedElements: all })).toEqual(
      assessGdpReadiness({ region: 'EU', providedElements: all }),
    );
    expect(getGdpFramework('US')).toEqual(getGdpFramework('US'));
  });
});
