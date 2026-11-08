/**
 * Clinical-trial-application (CTA / IND) requirements expert — per-market
 * required components and the readiness assessment (missing/extra components,
 * unknown market, determinism).
 */

import { describe, it, expect } from 'vitest';
import {
  assessCtaReadiness,
  getCtaRequirements,
  CTA_REQUIREMENTS,
  type CtaMarket,
} from '../clinical-trial-application-requirements';
import { getApplicationType } from '../../../../shared/regulatory/global-document-registry';
import { getResolvedSectionBlueprint, getSectionBlueprintContext } from '../../regulatory/sectionBlueprintCatalog';

const ALL_MARKETS: CtaMarket[] = ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'MHRA'];

/** All required component codes for a market. */
const allCodes = (m: CtaMarket) => CTA_REQUIREMENTS[m].map((c) => c.code);

describe('CTA_REQUIREMENTS', () => {
  it('models every market with a non-empty, well-formed component set', () => {
    for (const m of ALL_MARKETS) {
      const reqs = getCtaRequirements(m);
      expect(reqs.length).toBeGreaterThan(0);
      for (const c of reqs) {
        expect(c.code).toBeTruthy();
        expect(c.label).toBeTruthy();
      }
    }
  });

  it('uses unique component codes within each market', () => {
    for (const m of ALL_MARKETS) {
      const codes = allCodes(m);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});

describe('assessCtaReadiness', () => {
  it('retains the other markets\' component-presence verdict when all required components are provided', () => {
    for (const m of ALL_MARKETS.filter((market) => market !== 'MHRA')) {
      const result = assessCtaReadiness({ market: m, providedComponents: allCodes(m) });
      expect(result.ready).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.counts.errors).toBe(0);
      expect(result.findings).toEqual([]);
    }
  });

  it("flags a missing FDA Investigator's Brochure as a MISSING_COMPONENT error and not ready", () => {
    const provided = allCodes('FDA').filter((c) => c !== 'us_ind_ib');
    const result = assessCtaReadiness({ market: 'FDA', providedComponents: provided });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain('us_ind_ib');
    const finding = result.findings.find((f) => f.component === 'us_ind_ib');
    expect(finding?.severity).toBe('error');
    expect(finding?.code).toBe('MISSING_COMPONENT');
    expect(result.counts.errors).toBeGreaterThanOrEqual(1);
  });

  it('treats an unrecognized provided component as a warning but stays ready', () => {
    const result = assessCtaReadiness({
      market: 'PMDA',
      providedComponents: [...allCodes('PMDA'), 'jp_extra_bogus'],
    });
    expect(result.ready).toBe(true);
    expect(result.counts.errors).toBe(0);
    const extra = result.findings.find((f) => f.component === 'jp_extra_bogus');
    expect(extra?.severity).toBe('warning');
    expect(extra?.code).toBe('EXTRA_COMPONENT');
  });

  it('requires the IMPD for an EU CTA', () => {
    expect(allCodes('EMA')).toContain('eu_cta_impd');
    const provided = allCodes('EMA').filter((c) => c !== 'eu_cta_impd');
    const result = assessCtaReadiness({ market: 'EMA', providedComponents: provided });
    expect(result.ready).toBe(false);
    expect(result.missing).toContain('eu_cta_impd');
    expect(result.findings.some((f) => f.component === 'eu_cta_impd' && f.code === 'MISSING_COMPONENT')).toBe(true);
  });

  it('returns an UNKNOWN_MARKET error for an unmodeled market', () => {
    const result = assessCtaReadiness({ market: 'XX' as CtaMarket, providedComponents: [] });
    expect(result.ready).toBe(false);
    expect(result.required).toEqual([]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].code).toBe('UNKNOWN_MARKET');
    expect(result.counts.errors).toBe(1);
  });

  it('is deterministic — identical input yields identical output', () => {
    const input = { market: 'HEALTH_CANADA' as CtaMarket, providedComponents: ['ca_cta_hc3011', 'zzz_extra', 'ca_cta_protocol'] };
    const a = assessCtaReadiness(input);
    const b = assessCtaReadiness(input);
    expect(a).toEqual(b);
    // findings sorted by component then severity
    const components = a.findings.map((f) => f.component ?? '');
    const sorted = [...components].sort((x, y) => x.localeCompare(y));
    expect(components).toEqual(sorted);
  });
});

describe('UK CTA baseline preparation and unresolved applicability', () => {
  const legacyCodes = [
    'uk_cta_cover_letter', 'uk_cta_application_form', 'uk_cta_protocol',
    'uk_cta_ib', 'uk_cta_impd', 'uk_cta_gmp',
  ];

  it('cannot report ready from the six legacy labels and does not call them unknown', () => {
    const result = assessCtaReadiness({ market: 'MHRA', providedComponents: legacyCodes });
    expect(result.ready).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      severity: 'error', code: 'MHRA_APPLICABILITY_UNASSESSED',
    }));
    expect(result.findings.filter((finding) => finding.code === 'EXTRA_COMPONENT')).toEqual([]);
    expect(result.missing).toContain('uk_cta_labelling');
  });

  it('projects the canonical outline\'s baseline rows and guidance without another legal list', () => {
    const blueprint = getResolvedSectionBlueprint(getApplicationType('UK_CTA')!);
    const required = getCtaRequirements('MHRA');
    expect(required.length).toBeGreaterThan(6);
    expect(required).toEqual(blueprint.sections.filter((section) => section.required).map((section) => ({
      code: section.code, label: section.title, guidance: section.guidance,
    })));
  });

  it('stays unassessed when every baseline label is present, with the canonical dated basis and limits', () => {
    const result = assessCtaReadiness({ market: 'MHRA', providedComponents: allCodes('MHRA') });
    const context = getSectionBlueprintContext('UK_CTA');
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.counts.errors).toBe(1);
    expect(result).toMatchObject({ applicability: {
      state: 'unassessed',
      basis: { confidence: 'platform-convention', checked: '2026-11-06' },
      limitations: context.limitations,
    } });
    expect(result.findings[0].message).toMatch(/initial.*submission date/i);
    expect(result.findings[0].message).toMatch(/alternatives/i);
    expect(result.findings[0].message).toMatch(/does not authorise.*trial/i);
  });

  it('recognizes conditional rows without requiring them universally or treating them as waivers', () => {
    const blueprint = getResolvedSectionBlueprint(getApplicationType('UK_CTA')!);
    const conditional = blueprint.sections.filter((section) => !section.required).map((section) => section.code);
    expect(conditional).toContain('uk_cta_gmp');
    expect(conditional).toContain('uk_cta_notifiable');
    const result = assessCtaReadiness({ market: 'MHRA', providedComponents: [...allCodes('MHRA'), ...conditional] });
    expect(result.missing).toEqual([]);
    expect(result.findings.filter((finding) => finding.code === 'EXTRA_COMPONENT')).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: 'MHRA_APPLICABILITY_UNASSESSED' }));
    expect(result.ready).toBe(false);
  });

  it('calls a missing UK baseline row preparation, while preserving the other market wording', () => {
    const uk = assessCtaReadiness({ market: 'MHRA', providedComponents: [] });
    expect(uk.findings.find((finding) => finding.component === 'uk_cta_cover_letter')?.message)
      .toMatch(/^Missing baseline UK CTA preparation row:/);
    const us = assessCtaReadiness({ market: 'FDA', providedComponents: [] });
    expect(us.findings.find((finding) => finding.component === 'us_ind_ib')?.message)
      .toBe("Missing required CTA/IND component: Investigator's Brochure.");
  });
});
