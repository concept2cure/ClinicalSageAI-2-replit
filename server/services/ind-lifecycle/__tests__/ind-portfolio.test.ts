/**
 * IND portfolio combiner — deterministic per-submission rollup + totals. No DB.
 */

import { describe, it, expect } from 'vitest';
import { buildIndPortfolioEntry, buildIndPortfolio, isIndSubmission, buildPortfolioDrift, portfolioDriftToCsv } from '../ind-portfolio';
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
    expect(p.totals).toEqual({ submissions: 2, totalSequences: 3, dispatched: 1, validationFailures: 1, submissionsWithUnauthorizedRefs: 0 });
  });

  it('counts submissions with unauthorized external dependencies', () => {
    const a = buildIndPortfolioEntry({ id: 1, title: 'A' }, [], { total: 2, missingLoa: 1, ready: false });
    const b = buildIndPortfolioEntry({ id: 2, title: 'B' }, [], { total: 1, missingLoa: 0, ready: true });
    const p = buildIndPortfolio([a, b]);
    expect(p.totals.submissionsWithUnauthorizedRefs).toBe(1);
    expect(p.entries[0].crossReferences).toEqual({ total: 2, missingLoa: 1, ready: false });
  });

  it('is empty for no submissions', () => {
    expect(buildIndPortfolio([]).totals).toEqual({ submissions: 0, totalSequences: 0, dispatched: 0, validationFailures: 0, submissionsWithUnauthorizedRefs: 0 });
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

const digestWithEntry = (reason: 'drifted' | 'never_verified', overrides: any = {}): DriftDigest => ({
  entries: [
    {
      sequenceId: 42,
      sequenceNumber: '0001',
      type: 'amendment',
      status: 'draft',
      reason,
      canDispatch: false,
      lastVerifiedAt: reason === 'drifted' ? '2026-01-01T00:00:00.000Z' : null,
      ...overrides,
    },
  ],
  summary: { total: 1, drifted: reason === 'drifted' ? 1 : 0, neverVerified: reason === 'never_verified' ? 1 : 0 },
});

describe('portfolioDriftToCsv', () => {
  it('emits a header and one row per flagged sequence', () => {
    const p = buildPortfolioDrift([
      { submission: { id: 2, title: 'Drifted IND', productName: 'C2C-001' }, drift: digestWithEntry('drifted') },
      { submission: { id: 3, title: 'Unverified IND' }, drift: digestWithEntry('never_verified') },
    ]);
    const csv = portfolioDriftToCsv(p);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('submission_id,submission_title,product_name,sequence_id,sequence_number,sequence_type,sequence_status,reason,can_dispatch,last_verified_at');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain('2,Drifted IND,C2C-001,42,0001,amendment,draft,drifted,false,2026-01-01T00:00:00.000Z');
    expect(lines[2]).toContain('3,Unverified IND,,42,0001,amendment,draft,never_verified,false,');
  });

  it('quotes/escapes fields containing commas or quotes', () => {
    const p = buildPortfolioDrift([
      { submission: { id: 9, title: 'Acme, Inc. "IND"' }, drift: digestWithEntry('drifted') },
    ]);
    const csv = portfolioDriftToCsv(p);
    expect(csv).toContain('"Acme, Inc. ""IND"""');
  });

  it('emits just the header when there are no issues', () => {
    const csv = portfolioDriftToCsv(buildPortfolioDrift([]));
    expect(csv.trim().split('\n')).toHaveLength(1);
  });
});
