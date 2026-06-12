/**
 * Tests for the regional eCTD rule catalog, focused on the PMDA (Japan) rules.
 */

import { describe, it, expect } from 'vitest';

import { getRulesForRegion, REGIONAL_RULES, getGatewaySizeLimit } from '../ectd-regional-rules';

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
