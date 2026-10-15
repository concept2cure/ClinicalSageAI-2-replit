/**
 * An adverse event whose onset date is not recorded reads back with onsetDate
 * null, and its readers say "not recorded" — never 1970-01-01.
 *
 * What the code used to do (until 2026-10-15): mapRowToAdverseEvent did
 * `new Date(row.onset_date)`, and `new Date(null)` is 1970-01-01 (onset_date
 * is nullable, migrations/20260603_pv_operational.sql). getAdverseEvents
 * served that epoch to the AnA safety tools, so the SAE line listing dropped
 * the case as out of period, E2B E.i.4 printed 1970-01-01, and the IND safety
 * report's onset line read the epoch.
 */
import { describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query } }));

import { getAdverseEvents } from '../pharmacovigilanceService';
import { buildSaeLineListing, saeLineListingToCsv } from '../../ind-lifecycle/ind-sae-line-listing';
import { buildIndSafetyReportDocument, type IndSafetyClassification } from '../../ind-lifecycle/ind-safety-report-service';
import { composeE2bR3Icsr } from '../../ind-lifecycle/e2b-icsr-composer';

const row = (over: Record<string, unknown>) => ({
  id: 'ae-1', organization_id: 'org-1', project_id: 'proj-1', event_type: 'SAE', patient_id: 'subj-1',
  event_description: 'Acute hepatic failure', onset_date: '2026-01-05T00:00:00.000Z', report_date: '2026-01-06T00:00:00.000Z',
  seriousness_criteria: 'life_threatening', causality: 'probable', outcome: 'not_recovered', reporter_type: 'investigator',
  country_of_occurrence: 'US', regulatory_reporting_deadline: '2026-01-13T00:00:00.000Z', reported_to_authorities: false,
  expedited_report_required: true, created_at: '2026-01-06T00:00:00.000Z',
  ...over,
});

async function readOne(over: Record<string, unknown>) {
  query.mockResolvedValueOnce({ rows: [row(over)] });
  const [e] = await getAdverseEvents('org-1');
  return e;
}

const NOT_DETERMINED: IndSafetyClassification = {
  obligation: 'NOT_DETERMINED', reportingWindowDays: null, deadline: null,
  determinations: { serious: true, suspected: true, unexpected: null, expectednessRecorded: false, fatalOrLifeThreatening: true },
  regulatoryBasis: '21 CFR 312.32(a)', rationale: 'Not determined: expectedness not assessed.',
};

describe('an unrecorded onset date', () => {
  it('reads as null, not the epoch', async () => {
    const e = await readOne({ onset_date: null });
    expect(e.onsetDate, 'a NULL onset_date was read as a date').toBeNull();
    expect(JSON.stringify(e)).not.toContain('1970-01-01');
  });

  it('is listed in the SAE line listing with its onset "not recorded", not dropped as out of period', async () => {
    const listing = buildSaeLineListing({ events: [await readOne({ onset_date: null })], periodStart: '2026-01-01', periodEnd: '2026-12-31' });
    expect(listing.rows.map((r) => r.adverseEventId), 'the case was dropped as out of period').toEqual(['ae-1']);
    const [header, csvRow] = saeLineListingToCsv(listing).trim().split('\n');
    expect(csvRow.split(',')[header.split(',').indexOf('onset_date')]).toBe('not recorded');
  });

  it('leaves E2B E.i.4 blank rather than printing 1970-01-01', async () => {
    const { xml } = composeE2bR3Icsr(await readOne({ onset_date: null }));
    expect(xml).not.toContain('1970-01-01');
  });

  it('is stated as not recorded in the IND safety report', async () => {
    const doc = buildIndSafetyReportDocument(await readOne({ onset_date: null }), NOT_DETERMINED);
    expect(doc.sections.find((s) => s.key === 'description_of_event')?.body).toContain('Onset: not recorded.');
  });
});

describe('a recorded onset date (control)', () => {
  it('reads as that date and is printed as it', async () => {
    const e = await readOne({});
    expect(e.onsetDate?.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    const listing = buildSaeLineListing({ events: [e], periodStart: '2026-01-01', periodEnd: '2026-12-31' });
    expect(listing.rows[0].onsetDate).toBe('2026-01-05');
    expect(buildIndSafetyReportDocument(e, NOT_DETERMINED).sections[1].body).toContain('Onset: 2026-01-05.');
  });
});
