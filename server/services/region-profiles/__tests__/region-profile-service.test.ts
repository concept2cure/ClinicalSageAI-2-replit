import { describe, it, expect } from 'vitest';
import { getSubmissionRegionProfile, getAllSubmissionRegionProfiles } from '../region-profile-service';
import { getRegionalTemplate } from '../../regional-ctd-templates';

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

  it('uses the authoritative EU Module 1 numbering in the EMA profile', () => {
    const eu = getSubmissionRegionProfile('eu')!;
    const byNumber = new Map(eu.module1Sections.map((s) => [s.number, s.title]));
    // Verified against the EU Module 1 eCTD Specification (EMA eSubmission / NTA).
    expect(byNumber.get('1.1')).toMatch(/Table of Contents/i);
    expect(byNumber.get('1.7')).toMatch(/Orphan Market Exclusivity/i);
    expect(byNumber.get('1.8')).toMatch(/Pharmacovigilance/i);
    expect(byNumber.get('1.9')).toMatch(/Clinical Trials/i);
    expect(byNumber.get('1.10')).toMatch(/Paediatrics/i);
  });

  it('uses the authoritative NMPA Module 1 numbering in the China (NMPA) template', () => {
    const cn = getRegionalTemplate('NMPA')!;
    expect(cn.agency).toBe('NMPA');
    const byNumber = new Map(cn.module1Sections.map((s) => [s.number, s.title]));
    // Verified against NMPA M4 Module 1 (行政文件和药品信息, 2019 No. 17).
    expect(byNumber.get('1.0')).toMatch(/Cover Letter/i);
    expect(byNumber.get('1.1')).toMatch(/Table of Contents/i);
    expect(byNumber.get('1.2')).toMatch(/Application Form/i);
    expect(byNumber.get('1.3')).toMatch(/Product Information/i);
    // The prior template's FDA-artifact section number (1.15) must be gone.
    expect(byNumber.has('1.15')).toBe(false);
    const oneThree = cn.module1Sections.find((s) => s.number === '1.3');
    expect(oneThree?.childSections?.some((c) => c.number === '1.3.1')).toBe(true);
  });

  it('surfaces Japan-specific Module 1 structure and advisory requirements in the PMDA profile', () => {
    const jp = getSubmissionRegionProfile('jp')!;
    expect(jp.language).toBe('ja');
    expect(jp.currency).toBe('JPY');
    // Structural Module 1 depth, with section numbers verified against the
    // authoritative JP CTD framework (承認申請書 = 1.2, 添付文書 = 1.8, J-RMP at 1.11).
    const byNumber = new Map(jp.module1Sections.map((s) => [s.number, s.titleLocal ?? '']));
    expect(byNumber.get('1.2')).toContain('承認申請書'); // application form
    expect(byNumber.get('1.8')).toContain('添付文書'); // package insert
    expect(byNumber.get('1.11')).toContain('医薬品リスク管理計画'); // J-RMP submitted at 1.11
    // Advisory depth: reexamination period and electronic study data guidance.
    const reqs = jp.specificRequirements.join(' ');
    expect(reqs).toContain('再審査期間'); // reexamination period
    expect(reqs).toContain('申請電子データ'); // CDISC-compliant electronic study data
    expect(reqs).toContain('薬価収載'); // NHI price listing
  });

  it('returns null for an unknown region', () => {
    expect(getSubmissionRegionProfile('zz')).toBeNull();
  });
});

describe('getAllSubmissionRegionProfiles', () => {
  it('returns fda, eu, jp, cn, kr in canonical order', () => {
    const all = getAllSubmissionRegionProfiles();
    expect(all.map((p) => p.region)).toEqual(['fda', 'eu', 'jp', 'cn', 'kr']);
  });
});

describe('Korea (kr) region profile', () => {
  it('exposes the MFDS submission profile via kr', () => {
    const kr = getSubmissionRegionProfile('kr');
    expect(kr).toBeTruthy();
    expect(kr!.agency).toBe('MFDS');
    expect(kr!.language).toBe('ko');
    expect(kr!.currency).toBe('KRW');
    expect(kr!.pathways).toContain('ectd_v322');
    expect(kr!.module1Sections.length).toBeGreaterThan(0);
    // The approximate-numbering caveat must be carried on the profile, not hidden.
    expect(kr!.specificRequirements.join(' ')).toMatch(/APPROXIMATE|verify against/i);
    expect(kr!.validationRuleCount).toBeGreaterThanOrEqual(0);
  });
});

describe('China (cn) region profile', () => {
  it('exposes the NMPA submission profile via cn', () => {
    const cn = getSubmissionRegionProfile('cn');
    expect(cn).toBeTruthy();
    expect(cn!.agency).toBe('NMPA');
    expect(cn!.language).toBe('zh');
    expect(cn!.currency).toBe('CNY');
    expect(cn!.pathways).toContain('ectd_v322');
    // Wired to the corrected NMPA Module 1 (Cover Letter at 1.0, no FDA-artifact 1.15).
    const numbers = cn!.module1Sections.map((s) => s.number);
    expect(numbers).toContain('1.0');
    expect(numbers).not.toContain('1.15');
    expect(cn!.validationRuleCount).toBeGreaterThanOrEqual(0);
  });
});
