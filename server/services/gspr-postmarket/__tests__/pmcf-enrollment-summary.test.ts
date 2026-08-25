/**
 * PMCF enrolment summary — the arithmetic a notified body reads.
 *
 * `summariseRecords` is the pure half of the PMCF enrolment read path: the
 * route fetches once and summarises the same array it returns, so the table and
 * the totals cannot disagree. What these tests pin is the part that is easy to
 * get subtly, dangerously wrong — the difference between "not reported" and
 * "zero".
 *
 * Under MDR Annex XIV Part B the post-market section of a CER rests on PMCF
 * execution, not just on the existence of a PMCF plan. A summary that renders
 * an unreported activity as `0 enrolled of 0 planned` states that the
 * programme was checked and found empty. It was not; nobody has reported yet.
 * Those are different claims and only one of them is true, so the summary
 * carries null rather than zero and counts the basis it computed over.
 */
import { describe, it, expect } from 'vitest';

import { summariseRecords } from '../pmcf-enrollment.service';
import type { PmcfEnrollmentRecord } from '../../../../shared/schema/gspr-postmarket';

const PROGRAM = '11111111-2222-3333-4444-555555555555';

/** A record with only the fields the summary reads; the rest are irrelevant
 *  here and are left as the store would leave them. */
function rec(over: Partial<PmcfEnrollmentRecord>): PmcfEnrollmentRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    organizationId: 7,
    programId: PROGRAM,
    activityCode: 'PMCF-01',
    activityKind: 'registry',
    title: 'Post-market registry',
    status: 'planned',
    pmcfPlanDocumentId: null,
    primaryEndpoint: null,
    sitesCount: null,
    targetEnrollment: null,
    enrolledCount: null,
    enrollmentAsOf: null,
    dataCollectionThrough: null,
    notes: null,
    ...over,
  } as PmcfEnrollmentRecord;
}

describe('summariseRecords — reported vs. zero', () => {
  it('reports nothing as null, not as zero, when no activity has been reported', () => {
    const s = summariseRecords(PROGRAM, [
      rec({ id: '00000000-0000-4000-8000-000000000001', activityCode: 'PMCF-01' }),
      rec({ id: '00000000-0000-4000-8000-000000000002', activityCode: 'PMCF-02', targetEnrollment: 200 }),
    ]);
    // The whole point: 0/0 would read as a verified-empty programme.
    expect(s.enrolledInReporting).toBeNull();
    expect(s.targetInReporting).toBeNull();
    expect(s.activityCount).toBe(2);
    expect(s.reportingActivityCount).toBe(0);
    expect(s.notReportedActivityCount).toBe(2);
  });

  it('counts the basis it computed over, so a ratio cannot be read as programme-wide', () => {
    const s = summariseRecords(PROGRAM, [
      rec({ id: '00000000-0000-4000-8000-000000000001', activityCode: 'A', targetEnrollment: 100, enrolledCount: 92, enrollmentAsOf: new Date('2026-03-01') }),
      rec({ id: '00000000-0000-4000-8000-000000000002', activityCode: 'B', targetEnrollment: 400 }),
      rec({ id: '00000000-0000-4000-8000-000000000003', activityCode: 'C' }),
      rec({ id: '00000000-0000-4000-8000-000000000004', activityCode: 'D' }),
      rec({ id: '00000000-0000-4000-8000-000000000005', activityCode: 'E' }),
    ]);
    // 92 of 100 is real, but it is one of five activities — the basis count is
    // what stops it being presented as 92% of the programme.
    expect(s.enrolledInReporting).toBe(92);
    expect(s.targetInReporting).toBe(100);
    expect(s.ratioBasisActivityCount).toBe(1);
    expect(s.activityCount).toBe(5);
  });

  it('excludes a reported count with no target from the ratio basis', () => {
    const s = summariseRecords(PROGRAM, [
      rec({ id: '00000000-0000-4000-8000-000000000001', activityCode: 'A', enrolledCount: 40, enrollmentAsOf: new Date('2026-02-01') }),
    ]);
    expect(s.enrolledInReporting).toBe(40);
    // No planned size means no denominator; inventing one would manufacture a
    // completion percentage out of nothing.
    expect(s.targetInReporting).toBeNull();
    expect(s.ratioBasisActivityCount).toBe(0);
  });

  it('surfaces activities with no linked plan as a reportable gap', () => {
    const s = summariseRecords(PROGRAM, [
      rec({ id: '00000000-0000-4000-8000-000000000001', activityCode: 'A', pmcfPlanDocumentId: 'doc-1' }),
      rec({ id: '00000000-0000-4000-8000-000000000002', activityCode: 'B' }),
      rec({ id: '00000000-0000-4000-8000-000000000003', activityCode: 'C' }),
    ]);
    expect(s.unlinkedToPlanCount).toBe(2);
  });

  it('tallies every status, including the ones with no rows', () => {
    const s = summariseRecords(PROGRAM, [
      rec({ id: '00000000-0000-4000-8000-000000000001', activityCode: 'A', status: 'enrolling' }),
      rec({ id: '00000000-0000-4000-8000-000000000002', activityCode: 'B', status: 'enrolling' }),
      rec({ id: '00000000-0000-4000-8000-000000000003', activityCode: 'C', status: 'terminated' }),
    ]);
    expect(s.byStatus.enrolling).toBe(2);
    expect(s.byStatus.terminated).toBe(1);
    // A status absent from the data still reports 0 rather than undefined, so
    // the surface renders a complete tally instead of a ragged one.
    expect(s.byStatus.completed).toBe(0);
    expect(s.byStatus.planned).toBe(0);
    expect(s.byStatus.follow_up).toBe(0);
  });

  it('reports the reporting window from real dates only', () => {
    const s = summariseRecords(PROGRAM, [
      rec({ id: '00000000-0000-4000-8000-000000000001', activityCode: 'A', enrolledCount: 10, enrollmentAsOf: new Date('2026-01-15') }),
      rec({ id: '00000000-0000-4000-8000-000000000002', activityCode: 'B', enrolledCount: 20, enrollmentAsOf: new Date('2026-06-30') }),
      rec({ id: '00000000-0000-4000-8000-000000000003', activityCode: 'C' }),
    ]);
    expect(s.oldestReportAsOf).toContain('2026-01-15');
    expect(s.latestReportAsOf).toContain('2026-06-30');
  });

  it('has no reporting window when nothing carries a date', () => {
    const s = summariseRecords(PROGRAM, [rec({ id: '00000000-0000-4000-8000-000000000001', activityCode: 'A' })]);
    expect(s.oldestReportAsOf).toBeNull();
    expect(s.latestReportAsOf).toBeNull();
  });

  it('summarises an empty programme without implying it was checked', () => {
    const s = summariseRecords(PROGRAM, []);
    expect(s.activityCount).toBe(0);
    expect(s.enrolledInReporting).toBeNull();
    expect(s.targetInReporting).toBeNull();
  });
});
