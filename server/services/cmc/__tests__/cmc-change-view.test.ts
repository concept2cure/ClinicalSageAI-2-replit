/**
 * CMC change-view projection — maps a governed proposed-change row through the
 * deterministic SUPAC/variations classifier into the Lifecycle card shape.
 * Pure; asserts the risk band derives from the computed FDA reporting category
 * and that highest-risk sorts first.
 */
import { describe, it, expect } from 'vitest';
import { riskFromReportingCategory, projectCmcChange, projectCmcChanges, type CmcChangeRow } from '../cmc-change-view';

function row(over: Partial<CmcChangeRow> = {}): CmcChangeRow {
  return {
    title: 'A change',
    area: 'Drug substance',
    programs: 'BX-099',
    status: 'evaluating',
    dosage_form_family: 'biologic',
    change_category: 'scale_up',
    scale_change_factor: 'within_10x',
    excipient_level_change: null,
    site_change_kind: null,
    process_change_kind: null,
    touches_critical_step: true,
    affects: 'drug_substance',
    has_comparability_data: false,
    description: null,
    ...over,
  };
}

describe('riskFromReportingCategory', () => {
  it('maps PAS→high, CBE-30→medium, the rest→low', () => {
    expect(riskFromReportingCategory('pas')).toBe('high');
    expect(riskFromReportingCategory('cbe_30')).toBe('medium');
    expect(riskFromReportingCategory('cbe_0')).toBe('low');
    expect(riskFromReportingCategory('annual_report')).toBe('low');
    expect(riskFromReportingCategory('no_filing')).toBe('low');
  });
});

describe('projectCmcChange', () => {
  it('carries display fields and derives risk from the computed category', () => {
    const v = projectCmcChange(row());
    expect(v.title).toBe('A change');
    expect(v.area).toBe('Drug substance');
    // The classifier decides the category; risk must agree with it (not a stored value).
    expect(v.risk).toBe(riskFromReportingCategory(v.fdaCategory));
    expect(typeof v.fdaCategory).toBe('string');
    expect(typeof v.citation).toBe('string');
  });

  it('defaults an unknown/blank display area and programs to an em dash', () => {
    const v = projectCmcChange(row({ area: null, programs: null }));
    expect(v.area).toBe('—');
    expect(v.programs).toBe('—');
  });
});

describe('projectCmcChanges', () => {
  it('sorts highest-risk first', () => {
    const rows = [
      row({ title: 'spec tightening', change_category: 'specifications', dosage_form_family: 'biologic', touches_critical_step: false, has_comparability_data: true }),
      row({ title: 'site to new country', change_category: 'manufacturing_site', site_change_kind: 'different_country', dosage_form_family: 'sterile_injectable', touches_critical_step: true }),
    ];
    const out = projectCmcChanges(rows);
    expect(out).toHaveLength(2);
    // The higher-burden change (prior-approval class) must sort ahead of the low one.
    const riskRank = { high: 0, medium: 1, low: 2 } as const;
    expect(riskRank[out[0].risk]).toBeLessThanOrEqual(riskRank[out[1].risk]);
  });
});
