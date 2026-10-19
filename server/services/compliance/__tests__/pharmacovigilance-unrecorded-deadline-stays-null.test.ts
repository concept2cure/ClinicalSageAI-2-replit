/**
 * An adverse event read back with no recorded reporting deadline reads as
 * null, with the reason — never as 1970-01-01.
 *
 * Until 2026-10-15 mapRowToAdverseEvent did
 * `new Date(row.regulatory_reporting_deadline)`: a NULL column (nullable since
 * migrations/20260603_pv_operational.sql) became the epoch, a deadline decades
 * overdue that nobody set, served by getAdverseEvents to the PV routes and the
 * AnA safety tools.
 */
import { describe, it, expect, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query } }));

import { getAdverseEvents } from '../pharmacovigilanceService';

const row = (over: Record<string, unknown>) => ({
  id: 'ae-1',
  organization_id: 'org-1',
  project_id: 'proj-1',
  event_type: 'SAE',
  patient_id: 'subj-1',
  event_description: 'Acute hepatic failure',
  onset_date: '2026-01-05T00:00:00.000Z',
  report_date: '2026-01-06T00:00:00.000Z',
  seriousness_criteria: 'life_threatening',
  causality: 'probable',
  outcome: 'not_recovered',
  reporter_type: 'investigator',
  country_of_occurrence: 'US',
  regulatory_reporting_deadline: '2026-01-13T00:00:00.000Z',
  reported_to_authorities: false,
  expedited_report_required: true,
  created_at: '2026-01-06T00:00:00.000Z',
  ...over,
});

describe('getAdverseEvents: an unrecorded reporting deadline', () => {
  it('reads a NULL deadline as null, with the reason, not as the epoch', async () => {
    query.mockResolvedValueOnce({ rows: [row({ regulatory_reporting_deadline: null })] });
    const [e] = await getAdverseEvents('org-1');
    expect(e.regulatoryReportingDeadline, 'a NULL deadline was read as a date').toBeNull();
    expect(e.regulatoryReportingDeadlineReason).toMatch(/no reporting deadline is recorded/i);
    expect(JSON.stringify(e)).not.toContain('1970-01-01');
  });

  it('reads a recorded deadline as that date, with no reason', async () => {
    query.mockResolvedValueOnce({ rows: [row({})] });
    const [e] = await getAdverseEvents('org-1');
    expect(e.regulatoryReportingDeadline?.toISOString()).toBe('2026-01-13T00:00:00.000Z');
    expect(e.regulatoryReportingDeadlineReason).toBeUndefined();
  });
});
