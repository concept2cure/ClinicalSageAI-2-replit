/**
 * An adverse event from a country whose regulatory region is not on record
 * gets no reporting deadline, with the reason — not FDA's clock.
 *
 * What it used to do (until 2026-10-15): mapCountryToRegion defaulted any
 * unknown country (BR, AU, GB, a blank) to 'FDA' ("most conservative"), so the
 * case carried an FDA 7/15-day deadline nobody determined applied to it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ pool: null }));

import { reportAdverseEvent, type AdverseEvent } from '../pharmacovigilanceService';

const susar = (countryOfOccurrence: string) => ({
  organizationId: 'org-1', projectId: 'p-1', eventType: 'SUSAR', patientId: 's-1', eventDescription: 'Hepatic failure',
  onsetDate: new Date('2026-01-05'), reportDate: new Date('2026-01-06T00:00:00.000Z'), seriousnessCriteria: 'death',
  causality: 'probable', outcome: 'fatal', reporterType: 'investigator', countryOfOccurrence, reportedToAuthorities: false,
}) as unknown as Parameters<typeof reportAdverseEvent>[0];

describe('the region of an unknown country is undetermined', () => {
  it.each(['BR', 'GB', ''])('country %j: no deadline, with the reason', async (country) => {
    const e: AdverseEvent = await reportAdverseEvent(susar(country));
    expect(e.regulatoryReportingDeadline, 'an unknown country took the FDA clock').toBeNull();
    expect(e.regulatoryReportingDeadlineReason).toMatch(/region/);
  });

  it('a mapped country keeps its region clock (US → FDA 7 days for a fatal SUSAR)', async () => {
    const e = await reportAdverseEvent(susar('US'));
    expect(e.regulatoryReportingDeadline?.toISOString()).toBe('2026-01-13T00:00:00.000Z');
  });
});
