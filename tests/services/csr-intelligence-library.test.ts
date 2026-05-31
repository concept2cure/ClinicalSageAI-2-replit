import { describe, it, expect } from 'vitest';
import {
  extractCsrEntities,
  validateCsrStructure,
  csrIntelligenceLibrary,
} from '../../server/services/csr-intelligence-library';

const sampleCsr = `
Synopsis. This was a Phase III, randomized, double-blind, placebo-controlled,
parallel-group study. A total of 450 patients were randomized in a 1:1 ratio to
receive Drug X or placebo over 24 weeks. The primary endpoint showed a
significant treatment effect (p < 0.001). A secondary analysis was not
significant (p = 0.34).
`;

describe('extractCsrEntities', () => {
  it('extracts structured fields deterministically', () => {
    const a = extractCsrEntities(sampleCsr);
    const b = extractCsrEntities(sampleCsr);
    expect(a).toEqual(b);
    expect(a.sampleSize).toBe(450);
    expect(a.phase).toBe('Phase 3');
    expect(a.design).toContain('randomized');
    expect(a.blinding).toBe('double-blind');
    expect(a.randomization).toBe('1:1');
    expect(a.durationWeeks).toBe(24);
    expect(a.pValues).toEqual([0.001, 0.34]);
  });

  it('attaches verbatim evidence to every entity', () => {
    const { entities } = extractCsrEntities(sampleCsr);
    for (const e of entities) {
      expect(typeof e.evidence).toBe('string');
      expect(e.evidence.length).toBeGreaterThan(0);
      expect(sampleCsr).toContain(e.evidence);
    }
  });

  it('never fabricates on empty or junk input', () => {
    for (const input of ['', '   ', 'the quick brown fox']) {
      const r = extractCsrEntities(input);
      expect(r.sampleSize).toBeNull();
      expect(r.phase).toBeNull();
      expect(r.pValues).toEqual([]);
      expect(r.design).toBeNull();
      expect(r.entities).toEqual([]);
    }
  });

  it('handles roman-numeral phase', () => {
    expect(extractCsrEntities('A Phase II trial').phase).toBe('Phase 2');
  });

  it('converts months and years to weeks', () => {
    expect(extractCsrEntities('treatment over 6 months').durationWeeks).toBe(26);
    expect(extractCsrEntities('a 1 year follow-up').durationWeeks).toBe(52);
  });

  it('ignores out-of-range p-values', () => {
    expect(extractCsrEntities('p = 1.5').pValues).toEqual([]);
  });
});

describe('validateCsrStructure', () => {
  it('flags missing ICH E3 sections', () => {
    const r = validateCsrStructure('Synopsis and conclusions only.');
    expect(r.presentSections).toContain('synopsis');
    expect(r.presentSections).toContain('conclusions');
    expect(r.missingSections.length).toBeGreaterThan(0);
    expect(r.valid).toBe(false);
    expect(r.issues.every(i => i.severity === 'warning')).toBe(true);
  });

  it('is valid when all sections present', () => {
    const text = [
      'synopsis',
      'introduction',
      'study objectives',
      'investigational plan',
      'study patients',
      'efficacy evaluation',
      'safety evaluation',
      'discussion',
      'conclusions',
    ].join(' ');
    const r = validateCsrStructure(text);
    expect(r.valid).toBe(true);
    expect(r.missingSections).toEqual([]);
  });
});

describe('csrIntelligenceLibrary (backward-compatible API)', () => {
  it('processContent returns real extraction and insights', async () => {
    const r = await csrIntelligenceLibrary.processContent(null, sampleCsr);
    expect(r.success).toBe(true);
    expect(r.extraction.sampleSize).toBe(450);
    expect(r.insights.some(i => i.includes('450'))).toBe(true);
  });

  it('processContent is honest about empty input', async () => {
    const r = await csrIntelligenceLibrary.processContent(null, 'nothing here');
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/No structured entities/i);
  });

  it('validate returns ICH E3 structural result', async () => {
    const r = await csrIntelligenceLibrary.validate('synopsis only');
    expect(r.presentSections).toContain('synopsis');
    expect(r.valid).toBe(false);
  });
});
