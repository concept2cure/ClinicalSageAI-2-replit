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
      stored = String(body?.applicationNumber);
      return ok({ changed: true });
    }
    return ok({});
  });
});
afterEach(cleanup);

async function recordNumber(number: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Record the number' }));
  fireEvent.change(screen.getByLabelText(/Application number/), { target: { value: number } });
  fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'EMA assigned it on validation' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
}

describe("a market's own application number on its row (P-44)", () => {
  it("says an added market's packages are refused until its number is recorded, and records it with a reason", async () => {
    render(<MarketApplicationNumber submissionId={2} />);
    expect((await screen.findByTestId('pj-market-number')).textContent).toMatch(
      /No application number is recorded for the EU market, so its packages are refused until one is\. The project's number \(FDA\) is not used here\./);
    await recordNumber('EMEA-H-C-005124');
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/submissions/2/application-number',
      { applicationNumber: 'EMEA-H-C-005124', reason: 'EMA assigned it on validation' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Application number recorded, with your reason/);
    await waitFor(() => expect(screen.getByTestId('pj-market-number').textContent).toMatch(/Application number \(EU market\): EMEA-H-C-005124/));
  });

  it("shows the server's refusal in its words", async () => {
    render(<MarketApplicationNumber submissionId={2} />);
    await recordNumber('EMEA/H/C/005124');
    expect((await screen.findByRole('alert')).textContent).toMatch(/not recorded: That is not a usable application number: a slash is not accepted yet/);
  });

  it('draws nothing for the home market, whose number is the project\'s', async () => {
    read = { submissionId: 2, home: true, market: null, homeAgency: 'FDA' };
    stored = '214321';
    const { container } = render(<MarketApplicationNumber submissionId={2} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });

  it('offers no change to someone who may not change the project', async () => {
    render(<MarketApplicationNumber submissionId={2} canChange={false} />);
    await screen.findByTestId('pj-market-number');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a read that failed says so', async () => {
    apiRequest.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
    render(<MarketApplicationNumber submissionId={2} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/);
  });
});
