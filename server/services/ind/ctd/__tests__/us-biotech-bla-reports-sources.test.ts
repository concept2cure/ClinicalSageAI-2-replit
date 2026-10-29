/**
 * BLA report lifecycle sources (601.12(d), 601.28, 601.70, 600.81, 600.14, 600.80(c)(2)).
 * Pins: one record per id, a cited basis on every part, original parts manual,
 * and no form number or day count without a citation beside it.
 */
import { describe, it, expect } from 'vitest';
import { US_BLA_REPORT_SOURCES, US_BLA_REPORT_SOURCE_IDS } from '../us-biotech-bla-reports-sources';

const MANUAL_TYPES = new Set(['form', 'data', 'table']);
const CITED = /21 CFR|FD&C Act|guidance/;

describe('US BLA report lifecycle sources', () => {
  it('has each lifecycle and registry id once, and the PMR record is a status report', () => {
    const want = Object.values(US_BLA_REPORT_SOURCE_IDS);
    expect(US_BLA_REPORT_SOURCES.map(r => r.id)).toEqual(want.map(w => w.id));
    expect(US_BLA_REPORT_SOURCES.map(r => r.registryId)).toEqual(want.map(w => w.registryId));
    expect(new Set(US_BLA_REPORT_SOURCES.map(r => r.id)).size).toBe(want.length);
    const pmr = US_BLA_REPORT_SOURCES.find(r => r.registryId === 'US_BLA_PMR_ANNUAL');
    expect(pmr?.components.map(c => c.code)).toContain('bla_pmr.status_table');
    expect(pmr?.regulatoryBasis.join(' ')).toContain('601.70');
  });

  it('cites a marked basis on every record and part', () => {
    for (const r of US_BLA_REPORT_SOURCES) {
      expect(r.family).toBe('BLA');
      expect(r.regulatoryBasis.every(b => CITED.test(b) && /recall/.test(b)), r.id).toBe(true);
      expect(new Set(r.components.map(c => c.code)).size).toBe(r.components.length);
      for (const c of r.components) expect(c.guidance, c.code).toMatch(/^Basis: .*(21 CFR|FD&C Act).*recall/);
    }
  });

  it('keeps original forms, data and tables manual and never mixed', () => {
    for (const c of US_BLA_REPORT_SOURCES.flatMap(r => r.components)) {
      expect(c.contentType, c.code).not.toBe('mixed');
      if (MANUAL_TYPES.has(c.contentType)) expect(c.generationPrompt, c.code).toMatch(/^Not drafted/);
      else expect(c.generationPrompt, c.code).toMatch(/\{\{PRODUCT_NAME\}\}/);
    }
    expect(US_BLA_REPORT_SOURCES.find(r => r.id === 'us_bpdr')?.components.find(c => c.code === 'bpdr.3486')?.contentType).toBe('form');
  });

  it('names a form number or a day count only beside its citation', () => {
    const texts = US_BLA_REPORT_SOURCES.flatMap(r => [r.description, r.timing ?? '', ...r.components.flatMap(c =>
      [c.guidance, c.authoringGuidance, c.generationPrompt, ...c.keyContentElements])]);
    expect(texts.filter(t => /\bForm\s*FDA\s*\d{3,4}/.test(t)).every(t => /3486/.test(t))).toBe(true);
    expect(texts.filter(t => /\bForm\s*FDA\s*(?!3486)\d{3,4}/.test(t))).toEqual([]);
    expect(texts.filter(t => /\b\d+\s+(calendar\s+)?days\b/.test(t) && !/21 CFR/.test(t))).toEqual([]);
    for (const r of US_BLA_REPORT_SOURCES) expect(r.timing, r.id).toMatch(/21 CFR \d{3}\.\d+/);
  });
});
