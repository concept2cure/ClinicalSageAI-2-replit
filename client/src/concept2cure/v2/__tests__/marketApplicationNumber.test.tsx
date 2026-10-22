// @vitest-environment jsdom
/**
 * A market's own application number on its row (decision P-44).
 *
 * The project's number is its home market's; another market's packages carry
 * the number its own agency assigned, and are refused until one is recorded.
 * The row says which, and records one through the governed act, with a reason,
 * in the server's words when refused. Nothing is drawn for the home market.
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
import { MarketApplicationNumber } from '../surfaces/MarketApplicationNumber';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
let stored: string | null = null;
let read: Record<string, unknown> = {};

beforeEach(() => {
  stored = null;
  read = { submissionId: 2, home: false, market: 'EU', homeAgency: 'FDA' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && url === '/api/submissions/2/application-number') return ok({ ...read, applicationNumber: stored });
    if (method === 'POST' && url === '/api/submissions/2/application-number') {
      if (String(body?.applicationNumber).includes('/')) {
        throw new ApiRequestError('That is not a usable application number: a slash is not accepted yet. Nothing was changed.', 400, {});
      }
      const changed = stored !== String(body?.applicationNumber);
      stored = String(body?.applicationNumber);
      return ok({ changed });
    }
    return ok({});
  });
});
afterEach(cleanup);

async function recordNumber(number: string, button = 'Record the number') {
  fireEvent.click(await screen.findByRole('button', { name: button }));
  fireEvent.change(screen.getByLabelText(/Application number/), { target: { value: number } });
  fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'EMA assigned it on validation' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
}

describe("a market's own application number on its row (P-44)", () => {
  it("says an added market's packages are refused until its number is recorded, and records it with a reason", async () => {
    const onChanged = vi.fn();
    render(<MarketApplicationNumber submissionId={2} onChanged={onChanged} />);
    expect((await screen.findByTestId('pj-market-number')).textContent).toMatch(
      /No application number is recorded for the EU market, so its packages are refused until one is\. The project's number \(FDA\) is not used here\./);
    await recordNumber('EMEA-H-C-005124');
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submissions/2/application-number',
      { applicationNumber: 'EMEA-H-C-005124', reason: 'EMA assigned it on validation' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Application number recorded, with your reason/);
    await waitFor(() => expect(screen.getByTestId('pj-market-number').textContent).toMatch(/Application number \(EU market\): EMEA-H-C-005124/));
    // What depends on the number (the market's verdict) is read again.
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('says what recording does before it is done, and who recorded the number, when and why', async () => {
    stored = 'EMEA-H-C-005124';
    read = { ...read, lastRecorded: { by: 'Robin Lead', at: '2026-10-22T10:00:00.000Z', reason: 'EMA assigned it on validation' } };
    render(<MarketApplicationNumber submissionId={2} />);
    expect((await screen.findByTestId('pj-market-number')).textContent).toMatch(/Recorded by Robin Lead on .*2026: EMA assigned it on validation\./);
    fireEvent.click(screen.getByRole('button', { name: 'Change the number' }));
    expect(screen.getByRole('dialog').textContent).toMatch(/A sequence already signed for release reads unsigned until it is signed again over the new number/);
    expect(screen.getByRole('dialog').textContent).toMatch(/in at least 8 characters/);
  });

  it('an unchanged number is said to be no change, and nothing is re-read', async () => {
    stored = 'EMEA-H-C-005124';
    const onChanged = vi.fn();
    render(<MarketApplicationNumber submissionId={2} onChanged={onChanged} />);
    await recordNumber('EMEA-H-C-005124', 'Change the number');
    expect((await screen.findByRole('status')).textContent).toMatch(/No change: that is already the recorded number\. Nothing was written\./);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in its words, inside the form, which keeps what was typed", async () => {
    render(<MarketApplicationNumber submissionId={2} />);
    await recordNumber('EMEA/H/C/005124');
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toMatch(/Not recorded: That is not a usable application number: a slash is not accepted yet/));
    expect((screen.getByLabelText(/Application number/) as HTMLInputElement).value).toBe('EMEA/H/C/005124');
  });

  it('draws nothing for the home market, whose number is the project\'s', async () => {
    read = { submissionId: 2, home: true, market: null, homeAgency: 'FDA' };
    stored = '214321';
    const { container } = render(<MarketApplicationNumber submissionId={2} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });

  it('offers no change to someone who may not change the project, and says who can', async () => {
    render(<MarketApplicationNumber submissionId={2} canChange={false} />);
    expect((await screen.findByTestId('pj-market-number')).textContent).toMatch(/Only this project's lead or an organization manager can record it\./);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a read that failed says so', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
    render(<MarketApplicationNumber submissionId={2} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/);
  });
});
