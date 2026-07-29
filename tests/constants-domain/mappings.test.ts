/**
 * Domain mapping tables — the derived lookups that bridge flows, war games,
 * therapeutic areas, phases, ICH guidelines, product classes, designations,
 * and agency filings.
 */
import { describe, it, expect } from 'vitest';
import {
  getWarGameCategory,
  hasWarGame,
  auditableFlowCategories,
} from '../../shared/constants/domain/mappings/flow-war-game-mapping';
import {
  getEndpointsForArea,
  getPrimaryEndpoints,
} from '../../shared/constants/domain/mappings/therapeutic-area-endpoints';
import {
  getEnrollmentRange,
  isEnrollmentUnusual,
} from '../../shared/constants/domain/mappings/phase-enrollment';
import {
  ICH_GUIDELINES,
  getGuideline,
  getGuidelinesForFlow,
  getGuidelinesForProduct,
  getGuidelinesByCategory,
} from '../../shared/constants/domain/mappings/ich-guideline-registry';
import {
  PRODUCT_CLASS_REQUIREMENTS,
  getRequirements,
} from '../../shared/constants/domain/mappings/product-class-requirements';
import {
  DESIGNATION_INFO,
  getDesignation,
  getDesignationsForAgency,
} from '../../shared/constants/domain/mappings/designation-eligibility';
import {
  AGENCY_FILING_REQUIREMENTS,
  getFilingRequirements,
} from '../../shared/constants/domain/mappings/agency-filing-requirements';
import type { FlowCategory } from '../../shared/types/intelligence-questions';

/* ─── flow → war game ──────────────────────────────────────────────────── */

describe('flow-war-game-mapping', () => {
  const AUDITABLE: FlowCategory[] = [
    'protocol_development', 'csr_report', 'ind_submission', 'nda_submission',
    'bla_submission', 'sop_development', 'device_510k', 'device_pma',
    'cer_report', 'briefing_book', 'safety_narrative', 'labeling',
    'risk_management', 'cmc_specification', 'stability_study',
  ];

  it('returns a war-game category for all 15 auditable flow categories', () => {
    for (const cat of AUDITABLE) {
      expect(getWarGameCategory(cat), cat).toBeDefined();
      expect(hasWarGame(cat)).toBe(true);
    }
    expect(auditableFlowCategories()).toHaveLength(15);
    expect(new Set(auditableFlowCategories())).toEqual(new Set(AUDITABLE));
  });

  it('returns undefined for project_setup (no war game)', () => {
    expect(getWarGameCategory('project_setup')).toBeUndefined();
    expect(hasWarGame('project_setup')).toBe(false);
  });

  it('hasWarGame is consistent with getWarGameCategory', () => {
    const all: FlowCategory[] = [...AUDITABLE, 'project_setup'];
    for (const cat of all) {
      expect(hasWarGame(cat)).toBe(getWarGameCategory(cat) !== undefined);
    }
  });
});

/* ─── therapeutic area → endpoints ─────────────────────────────────────── */

describe('therapeutic-area-endpoints', () => {
  it('returns an endpoint array for a known area', () => {
    const eps = getEndpointsForArea('oncology');
    expect(Array.isArray(eps)).toBe(true);
    expect(eps.length).toBeGreaterThan(0);
    for (const e of eps) {
      expect(typeof e.endpoint).toBe('string');
      expect(typeof e.typicallyPrimary).toBe('boolean');
    }
  });

  it('returns an empty array for an area with no mapping', () => {
    expect(getEndpointsForArea('dental')).toEqual([]);
  });

  it('primary endpoints are a subset of all endpoints for the area', () => {
    for (const area of ['oncology', 'cardiology', 'metabolic'] as const) {
      const all = getEndpointsForArea(area);
      const primary = getPrimaryEndpoints(area);
      expect(primary.length).toBeLessThanOrEqual(all.length);
      const allSet = new Set(all.map((e) => e.endpoint));
      for (const p of primary) {
        expect(allSet.has(p.endpoint)).toBe(true);
        expect(p.typicallyPrimary).toBe(true);
      }
    }
  });
});

/* ─── phase × area → enrollment ────────────────────────────────────────── */

describe('phase-enrollment', () => {
  it('returns min <= typical <= max for area-specific and default ranges', () => {
    const cases: Array<[Parameters<typeof getEnrollmentRange>[0], Parameters<typeof getEnrollmentRange>[1]]> = [
      ['phase_1', 'oncology'],
      ['phase_3', 'cardiology'],
      ['phase_2', undefined],
      ['phase_1b', undefined],
      ['phase_4', 'oncology'],
    ];
    for (const [phase, area] of cases) {
      const r = getEnrollmentRange(phase, area);
      expect(r.min).toBeLessThanOrEqual(r.typical);
      expect(r.typical).toBeLessThanOrEqual(r.max);
    }
  });

  it('falls back to the default range for an area without a specific entry', () => {
    // phase_3 has no 'dental' entry -> default phase_3 range { min:200, max:3000 }
    const specific = getEnrollmentRange('phase_3', 'dental');
    const def = getEnrollmentRange('phase_3');
    expect(specific).toEqual(def);
  });

  it('flags low and high enrollment correctly', () => {
    const r = getEnrollmentRange('phase_3', 'oncology'); // { min:200, typical:500, max:2000 }
    expect(isEnrollmentUnusual(r.min - 1, 'phase_3', 'oncology')).toBe('low');
    expect(isEnrollmentUnusual(r.max + 1, 'phase_3', 'oncology')).toBe('high');
    expect(isEnrollmentUnusual(r.typical, 'phase_3', 'oncology')).toBeNull();
    // boundaries are inclusive (not unusual)
    expect(isEnrollmentUnusual(r.min, 'phase_3', 'oncology')).toBeNull();
    expect(isEnrollmentUnusual(r.max, 'phase_3', 'oncology')).toBeNull();
  });
});

/* ─── ICH guideline registry ───────────────────────────────────────────── */

describe('ich-guideline-registry', () => {
  it('every guideline carries the required fields', () => {
    expect(ICH_GUIDELINES.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const g of ICH_GUIDELINES) {
      expect(g.id.length).toBeGreaterThan(0);
      expect(g.designation.length).toBeGreaterThan(0);
      expect(g.title.length).toBeGreaterThan(0);
      expect(['quality', 'efficacy', 'safety', 'multidisciplinary']).toContain(g.category);
      expect(g.version.length).toBeGreaterThan(0);
      expect(Array.isArray(g.relevantFlows)).toBe(true);
      expect(Array.isArray(g.applicableProducts)).toBe(true);
      expect(g.summary.length).toBeGreaterThan(0);
      expect(ids.has(g.id)).toBe(false); // unique ids
      ids.add(g.id);
    }
  });

  it('getGuideline finds by id and returns undefined for an unknown id', () => {
    expect(getGuideline('q1a')?.designation).toBe('ICH Q1A(R2)');
    expect(getGuideline('does_not_exist')).toBeUndefined();
  });

  it('getGuidelinesForFlow returns only guidelines listing that flow', () => {
    const stability = getGuidelinesForFlow('stability_study');
    expect(stability.length).toBeGreaterThan(0);
    for (const g of stability) expect(g.relevantFlows).toContain('stability_study');
  });

  it('getGuidelinesForProduct returns only guidelines listing that product class', () => {
    const biologics = getGuidelinesForProduct('biologic');
    expect(biologics.length).toBeGreaterThan(0);
    for (const g of biologics) expect(g.applicableProducts).toContain('biologic');
  });

  it('getGuidelinesByCategory partitions the registry by category', () => {
    const quality = getGuidelinesByCategory('quality');
    expect(quality.length).toBeGreaterThan(0);
    for (const g of quality) expect(g.category).toBe('quality');
  });
});

/* ─── product class requirements ───────────────────────────────────────── */

describe('product-class-requirements', () => {
  it('getRequirements returns the full requirement shape for a known class', () => {
    const req = getRequirements('biologic');
    expect(req).toBeDefined();
    expect(req!.productClass).toBe('biologic');
    expect(req!.label.length).toBeGreaterThan(0);
    for (const key of [
      'primaryGuidelines',
      'requiredStudies',
      'characterizationStudies',
      'criticalQualityAttributes',
      'commonDeficiencies',
    ] as const) {
      expect(Array.isArray(req![key])).toBe(true);
      expect(req![key].length).toBeGreaterThan(0);
    }
  });

  it('returns undefined for an unknown product class', () => {
    expect(getRequirements('unknown' as never)).toBeUndefined();
  });

  it('every entry has a unique product class', () => {
    const keys = PRODUCT_CLASS_REQUIREMENTS.map((r) => r.productClass);
    expect(keys.length).toBe(new Set(keys).size);
  });
});

/* ─── designation eligibility ──────────────────────────────────────────── */

describe('designation-eligibility', () => {
  it('every designation carries the required fields', () => {
    for (const d of DESIGNATION_INFO) {
      expect(d.id.length).toBeGreaterThan(0);
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.agency.length).toBeGreaterThan(0);
      expect(d.eligibility.length).toBeGreaterThan(0);
      expect(d.evidenceRequired.length).toBeGreaterThan(0);
      expect(Array.isArray(d.benefits)).toBe(true);
      expect(d.benefits.length).toBeGreaterThan(0);
      expect(d.reference.length).toBeGreaterThan(0);
    }
  });

  it('getDesignation finds by id; unknown id -> undefined', () => {
    expect(getDesignation('fda_orphan')?.agency).toBe('FDA');
    expect(getDesignation('nope')).toBeUndefined();
  });

  it('getDesignationsForAgency filters by agency', () => {
    const fda = getDesignationsForAgency('FDA');
    expect(fda.length).toBeGreaterThan(0);
    for (const d of fda) expect(d.agency).toBe('FDA');
    expect(getDesignationsForAgency('NONEXISTENT')).toEqual([]);
  });
});

/* ─── agency filing requirements ───────────────────────────────────────── */

describe('agency-filing-requirements', () => {
  it('every filing requirement carries the required shape', () => {
    for (const r of AGENCY_FILING_REQUIREMENTS) {
      expect(r.agency.length).toBeGreaterThan(0);
      expect(r.productClass.length).toBeGreaterThan(0);
      expect(Array.isArray(r.filingTypes)).toBe(true);
      expect(r.filingTypes.length).toBeGreaterThan(0);
      expect(r.dossierFormat.length).toBeGreaterThan(0);
      expect(typeof r.standardReviewMonths).toBe('number');
      expect(r.standardReviewMonths).toBeGreaterThan(0);
      if (r.priorityReviewMonths !== undefined) {
        expect(r.priorityReviewMonths).toBeLessThanOrEqual(r.standardReviewMonths);
      }
    }
  });

  it('getFilingRequirements filters by agency + product class', () => {
    const fdaSm = getFilingRequirements('FDA', 'small_molecule');
    expect(fdaSm.length).toBeGreaterThan(0);
    for (const r of fdaSm) {
      expect(r.agency).toBe('FDA');
      expect(r.productClass).toBe('small_molecule');
    }
    expect(getFilingRequirements('FDA', 'nonexistent_class')).toEqual([]);
  });
});
