/**
 * An adverse event whose report date is not recorded reads back with
 * reportDate null, and the PV board says its age is "not recorded".
 *
 * What it used to do (until 2026-10-15): mapRowToAdverseEvent did
 * `new Date(row.report_date)` (report_date is nullable,
 * migrations/20260603_pv_operational.sql), so a NULL read as 1970-01-01; the
 * board's "Active signals" aged such a pair from the epoch (≈20,000 days), and
 * the IND safety report printed the epoch as the clock start.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query } }));

import { getAdverseEvents, type AdverseEvent } from '../pharmacovigilanceService';
import { buildIndSafetyReportDocument, type IndSafetyClassification } from '../../ind-lifecycle/ind-safety-report-service';

const row = (over: Record<string, unknown>) => ({
  id: 'ae-1', organization_id: 'org-1', project_id: 'proj-1', event_type: 'SAE', patient_id: 'subj-1',
  event_description: 'Acute hepatic failure', onset_date: '2026-01-05T00:00:00.000Z', report_date: '2026-01-06T00:00:00.000Z',
  seriousness_criteria: 'life_threatening', causality: 'probable', outcome: 'not_recovered', reporter_type: 'investigator',
  country_of_occurrence: 'US', regulatory_reporting_deadline: null, reported_to_authorities: false,
  expedited_report_required: null, created_at: '2026-01-06T00:00:00.000Z', suspect_product: 'DrugX', reaction_pt: 'Hepatic failure',
  ...over,
});

const NOT_DETERMINED: IndSafetyClassification = {
  obligation: 'NOT_DETERMINED', reportingWindowDays: null, deadline: null,
  determinations: { serious: true, suspected: true, unexpected: null, expectednessRecorded: false, fatalOrLifeThreatening: true },
  regulatoryBasis: '21 CFR 312.32(a)', rationale: 'Not determined: expectedness not assessed.',
};

describe('an unrecorded report date', () => {
  it('reads as null, not the epoch', async () => {
    query.mockResolvedValueOnce({ rows: [row({ report_date: null })] });
    const [e] = await getAdverseEvents('org-1');
    expect(e.reportDate, 'a NULL report_date was read as a date').toBeNull();
    expect(JSON.stringify(e)).not.toContain('1970-01-01');
  });

  it('is stated as not recorded in the IND safety report', async () => {
    query.mockResolvedValueOnce({ rows: [row({ report_date: null })] });
    const [e] = await getAdverseEvents('org-1');
    const body = buildIndSafetyReportDocument(e, NOT_DETERMINED).sections.find((s) => s.key === 'description_of_event')?.body;
    expect(body).toContain('Sponsor awareness (clock-start): not recorded.');
  });
});

describe('the PV board ages a signal only from recorded report dates', () => {
  it('a pair whose cases record no report date: age "not recorded"', async () => {
    vi.resetModules();
    const events = Array.from({ length: 3 }, (_, i) => ({
      id: `ae-${i}`, suspectProduct: 'DrugX', reactionPt: 'Hepatic failure', reportDate: null,
    })) as unknown as AdverseEvent[];
    const others = Array.from({ length: 6 }, (_, i) => ({
      id: `o-${i}`, suspectProduct: i % 2 ? 'DrugY' : 'DrugZ', reactionPt: i % 3 ? 'Rash' : 'Nausea', reportDate: new Date('2026-01-01'),
    })) as unknown as AdverseEvent[];
    vi.doMock('../pharmacovigilanceService', () => ({
      getAdverseEvents: async () => [...events, ...others],
      getUpcomingReports: async () => [],
    }));
    const { default: createBoard } = await import('../../../routes/pharmacovigilance-board.routes');
    const app = express();
    app.use((req, _res, next) => { (req as unknown as { tenantId: number }).tenantId = 7; next(); });
    app.use('/board', createBoard());
    const res = await request(app).get('/board');
    expect(res.status).toBe(200);
    const signal = res.body.data.signals.find((s: { product: string }) => s.product === 'DrugX');
    expect(signal, 'no signal row for the pair').toBeDefined();
    expect(signal.age, 'a NULL report date aged the signal from 1970').toBe('not recorded');
  });
});
