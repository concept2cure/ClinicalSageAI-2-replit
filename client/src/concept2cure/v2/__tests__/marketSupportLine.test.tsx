// @vitest-environment jsdom
/**
 * Each market says what the platform can carry (docs/design/FILING_SPINE.md F19).
 *
 * The project's Submit tab listed its submissions with an application type and
 * a region, and nothing on screen said that an EMA MAA's Module 1 is filed flat
 * and has no channel, or that a Health Canada market has no outline. The New
 * project wizard said nothing either. The statement is the server's
 * (GET /api/submissions/market-support); the screen shows it in the server's
 * words, and a read that has not answered or failed claims nothing.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { MarketSupportLine, marketSupportPath, marketSupportText } from '../MarketSupportLine';

const PID = '6e0f3a2d-1b4c-4d5e-8f70-9a1b2c3d4e19';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const boom = () => Object.assign(new Error('Server error'), { status: 500 });

const SUBS = [
  { id: 61, title: 'ONC-221 NDA', applicationType: 'nda', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: PID },
  { id: 62, title: 'ONC-221 MAA', applicationType: 'maa', clientType: 'biotech', primaryRegion: 'eu', status: 'planning', lifecycleStage: 'original', programId: PID },
];
const SUPPORT: Record<string, { summary: string; line: string; buildable: boolean; offered: boolean }> = {
  'nda|fda': { summary: 'Structured Module 1', line: 'Transmit not proven: the ESG transmission is not signed as FDA requires', buildable: true, offered: true },
  'maa|eu': { summary: 'Flat Module 1, no channel', line: 'Applicant uploads through the EMA eSubmission Gateway / Web Client', buildable: false, offered: true },
};

function serve(supportFails = false) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'ONC-221', status: 'active' });
    if (url === `/api/submissions?programId=${PID}`) return ok(SUBS);
    if (url.startsWith('/api/submissions/market-support')) {
      if (supportFails) throw boom();
      const q = new URL(url, 'http://x').searchParams;
      const key = `${q.get('applicationType')}|${q.get('market')}`;
      const s = SUPPORT[key];
      return ok({ applicationType: q.get('applicationType'), asOf: '2026-10-08', markets: s ? [{ applicationType: q.get('applicationType'), market: q.get('market'), region: null, agency: null, ...s }] : [] });
    }
    return ok({});
  });
}

beforeEach(() => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const openSubmit = async () => {
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
  const tab = await waitFor(() => {
    const t = Array.from(document.querySelectorAll('.pj-lc-stage')).find((b) => b.textContent?.includes('Submit'));
    expect(t).toBeTruthy();
    return t as HTMLElement;
  });
  fireEvent.click(tab);
  await waitFor(() => expect(screen.getAllByTestId('pj-submission')).toHaveLength(2));
};

describe('market rows state what the platform can carry (F19)', () => {
  it("each submission row shows its market's support, in the server's words", async () => {
    serve();
    await openSubmit();
    const [nda, maa] = screen.getAllByTestId('pj-submission');
    await waitFor(() => expect(within(nda).getByTestId('market-support').getAttribute('data-state')).toBe('buildable'));
    expect(within(nda).getByTestId('market-support').textContent).toBe('Structured Module 1. Transmit not proven: the ESG transmission is not signed as FDA requires.');
    await waitFor(() => expect(within(maa).getByTestId('market-support').getAttribute('data-state')).toBe('limited'));
    expect(within(maa).getByTestId('market-support').textContent).toContain('Flat Module 1, no channel');
    expect(apiRequest).toHaveBeenCalledWith('GET', marketSupportPath('nda', 'fda'));
    expect(apiRequest).toHaveBeenCalledWith('GET', marketSupportPath('maa', 'eu'));
  });

  it('a failed read says it failed and offers a retry; it never reads as a market with nothing to say', async () => {
    serve(true);
    await openSubmit();
    const [nda] = screen.getAllByTestId('pj-submission');
    await waitFor(() => expect(within(nda).getByTestId('market-support').getAttribute('data-state')).toBe('error'));
    expect(within(nda).getByTestId('market-support').textContent).toMatch(/could not be read/);
    serve(false);
    // One status per row, not one alert per row; the Retry names its market.
    expect(within(nda).getByTestId('market-support').getAttribute('role')).toBe('status');
    fireEvent.click(within(nda).getByRole('button', { name: 'Retry: platform support for NDA in fda' }));
    await waitFor(() => expect(within(nda).getByTestId('market-support').getAttribute('data-state')).toBe('buildable'));
  });
});

describe('MarketSupportLine', () => {
  it('a read in flight claims nothing about the market', async () => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(() => new Promise(() => {}));
    render(<MarketSupportLine applicationType="nda" market="FDA" />);
    const el = screen.getByTestId('market-support');
    expect(el.getAttribute('data-state')).toBe('loading');
    expect(el.textContent).not.toMatch(/Module 1|channel|outline/);
  });

  it('says nothing, and reads nothing, without both an application type and a market', () => {
    apiRequest.mockReset();
    const { container } = render(<MarketSupportLine applicationType="nda" market={null} />);
    expect(container.textContent).toBe('');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('does not repeat the summary when the line says the same thing', () => {
    expect(marketSupportText({ summary: 'No outline, no channel', line: 'No outline; no channel' })).toBe('No outline, no channel.');
    expect(marketSupportText({ summary: 'Flat Module 1, no channel', line: 'Applicant uploads through the EMA eSubmission Gateway' }))
      .toBe('Flat Module 1, no channel. Applicant uploads through the EMA eSubmission Gateway.');
  });

  /* Design review 2026-10-08 (.design/filing-spine/DESIGN_REVIEW.md): a line
     that opens with its summary was printed after it, "Not offered. Not
     offered: the UK has no IND application type". */
  it('a line that opens with the summary is shown once, not after the summary', () => {
    expect(marketSupportText({ summary: 'Not offered', line: 'Not offered: the UK has no IND application type' }))
      .toBe('Not offered: the UK has no IND application type.');
    expect(marketSupportText({ summary: 'Not supported', line: 'Not supported: the platform has no filing outline or channel for ANVISA' }))
      .toBe('Not supported: the platform has no filing outline or channel for ANVISA.');
  });
});
