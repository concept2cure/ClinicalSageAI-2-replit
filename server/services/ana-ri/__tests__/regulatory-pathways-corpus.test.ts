/**
 * Regulatory Pathways Corpus — citable index of expedited/early-access programs
 * across global regulators. Must be internally consistent, searchable by agency
 * and goal, cover the major agencies, and every rendered block must carry the
 * "confirm eligibility against current agency guidance" caveat (no fabricated
 * designations or criteria).
 */

import { describe, it, expect } from 'vitest';
import {
  REGULATORY_PATHWAYS,
  getPathway,
  pathwaysByAgency,
  pathwaysByKind,
  searchPathways,
  buildPathwaysBlock,
  pathwaysSummary,
  type PathwayAgency,
} from '../regulatory-pathways-corpus';

describe('regulatory pathways corpus — integrity', () => {
  it('indexes pathways across many agencies', () => {
    expect(REGULATORY_PATHWAYS.length).toBeGreaterThanOrEqual(20);
    const agencies = new Set(REGULATORY_PATHWAYS.map(p => p.agency));
    for (const a of ['FDA', 'EMA', 'PMDA', 'MHRA', 'Health Canada', 'TGA', 'NMPA', 'ANVISA'] as PathwayAgency[]) {
      expect(agencies, `expected a pathway for ${a}`).toContain(a);
    }
  });

  it('every entry is well-formed with a citation and benefits', () => {
    const ids = REGULATORY_PATHWAYS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of REGULATORY_PATHWAYS) {
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(p.eligibility.trim().length).toBeGreaterThan(0);
      expect(p.citation.trim().length).toBeGreaterThan(0);
      expect(p.benefits.length).toBeGreaterThan(0);
      expect(p.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe('regulatory pathways corpus — lookups', () => {
  it('resolves a known program and rejects an unknown one', () => {
    expect(getPathway('fda-breakthrough')?.agency).toBe('FDA');
    expect(getPathway('ema-prime')?.name).toMatch(/PRIME/);
    expect(getPathway('not-a-pathway')).toBeUndefined();
  });

  it('filters by agency and kind', () => {
    expect(pathwaysByAgency('FDA').length).toBeGreaterThanOrEqual(4);
    expect(pathwaysByKind('orphan').some(p => p.agency === 'FDA')).toBe(true);
    expect(pathwaysByKind('early_access').some(p => p.id === 'ema-conditional-ma')).toBe(true);
  });

  it('searches by goal keyword and by agency', () => {
    expect(searchPathways('breakthrough').some(p => p.id === 'fda-breakthrough')).toBe(true);
    expect(searchPathways('conditional approval').some(p => p.kind === 'early_access')).toBe(true);
    expect(searchPathways('PMDA').every(p => p.agency === 'PMDA')).toBe(true);
  });
});

describe('regulatory pathways corpus — rendered block', () => {
  it('renders specific matches with agency, program and citation', () => {
    const block = buildPathwaysBlock({ message: 'breakthrough therapy' });
    expect(block).toMatch(/FDA — Breakthrough Therapy/);
    expect(block).toMatch(/Ref:/);
  });

  it('renders an overview when nothing matches, still with the caveat', () => {
    const block = buildPathwaysBlock({ message: 'zzzznomatch' });
    expect(block).toMatch(/indexed for \d+ regulators/);
    expect(block).toMatch(/current/i);
  });

  it('never omits the verify caveat', () => {
    for (const msg of ['orphan', 'PRIME', 'sakigake', '', 'priority review']) {
      expect(buildPathwaysBlock({ message: msg })).toMatch(/Confirm eligibility/i);
    }
  });
});

describe('regulatory pathways corpus — summary', () => {
  it('reports consistent totals', () => {
    const s = pathwaysSummary();
    expect(s.total).toBe(REGULATORY_PATHWAYS.length);
    const kindTotal = s.byKind.expedited_development + s.byKind.expedited_review + s.byKind.early_access + s.byKind.orphan;
    expect(kindTotal).toBe(s.total);
    expect(s.agencies).toBe(new Set(REGULATORY_PATHWAYS.map(p => p.agency)).size);
  });
});
