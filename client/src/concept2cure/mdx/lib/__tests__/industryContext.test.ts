/**
 * industryContext selectors — the pure display layer of the Program
 * context card (PM-01). These hold the label mappings and the rule that
 * an unset specialization renders as an explicit "Not set", never as a
 * dropped row.
 */

import { describe, it, expect } from 'vitest';
import {
  contextSummaryRows,
  humanizeToken,
  specializationLabel,
  sourceLabel,
  type EffectiveIndustryContext,
} from '../industryContext';

function ctx(overrides: Partial<EffectiveIndustryContext> = {}): EffectiveIndustryContext {
  return {
    vertical: 'mdx',
    specialization: 'ivd_diagnostics',
    productType: null,
    lifecycleStage: null,
    pathways: ['510k', 'de_novo'],
    markets: ['US', 'EU'],
    filingTypes: [],
    licensedModules: [],
    terminology: {},
    approvalRigor: 'regulated_dual_review',
    source: 'project',
    ...overrides,
  };
}

describe('humanizeToken', () => {
  it('replaces underscores and capitalizes the first letter only', () => {
    expect(humanizeToken('de_novo')).toBe('De novo');
    expect(humanizeToken('eu_MDR')).toBe('Eu MDR');
  });

  it('leaves tokens without underscores intact apart from the initial cap', () => {
    expect(humanizeToken('510k')).toBe('510k');
    expect(humanizeToken('US')).toBe('US');
  });

  it('returns an empty string unchanged', () => {
    expect(humanizeToken('')).toBe('');
  });
});

describe('specializationLabel', () => {
  it('maps known specializations to display labels', () => {
    expect(specializationLabel('ivd_diagnostics')).toBe('IVD diagnostics');
    expect(specializationLabel('samd')).toBe('SaMD');
    expect(specializationLabel('companion_diagnostic')).toBe('Companion diagnostic');
  });

  it('humanizes unknown values instead of dropping them', () => {
    expect(specializationLabel('digital_therapeutic')).toBe('Digital therapeutic');
  });

  it('returns null for null or empty input', () => {
    expect(specializationLabel(null)).toBeNull();
    expect(specializationLabel('')).toBeNull();
  });
});

describe('sourceLabel', () => {
  it('maps each resolver source to its display label', () => {
    expect(sourceLabel('project')).toBe('Project profile');
    expect(sourceLabel('organization')).toBe('Organization profile');
    expect(sourceLabel('license_default')).toBe('License default');
  });
});

describe('contextSummaryRows', () => {
  it('returns vertical, specialization, rigor and source in display order', () => {
    expect(contextSummaryRows(ctx())).toEqual([
      { label: 'Vertical', value: 'Medical device & diagnostics' },
      { label: 'Specialization', value: 'IVD diagnostics' },
      { label: 'Approval rigor', value: 'Regulated dual review' },
      { label: 'Source', value: 'Project profile' },
    ]);
  });

  it('renders an explicit "Not set" for a missing specialization', () => {
    const rows = contextSummaryRows(ctx({ specialization: null }));
    expect(rows.find((r) => r.label === 'Specialization')?.value).toBe('Not set');
  });

  it('labels the biopharma vertical and org-sourced context', () => {
    const rows = contextSummaryRows(
      ctx({ vertical: 'biopharma', source: 'organization', approvalRigor: 'signoff_required' }),
    );
    expect(rows).toEqual([
      { label: 'Vertical', value: 'Biopharma' },
      { label: 'Specialization', value: 'IVD diagnostics' },
      { label: 'Approval rigor', value: 'Sign-off required' },
      { label: 'Source', value: 'Organization profile' },
    ]);
  });
});
