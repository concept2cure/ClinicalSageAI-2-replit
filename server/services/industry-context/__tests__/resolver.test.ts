/**
 * mergeIndustryContext — the precedence core of the effective-context resolver.
 *
 * The whole tailoring model rests on one rule: project overrides org overrides
 * license default, per field, without ever throwing on a missing layer. These
 * tests hold that rule and the safe fall-throughs.
 */

import { describe, it, expect } from 'vitest';
import {
  mergeIndustryContext,
  verticalForPrimaryIndustry,
  defaultRigorForPrimaryIndustry,
} from '../resolver';

describe('verticalForPrimaryIndustry', () => {
  it('maps only device/diagnostics to the mdx vertical', () => {
    expect(verticalForPrimaryIndustry('medical_device_diagnostics')).toBe('mdx');
    expect(verticalForPrimaryIndustry('biotech_pharma')).toBe('biopharma');
    expect(verticalForPrimaryIndustry('cro')).toBe('biopharma');
    expect(verticalForPrimaryIndustry(null)).toBe('biopharma');
  });
});

describe('defaultRigorForPrimaryIndustry', () => {
  it('defaults regulated industries to dual review, CRO to signoff, academia to single', () => {
    expect(defaultRigorForPrimaryIndustry('medical_device_diagnostics')).toBe('regulated_dual_review');
    expect(defaultRigorForPrimaryIndustry('cro')).toBe('signoff_required');
    expect(defaultRigorForPrimaryIndustry('academic_research')).toBe('single_reviewer');
  });
});

describe('mergeIndustryContext', () => {
  it('derives vertical from the org when no project override, and reports the source', () => {
    const ctx = mergeIndustryContext({ org: { primaryIndustry: 'medical_device_diagnostics' } });
    expect(ctx.vertical).toBe('mdx');
    expect(ctx.source).toBe('organization');
    expect(ctx.terminology.product).toBe('Device');
  });

  it('lets an explicit project vertical override the org', () => {
    const ctx = mergeIndustryContext({
      project: { vertical: 'mdx' },
      org: { primaryIndustry: 'biotech_pharma' },
    });
    expect(ctx.vertical).toBe('mdx');
    expect(ctx.source).toBe('project');
  });

  it('falls through to a biopharma license default when nothing is set', () => {
    const ctx = mergeIndustryContext({});
    expect(ctx.vertical).toBe('biopharma');
    expect(ctx.source).toBe('license_default');
    expect(ctx.specialization).toBeNull();
    expect(ctx.pathways).toEqual([]);
    expect(ctx.markets).toEqual([]);
  });

  it('prefers project specialization over org specialization', () => {
    const ctx = mergeIndustryContext({
      project: { specialization: 'ivd_diagnostics' },
      org: { primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'medical_device' },
    });
    expect(ctx.specialization).toBe('ivd_diagnostics');
  });

  it('falls back to org specialization when the project has none', () => {
    const ctx = mergeIndustryContext({
      project: {},
      org: { primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'both' },
    });
    expect(ctx.specialization).toBe('both');
  });

  it('takes a non-empty project pathway/market array over the org default', () => {
    const ctx = mergeIndustryContext({
      project: { regulatoryPathways: ['dual_510k_clia'], targetMarkets: ['US'] },
      org: { primaryIndustry: 'medical_device_diagnostics', defaultPathways: ['510k'], defaultMarkets: ['US', 'EU'] },
    });
    expect(ctx.pathways).toEqual(['dual_510k_clia']);
    expect(ctx.markets).toEqual(['US']);
  });

  it('inherits org pathways/markets when the project arrays are empty', () => {
    const ctx = mergeIndustryContext({
      project: { regulatoryPathways: [], targetMarkets: [] },
      org: { primaryIndustry: 'medical_device_diagnostics', defaultPathways: ['510k'], defaultMarkets: ['US'] },
    });
    expect(ctx.pathways).toEqual(['510k']);
    expect(ctx.markets).toEqual(['US']);
  });

  it('uses the org approval rigor when set, else the industry default', () => {
    expect(
      mergeIndustryContext({ org: { primaryIndustry: 'cro', defaultApprovalRigor: 'qa_lock' } }).approvalRigor,
    ).toBe('qa_lock');
    expect(
      mergeIndustryContext({ org: { primaryIndustry: 'medical_device_diagnostics' } }).approvalRigor,
    ).toBe('regulated_dual_review');
  });

  it('passes licensed modules through', () => {
    const ctx = mergeIndustryContext({ licensedModules: ['mdx', 'submissions'] });
    expect(ctx.licensedModules).toEqual(['mdx', 'submissions']);
  });
});
