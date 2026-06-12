/**
 * Tests for the regional eCTD rule catalog, focused on the PMDA (Japan) rules.
 */

import { describe, it, expect } from 'vitest';

import { getRulesForRegion, REGIONAL_RULES, getGatewaySizeLimit, validateRegionalPackage } from '../ectd-regional-rules';

describe('regional eCTD rule catalog — PMDA (Japan)', () => {
  it('has unique rule ids across the whole catalog', () => {
    const ids = REGIONAL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every JP rule is tagged region=JP with a citation', () => {
    const jp = getRulesForRegion('JP');
    expect(jp.length).toBeGreaterThan(0);
    for (const rule of jp) {
      expect(rule.region).toBe('JP');
      expect(rule.citation.trim().length).toBeGreaterThan(0);
      expect(['error', 'warning', 'info']).toContain(rule.severity);
    }
  });

  it('catalogs the J-RMP (Risk Management Plan) requirement for Japan', () => {
    // Declarative catalog rule (no programmatic leaf check), mirroring the
    // Health Canada bilingual-labelling rule: a real PMDA requirement surfaced
    // for awareness without a section-number-dependent gate that could misfire.
    const jrmp = getRulesForRegion('JP').find((r) => r.id === 'PMDA-005');
    expect(jrmp).toBeDefined();
    expect(jrmp!.severity).toBe('warning');
    expect(jrmp!.description).toMatch(/Risk Management Plan|J-RMP|医薬品リスク管理計画/);
  });
});

describe('regional eCTD rule catalog — NMPA (China)', () => {
  it('provides a CN rule pack, every rule tagged region=CN with a citation', () => {
    const cn = getRulesForRegion('CN');
    expect(cn.length).toBeGreaterThanOrEqual(5);
    for (const rule of cn) {
      expect(rule.region).toBe('CN');
      expect(rule.id).toMatch(/^NMPA-CDE-/);
      expect(rule.citation.length).toBeGreaterThan(0);
    }
  });

  it('codifies the Simplified-Chinese language requirement', () => {
    const lang = getRulesForRegion('CN').find((r) => r.id === 'NMPA-CDE-003');
    expect(lang).toBeDefined();
    expect(lang!.severity).toBe('error');
    expect(lang!.description).toMatch(/Simplified Chinese/i);
  });

  it('exposes a (conservative, flagged) gateway size limit for CN', () => {
    expect(getGatewaySizeLimit('CN')).toBeGreaterThan(0);
  });
});

describe('NMPA (China) package validator', () => {
  const ctx = {
    region: 'CN' as const,
    applicationNumber: 'CXHS2400001',
    sequenceNumber: '0000',
    submissionType: 'initial',
  };

  it('flags a missing cn-regional.xml backbone (NMPA-CDE-001, error)', () => {
    const findings = validateRegionalPackage(ctx, [
      { sectionCode: 'm1.2', filePath: 'm1/cn/application-form.pdf', mimeType: 'application/pdf', fileSize: 100 },
    ]);
    const f = findings.find((x) => x.ruleId === 'NMPA-CDE-001');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.region).toBe('CN');
  });

  it('flags a non-ASCII file name (NMPA-CDE-005, warning, leaf-scoped)', () => {
    const findings = validateRegionalPackage(ctx, [
      { sectionCode: 'm1', filePath: 'm1/cn/cn-regional.xml', mimeType: 'application/xml', fileSize: 10 },
      { sectionCode: 'm1.2', filePath: 'm1/cn/申请表.pdf', mimeType: 'application/pdf', fileSize: 100 },
    ]);
    const f = findings.find((x) => x.ruleId === 'NMPA-CDE-005');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warning');
    expect(f!.scope).toBe('leaf');
  });

  it('passes a well-formed CN package with no NMPA findings', () => {
    const findings = validateRegionalPackage(ctx, [
      { sectionCode: 'm1', filePath: 'm1/cn/cn-regional.xml', mimeType: 'application/xml', fileSize: 10 },
      { sectionCode: 'm1.2', filePath: 'm1/cn/application-form.pdf', mimeType: 'application/pdf', fileSize: 100 },
    ]);
    expect(findings.filter((x) => x.region === 'CN')).toHaveLength(0);
  });
});

describe('regional eCTD rule catalog — MFDS (Korea)', () => {
  it('provides a KR rule pack, every rule tagged region=KR with a citation', () => {
    const kr = getRulesForRegion('KR');
    expect(kr.length).toBeGreaterThanOrEqual(4);
    for (const rule of kr) {
      expect(rule.region).toBe('KR');
      expect(rule.id).toMatch(/^MFDS-KR-/);
      expect(rule.citation.length).toBeGreaterThan(0);
    }
  });

  it('codifies the Korean-language (K-CTD) requirement', () => {
    const lang = getRulesForRegion('KR').find((r) => r.id === 'MFDS-KR-002');
    expect(lang).toBeDefined();
    expect(lang!.severity).toBe('error');
    expect(lang!.description).toMatch(/Korean/i);
  });

  it('exposes a (conservative, flagged) gateway size limit for KR', () => {
    expect(getGatewaySizeLimit('KR')).toBeGreaterThan(0);
  });
});

describe('MFDS (Korea) package validator', () => {
  const ctx = {
    region: 'KR' as const,
    applicationNumber: '20240001',
    sequenceNumber: '0000',
    submissionType: 'initial',
  };

  it('flags a missing kr-regional.xml backbone (MFDS-KR-001, error)', () => {
    const findings = validateRegionalPackage(ctx, [
      { sectionCode: 'm1.2', filePath: 'm1/kr/application-form.pdf', mimeType: 'application/pdf', fileSize: 100 },
    ]);
    const f = findings.find((x) => x.ruleId === 'MFDS-KR-001');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.region).toBe('KR');
  });

  it('flags a non-ASCII file name (MFDS-KR-004, warning, leaf-scoped)', () => {
    const findings = validateRegionalPackage(ctx, [
      { sectionCode: 'm1', filePath: 'm1/kr/kr-regional.xml', mimeType: 'application/xml', fileSize: 10 },
      { sectionCode: 'm1.2', filePath: 'm1/kr/신청서.pdf', mimeType: 'application/pdf', fileSize: 100 },
    ]);
    const f = findings.find((x) => x.ruleId === 'MFDS-KR-004');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warning');
    expect(f!.scope).toBe('leaf');
  });

  it('passes a well-formed KR package with no MFDS findings', () => {
    const findings = validateRegionalPackage(ctx, [
      { sectionCode: 'm1', filePath: 'm1/kr/kr-regional.xml', mimeType: 'application/xml', fileSize: 10 },
      { sectionCode: 'm1.2', filePath: 'm1/kr/application-form.pdf', mimeType: 'application/pdf', fileSize: 100 },
    ]);
    expect(findings.filter((x) => x.region === 'KR')).toHaveLength(0);
  });
});
