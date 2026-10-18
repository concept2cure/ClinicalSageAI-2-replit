/**
 * SAE line listing (21 CFR 312.33(b) / ICH E2F) — what was not recorded is
 * listed as not recorded.
 *
 * What the code used to do (until 2026-10-15):
 *   - a serious case whose expectedness was not recorded printed "expected"
 *     (isUnexpected(null) is false) and was counted in byExpectedness.expected;
 *   - a serious case whose onset date was unknown or not a date was dropped
 *     from the rows AND from totalSerious (NaN fails the period test), so the
 *     annual report's tabulation silently lost it;
 *   - with no MedDRA coding, the free-text event description was printed in
 *     the reaction_pt column and tabulated in byReactionPt as if it were a
 *     MedDRA Preferred Term;
 *   - an unparseable period produced an empty listing, read as "no cases".
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
    eventDescription: 'Liver went bad after dose 3',
    onsetDate: new Date('2026-03-01T00:00:00.000Z'),
    reportDate: new Date('2026-03-02T00:00:00.000Z'),
    seriousnessCriteria: 'hospitalization',
    causality: 'probable',
    outcome: 'recovered',
    reporterType: 'investigator',
    countryOfOccurrence: 'US',
    regulatoryReportingDeadline: new Date('2026-03-17T00:00:00.000Z'),
    reportedToAuthorities: false,
    expeditedReportRequired: false,
    reactionPt: 'Hepatic failure',
    createdAt: new Date('2026-03-02T00:00:00.000Z'),
    ...over,
  };
}

const period = { periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-12-31T23:59:59.000Z' };

describe('buildSaeLineListing — unrecorded expectedness', () => {
  it('a serious, probable case with no expectedness recorded is "not_assessed", never "expected"', () => {
    const { rows, tabulation } = buildSaeLineListing({ events: [evt({ id: 'a', expectedness: null })], ...period });
    expect(rows[0].expectedness).toBe('not_assessed');
    expect(tabulation.byExpectedness).toEqual({ unexpected: 0, expected: 0, notAssessed: 1 });
  });

  it('text outside the vocabulary ("unknown", "pending") is not a determination either', () => {
    const { rows, tabulation } = buildSaeLineListing({
      events: [evt({ id: 'a', expectedness: 'unknown' }), evt({ id: 'b', expectedness: 'pending' })],
      ...period,
    });
    expect(rows.map((r) => r.expectedness)).toEqual(['not_assessed', 'not_assessed']);
    expect(tabulation.byExpectedness.expected).toBe(0);
  });

  it('recorded determinations keep their values', () => {
    const { rows, tabulation } = buildSaeLineListing({
      events: [evt({ id: 'a', expectedness: 'expected' }), evt({ id: 'b', expectedness: 'unexpected' })],
      ...period,
    });
    expect(rows.map((r) => r.expectedness)).toEqual(['expected', 'unexpected']);
    expect(tabulation.byExpectedness).toEqual({ unexpected: 1, expected: 1, notAssessed: 0 });
  });
});

describe('buildSaeLineListing — unknown onset', () => {
  it('a serious case with an unknown or unparseable onset is listed and counted, its onset shown as unknown', () => {
    const { rows, tabulation } = buildSaeLineListing({
      events: [
        evt({ id: 'a' }),
        evt({ id: 'b', onsetDate: 'unknown' as unknown as Date }),
        evt({ id: 'c', onsetDate: new Date('not a date') }),
        evt({ id: 'd', onsetDate: undefined as unknown as Date }),
      ],
      ...period,
    });
    expect(rows.map((r) => r.adverseEventId)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.slice(1).every((r) => r.onsetDate === null)).toBe(true);
    expect(tabulation.totalSerious).toBe(4);
    expect(tabulation.onsetUnknownCount).toBe(3);
  });

  it('a case with a known onset outside the period is still excluded', () => {
    const { rows } = buildSaeLineListing({ events: [evt({ id: 'a', onsetDate: new Date('2025-06-01T00:00:00.000Z') })], ...period });
    expect(rows).toHaveLength(0);
  });
});

describe('buildSaeLineListing — MedDRA coding', () => {
  it('an uncoded case has reaction PT null and its verbatim term in its own field, outside the per-PT table', () => {
    const { rows, tabulation } = buildSaeLineListing({
      events: [evt({ id: 'a', reactionPt: null }), evt({ id: 'b' })],
      ...period,
    });
    const uncoded = rows.find((r) => r.adverseEventId === 'a')!;
    expect(uncoded.reactionPt).toBeNull();
    expect(uncoded.verbatimTerm).toBe('Liver went bad after dose 3');
    expect(tabulation.byReactionPt.map((p) => p.reactionPt)).toEqual(['Hepatic failure']);
    expect(tabulation.uncodedCount).toBe(1);
  });
});

describe('saeLineListingToCsv — the appendix says the same', () => {
  it('prints an empty reaction_pt, the verbatim term, "unknown" onset and "not_assessed"', () => {
    const csv = saeLineListingToCsv(
      buildSaeLineListing({
        events: [evt({ id: 'a', reactionPt: null, expectedness: null, onsetDate: 'unknown' as unknown as Date })],
        ...period,
      }),
    );
    const [header, row] = csv.trim().split('\n');
    const cols = header.split(',');
    const cells = row.split(',');
    const at = (name: string) => cells[cols.indexOf(name)];
    expect(cols).toContain('verbatim_term');
    expect(at('reaction_pt')).toBe('');
    expect(at('verbatim_term')).toBe('Liver went bad after dose 3');
    expect(at('onset_date')).toBe('unknown');
    expect(at('expectedness')).toBe('not_assessed');
  });
});

describe('buildSaeLineListing — the period', () => {
  it('an unparseable period is refused (VALIDATION), never an empty listing', () => {
    expect(() => buildSaeLineListing({ events: [evt({ id: 'a' })], periodStart: 'nope', periodEnd: period.periodEnd })).toThrow(
      /^VALIDATION:/,
    );
  });
});
