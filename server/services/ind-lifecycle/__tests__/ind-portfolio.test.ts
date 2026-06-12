/**
 * IND portfolio combiner — deterministic per-submission rollup + totals. No DB.
 */

import { describe, it, expect } from 'vitest';
import { buildIndPortfolioEntry, buildIndPortfolio, isIndSubmission, buildPortfolioDrift } from '../ind-portfolio';
import type { SequenceLike } from '../ind-submission-overview';
import type { DriftDigest } from '../ind-cockpit';

const seqs = (defs: Array<Partial<SequenceLike>>): SequenceLike[] =>
  defs.map((d, i) => ({ sequenceNumber: String(i).padStart(4, '0'), type: 'original', status: 'draft', ...d }));

describe('isIndSubmission', () => {
  it('matches application_type ind, case-insensitively', () => {
    expect(isIndSubmission({ id: 1, title: 'x', applicationType: 'IND' })).toBe(true);
    expect(isIndSubmission({ id: 1, title: 'x', applicationType: 'nda' })).toBe(false);
    expect(isIndSubmission({ id: 1, title: 'x' })).toBe(false);
  });
});

describe('buildIndPortfolioEntry', () => {
  it('summarizes a submission and its sequences', () => {
    const e = buildIndPortfolioEntry(
      { id: 7, title: 'C2C-001 IND', productName: 'C2C-001', lifecycleStage: 'original', status: 'active' },
      seqs([{ dispatchStatus: 'sent', validationStatus: 'passed' }, { validationStatus: 'failed' }]),
    );
    expect(e.submissionId).toBe(7);
    expect(e.productName).toBe('C2C-001');
    expect(e.sequenceSummary.total).toBe(2);
    expect(e.sequenceSummary.dispatched).toBe(1);
    expect(e.sequenceSummary.validationFailures).toBe(1);
  });

  it('defaults missing optional fields', () => {
    const e = buildIndPortfolioEntry({ id: 1, title: 't' }, []);
    expect(e.productName).toBeNull();
    expect(e.lifecycleStage).toBe('planning');
    expect(e.status).toBe('planning');
  });
});

describe('buildIndPortfolio', () => {
  it('rolls up org-level totals across entries', () => {
    const a = buildIndPortfolioEntry({ id: 1, title: 'A' }, seqs([{ dispatchStatus: 'acknowledged' }, {}]));
    const b = buildIndPortfolioEntry({ id: 2, title: 'B' }, seqs([{ validationStatus: 'failed' }]));
    const p = buildIndPortfolio([a, b]);
    expect(p.totals).toEqual({ submissions: 2, totalSequences: 3, dispatched: 1, validationFailures: 1 });
  });

  it('is empty for no submissions', () => {
    expect(buildIndPortfolio([]).totals).toEqual({ submissions: 0, totalSequences: 0, dispatched: 0, validationFailures: 0 });
  });
});

const digest = (drifted: number, neverVerified: number): DriftDigest => ({
  entries: [],
  summary: { total: drifted + neverVerified, drifted, neverVerified },
});

describe('buildPortfolioDrift', () => {
  it('lists only submissions with issues and sums totals across all', () => {
    const p = buildPortfolioDrift([
      { submission: { id: 1, title: 'Clean IND' }, drift: digest(0, 0) },
      { submission: { id: 2, title: 'Drifted IND' }, drift: digest(2, 1) },
      { submission: { id: 3, title: 'Unverified IND' }, drift: digest(0, 1) },
    ]);
    expect(p.submissions.map((s) => s.submissionId)).toEqual([2, 3]); // clean one excluded
    expect(p.totals).toEqual({ submissionsWithIssues: 2, sequencesDrifted: 2, sequencesNeverVerified: 2 });
  });

  it('is empty when every submission is clean', () => {
    const p = buildPortfolioDrift([{ submission: { id: 1, title: 'A' }, drift: digest(0, 0) }]);
    expect(p.submissions).toHaveLength(0);
    expect(p.totals.submissionsWithIssues).toBe(0);
  });
});
