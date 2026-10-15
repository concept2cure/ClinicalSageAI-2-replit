/**
 * Seriousness is read from the recorded event type: 'AE' is non-serious; SAE,
 * SUSAR and AESI are serious; a missing or unrecognised type is UNDETERMINED —
 * neither serious nor non-serious — and is surfaced for review, never dropped.
 *
 * What the code used to do (until 2026-10-15): isSerious() was
 * `eventType !== 'AE'`, so an event with no type at all (or 'sae', or
 * 'Serious') was serious. The 312.33(b) SAE line listing listed it and COUNTED
 * it as a serious case — totalSerious, the criterion / causality / expectedness
 * tabulations and the per-PT suspected-unexpected cut — and nothing said its
 * type was never recorded.
 */
import { describe, it, expect } from 'vitest';
import type { AdverseEvent } from '../../compliance/pharmacovigilanceService';
import { isSerious, classifyIndSafetyReport } from '../ind-safety-report-service';
import { buildSaeLineListing, saeLineListingToCsv } from '../ind-sae-line-listing';

const D = new Date('2026-02-01T00:00:00.000Z');
const ev = (id: string, eventType: unknown): AdverseEvent =>
  ({
    id,
    organizationId: 'org-1',
    projectId: 'proj-1',
    eventType,
    patientId: `subj-${id}`,
    eventDescription: 'Liver enzymes raised',
    onsetDate: D,
    reportDate: D,
    seriousnessCriteria: 'hospitalization',
    causality: 'possible',
    outcome: 'recovered',
    reporterType: 'investigator',
    countryOfOccurrence: 'US',
    regulatoryReportingDeadline: D,
    reportedToAuthorities: false,
    expeditedReportRequired: false,
    expectedness: 'unexpected',
    reactionPt: 'Hepatic enzyme increased',
    createdAt: D,
  }) as AdverseEvent;

describe('isSerious — from the recorded event type', () => {
  it('AE is non-serious; SAE, SUSAR and AESI are serious', () => {
    expect(isSerious({ eventType: 'AE' })).toBe(false);
    for (const t of ['SAE', 'SUSAR', 'AESI'] as const) expect(isSerious({ eventType: t })).toBe(true);
  });

  it('a missing or unrecognised event type is undetermined (null), not serious', () => {
    for (const t of [undefined, null, '', 'sae', 'Serious']) {
      expect(isSerious({ eventType: t as never }), String(t)).toBeNull();
    }
  });
});

describe('the SAE line listing surfaces an undetermined case — never dropped, never counted serious', () => {
  const listing = buildSaeLineListing({
    events: [ev('a', 'SAE'), ev('b', undefined), ev('c', 'AE')],
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
  });

  it('lists it, marked undetermined; the recorded non-serious event stays out', () => {
    expect(listing.rows.map((r) => [r.adverseEventId, r.seriousness])).toEqual([
      ['a', 'serious'],
      ['b', 'undetermined'],
    ]);
  });

  it('counts only the recorded serious case, and says what is missing for the other', () => {
    const t = listing.tabulation;
    expect(t.totalSerious).toBe(1);
    expect(t.bySuspected).toEqual({ suspected: 1, notSuspected: 0 });
    expect(t.byExpectedness).toEqual({ unexpected: 1, expected: 0, notAssessed: 0 });
    expect(t.byReactionPt).toEqual([{ reactionPt: 'Hepatic enzyme increased', total: 1, suspectedUnexpected: 1 }]);
    expect(t.seriousnessUndetermined).toEqual({ count: 1, missing: 'event type (AE, SAE, SUSAR or AESI)' });
  });

  it('the CSV appendix says so on the row', () => {
    const [header, ...rows] = saeLineListingToCsv(listing).trim().split('\n');
    const col = header.split(',').indexOf('seriousness_determination');
    expect(col).toBeGreaterThan(-1);
    expect(rows.map((r) => r.split(',')[col])).toEqual(['serious', 'undetermined: event type not recorded']);
  });
});

describe('the expedited (312.32) classification refuses an undetermined event type by name', () => {
  it('names the event type and classifies nothing', () => {
    expect(() => classifyIndSafetyReport(ev('b', undefined))).toThrow(/event type/);
  });
});
