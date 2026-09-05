// @vitest-environment jsdom
/**
 * The PMS/PMCF tab reads the program's own complaint queue and PMCF enrolment
 * (ledger L5). Before this, outside sample mode the tab rendered a note saying
 * no live feed existed — while /api/capa-mdr/complaints and
 * /api/post-market/programs/:id/pmcf-enrollment were both live.
 *
 * Every figure comes from the rows; a figure the rows cannot support is absent,
 * a failed read is an error with a retry, and an empty tenant is an empty state.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PmsPmcfTab } from '../PmsPmcfTab';
import { complaintFigures, type CerComplaint } from '../../../hooks/useCerPmsFeeds';

const PROGRAM = 'a0a0a0a0-0000-4000-8000-000000000001';

const json = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);

const REPORT = {
  programId: PROGRAM, deviceClass: null, regulation: 'MDR', documents: [],
  requiredTotal: 0, requiredPresent: 0, requiredApprovedCount: 0, allRequiredApproved: false,
  generatedAt: '2026-09-05T00:00:00Z',
};

const complaint = (over: Partial<CerComplaint>): CerComplaint => ({
  id: 'c-' + Math.random().toString(36).slice(2), programId: PROGRAM, complaintCode: 'CMP-0001',
  source: 'customer', channel: 'email', receivedAt: '2026-09-01T00:00:00Z',
  eventNarrative: 'Lead dislodgement reported at 3 months', patientHarm: 'injury',
  severityAssessment: 'serious', triageState: 'new', triagedAt: null, closedAt: null, ...over,
});

const ROWS: CerComplaint[] = [
  complaint({ complaintCode: 'CMP-3104', triageState: 'new' }),
  complaint({ complaintCode: 'CMP-3098', severityAssessment: 'minor', patientHarm: 'none', triageState: 'triaged', triagedAt: '2026-09-03T00:00:00Z' }),
  complaint({ complaintCode: 'CMP-3071', severityAssessment: 'minor', patientHarm: 'none', triageState: 'closed', triagedAt: '2026-09-02T00:00:00Z', closedAt: '2026-09-04T00:00:00Z' }),
];

const PMCF = {
  programId: PROGRAM,
  records: [
    { id: 'p1', activityCode: 'PMCF-2026-A', activityKind: 'registry', title: 'Late adverse events registry', status: 'enrolling',
      primaryEndpoint: 'Late-stage adverse events', sitesCount: 7, targetEnrollment: 400, enrolledCount: 120, enrollmentAsOf: '2026-08-30T00:00:00Z', dataCollectionThrough: null },
    { id: 'p2', activityCode: 'PMCF-2026-B', activityKind: 'survey', title: 'IFU adherence survey', status: 'planned',
      primaryEndpoint: null, sitesCount: null, targetEnrollment: null, enrolledCount: null, enrollmentAsOf: null, dataCollectionThrough: null },
  ],
  count: 2,
  summary: { activityCount: 2, reportingActivityCount: 1, notReportedActivityCount: 1,
    byStatus: { planned: 1, enrolling: 1, follow_up: 0, completed: 0, terminated: 0 },
    unlinkedToPlanCount: 2, enrolledInReporting: 120, targetInReporting: 400, ratioBasisActivityCount: 1, latestReportAsOf: '2026-08-30T00:00:00Z' },
};

function stubFetch(complaints: () => Promise<Response>, pmcf: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/documentation-status')) return json(200, REPORT);
    if (url.includes('/api/capa-mdr/complaints')) return complaints();
    if (url.includes('/pmcf-enrollment')) return pmcf();
    return json(404, { error: 'unexpected ' + url });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('PmsPmcfTab — live complaint and PMCF feeds', () => {
  it('renders the program’s complaints and PMCF activities, with figures from the rows', async () => {
    stubFetch(() => json(200, { rows: ROWS, count: ROWS.length }), () => json(200, PMCF));
    render(<PmsPmcfTab programId={PROGRAM} profile={null} onAskAna={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('pms-complaints-table')).toBeTruthy());
    expect(screen.getByText('CMP-3104')).toBeTruthy();
    expect(screen.getByText('PMCF-2026-A · Late adverse events registry')).toBeTruthy();
    // Two of the three complaints are open; one of those is serious; two were triaged.
    const kpis = screen.getByTestId('pms-live-kpis');
    expect(kpis.textContent).toContain('3 received · 2 still open');
    expect(kpis.textContent).toContain('Over 2 triaged complaints');
    expect(kpis.textContent).toContain('120 of 400 across 1 reporting activity');
    // The activity that never reported enrolment says so, rather than showing 0.
    expect(screen.getByText(/enrolment not reported/)).toBeTruthy();
    // The pre-feed note is gone.
    expect(screen.queryByText(/have no live backend feed/)).toBeNull();
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes(`/api/capa-mdr/complaints?program_id=${PROGRAM}`))).toBe(true);
    expect(calls.some((u) => u.includes(`/api/post-market/programs/${PROGRAM}/pmcf-enrollment`))).toBe(true);
  });

  it('a failed complaint read is an error with a retry, not an empty queue — and the PMCF panel still renders', async () => {
    stubFetch(() => json(500, { error: 'db down' }), () => json(200, PMCF));
    render(<PmsPmcfTab programId={PROGRAM} profile={null} onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('pms-complaints-error')).toBeTruthy());
    expect(screen.queryByTestId('pms-complaints-empty')).toBeNull();
    expect(screen.getByTestId('pms-pmcf-list')).toBeTruthy();
    // With no complaint rows the complaint figures are absent, never zero.
    expect(screen.getByTestId('pms-live-kpis').textContent).toContain('Complaint rows not loaded');
  });

  it('an empty tenant gets empty states, and a PMCF store that is unavailable is reported as such', async () => {
    stubFetch(() => json(200, { rows: [], count: 0 }), () => json(503, { error: 'PMCF enrolment unavailable' }));
    render(<PmsPmcfTab programId={PROGRAM} profile={null} onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('pms-complaints-empty')).toBeTruthy());
    expect(screen.getByTestId('pms-pmcf-error')).toBeTruthy();
  });

  it('without a program the feeds are not requested', () => {
    stubFetch(() => json(200, { rows: ROWS, count: 3 }), () => json(200, PMCF));
    render(<PmsPmcfTab programId={null} profile={null} onAskAna={() => {}} />);
    expect(screen.getByText(/feeds are held per program/)).toBeTruthy();
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/api/capa-mdr/complaints'))).toBe(false);
  });
});

describe('complaintFigures', () => {
  it('reports no mean time to triage when nothing has been triaged, and marks a capped page', () => {
    const f = complaintFigures([complaint({})], 500);
    expect(f.meanTriageDays).toBeNull();
    expect(f.triagedCount).toBe(0);
    expect(f.capped).toBe(true);
    expect(f.open).toBe(1);
    expect(f.seriousOpen).toBe(1);
  });
  it('averages receipt-to-triage over the triaged rows only', () => {
    const f = complaintFigures(ROWS, 3);
    expect(f.triagedCount).toBe(2);
    expect(f.meanTriageDays).toBeCloseTo(1.5, 5);
    expect(f.capped).toBe(false);
  });
});
