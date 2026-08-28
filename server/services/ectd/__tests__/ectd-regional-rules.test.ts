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

// Every supported region. Kept in lock-step with the RegulatoryRegion union so
// that adding a region without a rule pack, gateway limit, or dispatcher case
// fails CI rather than silently shipping a half-wired region. UK/AU/CH/BR/IN/SG
// are covered by validateGenericRegionPackage (minimum-viable stubs enforcing
// only M1 regional-backbone presence + ASCII file names) until their full
// MHRA / TGA / Swissmedic / ANVISA / CDSCO / HSA rule packs are encoded.
const ALL_REGIONS = ['US', 'EU', 'JP', 'CA', 'CN', 'KR', 'UK', 'AU', 'CH', 'BR', 'IN', 'SG'] as const;

describe('regional eCTD rule catalog — cross-region invariants', () => {
  it('every catalog rule has a valid region, non-empty citation, and valid severity', () => {
    for (const rule of REGIONAL_RULES) {
      expect(ALL_REGIONS).toContain(rule.region);
      expect(rule.id.trim().length).toBeGreaterThan(0);
      expect(rule.citation.trim().length).toBeGreaterThan(0);
      expect(['error', 'warning', 'info']).toContain(rule.severity);
    }
  });

  it('every supported region has at least one rule and a positive gateway limit', () => {
    for (const region of ALL_REGIONS) {
      expect(getRulesForRegion(region).length).toBeGreaterThan(0);
      expect(getGatewaySizeLimit(region)).toBeGreaterThan(0);
    }
  });

  it('dispatches every region without throwing (validator wired for each)', () => {
    for (const region of ALL_REGIONS) {
      const ctx = {
        region,
        applicationNumber: 'X',
        sequenceNumber: 'bad', // forces a deterministic sequence finding
        submissionType: 'initial',
      };
      const findings = validateRegionalPackage(ctx, []);
      // The universal sequence-format rule must always fire for an invalid value,
      // proving the dispatcher ran rather than silently no-op'ing.
      expect(findings.some((f) => f.ruleId === 'FDA-ESG-001')).toBe(true);
    }
  });
});

describe('EMA (EU) package validator — application-number format (EMA-CESP-002)', () => {
  const euCtx = (applicationNumber: string) => ({
    region: 'EU' as const,
    applicationNumber,
    sequenceNumber: '0000',
    submissionType: 'initial',
  });
  const leaves = [
    { sectionCode: 'm1', filePath: 'm1/eu/eu-regional.xml', mimeType: 'application/xml', fileSize: 10 },
  ];
  const hasAppNumberFinding = (applicationNumber: string) =>
    validateRegionalPackage(euCtx(applicationNumber), leaves).some((f) => f.ruleId === 'EMA-CESP-002');

  it('accepts the canonical 6-digit centralised number (EMEA/H/C/005012)', () => {
    // Rule EMA-CESP-002 cites the "[6-digit]" centralised format; this is the
    // form used throughout the product (e.g. EMEA/H/C/005012, /005612). It must
    // not be flagged as malformed.
    expect(hasAppNumberFinding('EMEA/H/C/005012')).toBe(false);
  });

  it('accepts shorter centralised fixtures (4–5 digit)', () => {
    expect(hasAppNumberFinding('EMEA/H/C/12345')).toBe(false);
    expect(hasAppNumberFinding('EMEA/H/C/0001')).toBe(false);
  });

  it('accepts a national (MRP/DCP) number', () => {
    expect(hasAppNumberFinding('GB/H/12345/2024')).toBe(false);
  });

  it('rejects non-conformant numbers with trailing characters (anchored)', () => {
    // The pattern must be anchored at both ends: a valid prefix followed by
    // garbage is NOT a conformant EU application number and must be flagged.
    expect(hasAppNumberFinding('EMEA/H/C/12345-bogus-trailing')).toBe(true);
    expect(hasAppNumberFinding('EMEA/H/C/1234567890')).toBe(true);
    expect(hasAppNumberFinding('GB/H/12345/2024/extra')).toBe(true);
  });

  it('rejects an obviously invalid number', () => {
    expect(hasAppNumberFinding('NOT-VALID')).toBe(true);
  });
});

describe('Health Canada (CA) package validator', () => {
  it('uses distinct rule ids for a bad application number vs a missing backbone', () => {
    const findings = validateRegionalPackage(
      { region: 'CA', applicationNumber: 'NOT-VALID', sequenceNumber: '0000', submissionType: 'initial' },
      [{ sectionCode: 'm1.2', filePath: 'm1/ca/form.pdf', mimeType: 'application/pdf', fileSize: 100 }]
    );
    const appNumberFinding = findings.find((f) => /does not match HC format/.test(f.message));
    const backboneFinding = findings.find((f) => /ca-regional\.xml is missing/.test(f.message));
    expect(appNumberFinding).toBeDefined();
    expect(backboneFinding).toBeDefined();
    // The two conditions are different rules and must not share a rule id.
    expect(appNumberFinding!.ruleId).toBe('HC-REP-003');
    expect(backboneFinding!.ruleId).toBe('HC-REP-001');
    expect(appNumberFinding!.ruleId).not.toBe(backboneFinding!.ruleId);
  });

  it('passes a well-formed CA package with no findings', () => {
    const findings = validateRegionalPackage(
      { region: 'CA', applicationNumber: 'NDS123456', sequenceNumber: '0000', submissionType: 'initial' },
      [
        { sectionCode: 'm1', filePath: 'm1/ca/ca-regional.xml', mimeType: 'application/xml', fileSize: 10 },
        { sectionCode: 'm1.2', filePath: 'm1/ca/form.pdf', mimeType: 'application/pdf', fileSize: 100 },
      ]
    );
    expect(findings.filter((f) => f.region === 'CA')).toHaveLength(0);
  });

  it('rejects a valid HC prefix followed by trailing garbage (end-anchored)', () => {
    const findings = validateRegionalPackage(
      { region: 'CA', applicationNumber: 'NDS123456ZZZ', sequenceNumber: '0000', submissionType: 'initial' },
      [{ sectionCode: 'm1', filePath: 'm1/ca/ca-regional.xml', mimeType: 'application/xml', fileSize: 10 }]
    );
    // Before the fix the un-anchored regex matched "NDS123456" at the start and
    // passed the malformed identifier.
    expect(findings.some((f) => f.ruleId === 'HC-REP-003')).toBe(true);
  });
});

describe('gateway size limit is reported unverified, never silently skipped', () => {
  const usLeaves = [
    { sectionCode: 'm1', filePath: 'm1/us/us-regional.xml', mimeType: 'application/xml', fileSize: 10 },
    { sectionCode: 'm1.2', filePath: 'm1/us/cover.pdf', mimeType: 'application/pdf', fileSize: 100 },
  ];

  it('emits a warning when totalSizeBytes is not supplied (FDA)', () => {
    const findings = validateRegionalPackage(
      { region: 'US', applicationNumber: '123456', sequenceNumber: '0000', submissionType: 'original' },
      usLeaves,
    );
    const sizeFinding = findings.find((f) => f.ruleId === 'FDA-ESG-003');
    expect(sizeFinding).toBeDefined();
    expect(sizeFinding!.severity).toBe('warning');
    expect(sizeFinding!.message).toMatch(/could not be verified/i);
  });

  it('does not emit the unverified warning when a size is supplied under the limit', () => {
    const findings = validateRegionalPackage(
      { region: 'US', applicationNumber: '123456', sequenceNumber: '0000', submissionType: 'original', totalSizeBytes: 1024 },
      usLeaves,
    );
    expect(findings.some((f) => f.ruleId === 'FDA-ESG-003')).toBe(false);
  });
});
