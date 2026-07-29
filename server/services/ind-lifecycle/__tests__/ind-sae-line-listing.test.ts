/**
 * IND aggregate SAE line-listing — 312.33(b) / ICH E2F: selection (serious + in
 * period), the structured rows, the summary tabulation, and the CSV export.
 */

import { describe, it, expect } from 'vitest';
import { buildSaeLineListing, saeLineListingToCsv } from '../ind-sae-line-listing';
import type { AdverseEvent } from '../../compliance/pharmacovigilanceService';

function evt(over: Partial<AdverseEvent>): AdverseEvent {
  return {
    id: 'ae-x',
    organizationId: 'org-1',
    projectId: 'C2C-001',
    eventType: 'SAE',
    patientId: 'subj-001',
    eventDescription: 'Some event',
    onsetDate: new Date('2026-03-01T00:00:00.000Z'),
    reportDate: new Date('2026-03-02T00:00:00.000Z'),
    seriousnessCriteria: 'hospitalization',
    causality: 'possible',
    outcome: 'recovered',
    reporterType: 'investigator',
    countryOfOccurrence: 'US',
    regulatoryReportingDeadline: new Date('2026-03-17T00:00:00.000Z'),
    reportedToAuthorities: false,
    expeditedReportRequired: false,
    createdAt: new Date('2026-03-02T00:00:00.000Z'),
    ...over,
  };
}

const period = { periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-12-31T23:59:59.000Z' };

describe('buildSaeLineListing — selection', () => {
  it('includes serious events with onset in the period', () => {
    const listing = buildSaeLineListing({ events: [evt({ id: 'a' })], ...period });
    expect(listing.rows).toHaveLength(1);
    expect(listing.rows[0].adverseEventId).toBe('a');
  });

  it('excludes non-serious (eventType AE) events', () => {
    const listing = buildSaeLineListing({ events: [evt({ id: 'a', eventType: 'AE' })], ...period });
    expect(listing.rows).toHaveLength(0);
    expect(listing.tabulation.totalSerious).toBe(0);
  });

  it('excludes serious events whose onset is outside the period', () => {
    const listing = buildSaeLineListing({
      events: [evt({ id: 'a', onsetDate: new Date('2025-06-01T00:00:00.000Z') })],
      ...period,
    });
    expect(listing.rows).toHaveLength(0);
  });

  it('orders rows by onset date then id', () => {
    const listing = buildSaeLineListing({
      events: [
        evt({ id: 'b', onsetDate: new Date('2026-05-01') }),
        evt({ id: 'a', onsetDate: new Date('2026-04-01') }),
        evt({ id: 'c', onsetDate: new Date('2026-05-01') }),
      ],
      ...period,
    });
    expect(listing.rows.map((r) => r.adverseEventId)).toEqual(['a', 'b', 'c']);
  });
});

describe('buildSaeLineListing — row mapping', () => {
  it('maps suspected + unexpected from causality/expectedness', () => {
    const listing = buildSaeLineListing({
      events: [evt({ id: 'a', causality: 'probable', expectedness: 'unexpected, not listed in IB' })],
      ...period,
    });
    expect(listing.rows[0].suspected).toBe(true);
    expect(listing.rows[0].expectedness).toBe('unexpected');
  });

  it('not suspected when causality is unlikely; expected when no expectedness given', () => {
    const listing = buildSaeLineListing({ events: [evt({ id: 'a', causality: 'unlikely' })], ...period });
    expect(listing.rows[0].suspected).toBe(false);
    expect(listing.rows[0].expectedness).toBe('expected');
  });

  it('falls back to eventDescription when no MedDRA PT', () => {
    const listing = buildSaeLineListing({
      events: [evt({ id: 'a', reactionPt: null, eventDescription: 'Hepatic failure' })],
      ...period,
    });
    expect(listing.rows[0].reactionPt).toBe('Hepatic failure');
  });
});

describe('buildSaeLineListing — tabulation', () => {
  const events = [
    evt({ id: 'a', seriousnessCriteria: 'death', outcome: 'fatal', causality: 'probable', expectedness: 'unexpected', reactionPt: 'Hepatic failure', expeditedReportRequired: true }),
    evt({ id: 'b', seriousnessCriteria: 'hospitalization', causality: 'possible', expectedness: 'unexpected', reactionPt: 'Hepatic failure', expeditedReportRequired: true }),
    evt({ id: 'c', seriousnessCriteria: 'hospitalization', causality: 'unlikely', reactionPt: 'Nausea' }),
  ];

  it('counts totals, seriousness, suspected, expectedness, expedited, fatal', () => {
    const { tabulation } = buildSaeLineListing({ events, ...period });
    expect(tabulation.totalSerious).toBe(3);
    expect(tabulation.bySeriousnessCriteria.hospitalization).toBe(2);
    expect(tabulation.bySeriousnessCriteria.death).toBe(1);
    expect(tabulation.bySuspected.suspected).toBe(2);
    expect(tabulation.byExpectedness.unexpected).toBe(2);
    expect(tabulation.expeditedCount).toBe(2);
    expect(tabulation.fatalCount).toBe(1);
  });

  it('tabulates per reaction PT with the suspected-unexpected cut, ordered by total', () => {
    const { tabulation } = buildSaeLineListing({ events, ...period });
    expect(tabulation.byReactionPt[0]).toEqual({ reactionPt: 'Hepatic failure', total: 2, suspectedUnexpected: 2 });
    expect(tabulation.byReactionPt.find((p) => p.reactionPt === 'Nausea')).toEqual({ reactionPt: 'Nausea', total: 1, suspectedUnexpected: 0 });
  });
});

describe('saeLineListingToCsv', () => {
  it('emits a header + one row per case and escapes special characters', () => {
    const listing = buildSaeLineListing({
      events: [evt({ id: 'a', suspectProduct: 'Drug, "X"' })],
      ...period,
    });
    const csv = saeLineListingToCsv(listing);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('adverse_event_id');
    expect(lines[0]).toContain('expedited');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"Drug, ""X"""');
  });

  it('emits header-only CSV when there are no serious cases', () => {
    const csv = saeLineListingToCsv(buildSaeLineListing({ events: [], ...period }));
    expect(csv.trim().split('\n')).toHaveLength(1);
  });
});
