/**
 * Tests for the template validator's pure logic.
 *
 * Coverage: word counting, section matching, body-level rules, score weighting.
 * DB-backed validateDraft + persistence are exercised via integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  wordCount,
  findDraftForSection,
  validateSectionBody,
  computeConformanceScore,
  evaluate,
} from '../template-validator';
import type { DocumentTemplate, TemplateSection } from '../template-registry';

function section(overrides: Partial<TemplateSection> = {}): TemplateSection {
  return {
    id: 'sec-1',
    sectionCode: '2.5',
    sectionTitle: 'Clinical Overview',
    ordering: 100,
    required: true,
    criticality: 'blocking',
    contentGuidance: null,
    requiredElements: [],
    citationRules: {},
    agencyQuirks: null,
    minWords: null,
    maxWords: null,
    forbiddenPhrases: [],
    requiredPhrases: [],
    ...overrides,
  };
}

function template(sections: TemplateSection[]): DocumentTemplate {
  return {
    id: 'tpl-1',
    templateCode: 'test',
    templateName: 'Test',
    version: '1.0',
    agency: 'fda',
    documentType: 'section',
    submissionType: 'NDA',
    indicationArea: null,
    modulePath: null,
    baseTemplateId: null,
    description: null,
    formattingRules: {},
    agencySpecificNotes: null,
    sourceReference: null,
    status: 'active',
    lastVerifiedAt: null,
    sections,
  };
}

describe('wordCount', () => {
  it('handles whitespace and empty strings', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
    expect(wordCount('one')).toBe(1);
    expect(wordCount('one  two   three')).toBe(3);
    expect(wordCount('one\n\ttwo')).toBe(2);
  });
});

describe('findDraftForSection', () => {
  it('matches by exact section code', () => {
    const ts = section({ sectionCode: '2.5', sectionTitle: 'Clinical Overview' });
    expect(findDraftForSection([{ identifier: '2.5', body: 'body' }], ts)?.body).toBe('body');
  });
  it('matches by title (case-insensitive)', () => {
    const ts = section({ sectionCode: '2.5', sectionTitle: 'Clinical Overview' });
    expect(findDraftForSection([{ identifier: 'clinical overview', body: 'body' }], ts)?.body).toBe('body');
  });
  it('matches by title-contains when title is long enough', () => {
    const ts = section({ sectionCode: '2.5', sectionTitle: 'Clinical Overview' });
    expect(findDraftForSection([{ identifier: '2.5 Clinical Overview — Oncology', body: 'body' }], ts)?.body).toBe('body');
  });
  it('returns null when nothing matches', () => {
    const ts = section({ sectionCode: '2.5', sectionTitle: 'Clinical Overview' });
    expect(findDraftForSection([{ identifier: 'other', body: 'body' }], ts)).toBeNull();
  });
});

describe('validateSectionBody', () => {
  it('flags min/max word counts', () => {
    const ts = section({ minWords: 10, maxWords: 100 });
    const tooShort = validateSectionBody(ts, 'one two three');
    expect(tooShort.some(v => v.rule === 'min_words')).toBe(true);

    const tooLong = validateSectionBody(ts, Array(120).fill('w').join(' '));
    expect(tooLong.some(v => v.rule === 'max_words')).toBe(true);
  });

  it('flags forbidden phrases (case-insensitive)', () => {
    const ts = section({ forbiddenPhrases: ['preliminary data'] });
    const result = validateSectionBody(ts, 'We share Preliminary Data from the cohort.');
    expect(result.some(v => v.rule === 'forbidden_phrase')).toBe(true);
  });

  it('flags missing required phrases', () => {
    const ts = section({ requiredPhrases: ['benefit-risk'] });
    const result = validateSectionBody(ts, 'No statement about that concept here.');
    expect(result.some(v => v.rule === 'missing_required_phrase')).toBe(true);
  });

  it('flags missing required elements', () => {
    const ts = section({ requiredElements: ['sample size justification'] });
    const result = validateSectionBody(ts, 'We will enroll some subjects.');
    expect(result.some(v => v.rule === 'missing_required_element')).toBe(true);
  });

  it('produces no violations when all rules pass', () => {
    const ts = section({
      minWords: 5,
      maxWords: 100,
      requiredPhrases: ['benefit-risk'],
      forbiddenPhrases: ['preliminary'],
      requiredElements: ['sample size'],
    });
    const result = validateSectionBody(
      ts,
      'The benefit-risk assessment supports approval. Sample size justification is given.',
    );
    expect(result).toEqual([]);
  });
});

describe('computeConformanceScore', () => {
  it('returns 1.0 with no issues', () => {
    expect(
      computeConformanceScore({
        missingRequired: [],
        weakSections: [],
        violations: [],
        totalSections: 5,
      }),
    ).toBe(1);
  });

  it('weights blocking-missing more than important-missing', () => {
    const blocking = computeConformanceScore({
      missingRequired: [{ sectionCode: 'a', sectionTitle: 'A', criticality: 'blocking' }],
      weakSections: [],
      violations: [],
      totalSections: 5,
    });
    const important = computeConformanceScore({
      missingRequired: [{ sectionCode: 'a', sectionTitle: 'A', criticality: 'important' }],
      weakSections: [],
      violations: [],
      totalSections: 5,
    });
    expect(blocking).toBeLessThan(important);
  });

  it('clamps to [0, 1]', () => {
    const result = computeConformanceScore({
      missingRequired: Array(20).fill({ sectionCode: 'x', sectionTitle: 'X', criticality: 'blocking' as const }),
      weakSections: [],
      violations: [],
      totalSections: 5,
    });
    expect(result).toBe(0);
  });

  it('returns 0 on empty template', () => {
    expect(
      computeConformanceScore({ missingRequired: [], weakSections: [], violations: [], totalSections: 0 }),
    ).toBe(0);
  });
});

describe('evaluate (end-to-end)', () => {
  it('catches missing required + weak section + violation in one pass', () => {
    const tpl = template([
      section({ sectionCode: '2.5', sectionTitle: 'Clinical Overview', required: true, criticality: 'blocking', minWords: 50 }),
      section({ id: 'sec-2', sectionCode: '2.6', sectionTitle: 'Nonclinical Summaries', required: true, criticality: 'important', forbiddenPhrases: ['data not shown'] }),
      section({ id: 'sec-3', sectionCode: '2.7', sectionTitle: 'Clinical Summary', required: false, criticality: 'supporting' }),
    ]);
    const result = evaluate(tpl, [
      // Provided 2.5 but too short.
      { identifier: '2.5', body: 'Brief summary.' },
      // Provided 2.6 but contains a forbidden phrase.
      { identifier: '2.6', body: 'Pivotal toxicology study (data not shown) supports safety.' },
      // 2.7 omitted (optional → missingOptional, not Required).
    ]);
    expect(result.missingRequired).toEqual([]);
    expect(result.missingOptional.length).toBe(1);
    expect(result.weakSections.length).toBe(1);
    expect(result.violations.some(v => v.rule === 'forbidden_phrase')).toBe(true);
    expect(result.conformanceScore).toBeLessThan(1);
    expect(result.conformanceScore).toBeGreaterThan(0);
  });

  it('returns max score when draft perfectly conforms', () => {
    const tpl = template([
      section({ sectionCode: '1', sectionTitle: 'Intro', required: true, criticality: 'important' }),
    ]);
    const result = evaluate(tpl, [{ identifier: '1', body: 'Adequate body text.' }]);
    expect(result.conformanceScore).toBe(1);
    expect(result.missingRequired).toEqual([]);
    expect(result.violations).toEqual([]);
  });
});
