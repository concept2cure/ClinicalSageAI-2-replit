/**
 * QA aggregator tests — prove runQaChecks folds the structural + numeric +
 * semantic checks into one report: a clean segment passes with no findings, and
 * a segment that drops a do-not-translate identifier AND mangles a dose fails
 * with multiple error findings and gates approval. summary counts stay
 * consistent with the findings list.
 */

import { describe, it, expect } from 'vitest';

import { runQaChecks, qaGatesApproval } from '../index';
import type { GlossaryTerm } from '../../types';

describe('runQaChecks aggregator', () => {
  it('passes a clean segment with no findings', () => {
    const report = runQaChecks({
      source: 'The investigator must report the outcome.',
      target: '治験責任医師は転帰を報告しなければならない。',
    });
    expect(report.passed).toBe(true);
    expect(report.findings).toHaveLength(0);
    expect(report.summary.error).toBe(0);
  });

  it('passes a segment with matched numbers and units', () => {
    const report = runQaChecks({
      source: 'Take 5 mg of the study drug.',
      target: '治験薬を5 mg服用する。',
    });
    expect(report.passed).toBe(true);
  });

  it('fails a segment that drops a DNT identifier and a dose, and gates approval', () => {
    const glossary: GlossaryTerm[] = [
      {
        id: 1,
        organizationId: 1,
        sourceTerm: '21 CFR 312.23',
        doNotTranslate: true,
        category: 'regulatory_citation',
      },
    ];
    const report = runQaChecks(
      { source: 'Administer 10 mg per 21 CFR 312.23.', target: '投与する。', glossary },
      42,
    );

    expect(report.passed).toBe(false);
    expect(report.summary.error).toBeGreaterThanOrEqual(2);
    expect(qaGatesApproval(report)).toBe(true);
    const ids = report.findings.map((f) => f.checkId);
    expect(ids).toContain('dnt-identifier-preserved');
    expect(ids).toContain('numeric-number-consistency');
    expect(report.segmentId).toBe(42);
  });

  it('keeps summary counts consistent with the findings list', () => {
    const report = runQaChecks({ source: 'Administer 10 mg.', target: '投与する。' });
    const total = report.summary.error + report.summary.warning + report.summary.info;
    expect(total).toBe(report.findings.length);
  });

  it('omits segmentId when not provided', () => {
    const report = runQaChecks({ source: 'abc', target: 'あいう' });
    expect(report.segmentId).toBeUndefined();
  });
});
