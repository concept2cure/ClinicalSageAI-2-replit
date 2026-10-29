/**
 * BLA change and CBER lifecycle sources (601.12(b)/(c)/(c)(5), CBER master file,
 * 610.2 lot release, FD&C Act 564 EUA). Pins: one record per id, a cited basis
 * on every part, original parts manual, and no form number or day count
 * without a citation beside it.
 */
import { describe, it, expect } from 'vitest';
import { US_BLA_CHANGES_CBER_SOURCES as RECORDS, US_BLA_CHANGES_CBER_SOURCE_IDS as IDS } from '../us-biotech-bla-changes-cber-sources';

const MANUAL_TYPES = new Set(['form', 'data', 'table']);

describe('US BLA change and CBER lifecycle sources', () => {
  it('has each lifecycle and registry id once; BLA supplements read 601.12, not 314.70', () => {
    const want = Object.values(IDS);
    expect(RECORDS.map(r => r.id)).toEqual(want.map(w => w.id));
    expect(RECORDS.map(r => r.registryId)).toEqual(want.map(w => w.registryId));
    expect(new Set(RECORDS.map(r => r.registryId)).size).toBe(want.length);
    for (const r of RECORDS.filter(x => x.category === 'supplement')) {
      expect(r.regulatoryBasis.join(' '), r.id).toContain('601.12');
      expect(r.regulatoryBasis.join(' '), r.id).not.toContain('314.70');
    }
  });

  it('cites a recall-marked basis on every record and part', () => {
    for (const r of RECORDS) {
      expect(r.regulatoryBasis.every(b => /21 CFR|FD&C Act|FDA guidance/.test(b) && /recall/.test(b)), r.id).toBe(true);
      expect(new Set(r.components.map(c => c.code)).size).toBe(r.components.length);
      for (const c of r.components) expect(c.guidance, c.code).toMatch(/^Basis: .*(21 CFR|FD&C Act|FDA guidance).*recall/);
    }
  });

  it('keeps original forms, data, tables and signed records manual and never mixed', () => {
    for (const c of RECORDS.flatMap(r => r.components)) {
      expect(c.contentType, c.code).not.toBe('mixed');
      if (MANUAL_TYPES.has(c.contentType)) expect(c.generationPrompt, c.code).toMatch(/^Not drafted/);
      else expect(c.generationPrompt, c.code).toMatch(/\{\{(PRODUCT_NAME|SPONSOR)\}\}/);
    }
    const codes = ['bla_cbe30.356h', 'cber_mf.loa', 'cber_mf.commitment', 'cber_lr.protocol'];
    const byCode = new Map(RECORDS.flatMap(r => r.components).map(c => [c.code, c.contentType]));
    for (const code of codes) expect(MANUAL_TYPES.has(byCode.get(code) ?? ''), code).toBe(true);
  });

  it('names a form number or a day count only beside its citation', () => {
    const texts = RECORDS.flatMap(r => [r.description, r.timing ?? '', ...r.components.flatMap(c =>
      [c.guidance, c.authoringGuidance, c.generationPrompt, ...c.keyContentElements])]);
    expect(texts.filter(t => /\bForm\s*FDA\s*(?!356h)\d{3,4}/.test(t))).toEqual([]);
    expect(texts.filter(t => /\b\d+\s+(calendar\s+)?days\b/.test(t) && !/21 CFR/.test(t))).toEqual([]);
    const timed = RECORDS.filter(r => r.timing);
    expect(timed.every(r => /21 CFR \d{3}\.\d+/.test(r.timing ?? ''))).toBe(true);
    expect(RECORDS.find(r => r.id === 'us_eua_therapeutic')?.timing).toBeUndefined();
  });
});
