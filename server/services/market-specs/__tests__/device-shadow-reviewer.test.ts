/**
 * Tests for the device shadow-reviewer checklist — proves the per-submission
 * reviewer questions aggregate correctly (incl. from CER/PER structure) and that
 * the severity counts are consistent.
 */
import { describe, it, expect } from 'vitest';
import {
  K510_REVIEWER_QUESTIONS,
  PMA_REVIEWER_QUESTIONS,
  buildShadowReviewerChecklist,
  deviceSubmissionTypes,
} from '../device-shadow-reviewer';
import { CER_SECTIONS } from '../cer-structure';
import { PER_SECTIONS } from '../per-structure';

describe('device shadow-reviewer — question banks', () => {
  it('510(k) questions cover the substantial-equivalence and RTA gate', () => {
    const ids = K510_REVIEWER_QUESTIONS.map((q) => q.sectionId);
    expect(ids).toEqual(expect.arrayContaining(['substantial_equivalence', 'administrative', 'indications_for_use']));
    expect(K510_REVIEWER_QUESTIONS.some((q) => /RTA gate/.test(q.question) && q.severity === 'critical')).toBe(true);
    expect(K510_REVIEWER_QUESTIONS.every((q) => q.basis)).toBe(true);
  });

  it('PMA questions cover reasonable assurance + benefit-risk', () => {
    expect(PMA_REVIEWER_QUESTIONS.some((q) => /reasonable assurance/i.test(q.question))).toBe(true);
    expect(PMA_REVIEWER_QUESTIONS.some((q) => q.sectionId === 'benefit_risk')).toBe(true);
  });
});

describe('device shadow-reviewer — checklist builder', () => {
  it('builds a 510(k) checklist with consistent severity counts', () => {
    const c = buildShadowReviewerChecklist('510k');
    expect(c.reviewer).toMatch(/510\(k\)/);
    expect(c.counts.total).toBe(c.questions.length);
    expect(c.counts.critical + c.counts.major + c.counts.minor).toBe(c.counts.total);
    expect(c.counts.critical).toBeGreaterThan(0);
  });

  it('sources the CER checklist from the CER structure (single source of truth)', () => {
    const c = buildShadowReviewerChecklist('cer');
    const expected = CER_SECTIONS.reduce((n, s) => n + s.reviewerQuestions.length, 0);
    expect(c.questions.length).toBe(expected);
    expect(c.reviewer).toMatch(/Notified Body/);
  });

  it('sources the PER checklist from the PER structure', () => {
    const c = buildShadowReviewerChecklist('per');
    const expected = PER_SECTIONS.reduce((n, s) => n + s.reviewerQuestions.length, 0);
    expect(c.questions.length).toBe(expected);
  });

  it('covers every device submission type', () => {
    for (const t of deviceSubmissionTypes()) {
      const c = buildShadowReviewerChecklist(t);
      expect(c.questions.length).toBeGreaterThan(0);
      expect(c.questions.every((q) => q.question && q.basis && q.sectionId)).toBe(true);
    }
  });
});
