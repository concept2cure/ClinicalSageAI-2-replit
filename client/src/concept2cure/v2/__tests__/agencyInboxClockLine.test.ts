/**
 * P-39 step 3, S4: an inbox card states a letter's due date as its response
 * clock reads it. The card shows the agency's date as it stands, a derived date
 * with the window's authority, and "owed, no date" when none exists.
 */
import { describe, expect, it } from 'vitest';
import { clockLine } from '../surfaces/AgencyInbox';

describe('clockLine', () => {
  it("shows a derived due date with its window and citation, and the agency's date as it stands", () => {
    expect(clockLine({ responseClock: { state: 'dated', dueDate: '2099-03-01T00:00:00.000Z', dueDateSource: 'derived_from_window',
      daysUntilDue: 30, bucket: 'upcoming', windowDays: 30, citation: '21 CFR 314.101(a)(3)', consequence: null } }))
      .toMatch(/^ · due 2099-03-01 \(.+\), 30 days from receipt \(21 CFR 314\.101\(a\)\(3\)\)$/);
    expect(clockLine({ responseClock: { state: 'dated', dueDate: '2099-01-15T00:00:00.000Z', dueDateSource: 'agency_stated',
      daysUntilDue: 70, bucket: 'upcoming', windowDays: null, citation: null, consequence: null } }))
      .toMatch(/^ · due 2099-01-15 \([^)]+\)$/);
  });

  it('says a response is owed with no date, and falls back to the typed date when no clock applies', () => {
    expect(clockLine({ responseClock: { state: 'undated', daysSinceReceived: 4, consequence: null } }))
      .toBe(' · response owed; the letter states no date and none is codified for its class');
    expect(clockLine({ dueDate: '2099-02-02', responseClock: { state: 'untracked', reason: 'class_asks_nothing' } })).toMatch(/^ · due 2099-02-02/);
    expect(clockLine({})).toBe('');
  });
});
