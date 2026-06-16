/**
 * International reliance / work-sharing / collaborative registration pathways —
 * catalog + recommender.
 */

import { describe, it, expect } from 'vitest';
import {
  RELIANCE_PATHWAYS,
  RELIANCE_PATHWAY_IDS,
  getReliancePathway,
  recommendReliancePathways,
} from '../reliance-pathways';

describe('reliance-pathway catalog', () => {
  it('models at least six pathways, each well-formed', () => {
    expect(RELIANCE_PATHWAYS.length).toBeGreaterThanOrEqual(6);
    for (const p of RELIANCE_PATHWAYS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.leadOrCoordinator).toBeTruthy();
      expect(Array.isArray(p.participatingAuthorities)).toBe(true);
      expect(p.participatingAuthorities.length).toBeGreaterThanOrEqual(1);
      expect(p.scope).toBeTruthy();
      expect(p.citation).toBeTruthy();
    }
  });

  it('exposes ids that match the catalog and are unique', () => {
    expect(RELIANCE_PATHWAY_IDS).toEqual(RELIANCE_PATHWAYS.map((p) => p.id));
    expect(new Set(RELIANCE_PATHWAY_IDS).size).toBe(RELIANCE_PATHWAY_IDS.length);
  });

  it('is ordered by id', () => {
    const sorted = [...RELIANCE_PATHWAY_IDS].sort((a, b) => a.localeCompare(b));
    expect(RELIANCE_PATHWAY_IDS).toEqual(sorted);
  });
});

describe('getReliancePathway', () => {
  it('returns a known pathway', () => {
    const orbis = getReliancePathway('project-orbis');
    expect(orbis).not.toBeNull();
    expect(orbis!.name).toContain('Project Orbis');
    expect(orbis!.leadOrCoordinator).toContain('FDA');
  });

  it('returns null for an unknown id', () => {
    expect(getReliancePathway('does-not-exist')).toBeNull();
  });
});

describe('recommendReliancePathways', () => {
  it('oncology → includes Project Orbis', () => {
    const r = recommendReliancePathways({ isOncology: true });
    const ids = r.eligible.map((p) => p.id);
    expect(ids).toContain('project-orbis');
  });

  it("targetMarkets ['AU','CA'] → includes Access Consortium", () => {
    const r = recommendReliancePathways({ targetMarkets: ['AU', 'CA'] });
    const ids = r.eligible.map((p) => p.id);
    expect(ids).toContain('access-consortium');
  });

  it('lower-case market codes are normalised', () => {
    const r = recommendReliancePathways({ targetMarkets: ['sg'] });
    expect(r.eligible.map((p) => p.id)).toContain('access-consortium');
  });

  it('globalHealth → includes WHO CRP and EU-M4all (and MAGHP)', () => {
    const r = recommendReliancePathways({ globalHealth: true });
    const ids = r.eligible.map((p) => p.id);
    expect(ids).toContain('who-crp');
    expect(ids).toContain('eu-m4all');
    expect(ids).toContain('swissmedic-maghp');
  });

  it('a global-health target-market marker also triggers global-health pathways', () => {
    const r = recommendReliancePathways({ targetMarkets: ['global-health'] });
    expect(r.eligible.map((p) => p.id)).toContain('who-crp');
  });

  it('ASEAN marker → includes ASEAN Joint Assessment', () => {
    const r = recommendReliancePathways({ targetMarkets: ['ASEAN'] });
    expect(r.eligible.map((p) => p.id)).toContain('asean-joint-assessment');
  });

  it('empty input does not crash and yields no recommendations', () => {
    const r = recommendReliancePathways({});
    expect(r.count).toBe(0);
    expect(r.eligible).toEqual([]);
    expect(r.rationale).toEqual([]);
  });

  it('output is sorted by id', () => {
    const r = recommendReliancePathways({
      isOncology: true,
      globalHealth: true,
      targetMarkets: ['AU', 'ASEAN'],
    });
    const ids = r.eligible.map((p) => p.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it('is deterministic', () => {
    const input = { isOncology: true, targetMarkets: ['CA', 'CH'] };
    expect(recommendReliancePathways(input)).toEqual(recommendReliancePathways(input));
  });

  it('rationale length matches eligible length and count', () => {
    const r = recommendReliancePathways({
      isOncology: true,
      globalHealth: true,
      targetMarkets: ['UK', 'ASEAN'],
    });
    expect(r.rationale.length).toBe(r.eligible.length);
    expect(r.count).toBe(r.eligible.length);
    for (const line of r.rationale) {
      expect(line).toBeTruthy();
    }
  });
});
