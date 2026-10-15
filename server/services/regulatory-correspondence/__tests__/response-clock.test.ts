/**
 * The response clock: what a letter owes, by when, and on whose authority.
 *
 * The signal this replaces fired on `received_at < NOW() - INTERVAL '14 days'`.
 * These cases are the regimes that number is wrong in — a CRL with eleven
 * months to run, and a 510(k) three days from withdrawal — plus the two rules
 * that matter most: the agency's stated date beats every table, and a letter
 * with no date on record is reported as that and never as overdue.
 */
import { describe, expect, it } from 'vitest';

import {
  correspondenceResponseClock,
  type CorrespondenceClockInput,
} from '../response-clock';
import {
  AGENCY_LETTER_CLASSES,
  responseWindowFor,
} from '../../../../shared/regulatory/agency-interaction';
import { CORRESPONDENCE_TYPES } from '../../../../shared/types/regulatory-correspondence';

const NOW = new Date('2026-10-12T00:00:00.000Z');
const letter = (o: Partial<CorrespondenceClockInput>): CorrespondenceClockInput => ({
  direction: 'inbound',
  communicationType: 'information_request',
  responseRequired: true,
  status: 'new',
  receivedAt: '2026-10-01T00:00:00.000Z',
  dueDate: null,
  submissionType: 'NDA',
  ...o,
});

describe('a letter that puts us on no clock is not tracked', () => {
  it.each([
    ['a letter we sent', { direction: 'outbound' }, 'not_inbound'],
    ['an internal note', { direction: 'internal' }, 'not_inbound'],
    ['one recorded as needing no response', { responseRequired: false }, 'no_response_required'],
    ['one already responded to', { status: 'responded' }, 'already_answered'],
    ['one already closed', { status: 'closed' }, 'already_answered'],
    ['an acknowledgement', { communicationType: 'acknowledgment_letter' }, 'class_asks_nothing'],
    ['an approval', { communicationType: 'approval_letter' }, 'class_asks_nothing'],
    ['meeting minutes', { communicationType: 'meeting_minutes' }, 'class_asks_nothing'],
    ['our own response letter', { communicationType: 'response_letter' }, 'class_asks_nothing'],
    ['an internal triage memo', { communicationType: 'triage_memo' }, 'class_asks_nothing'],
    ['one with no receipt date and no stated date', { receivedAt: null }, 'no_receipt_date'],
  ])('%s', (_name, patch, reason) => {
    expect(correspondenceResponseClock(letter(patch as object), NOW)).toEqual({
      state: 'untracked',
      reason,
    });
  });
});

describe('the date the agency stated governs, whatever the table says', () => {
  it('a complete response letter due next week is due_soon, not a year out', () => {
    // Received 11 days ago; its codified window is a YEAR, but FDA stated a date.
    const clock = correspondenceResponseClock(
      letter({ communicationType: 'complete_response_letter', dueDate: '2026-10-19T00:00:00.000Z' }),
      NOW,
    );
    expect(clock).toMatchObject({
      state: 'dated',
      dueDateSource: 'agency_stated',
      daysUntilDue: 7,
      bucket: 'due_soon',
      severity: 'warn',
    });
  });

  it('a stated date already past is overdue and critical', () => {
    const clock = correspondenceResponseClock(letter({ dueDate: '2026-10-05T00:00:00.000Z' }), NOW);
    expect(clock).toMatchObject({
      state: 'dated',
      dueDateSource: 'agency_stated',
      daysUntilDue: -7,
      bucket: 'overdue',
      severity: 'critical',
    });
  });
});

describe('with no stated date, the window comes from the class and the family', () => {
  it('a complete response letter runs a year — the 14-day rule would have shouted at month one', () => {
    const clock = correspondenceResponseClock(
      letter({ communicationType: 'complete_response_letter', receivedAt: '2026-10-01T00:00:00.000Z' }),
      NOW,
    );
    expect(clock).toMatchObject({
      state: 'dated',
      dueDateSource: 'derived_from_window',
      bucket: 'upcoming',
      severity: 'info',
    });
    // 365 days from 2026-10-01, so still 354 days away.
    expect(clock).toMatchObject({ daysUntilDue: 354 });
    expect((clock as { window: { citation: string } }).window.citation).toContain('314.110(c)');
  });

  it('a refuse-to-file letter runs 30 days, and at day 31 it is overdue', () => {
    const clock = correspondenceResponseClock(
      letter({ communicationType: 'refuse_to_file_letter', receivedAt: '2026-09-10T00:00:00.000Z' }),
      NOW,
    );
    expect(clock).toMatchObject({ state: 'dated', bucket: 'overdue', severity: 'critical' });
    expect((clock as { window: { citation: string } }).window.citation).toBe('21 CFR 314.101(a)(3)');
  });

  it('a 510(k) Additional Information hold runs 180 days and names withdrawal', () => {
    const clock = correspondenceResponseClock(
      letter({ submissionType: '510(k)', receivedAt: '2026-05-01T00:00:00.000Z' }),
      NOW,
    );
    expect(clock).toMatchObject({ state: 'dated', dueDateSource: 'derived_from_window' });
    const w = (clock as { window: { days: number; consequence: string } }).window;
    expect(w.days).toBe(180);
    expect(w.consequence).toContain('withdrawn');
  });

  it('a PMA deficiency runs the same 180 days, on the CFR rather than on guidance', () => {
    const clock = correspondenceResponseClock(
      letter({ communicationType: 'deficiency_letter', submissionType: 'PMA', receivedAt: '2026-05-01T00:00:00.000Z' }),
      NOW,
    );
    const w = (clock as { window: { days: number; basis: string; citation: string } }).window;
    expect(w).toMatchObject({ days: 180, basis: 'statutory', citation: '21 CFR 814.37(c)(1)' });
  });

  it('the SAME information request on a drug application has no codified window at all', () => {
    const clock = correspondenceResponseClock(letter({ submissionType: 'NDA' }), NOW);
    expect(clock).toMatchObject({ state: 'undated', severity: 'info' });
    expect((clock as { window: { basis: string } }).window.basis).toBe('stated_only');
    // 11 days since receipt is REPORTED, never compared to a threshold.
    expect(clock).toMatchObject({ daysSinceReceived: 11 });
  });
});

describe('a letter with no date on record is never reported as overdue', () => {
  it('an undated clinical hold is a warning, because the study is stopped', () => {
    const clock = correspondenceResponseClock(
      letter({ communicationType: 'hold_letter', submissionType: 'IND' }),
      NOW,
    );
    expect(clock).toMatchObject({ state: 'undated', severity: 'warn' });
    const w = (clock as { window: { blocking: boolean; citation: string; consequence: string; days: number | null } }).window;
    expect(w.blocking).toBe(true);
    expect(w.citation).toBe('21 CFR 312.42');
    // The nuance that matters: FDA's 30 days is FDA's, not the sponsor's.
    expect(w.consequence).toContain('sets no deadline on the sponsor');
    // And no invented number reaches the caller.
    expect(w.days).toBeNull();
  });

  it('an undated drug information request is information, because the review continues', () => {
    const clock = correspondenceResponseClock(letter({}), NOW);
    expect(clock).toMatchObject({ state: 'undated', severity: 'info' });
    expect((clock as { window: { blocking: boolean } }).window.blocking).toBe(false);
  });
});

describe('the governed table is complete and cites what it claims', () => {
  it('every correspondence type is either an agency letter class or deliberately not one', () => {
    const classes = new Set<string>(AGENCY_LETTER_CLASSES);
    const unaccounted = CORRESPONDENCE_TYPES.filter((t) => !classes.has(t));
    // The remainder must all be sponsor-authored or internal work products.
    expect(unaccounted).toEqual([
      'cover_letter',
      'response_letter',
      'amendment_letter',
      'clarification_response',
      'meeting_materials',
      'follow_up_correspondence',
      'triage_memo',
      'deficiency_summary',
      'response_plan',
      'issue_tracker',
      'remediation_memo',
      'executive_briefing',
    ]);
  });

  it('every window with a day count cites a regulation or a named convention', () => {
    for (const cls of AGENCY_LETTER_CLASSES) {
      for (const family of ['marketing_authorization', 'device_clearance', 'device_approval', 'clinical_trial', null] as const) {
        const w = responseWindowFor(cls, family);
        if (w.days != null) {
          expect(w.citation, `${cls}/${family}`).toBeTruthy();
          expect(w.consequence, `${cls}/${family}`).toBeTruthy();
          expect(['statutory', 'guidance'], `${cls}/${family}`).toContain(w.basis);
        }
        if (w.basis === 'stated_only') {
          // No fixed window may carry a day count — that is the whole point.
          expect(w.days, `${cls}/${family}`).toBeNull();
        }
      }
    }
  });
});
