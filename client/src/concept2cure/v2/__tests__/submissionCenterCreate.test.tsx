// @vitest-environment jsdom
/**
 * SubmissionCenter — "+ New submission" posts the body the MOUNTED router
 * actually accepts.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 * The form posted { type, projectId, targetAgency, targetDate } — the schema
 * of a router that is NOT mounted at /api/submissions — while the mounted
 * router (routes/submissions.ts) requires { title, applicationType,
 * clientType, primaryRegion }. Every submit answered 400 VALIDATION, so the
 * surface's only create control had never created anything, and the option
 * list offered no MAA/CTA and no region — the second-market submission the
 * global-markets mandate sells was fully blocked.
 *
 * Follows the submissionCenter* harness idiom: apiRequest mocked at the
 * module boundary, REAL distinctive payloads.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() });

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const posts: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  posts.length = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === 'POST' && url === '/api/submissions') {
      posts.push({ url, body });
      // The real route returns the created row UNENVELOPED
      // (res.status(201).json(await createSubmission(...))).
      return res(
        {
          id: 71,
          title: (body as { title?: string })?.title ?? '',
          productName: (body as { productName?: string })?.productName ?? null,
          applicationType: (body as { applicationType?: string })?.applicationType ?? '',
          clientType: (body as { clientType?: string })?.clientType ?? '',
          primaryRegion: (body as { primaryRegion?: string })?.primaryRegion ?? '',
          status: 'planning',
          lifecycleStage: 'planning',
        },
        201,
      );
    }
    if (method === 'GET' && url === '/api/submissions') return res({ data: [] });
    if (method === 'GET' && url === '/api/c2c/projects') {
      return res({ data: [{ id: 'prog-uuid-1', title: 'BX-701', code: 'BX701' }] });
    }
    return res({ data: [] });
  });
});

afterEach(() => cleanup());

describe('SubmissionCenter — create posts the live schema', () => {
  it('an EU MAA can be OPENED: the body carries title/applicationType/clientType/primaryRegion and the programme identity', async () => {
    render(<SubmissionCenter {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /New submission/ }));

    fireEvent.change(await screen.findByLabelText(/Title/), {
      target: { value: 'BX-701 — EU MAA (Centralised)' },
    });
    fireEvent.change(screen.getByLabelText(/Application type/), { target: { value: 'maa' } });
    fireEvent.change(screen.getByLabelText(/Primary region/), { target: { value: 'eu' } });
    fireEvent.change(screen.getByLabelText(/Client type/), { target: { value: 'biotech' } });
    fireEvent.change(screen.getByLabelText(/Programme/), { target: { value: 'prog-uuid-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Create submission/ }));

    await waitFor(() => expect(posts).toHaveLength(1));
    // The EXACT keys the mounted router's createSubmissionSchema requires —
    // and productName is the programme's identity, which is what the eCTD
    // compile spine links program ↔ submission on.
    expect(posts[0].body).toEqual({
      title: 'BX-701 — EU MAA (Centralised)',
      productName: 'BX-701',
      applicationType: 'maa',
      clientType: 'biotech',
      primaryRegion: 'eu',
    });
    // None of the old, unmounted-router keys survive.
    expect(Object.keys(posts[0].body as object)).not.toContain('type');
    expect(Object.keys(posts[0].body as object)).not.toContain('targetAgency');
    expect(Object.keys(posts[0].body as object)).not.toContain('projectId');
    await screen.findByText(/Submission created — MAA · EU \(EMA\)\./);
  });

  it('the form offers the global markets, not only the US ones', async () => {
    render(<SubmissionCenter {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /New submission/ }));
    const regionSel = await screen.findByLabelText(/Primary region/);
    const regions = Array.from(regionSel.querySelectorAll('option')).map((o) => o.textContent);
    expect(regions).toEqual(expect.arrayContaining(['FDA (US)', 'EU (EMA)', 'PMDA (Japan)', 'Health Canada', 'MHRA (UK)']));
    const typeSel = screen.getByLabelText(/Application type/);
    const types = Array.from(typeSel.querySelectorAll('option')).map((o) => o.textContent);
    expect(types).toEqual(expect.arrayContaining(['MAA', 'CTA', 'IND', 'NDA', 'BLA']));
  });
});

/**
 * WO-9 Click 6: a follow-up sequence is started from the product, through the
 * same POST /api/submissions/:id/sequences that starts 0000. Only 0000 could be
 * started here, so a lifecycle sequence (0001) had no path in the UI.
 */
describe('SubmissionCenter — the next sequence', () => {
  const SUB = {
    id: 55, title: 'BX-512 IND', productName: 'BX-512', applicationType: 'ind', clientType: 'biotech',
    primaryRegion: 'fda', status: 'active', lifecycleStage: 'original',
  };
  const seq = (id: number, sequenceNumber: string, region = 'fda', type = 'original') =>
    ({ id, submissionId: 55, sequenceNumber, region, type, status: 'dispatched' });

  function serve(initial: unknown[]) {
    const seqPosts: unknown[] = [];
    let rowsNow = initial;
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url === '/api/submissions') return res({ data: [SUB] });
      if (method === 'GET' && url === '/api/submissions/55/sequences') return res({ data: rowsNow });
      if (method === 'POST' && url === '/api/submissions/55/sequences') {
        seqPosts.push(body);
        const created = { id: 99, submissionId: 55, sequenceNumber: body.sequenceNumber, region: body.region, type: body.type, status: 'draft' };
        rowsNow = [...rowsNow, created];
        return res(created, 201);
      }
      return res({ data: [] });
    });
    return seqPosts;
  }

  it('starts the next sequence in the submission\'s region, numbered after the last, of the type chosen', async () => {
    const seqPosts = serve([seq(9, '0000')]);
    render(<SubmissionCenter {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the sequences' }));

    const start = await screen.findByRole('button', { name: 'Start sequence 0001' });
    fireEvent.change(screen.getByLabelText('Type of sequence 0001'), { target: { value: 'response' } });
    fireEvent.click(start);

    await waitFor(() => expect(seqPosts).toEqual([{ region: 'fda', sequenceNumber: '0001', type: 'response' }]));
    expect(await screen.findByText(/Sequence 0001 created for BX-512 IND — server-confirmed/)).toBeTruthy();
  });

  it('numbers after the highest sequence in the submission\'s own region — numbering restarts per region', async () => {
    serve([seq(9, '0000'), seq(10, '0001'), seq(11, '0004', 'ema')]);
    render(<SubmissionCenter {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the sequences' }));
    expect(await screen.findByRole('button', { name: 'Start sequence 0002' })).toBeTruthy();
    // An original is sequence 0000; a follow-up is never offered as one.
    const types = Array.from((screen.getByLabelText('Type of sequence 0002') as HTMLSelectElement).options).map((o) => o.value);
    expect(types).not.toContain('original');
    expect(types).toContain('amendment');
  });
});
