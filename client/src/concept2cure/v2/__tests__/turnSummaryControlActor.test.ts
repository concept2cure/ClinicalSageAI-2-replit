/**
 * A control is never credited to a person who did not take it (AnA detach DT3
 * review, the blocker). The Summary's control row read "You stopped the run"
 * for an administrator's cancel, while the same panel's closing row said
 * "Stopped by an administrator." The server now says who took each control in
 * terms the reader may be told (turn-summary.ts attributeControls); the rows
 * word it, with the administrator's reason.
 */
import { describe, expect, it } from 'vitest';

import { controlText, summaryRows } from '../turnSummaryRows';
import type { TimelineControl, TimelineEvent } from '@shared/ana/turn-timeline';

const AT = '2026-10-22T10:00:00.000Z';
const END: TimelineEvent = { kind: 'end', seq: 9, at: '2026-10-22T10:00:05.000Z', outcome: 'stopped', stoppedReason: 'admin_cancelled' } as TimelineEvent;
const ADMIN_CANCEL: TimelineControl = {
  action: 'cancel',
  round: 2,
  at: AT,
  reason: 'Wrong agency.',
  by: { kind: 'administrator', name: 'Dana Okafor' },
};

describe("an administrator's cancel in the Summary", () => {
  it('is credited to the administrator by name, with their reason, and never as "You stopped"', () => {
    const rows = summaryRows([END], [ADMIN_CANCEL], { live: false });
    const control = rows.find(r => r.kind === 'control')!;
    expect(control).toMatchObject({ text: 'Stopped by Dana Okafor, an administrator', message: 'Reason: Wrong agency.' });
    expect(JSON.stringify(rows)).not.toContain('You stopped');
    // …and agrees with the closing row.
    expect(rows.find(r => r.kind === 'end')).toMatchObject({ text: 'Stopped by an administrator.' });
  });

  it('read by the administrator who took it: theirs, as an administrator', () => {
    expect(controlText({ ...ADMIN_CANCEL, by: { kind: 'you_as_administrator' } })).toBe('You stopped the run, as an administrator');
  });
});

describe("the asker's own controls", () => {
  it('read by the asker: "You …", as before', () => {
    expect(controlText({ action: 'pause', round: 1, at: AT })).toBe('You paused AnA');
    expect(controlText({ action: 'cancel', round: 1, at: AT })).toBe('You stopped the run');
  });

  it('read by anyone else: the person who asked, never "You"', () => {
    expect(controlText({ action: 'interject', round: 1, at: AT, by: { kind: 'asker' } })).toBe('The person who asked steered AnA');
  });

  it('an attribution this client cannot read is nobody\'s "You"', () => {
    expect(controlText({ action: 'cancel', round: 1, at: AT, by: { kind: 'robot' } as never })).toBe('Someone else stopped the run');
  });
});
