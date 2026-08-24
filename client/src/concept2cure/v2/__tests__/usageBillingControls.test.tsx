// @vitest-environment jsdom
/**
 * Usage & billing — the three controls that did nothing.
 *
 * "Buy more", "Manage" (auto-reload) and "Copy link" (referral) all rendered as
 * real, enabled, focusable buttons with no `onClick` between them. Two are now
 * wired to the endpoints that already existed; the third was deleted, because
 * it advertised a referral programme the product cannot honour.
 *
 * "Buy more" is the one that costs money. A customer out of credits presses it
 * and, until now, nothing happened — no navigation, no error, no sign the click
 * registered. That is the failure this file exists to keep closed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  redactInternals: (x: unknown) => x,
  serverMessage: (b: unknown) => (b as { error?: string } | null)?.error ?? null,
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 't', getJwtOrgId: () => 1 }));
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: () => {} }));

import { UsageBilling } from '../surfaces/UsageBilling';

const CREDITS = {
  balanceCents: 4200,
  ledger: [],
  autoReload: { enabled: false, thresholdCents: 1000, topupCents: 5000 },
};

const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b } as unknown as Response);
function apiError(status: number, body: unknown) {
  const e = new Error((body as { error?: string })?.error ?? `HTTP ${status}`) as Error & {
    name: string; status: number; payload: unknown;
  };
  e.name = 'ApiRequestError'; e.status = status; e.payload = body;
  return e;
}

function route(over: Partial<Record<string, (body?: unknown) => Promise<Response>>> = {}) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const key = `${method} ${url}`;
    if (over[key]) return over[key]!(body);
    if (method === 'GET' && url === '/api/billing/credits') return ok(CREDITS);
    if (method === 'GET') return ok({});
    throw apiError(404, { error: `unrouted ${key}` });
  });
}

const props = { surface: { id: 'usage' } as never, onAsk: () => {}, onNav: () => {}, segment: 'biopharma' };

beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

/** Credits and auto-reload live on the Billing tab, not the default one. */
async function mount() {
  render(<UsageBilling {...(props as never)} />);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/billing/credits'));
  const billingTab = screen
    .getAllByRole('button')
    .find((b) => /^billing$/i.test((b.textContent ?? '').trim()));
  expect(billingTab, 'the Billing tab must exist').toBeTruthy();
  fireEvent.click(billingTab as HTMLButtonElement);
}

describe('Buy more', () => {
  it('opens the real Stripe portal', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    route({ 'POST /api/billing/portal': async () => ok({ portalUrl: 'https://billing.stripe.test/s/1' }) });
    await mount();

    const btn = await screen.findByRole('button', { name: /buy more/i });
    fireEvent.click(btn);

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('POST', '/api/billing/portal', expect.anything()),
    );
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith('https://billing.stripe.test/s/1', '_blank', 'noopener'),
    );
    open.mockRestore();
  });

  it('says so when no portal link comes back, rather than doing nothing', async () => {
    // Silently doing nothing while looking successful is the same defect this
    // fixes, just wearing a handler.
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    route({ 'POST /api/billing/portal': async () => ok({}) });
    await mount();
    fireEvent.click(await screen.findByRole('button', { name: /buy more/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/did not return a link|Could not open/i));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('surfaces the server refusal', async () => {
    route({ 'POST /api/billing/portal': async () => { throw apiError(403, { error: 'Billing access is restricted.' }); } });
    await mount();
    fireEvent.click(await screen.findByRole('button', { name: /buy more/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Billing access is restricted/));
  });

  it('makes no price claim it cannot honour', async () => {
    // The button carried "Up to 30% off". Nothing computes or applies a
    // discount — no volume tier, no coupon, no promotion code reaches Stripe.
    route();
    await mount();
    expect(document.body.textContent).not.toMatch(/30% off/i);
  });
});

describe('auto-reload', () => {
  it('requires a reason before it writes, then sends it', async () => {
    const put = vi.fn(async () => ok({ autoReload: { enabled: true, thresholdCents: 1000, topupCents: 5000 } }));
    route({ 'PUT /api/billing/credits/auto-reload': put });
    await mount();

    const btn = await screen.findByRole('button', { name: /turn on|turn off/i });
    fireEvent.click(btn);

    const dialog = await screen.findByRole('dialog');
    // Nothing written yet.
    expect(apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'PUT')).toHaveLength(0);

    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'enabling top-up for Q3' } });
    fireEvent.change(dialog.querySelector('input[type="text"]')!, { target: { value: 'yes' } });
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find((b) => /confirm|apply|save|continue/i.test(b.textContent ?? ''))!,
    );

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c: unknown[]) => c[0] === 'PUT');
      expect(call, 'the write must reach the server').toBeTruthy();
      expect((call![2] as { reason: string }).reason).toBe('enabling top-up for Q3');
    });
  });

  it('reports the refusal a non-admin gets', async () => {
    // The endpoint is admin/owner only, so 403 is the common real case.
    route({
      'PUT /api/billing/credits/auto-reload': async () => { throw apiError(403, { error: 'Admin access required' }); },
    });
    await mount();
    fireEvent.click(await screen.findByRole('button', { name: /turn on|turn off/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'attempting change' } });
    fireEvent.change(dialog.querySelector('input[type="text"]')!, { target: { value: 'yes' } });
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find((b) => /confirm|apply|save|continue/i.test(b.textContent ?? ''))!,
    );
    await waitFor(() => expect(document.body.textContent).toMatch(/Admin access required/));
  });
});

describe('the referral offer', () => {
  it('is gone — the product cannot pay it', async () => {
    /* It promised "you both get $10 in usage credits". There is no invite
       issuance, no referral code, no signup attribution, and no path that could
       credit either account: POST /credits/adjust is platform-admin only
       precisely because ledger credits move money-equivalent value. An offer of
       $10 the product cannot honour is a commitment, not a dead button. */
    route();
    await mount();
    expect(document.body.textContent).not.toMatch(/\$10 in usage credits/i);
    expect(document.body.textContent).not.toMatch(/Give AnA, get more AnA/i);
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();
  });
});
