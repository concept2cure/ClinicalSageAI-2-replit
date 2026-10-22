/**
 * C.1.7 (fulfils local criteria for an expedited report) is blank, and tracked
 * as a gap, when the case does not determine it.
 *
 * What it used to do (until 2026-10-15): event.expeditedReportRequired can be
 * null (an SAE / AESI record does not say "unexpected"), and
 * `isExpedited ? '1 (Yes)' : '2 (No)'` printed "2 (No)" for it — a statement
 * that the case is not expedited, which nobody determined.
 */
import { describe, it, expect } from 'vitest';
import { composeE2bR3Icsr } from '../e2b-icsr-composer';
import type { AdverseEvent } from '../../compliance/pharmacovigilanceService';

const event = (expeditedReportRequired: boolean | null): AdverseEvent => ({
  id: 'ae-9', organizationId: 'org-1', projectId: 'C2C-001', eventType: 'SAE', patientId: 'subj-009',
  eventDescription: 'Acute hepatic failure', onsetDate: new Date('2026-01-05T00:00:00.000Z'),
  reportDate: new Date('2026-01-06T00:00:00.000Z'), seriousnessCriteria: 'life_threatening', causality: 'probable',
  outcome: 'not_recovered', reporterType: 'investigator', countryOfOccurrence: 'US',
  regulatoryReportingDeadline: null, reportedToAuthorities: false, expeditedReportRequired,
  reactionPt: 'Hepatic failure', suspectProduct: 'C2C-001', createdAt: new Date('2026-01-06T00:00:00.000Z'),
} as AdverseEvent);

const c17 = (out: ReturnType<typeof composeE2bR3Icsr>) => out.icsr.caseAdmin.find((e) => e.id === 'C.1.7')!.value;

describe('C.1.7 states only a determined expedited flag', () => {
  it('undetermined (null): blank, and a gap', () => {
    const out = composeE2bR3Icsr(event(null));
    expect(c17(out), 'an undetermined expedited flag was printed as "2 (No)"').toBe('');
    expect(out.gaps.map((g) => g.id)).toContain('C.1.7');
  });

  it('determined: printed, and no gap', () => {
    expect(c17(composeE2bR3Icsr(event(true)))).toBe('1 (Yes)');
    const no = composeE2bR3Icsr(event(false));
    expect(c17(no)).toBe('2 (No)');
    expect(no.gaps.map((g) => g.id)).not.toContain('C.1.7');
  });

  it('an explicit option still decides', () => {
    expect(c17(composeE2bR3Icsr(event(null), { expedited: true }))).toBe('1 (Yes)');
  });
});
