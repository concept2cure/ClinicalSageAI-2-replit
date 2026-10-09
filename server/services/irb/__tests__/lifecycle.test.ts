/**
 * IRB approval lifecycle.
 *
 * The test this module exists for is the first one: a full-board approval with
 * no approval date recorded must NOT report as current. `continuingReviewStatus`
 * returns `expired: false` for that case, so an approval that has actually
 * lapsed reads as fine because nobody typed a date — and a site enrolling under
 * a lapsed approval is a serious-noncompliance report to OHRP.
 */
import { describe, it, expect } from 'vitest';

import {
  EXPIRING_SOON_DAYS,
  continuingReviewRequirement,
  lifecycleStatus,
  type LifecycleInput,
} from '../lifecycle';
import { continuingReviewStatus } from '../irb-logic';

const TODAY = '2026-09-22';

function input(over: Partial<LifecycleInput> = {}): LifecycleInput {
  return {
    status: 'approved',
    reviewType: 'full_board',
    approvalDate: '2026-03-01',
    today: TODAY,
    amendments: [],
    reportableEvents: [],
    ...over,
  };
}

function codes(s: ReturnType<typeof lifecycleStatus>): string[] {
  return s.findings.map((f) => f.code);
}

// ─── The reason this module exists ───────────────────────────────────────────

describe('an approval with no recorded date is unknown, not current', () => {
  it('reports unknown and says so in words', () => {
    const s = lifecycleStatus(input({ approvalDate: null }));

    expect(s.approval).toBe('unknown');
    expect(s.undetermined).toBe(true);
    expect(codes(s)).toContain('IRB-LC-001');
    expect(s.findings.find((f) => f.code === 'IRB-LC-001')?.message).toMatch(/not a finding that it is current/);
  });

  /*
   * The existing helper is not wrong about arithmetic; it is wrong about
   * shape. Two booleans cannot express "I do not know", so the undated
   * full-board approval above comes back `expired: false` — indistinguishable
   * from an approval that is genuinely in date. This test pins the difference
   * so the two are never confused again.
   */
  it('differs from continuingReviewStatus exactly where that helper cannot say "unknown"', () => {
    const undated = continuingReviewStatus('full_board', null, TODAY);
    expect(undated.expired).toBe(false);
    expect(undated.continuingReviewRequired).toBe(false);

    const ours = lifecycleStatus(input({ approvalDate: null }));
    expect(ours.approval).toBe('unknown');
    expect(ours.continuingReview).toBe('required');
  });

  it('treats an unrecorded review type as unknown, not as "continuing review not required"', () => {
    expect(continuingReviewRequirement(null)).toBe('unknown');
    expect(continuingReviewRequirement('expedited')).toBe('not_required');
    expect(continuingReviewRequirement('full_board')).toBe('required');

    const s = lifecycleStatus(input({ reviewType: null }));
    expect(s.continuingReview).toBe('unknown');
    expect(codes(s)).toContain('IRB-LC-002');
  });
});

// ─── Expiration ──────────────────────────────────────────────────────────────

describe('expiration', () => {
  it('computes one year from approval for a full-board determination', () => {
    const s = lifecycleStatus(input({ approvalDate: '2026-03-01' }));

    expect(s.expirationDate).toBe('2027-03-01');
    expect(s.expirationSource).toBe('computed');
    expect(s.approval).toBe('current');
  });

  /* A board may approve for less than a year. Computing twelve months from
     approval would then report an approval as current past the date the board
     actually set, which is the more dangerous direction. */
  it('prefers the board’s recorded date over the computed one', () => {
    const s = lifecycleStatus(input({ approvalDate: '2026-03-01', expirationDate: '2026-09-01' }));

    expect(s.expirationDate).toBe('2026-09-01');
    expect(s.expirationSource).toBe('recorded');
    expect(s.approval).toBe('expired');
  });

  it('reports expiring_soon inside the window and current outside it', () => {
    const soon = lifecycleStatus(input({ expirationDate: '2026-10-10' }));
    expect(soon.approval).toBe('expiring_soon');
    expect(soon.daysToExpiration).toBe(18);
    expect(codes(soon)).toContain('IRB-LC-004');

    const far = lifecycleStatus(input({ expirationDate: '2027-01-01' }));
    expect(far.approval).toBe('current');
    expect(far.daysToExpiration).toBeGreaterThan(EXPIRING_SOON_DAYS);
  });

  it('reports a past expiration as expired, with the date and the stop-activity consequence', () => {
    const s = lifecycleStatus(input({ expirationDate: '2026-08-01' }));

    expect(s.approval).toBe('expired');
    expect(s.daysToExpiration).toBeLessThan(0);
    expect(s.findings.find((f) => f.code === 'IRB-LC-003')?.message).toMatch(/research activity must stop/);
  });

  it('derives no expiration for an expedited determination, and does not call that current', () => {
    const s = lifecycleStatus(input({ reviewType: 'expedited', expirationDate: null }));

    expect(s.continuingReview).toBe('not_required');
    expect(s.expirationDate).toBeNull();
    expect(s.expirationSource).toBe('none');
    expect(s.approval).toBe('unknown');
  });
});

// ─── Status vocabulary ───────────────────────────────────────────────────────

describe('status', () => {
  it('reports the pre-approval statuses as not approved', () => {
    for (const status of ['draft', 'submitted', 'under_review', 'modifications_required', 'deferred', 'disapproved']) {
      expect(lifecycleStatus(input({ status })).approval).toBe('not_approved');
    }
  });

  it('reports a closed submission as not approved', () => {
    expect(lifecycleStatus(input({ status: 'closed' })).approval).toBe('not_approved');
  });

  it('refuses to reduce a suspension to current or expired', () => {
    const s = lifecycleStatus(input({ status: 'suspended' }));

    expect(s.approval).toBe('unknown');
    expect(codes(s)).toContain('IRB-LC-005');
  });

  it('honours a recorded expired status even with a future computed date', () => {
    expect(lifecycleStatus(input({ status: 'expired', approvalDate: '2026-09-01' })).approval).toBe('expired');
  });
});

// ─── Modifications ───────────────────────────────────────────────────────────

describe('modifications', () => {
  it('flags a substantive amendment submitted and not approved, and says what it did not check', () => {
    const s = lifecycleStatus(input({ amendments: [{ id: 1, substantive: true, status: 'submitted', protocolAmendmentId: 4 }] }));
    const f = s.findings.find((x) => x.code === 'IRB-LC-011');

    expect(f?.severity).toBe('major');
    expect(f?.message).toMatch(/not recorded here and was not checked/);
  });

  it('does not flag an approved amendment', () => {
    const s = lifecycleStatus(input({ amendments: [{ id: 1, substantive: true, status: 'approved', protocolAmendmentId: 4 }] }));
    expect(codes(s)).not.toContain('IRB-LC-011');
  });

  it('flags an IRB amendment that cannot be traced to a protocol amendment', () => {
    const s = lifecycleStatus(input({ amendments: [{ id: 1, substantive: false, status: 'approved', protocolAmendmentId: null }] }));
    expect(codes(s)).toContain('IRB-LC-012');
  });

  /* Absent input is not an empty list. An engine that reported "no pending
     modifications" because the caller passed nothing would be inventing a
     clean bill out of a missing argument. */
  it('reports modifications as unassessed when no amendment record was supplied', () => {
    const s = lifecycleStatus({ ...input(), amendments: undefined });
    const f = s.findings.find((x) => x.code === 'IRB-LC-010');

    expect(f?.message).toMatch(/not a finding that there are none/);
    expect(codes(s)).not.toContain('IRB-LC-011');
  });
});

// ─── Reportable events ───────────────────────────────────────────────────────

describe('reportable events', () => {
  it('flags open events without judging promptness', () => {
    const s = lifecycleStatus(input({ reportableEvents: [{ id: 1, eventType: 'unanticipated_problem', status: 'reported', reportedDate: '2026-09-01' }] }));
    const f = s.findings.find((x) => x.code === 'IRB-LC-021');

    expect(f?.message).toMatch(/does not judge promptness/);
  });

  it('reports an undated event as promptness-undeterminable, not as timely', () => {
    const s = lifecycleStatus(input({ reportableEvents: [{ id: 1, eventType: 'noncompliance', status: 'closed', reportedDate: null }] }));
    const f = s.findings.find((x) => x.code === 'IRB-LC-022');

    expect(f?.message).toMatch(/not evidence of a timely report/);
  });

  it('reports events as unassessed when none were supplied', () => {
    const s = lifecycleStatus({ ...input(), reportableEvents: undefined });
    expect(codes(s)).toContain('IRB-LC-020');
  });

  it('raises nothing when an empty list is genuinely supplied', () => {
    const s = lifecycleStatus(input({ reportableEvents: [] }));
    expect(codes(s)).not.toContain('IRB-LC-020');
    expect(codes(s)).not.toContain('IRB-LC-021');
  });
});

// ─── Shape ───────────────────────────────────────────────────────────────────

describe('shape', () => {
  it('gives every finding a basis and a remediation', () => {
    const s = lifecycleStatus(input({ status: 'suspended', approvalDate: null, reviewType: null, amendments: undefined, reportableEvents: undefined }));

    expect(s.findings.length).toBeGreaterThan(0);
    for (const f of s.findings) {
      expect(f.basis.length).toBeGreaterThan(20);
      expect(f.remediation.length).toBeGreaterThan(5);
    }
  });

  it('never states a review category the board will apply', () => {
    const s = lifecycleStatus(input({ reviewType: null }));
    for (const f of s.findings) {
      expect(f.message).not.toMatch(/will be (exempt|expedited|full board)/i);
    }
  });

  it('is deterministic', () => {
    const i = input();
    expect(JSON.stringify(lifecycleStatus(i))).toBe(JSON.stringify(lifecycleStatus(i)));
  });

  it('has no clock of its own', () => {
    const a = lifecycleStatus(input({ today: '2026-09-22' }));
    const b = lifecycleStatus(input({ today: '2027-09-22' }));

    expect(a.approval).toBe('current');
    expect(b.approval).toBe('expired');
  });
});
