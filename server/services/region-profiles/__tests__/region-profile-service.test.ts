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

  it('surfaces Japan-specific Module 1 structure and advisory requirements in the PMDA profile', () => {
    const jp = getSubmissionRegionProfile('jp')!;
    expect(jp.language).toBe('ja');
    expect(jp.currency).toBe('JPY');
    // Structural Module 1 depth: J-RMP and SAKIGAKE/conditional sections present.
    const sectionTitles = jp.module1Sections.map((s) => s.titleLocal);
    expect(sectionTitles).toContain('医薬品リスク管理計画書'); // J-RMP (1.7)
    expect(sectionTitles).toContain('先駆け審査指定情報'); // SAKIGAKE (1.12)
    // Advisory depth: reexamination period and electronic study data guidance.
    const reqs = jp.specificRequirements.join(' ');
    expect(reqs).toContain('再審査期間'); // reexamination period
    expect(reqs).toContain('申請電子データ'); // CDISC-compliant electronic study data
    expect(reqs).toContain('薬価収載'); // NHI price listing
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
