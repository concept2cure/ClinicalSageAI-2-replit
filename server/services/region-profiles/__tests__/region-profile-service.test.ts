import { describe, it, expect } from 'vitest';
import { getSubmissionRegionProfile, getAllSubmissionRegionProfiles } from '../region-profile-service';

describe('getSubmissionRegionProfile', () => {
  it('composes an FDA profile with agency, Module 1, forms, and pathways', () => {
    const p = getSubmissionRegionProfile('fda');
    expect(p).toBeTruthy();
    expect(p!.agency).toBe('FDA');
    expect(p!.pathways).toContain('ectd_v322');
    expect(p!.pathways).toContain('estar');
    expect(p!.module1Sections.length).toBeGreaterThan(0);
    expect(p!.forms.some((f) => f.formId === '356h')).toBe(true);
    expect(p!.validationRuleCount).toBeGreaterThanOrEqual(0);
  });

  it('is case-insensitive and maps eu→EMA, jp→PMDA', () => {
    expect(getSubmissionRegionProfile('EU')!.agency).toBe('EMA');
    expect(getSubmissionRegionProfile('jp')!.agency).toBe('PMDA');
  });

  it('returns null for an unknown region', () => {
    expect(getSubmissionRegionProfile('cn')).toBeNull();
  });
});

describe('getAllSubmissionRegionProfiles', () => {
  it('returns fda, eu, jp in canonical order', () => {
    const all = getAllSubmissionRegionProfiles();
    expect(all.map((p) => p.region)).toEqual(['fda', 'eu', 'jp']);
  });
});
