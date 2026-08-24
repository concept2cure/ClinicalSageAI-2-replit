// @vitest-environment jsdom
/**
 * Protocol deviations are the record, and "Add study site" no longer pretends.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * ClinicalOps.tsx:569 (and :553) — both drawers ended in the same two lines:
 *
 *   addDev({ ... });  fireToast('Deviation added to the board -- ' + v.site);
 *   addSite({ ... }); fireToast('Site added to the board -- ' + v.n + ...);
 *
 * `addDev`/`addSite` push onto React state. Nothing was written, the row was
 * gone on reload, and the deviations card's empty state read "No protocol
 * deviations logged" — clearance vocabulary for a board that had never asked the
 * record. The file's own comment said the deviations API is study-scoped and this
 * org-wide board "has no studyId handle"; that was true only because the studies
 * projection did not carry one. It does now (`id AS "studyId"`), so the board
 * reads and writes the real study-scoped deviations endpoints.
 *
 * The site drawer had no such route: this board's roster is `rbm_site_risk_scores`
 * — governed composite risk scores computed by the RBM engine from Site
 * Intelligence — and no endpoint puts a row there. So the affordance is gone
 * rather than made to look real; a hand-typed row in a monitoring-TIER table is
 * not merely unsaved, it is misleading.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN: the board reads deviations per study; a logged deviation reaches
 * POST /api/clinical-operations/deviations with the study it belongs to; a
 * REFUSED write adds no row and says nothing was saved; a successful write is
 * re-read from the record rather than echoed from the form; a failed studies read
 * never renders as "no deviations"; and no control claims to add a site.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { ClinicalOps } from '../surfaces/ClinicalOps';

const STUDY_UUID = '6f1d7d2e-3b4a-4f5c-8d9e-0a1b2c3d4e5f';
const DEVIATIONS_PATH = '/api/clinical-operations/studies/' + STUDY_UUID + '/deviations';

const STUDIES = {
  success: true,
  data: [{ studyId: STUDY_UUID, id: 'BX204-301', phase: '3', design: 'Randomized', n: 412, target: 412, status: 'active', note: null }],
};

/** The row the RECORD holds — deliberately not the text the form submits. */
const STORED = {
  id: 'dev-77',
  category: 'major',
  description: 'Site 1131 -- Informed consent re-signed after the window',
  detected_date: '2026-08-14T00:00:00.000Z',
  corrective_action: 'Retraining completed; monitoring visit scheduled',
  status: 'open',
};

const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload });

/** No deviations recorded yet; the POST succeeds; the re-read returns STORED. */
function wire(opts: { deviations?: unknown[]; onPost?: () => unknown } = {}) {
  let posted = false;
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/clinical-operations/studies') return ok(STUDIES);
    if (method === 'GET' && url === '/api/mdx/rbm-site-risk') return ok({ data: [] });
    if (method === 'GET' && url === DEVIATIONS_PATH) {
      return ok({ success: true, data: posted ? [STORED] : (opts.deviations ?? []) });
    }
    if (method === 'POST' && url === '/api/clinical-operations/deviations') {
      if (opts.onPost) return opts.onPost();
      posted = true;
      return ok({ success: true, data: STORED }, 201);
    }
    return ok({ data: [] });
  });
}

function mount() {
  return render(<ClinicalOps surface={{ id: 'clinical-ops', label: 'Clinical operations' } as never}
    onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
}

async function openAndFillDeviation() {
  // Two controls open the same drawer (the hero action and the card action).
  fireEvent.click(screen.getAllByRole('button', { name: /Log deviation/ })[0]);
  // Required labels render as "Study*" (the marker is aria-hidden), so match loosely.
  await waitFor(() => expect(screen.getByLabelText(/^Study/)).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/^Study/), { target: { value: STUDY_UUID } });
  fireEvent.change(screen.getByLabelText(/^Detected on/), { target: { value: '2026-08-14' } });
  fireEvent.change(screen.getByLabelText(/^Deviation/), {
    target: { value: 'Informed consent re-signed after the window' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Record deviation/ }));
}

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('ClinicalOps — protocol deviations are the record', () => {
  it('reads the deviations of every study on the board', async () => {
    wire({ deviations: [STORED] });
    mount();
    await waitFor(() => expect(screen.getByText(/Informed consent re-signed/)).toBeTruthy());
    expect(apiRequest.mock.calls.some((c) => c[1] === DEVIATIONS_PATH)).toBe(true);
    expect(screen.getByText(/detected 2026-08-14/)).toBeTruthy();
  });

  it('says "no deviations recorded" only about the studies it actually read', async () => {
    wire();
    mount();
    await waitFor(() => expect(screen.getByText(/No protocol deviations recorded/)).toBeTruthy());
    expect(screen.getByText(/the study on this board/)).toBeTruthy();
  });

  it('never renders a failed studies read as an empty deviations list', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/clinical-operations/studies') {
        throw new ApiRequestError('The clinical-operations service is unavailable.', 503, null, 'UNAVAILABLE');
      }
      return ok({ data: [] });
    });
    mount();
    await waitFor(() => expect(screen.getByText(/Couldn't read the protocol deviations/)).toBeTruthy());
    expect(screen.queryByText(/No protocol deviations recorded/)).toBeNull();
  });

  it('writes the deviation against the study, then shows what the RECORD holds', async () => {
    wire();
    mount();
    await waitFor(() => expect(screen.getByText(/No protocol deviations recorded/)).toBeTruthy());
    await openAndFillDeviation();

    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/api/clinical-operations/deviations')).toBe(true),
    );
    const body = apiRequest.mock.calls.find((c) => c[0] === 'POST')![2];
    expect(body.studyId).toBe(STUDY_UUID);
    expect(body.category).toBe('minor');
    expect(body.detectedDate).toBe('2026-08-14');
    expect(body.description).toMatch(/Informed consent re-signed after the window/);

    // The toast names the study, and the row that appears is the stored one —
    // note the CAPA text was never typed into the form.
    await waitFor(() => expect(screen.getByText(/Deviation recorded against BX204-301/)).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Retraining completed/)).toBeTruthy());
  });

  it('a REFUSED write adds no row and does not claim it was saved', async () => {
    wire({
      onPost: () => { throw new ApiRequestError('Validation failed', 400, null, 'VALIDATION'); },
    });
    mount();
    await waitFor(() => expect(screen.getByText(/No protocol deviations recorded/)).toBeTruthy());
    await openAndFillDeviation();

    await waitFor(() => expect(screen.getByText(/Nothing was saved/)).toBeTruthy());
    expect(screen.getByText(/Not recorded/)).toBeTruthy();
    expect(screen.queryByText(/Informed consent re-signed/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/added to the board/);
  });
});

describe('ClinicalOps — the site roster is not hand-editable', () => {
  it('offers no control that claims to add a site to the risk roster', async () => {
    wire();
    mount();
    await waitFor(() => expect(screen.getByText(/No study sites yet/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Add study site/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add site/ })).toBeNull();
    expect(screen.getByText(/Sites reach this roster from Site Intelligence/)).toBeTruthy();
  });
});
