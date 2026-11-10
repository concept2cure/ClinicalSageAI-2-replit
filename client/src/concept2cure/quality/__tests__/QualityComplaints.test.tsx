// @vitest-environment jsdom
/**
 * P-122 (2026-11-10): Quality's Complaints and MDR tab, over the existing /api/capa-mdr routes (complaint intake and
 * lifecycle, 21 CFR 820.198; MDR and vigilance reports, 21 CFR 803 and EU MDR Article 87; the vigilance timeline).
 * Until now only AnA (server/services/ana/capaMdrTools.ts) and the CER's read-only complaint list reached them.
 * A tab inside the existing Quality screen: no new screen, mount or table. Every write is the server's audited one;
 * the moves offered are the server's lifecycle (shared/constants/capa-lifecycle.ts); a failed read is a failure.
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  reads: {} as Record<string, { data: unknown; loading: boolean; error: string | null }>,
  program: null as string | null,
  programName: null as string | null,
}));
vi.mock('../../mdx/hooks/useFetchJson', async (original) => ({
  ...(await original<typeof import('../../mdx/hooks/useFetchJson')>()),
  useFetchJson: (url: string) => ({ failure: null, ...(H.reads[url] ?? { data: null, loading: true, error: null }), refresh: H.refresh }),
}));
vi.mock('../../v2/shellProject', () => ({
  shellProgramId: () => H.program, shellProgramName: () => H.programName,
  useShellProject: () => (H.program ? { id: H.program, title: H.programName ?? undefined } : null),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'Q. Reviewer' }) }));
vi.mock('../../_shared/components/EsignModal', () => ({ esignSignerOf: () => undefined, EsignModal: () => null }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
  redactInternals: (m: string) => m,
}));

import { QmsRecords, QMS_RECORD_TABS, QMS_RECORD_ASK } from '../QmsRecords';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const P = '44444444-4444-4444-8444-444444444444';
const COMPLAINT = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001', programId: P, complaintCode: 'CMP-2026-0007', source: 'customer', channel: 'email',
  receivedAt: '2026-11-02T09:00:00Z', eventNarrative: 'Pump alarm failed to sound during an occlusion', patientHarm: 'serious_injury',
  severityAssessment: 'serious', triageState: 'new', linkedMdrEventId: null, linkedCapaId: null,
  preliminaryClassification: { fdaReportable: true, mdrEuReportable: null, determinationComplete: false, missingFacts: ['eventLocationCountry'] },
};
const MDR = {
  id: 'bbbbbbbb-0000-4000-8000-000000000001', programId: P, mdrCode: 'MDR-2026-0003', sourceComplaintId: COMPLAINT.id,
  jurisdiction: 'us_fda', usFdaReportType: 'initial_30day', euMdrSeverity: null, decisionDate: '2026-10-01T00:00:00Z',
  reportDueAt: '2026-10-31T00:00:00Z', eventNarrative: 'Pump alarm failed to sound', state: 'preparing',
};
const serve = () => {
  H.reads['/api/capa-mdr/complaints'] = { data: { rows: [COMPLAINT], count: 1 }, loading: false, error: null };
  H.reads['/api/capa-mdr/mdr-events'] = { data: { rows: [MDR], count: 1 }, loading: false, error: null };
};
afterEach(() => { cleanup(); H.apiRequest.mockReset(); H.reads = {}; H.program = null; H.programName = null; window.history.replaceState(null, '', '/concept2cure/quality'); });

const body = (name: string) => screen.getByRole('button', { name }).closest('tbody') as HTMLElement;
const section = (heading: string) => screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

describe("Quality's Complaints and MDR tab", () => {
  it('is a tab of Quality beside CAPA, and AnA can open it', () => {
    const ids = QMS_RECORD_TABS.map((t) => t.id);
    expect(ids.indexOf('complaints')).toBe(ids.indexOf('capa') + 1);
    expect(QMS_RECORD_TABS.find((t) => t.id === 'complaints')?.label).toBe('Complaints and MDR');
    expect(QMS_RECORD_ASK.complaints).toMatch(/complaint/i);
    expect(resolveSurfaceAction('quality.open-tab', { tab: 'complaints' }).ok).toBe(true);
  });

  it("lists the organisation's complaints and MDR reports, with the server's reportability and reporting clock", () => {
    serve();
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} />);
    const complaints = section('Complaints');
    expect(within(complaints).getByRole('button', { name: 'CMP-2026-0007' })).toBeTruthy();
    expect(complaints.textContent).toContain('Pump alarm failed to sound during an occlusion');
    expect(complaints.textContent).toContain('Serious injury');
    // The rules engine's preliminary classification, as computed at intake: an unstated fact is said, not read as no.
    expect(complaints.textContent).toContain('FDA: reportable · EU: not determined');
    const mdr = section('MDR and vigilance reports');
    expect(within(mdr).getByRole('button', { name: 'MDR-2026-0003' })).toBeTruthy();
    expect(mdr.textContent).toContain('FDA 30-day');
    expect(within(mdr).getByText('Overdue').className).toContain('tone-err');
    expect(screen.queryByText(/program_id/)).toBeNull();
    // One primary action per view (§2): the second register's create is a ghost button.
    expect(within(complaints).getByRole('button', { name: 'Record complaint' }).className).toBe('btn primary small');
    expect(within(mdr).getByRole('button', { name: 'Record MDR decision' }).className).toBe('btn ghost small');
  });

  it('narrowed to the project, reads its complaints and reports only', () => {
    H.program = P; H.programName = 'Infusion pump';
    window.history.replaceState(null, '', '/concept2cure/quality?quality=project');
    H.reads[`/api/capa-mdr/complaints?program_id=${P}`] = { data: { rows: [], count: 0 }, loading: false, error: null };
    H.reads[`/api/capa-mdr/mdr-events?program_id=${P}`] = { data: { rows: [], count: 0 }, loading: false, error: null };
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} />);
    expect(screen.getByText('No complaints filed under Infusion pump.')).toBeTruthy();
    expect(screen.getByText('No MDR and vigilance reports filed under Infusion pump.')).toBeTruthy();
  });

  it('says a failed read is a failure, never an empty register', () => {
    H.reads['/api/capa-mdr/complaints'] = { data: null, loading: false, error: 'The server did not answer.' };
    H.reads['/api/capa-mdr/mdr-events'] = { data: { rows: [], count: 0 }, loading: false, error: null };
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} />);
    expect(screen.getByText('The complaints register could not be read')).toBeTruthy();
    expect(screen.queryByText('No complaints recorded yet.')).toBeNull();
  });

  it('records a complaint in the open project, every event fact stated, through the audited route', async () => {
    serve();
    H.program = P; H.programName = 'Infusion pump';
    H.apiRequest.mockResolvedValue({ status: 201, json: async () => ({ ...COMPLAINT, complaintCode: 'CMP-2026-0008', meta: {} }) });
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record complaint' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(/Recorded in Infusion pump, the project you have open/)).toBeTruthy();
    const set = (label: RegExp, value: string) => fireEvent.change(within(d).getByLabelText(label), { target: { value } });
    set(/^Source/, 'customer'); set(/^Channel/, 'phone'); set(/^Received/, '2026-11-09');
    set(/What happened/, 'Display froze during infusion.'); set(/^Patient harm/, 'malfunction'); set(/^Severity/, 'minor');
    set(/Country of the event/, 'DE');
    // Each event fact is chosen, never defaulted: the server refuses an unstated one rather than read it as no.
    fireEvent.click(within(d).getByRole('button', { name: 'Record complaint' }));
    expect(H.apiRequest).not.toHaveBeenCalled();
    set(/^Malfunction/, 'yes'); set(/^Correction or removal expected/, 'no'); set(/^Trend threshold crossed/, 'no');
    fireEvent.click(within(d).getByRole('button', { name: 'Record complaint' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledTimes(1));
    const [method, url, sent] = H.apiRequest.mock.calls[0];
    expect([method, url]).toEqual(['POST', '/api/capa-mdr/complaints']);
    expect(sent).toMatchObject({
      programId: P, source: 'customer', channel: 'phone', eventNarrative: 'Display froze during infusion.', patientHarm: 'malfunction',
      severityAssessment: 'minor', eventLocationCountry: 'DE',
    });
    expect(sent).toMatchObject({ isMalfunction: true, anticipatesCorrection: false, trendThresholdCrossed: false });
    expect(String(sent.receivedAt)).toMatch(/^2026-11-09/);
    await waitFor(() => expect(screen.getByText('CMP-2026-0008 was recorded.')).toBeTruthy());
  });

  it('refuses to record a complaint with no project open, and sends nothing', async () => {
    serve();
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record complaint' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(/No project is open\. A complaint belongs to a project/)).toBeTruthy();
  });

  it('moves a complaint only along the server lifecycle, with its reason', async () => {
    serve();
    H.apiRequest.mockResolvedValue({ status: 200, json: async () => ({ ...COMPLAINT, triageState: 'triaged', meta: {} }) });
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} />);
    fireEvent.click(within(body('CMP-2026-0007')).getByRole('button', { name: 'Move' }));
    const d = screen.getByRole('dialog');
    const to = within(d).getByLabelText(/^Move to/) as HTMLSelectElement;
    expect([...to.options].map((o) => o.value).filter(Boolean)).toEqual(['triaged', 'escalated_capa', 'escalated_mdr', 'closed']);
    fireEvent.change(to, { target: { value: 'triaged' } });
    fireEvent.change(within(d).getByLabelText(/^Reason for this move/), { target: { value: 'Reviewed with engineering; investigate the alarm path.' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Record the move' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', `/api/capa-mdr/complaints/${COMPLAINT.id}/transition`, expect.objectContaining({
      to: 'triaged', reason: 'Reviewed with engineering; investigate the alarm path.',
    })));
  });

  it("records the MDR decision a complaint needs, in the complaint's project, linked to it", async () => {
    serve();
    H.apiRequest.mockResolvedValue({ status: 201, json: async () => ({ ...MDR, mdrCode: 'MDR-2026-0004', meta: {} }) });
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} />);
    fireEvent.click(within(body('CMP-2026-0007')).getByRole('button', { name: 'Record MDR decision' }));
    const d = screen.getByRole('dialog');
    fireEvent.change(within(d).getByLabelText(/^Jurisdiction/), { target: { value: 'us_fda' } });
    fireEvent.change(within(d).getByLabelText(/^FDA report type/), { target: { value: 'initial_5day' } });
    fireEvent.change(within(d).getByLabelText(/^Decided on/), { target: { value: '2026-11-09' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Record MDR decision' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/capa-mdr/mdr-events', expect.objectContaining({
      programId: P, sourceComplaintId: COMPLAINT.id, jurisdiction: 'us_fda', usFdaReportType: 'initial_5day',
      eventNarrative: COMPLAINT.eventNarrative,
    })));
  });

  it("opens a complaint's vigilance timeline under its row", () => {
    serve();
    const path = `/api/capa-mdr/vigilance?program_id=${P}&entity_type=complaint&entity_id=${COMPLAINT.id}`;
    H.reads[path] = { data: { rows: [{ id: 'v1', kind: 'complaint_received', occurredAt: '2026-11-02T09:05:00Z', actor: '12', reason: null }], count: 1 }, loading: false, error: null };
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'CMP-2026-0007' }));
    expect(screen.getByText('Complaint received')).toBeTruthy();
  });

  it('tells AnA both registers as read, and that a failed read is a failure', async () => {
    serve();
    const onContext = vi.fn();
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} onContext={onContext} />);
    await waitFor(() => expect(onContext).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'complaints', state: 'ready', count: 2 })));
    const last = onContext.mock.calls.at(-1)![0];
    expect(last.records.map((r: { register: string }) => r.register)).toEqual(['complaints', 'MDR and vigilance reports']);
    cleanup();
    H.reads['/api/capa-mdr/mdr-events'] = { data: null, loading: false, error: 'The server did not answer.' };
    const failed = vi.fn();
    render(<QmsRecords tab="complaints" onAsk={vi.fn()} onContext={failed} />);
    await waitFor(() => expect(failed).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'failed' })));
  });
});
