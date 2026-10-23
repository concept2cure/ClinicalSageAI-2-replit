/**
 * An AESI (adverse event of special interest) is serious only when a
 * seriousness criterion is recorded for it; with none, its seriousness is
 * undetermined — listed for review, never counted serious.
 *
 * What the code used to do (until 2026-10-15): the intake convention read the
 * event type alone — isSerious() returned true for every AESI, and the PV
 * intake flagged every AESI expedited. "Special interest" is a monitoring
 * category, not a seriousness criterion (ICH E2A): an AESI can be non-serious.
 * The 312.33(b) SAE line listing listed such an AESI as serious and counted it
 * in every serious total.
 */
import { describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [], rowCount: 1 })) }));
vi.mock('../../../db', () => ({ pool: { query } }));

import { reportAdverseEvent, type AdverseEvent } from '../../compliance/pharmacovigilanceService';
import { isSerious } from '../ind-safety-report-service';
import { buildSaeLineListing, saeLineListingToCsv } from '../ind-sae-line-listing';

const D = new Date('2026-02-01T00:00:00.000Z');
/** What an intake states. */
const stated = (eventType: string, seriousnessCriteria: unknown) => ({
  organizationId: 'org-1', projectId: 'proj-1', eventType, patientId: 'subj-1',
  eventDescription: 'Injection-site reaction', onsetDate: D, reportDate: D, seriousnessCriteria,
  causality: 'possible', outcome: 'recovered', reporterType: 'investigator', countryOfOccurrence: 'US',
  reportedToAuthorities: false, expectedness: 'expected', reactionPt: 'Injection site reaction',
});
const ev = (id: string, eventType: string, seriousnessCriteria: unknown): AdverseEvent =>
  ({ id, ...stated(eventType, seriousnessCriteria), regulatoryReportingDeadline: null, expeditedReportRequired: null, createdAt: D }) as unknown as AdverseEvent;

describe('isSerious — an AESI from its recorded seriousness criterion', () => {
  it('an AESI with no seriousness criterion is undetermined (null), not serious', () => {
    for (const c of [undefined, null, '']) {
      expect(isSerious({ eventType: 'AESI', seriousnessCriteria: c as never }), `criterion ${JSON.stringify(c)}`).toBeNull();
    }
  });

  it('an AESI with a recorded criterion is serious; SAE and SUSAR by type; AE non-serious (control)', () => {
    expect(isSerious({ eventType: 'AESI', seriousnessCriteria: 'hospitalization' })).toBe(true);
    expect(isSerious({ eventType: 'SAE' })).toBe(true);
    expect(isSerious({ eventType: 'SUSAR' })).toBe(true);
    expect(isSerious({ eventType: 'AE' })).toBe(false);
  });
});

describe('the SAE line listing — an AESI with no criterion is listed undetermined, not counted serious', () => {
  const listing = buildSaeLineListing({
    events: [ev('a', 'AESI', 'hospitalization'), ev('b', 'AESI', null)],
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
  });

  it('lists both, the uncriteria\'d AESI as undetermined', () => {
    expect(listing.rows.map((r) => [r.adverseEventId, r.seriousness])).toEqual([['a', 'serious'], ['b', 'undetermined']]);
  });

  it('counts only the AESI with a recorded criterion, and names what the other is missing', () => {
    expect(listing.tabulation.totalSerious).toBe(1);
    expect(listing.tabulation.seriousnessUndetermined.count).toBe(1);
    expect(listing.tabulation.seriousnessUndetermined.missing).toMatch(/seriousness criterion.*AESI/);
  });

  it('the CSV appendix names the missing criterion, not a missing event type', () => {
    const [header, ...rows] = saeLineListingToCsv(listing).trim().split('\n');
    const col = header.split(',').indexOf('seriousness_determination');
    expect(rows.map((r) => r.split(',')[col])).toEqual(['serious', 'undetermined: AESI seriousness criterion not recorded']);
  });
});

describe('the PV intake does not flag an AESI expedited by its type', () => {
  it('stores expedited as undetermined (null)', async () => {
    const e = await reportAdverseEvent(stated('AESI', 'hospitalization') as unknown as Parameters<typeof reportAdverseEvent>[0]);
    expect(e.expeditedReportRequired, 'an AESI intake was flagged expedited').toBeNull();
  });
});
