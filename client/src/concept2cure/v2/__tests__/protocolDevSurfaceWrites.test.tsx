// @vitest-environment jsdom
/**
 * Protocol development — every register writes from the screen.
 *
 * ── The gap this guards ──────────────────────────────────────────────────────
 * WO finished the server half on 2026-09-21 and never opened the surface
 * (docs/evidence/WO/2026-09-21). The read model returned the SoA engine's
 * findings, the budget engine's summary, the consent elements, the study team,
 * the risk owner and the review disposition, and every write route existed —
 * and `ProtocolDev.tsx` was read-only. A protocol author could not edit a
 * section, add a visit or an assessment, rate a residual risk, enter a budget
 * line, request a review, or name the sponsor and the principal investigator.
 *
 * Each case below drives the real control on the real tab, completes the
 * governed drawer, and asserts the request that leaves the browser: the
 * method, the path, the ids and the reason. The last assertion of each is the
 * one that matters after the write — the surface RE-READS GET /api/protocol-dev
 * rather than patching the register locally, so the screen can only ever show
 * what the record holds.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';
import { clearNavParams } from '../navParams';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;
const created = (obj: unknown) => ({ ok: true, status: 201, json: async () => obj }) as Response;

const REASON = 'Aligning the schedule with the amended dose-ranging design';

const PROGRAM = { id: '5ac45b38-a1d8-4a41-9488-fac39a57b852', title: 'C2C-101', product: 'C2C-101' };

const DOC = {
  id: '2',
  title: 'Phase 2 dose-ranging study of C2C-101 in plaque psoriasis',
  shortTitle: 'C2C-101-201',
  kind: 'clinical', version: '1.0', status: 'in_development',
  sponsor: '', pi: '', principalInvestigator: '',
  updated: '2026-09-21', completeness: 40, openSection: '101',
  sections: [
    { id: '101', num: '1', title: 'Synopsis', status: 'draft', required: true, updatedAt: '2026-09-21T10:00:00.000Z' },
    { id: '102', num: '2', title: 'Background', status: 'not_started', required: true, updatedAt: '' },
  ],
  content: { 101: [{ h: 'Synopsis', p: 'A randomised, double-blind study.', prov: {} }] },
  objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: {
    visits: [{ id: '11', label: 'Screening', day: 'Day -28', window: '' }],
    assessments: [{ id: '31', label: 'ECG', cat: 'procedure' }],
    cells: { 31: ['11'] },
    issues: [{ sev: 'minor', text: 'No safety assessment at the final visit.' }],
  },
  risks: [{ id: '7', hazard: 'Site staff turnover', cat: 'operational', l: 3, i: 3, rl: 0, ri: 0, mitigation: '', status: 'open', owner: '' }],
  milestones: [],
  budget: {
    params: null, items: [],
    summary: {
      categories: [], directPerSubject: 0, indirectPerSubject: 0, totalPerSubject: 0,
      targetEnrollment: 0, totalStudyCost: 0, sponsorRevenue: null, margin: null,
      feasibility: 'unknown', basis: '2 CFR 200.414',
    },
  },
  amendments: [], deviations: [],
  reviews: [{ id: '5', reviewer: 'Dr Iyer', role: 'scientific', status: 'assigned', disposition: '', dueDate: '2026-10-01', comments: [] }],
  consent: [{ id: '90', el: 'Statement that the study involves research', key: 'research_statement', required: true, present: true }],
  consentForm: { id: '4', title: 'Main consent', version: '1.0', status: 'draft', formsLinked: 1 },
  completenessFindings: [],
};

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function route() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) return ok({ success: true, data: [DOC] });
    if (method === 'GET') return ok({ data: [] });
    return created({ id: 1, actionId: 'gov-1' });
  });
}

const props = () => ({
  surface: { id: 'protocol-dev', label: 'Protocol development', navTier: 'project' } as never,
  onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech',
});

/** Reads of the protocol so far — the re-read assertion counts these. */
const reads = () => apiRequest.mock.calls.filter((c) => c[0] === 'GET' && String(c[1]).startsWith('/api/protocol-dev')).length;
/** The last non-GET call: method, path, body. */
const lastWrite = () => apiRequest.mock.calls.filter((c) => c[0] !== 'GET').slice(-1)[0];

async function openTab(name: RegExp) {
  render(<Providers><ProtocolWorkspace {...props()} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name }));
}

/** Complete the open governed drawer: fill `values` by field label, submit. */
async function completeDrawer(values: Record<string, string>, submitLabel: RegExp) {
  const dialog = await screen.findByRole('dialog');
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(within(dialog).getByLabelText(new RegExp(label)), { target: { value } });
  }
  fireEvent.click(within(dialog).getByRole('button', { name: submitLabel }));
}

beforeEach(() => {
  apiRequest.mockReset();
  clearNavParams();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = PROGRAM;
  route();
});
afterEach(() => { cleanup(); clearNavParams(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });

describe('schedule of assessments — visits and assessment rows', () => {
  it('adds a visit through the governed visit route and re-reads the protocol', async () => {
    await openTab(/Schedule of assessments/);
    const before = reads();
    fireEvent.click(await screen.findByRole('button', { name: /Add visit/ }));
    await completeDrawer({ 'Visit name': 'Week 12', 'Reason for change': REASON }, /Add visit/);
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    const [method, path, body] = lastWrite();
    expect(method).toBe('POST');
    expect(path).toBe('/api/protocol-development/documents/2/visits');
    expect(body).toMatchObject({ visitName: 'Week 12', reason: REASON });
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it('renames a visit through the visit PATCH, carrying the visit id', async () => {
    await openTab(/Schedule of assessments/);
    fireEvent.click(await screen.findByRole('button', { name: /Rename visit Screening/ }));
    await completeDrawer({ 'Visit name': 'Screening \\(revised\\)', 'Reason for change': REASON }, /Save visit/);
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    const [method, path] = lastWrite();
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/protocol-development/documents/2/visits/11');
  });

  it('removes a visit through the governed remove route', async () => {
    await openTab(/Schedule of assessments/);
    fireEvent.click(await screen.findByRole('button', { name: /Remove visit Screening/ }));
    await completeDrawer({ 'Reason for change': REASON }, /Remove visit/);
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    expect(lastWrite()[1]).toBe('/api/protocol-development/documents/2/visits/11/remove');
  });

  it('adds an assessment through the SoA router', async () => {
    await openTab(/Schedule of assessments/);
    fireEvent.click(await screen.findByRole('button', { name: /Add assessment/ }));
    await completeDrawer({ Assessment: 'Vital signs', 'Reason for change': REASON }, /Add assessment/);
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    const [method, path, body] = lastWrite();
    expect(method).toBe('POST');
    expect(path).toBe('/api/protocol-soa/documents/2/assessments');
    expect(body).toMatchObject({ name: 'Vital signs', reason: REASON });
  });

  it('removes an assessment through the governed remove route', async () => {
    await openTab(/Schedule of assessments/);
    fireEvent.click(await screen.findByRole('button', { name: /Remove assessment ECG/ }));
    await completeDrawer({ 'Reason for change': REASON }, /Remove assessment/);
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    expect(lastWrite()[1]).toBe('/api/protocol-development/documents/2/assessments/31/remove');
  });

  it('renders the assembler’s findings rather than an empty list', async () => {
    await openTab(/Schedule of assessments/);
    expect(await screen.findByText(/No safety assessment at the final visit/)).toBeTruthy();
  });
});

describe('risk register — residual rating, owner and mitigation', () => {
  it('writes the residual rating through the risk PATCH', async () => {
    await openTab(/Risk register/);
    const before = reads();
    // The rating acts on the selected risk: the row is itself a control, so the
    // action cannot live inside it. Nothing is rateable until one is chosen.
    expect(screen.getByRole('button', { name: /^Rate residual risk$/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: /Site staff turnover/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Rate residual risk — Site staff turnover/ }));
    await completeDrawer(
      { 'Residual likelihood': 'unlikely', 'Residual impact': 'minor', Owner: 'Clinical operations lead', 'Reason for change': REASON },
      /Save risk/,
    );
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    const [method, path, body] = lastWrite();
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/protocol-risks/risks/7');
    expect(body).toMatchObject({ residualLikelihood: 'unlikely', residualImpact: 'minor', owner: 'Clinical operations lead', reason: REASON });
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });
});

describe('budget — line items, parameters and the engine’s verdict', () => {
  it('says plainly that no budget has been entered instead of printing a verdict', async () => {
    await openTab(/Budget/);
    expect(await screen.findByText(/No budget has been entered/)).toBeTruthy();
    expect(screen.queryByText('Funded')).toBeNull();
    expect(screen.queryByText('Under-funded')).toBeNull();
  });

  it('adds a line item through the budget router', async () => {
    await openTab(/Budget/);
    fireEvent.click(await screen.findByRole('button', { name: /Add budget line/ }));
    await completeDrawer({ 'Line item': 'Screening ECG', 'Unit cost': '240', 'Reason for change': REASON }, /Add line/);
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    const [method, path, body] = lastWrite();
    expect(method).toBe('POST');
    expect(path).toBe('/api/protocol-budget/documents/2/items');
    expect(body).toMatchObject({ description: 'Screening ECG', unitCost: 240, reason: REASON });
  });

  it('sets the feasibility parameters through the params PUT', async () => {
    await openTab(/Budget/);
    fireEvent.click(await screen.findByRole('button', { name: /Feasibility parameters/ }));
    await completeDrawer(
      { 'Target enrollment': '240', 'Sponsor payment per subject': '9000', 'Indirect': '28', 'Reason for change': REASON },
      /Save parameters/,
    );
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    const [method, path, body] = lastWrite();
    expect(method).toBe('PUT');
    expect(path).toBe('/api/protocol-budget/documents/2/params');
    expect(body).toMatchObject({ targetEnrollment: 240, sponsorPaymentPerSubject: 9000, indirectRatePct: 28 });
  });
});

describe('reviews — request a review and record a disposition', () => {
  it('requests a review through the reviewers route', async () => {
    await openTab(/Reviews/);
    fireEvent.click(await screen.findByRole('button', { name: /Request a review/ }));
    await completeDrawer({ Reviewer: 'Dr Okafor', 'Due date': '2026-10-15', 'Reason for change': REASON }, /Request review/);
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    const [method, path, body] = lastWrite();
    expect(method).toBe('POST');
    expect(path).toBe('/api/protocol-reviews/documents/2/reviewers');
    expect(body).toMatchObject({ reviewerName: 'Dr Okafor', dueDate: '2026-10-15' });
  });

  it('a disposition is signed, not submitted: nothing is sent until the signer re-authenticates', async () => {
    /* It used to PATCH straight from a reason-only drawer, and the server wrote
       a `sign` ledger row nobody had signed. Now the drawer picks the decision
       and the shared EsignModal signs it (21 CFR 11.50 meaning, 11.200 password). */
    const verify = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) }));
    vi.stubGlobal('fetch', verify);
    try {
      await openTab(/Reviews/);
      fireEvent.click(await screen.findByRole('button', { name: /Record disposition for Dr Iyer/ }));
      await completeDrawer({ Disposition: 'approve_with_changes' }, /Continue to signature/);
      expect(apiRequest.mock.calls.filter((c) => c[0] !== 'GET')).toHaveLength(0);

      fireEvent.change(await screen.findByLabelText(/Reason for this action/), { target: { value: REASON } });
      fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'correct horse' } });
      fireEvent.click(screen.getByRole('button', { name: /Sign and commit/ }));

      await waitFor(() => expect(lastWrite()).toBeTruthy());
      expect(verify).toHaveBeenCalledWith('/api/esignature/verify-password', expect.anything());
      const [method, path, body] = lastWrite();
      expect(method).toBe('PATCH');
      expect(path).toBe('/api/protocol-reviews/assignments/5/disposition');
      // Dr Iyer has no account in this fixture, so the signer records the
      // decision and takes responsibility for it; they do not claim the review.
      expect(body).toEqual({
        disposition: 'approve_with_changes',
        reason: REASON,
        meaning: 'responsibility',
        reauth: { password: 'correct horse' },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('cover page — sponsor and principal investigator', () => {
  it('writes both through the cover-page PATCH and re-reads', async () => {
    render(<Providers><ProtocolWorkspace {...props()} /></Providers>);
    const before = await waitFor(async () => { await screen.findByText('C2C-101-201'); return reads(); });
    fireEvent.click(screen.getByRole('button', { name: /Edit sponsor and principal investigator/ }));
    await completeDrawer(
      { Sponsor: 'Concept2Cure Therapeutics', 'Principal investigator': 'Dr A. Rivera', 'Reason for change': REASON },
      /Save cover page/,
    );
    await waitFor(() => expect(lastWrite()).toBeTruthy());
    const [method, path, body] = lastWrite();
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/protocol-development/documents/2');
    expect(body).toMatchObject({ sponsor: 'Concept2Cure Therapeutics', principalInvestigator: 'Dr A. Rivera', reason: REASON });
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });
});

describe('consent — the tab shows what the read model returns', () => {
  it('reports the element the assembled consent form holds', async () => {
    await openTab(/Consent/);
    expect(await screen.findByText(/Statement that the study involves research/)).toBeTruthy();
    expect(screen.getByText(/Main consent/)).toBeTruthy();
  });
});

describe('a governed write does not take the protocol off screen', () => {
  it('stays on the register being edited while the record is re-read', async () => {
    /* The re-read is held open, because that is where the defect lives:
       `useLiveData` sets `loading` on every refetch while KEEPING the payload,
       so a blanket `if (loading)` gate unmounted the whole workspace after
       every governed write. The author was thrown back to the Document tab
       and the schedule they were building went off screen. With an instant
       mock the flash is too short to observe; held open, it is the state the
       screen is actually in while the record is re-read. */
    let releaseSecondRead: (() => void) | null = null;
    let readCount = 0;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/protocol-dev')) {
        readCount += 1;
        if (readCount > 1) await new Promise<void>((r) => { releaseSecondRead = r; });
        return ok({ success: true, data: [DOC] });
      }
      if (method === 'GET') return ok({ data: [] });
      return created({ id: 1, actionId: 'gov-1' });
    });

    await openTab(/Schedule of assessments/);
    fireEvent.click(await screen.findByRole('button', { name: /Add visit/ }));
    await completeDrawer({ 'Visit name': 'Week 12', 'Reason for change': REASON }, /Add visit/);
    await waitFor(() => expect(releaseSecondRead).toBeTruthy());

    // Mid-re-read: the register is still the one being edited, and the
    // workspace has not been replaced by a loading panel.
    expect(screen.getByRole('heading', { name: 'Schedule of assessments' })).toBeTruthy();
    expect(screen.queryByText(/Loading protocol…/)).toBeNull();
    // The refresh is reported rather than drawn over the work.
    expect(screen.getByText(/Re-reading the record/)).toBeTruthy();

    releaseSecondRead!();
    await waitFor(() => expect(screen.queryByText(/Re-reading the record/)).toBeNull());
    expect(screen.getByRole('heading', { name: 'Schedule of assessments' })).toBeTruthy();
  });
});

describe('empty state', () => {
  it('names the open project and offers both a start and an AnA draft', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/protocol-dev')) return ok({ success: true, data: [] });
      return ok({ data: [] });
    });
    const p = props();
    render(<Providers><ProtocolWorkspace {...p} /></Providers>);
    expect(await screen.findByText(/C2C-101/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ask AnA to draft the synopsis/ }));
    expect(p.onAsk).toHaveBeenCalled();
    expect(String(p.onAsk.mock.calls[0][0])).toContain('C2C-101');
    fireEvent.click(screen.getByRole('button', { name: /Start a protocol/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
