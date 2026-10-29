// @vitest-environment jsdom
/**
 * Usage & billing — the controls that did nothing, or claimed too much.
 *
 * "Buy more", "Manage" (auto-reload) and "Copy link" (referral) all rendered as
 * real, enabled, focusable buttons with no `onClick` between them. The referral
 * card was deleted because it advertised a programme the product cannot honour.
 *
 * "Buy more" and auto-reload were then wired to real endpoints — but they sat on
 * a credit balance nothing ever draws down (credit-ledger.ts `debitCredits` has
 * no caller). Selling top-ups of a balance that use never spends is the larger
 * defect, so the balance, "Buy more" and auto-reload are no longer shown
 * (settings/integrity audit 2026-10-17, finding 4). The Stripe portal stays
 * reachable from Plans & licensing ("Manage billing").
 *
 * The Billing tab these cases opened is gone: its invoice list moved to
 * Licensing, for billing administrators (fold billing into Licensing,
 * 2026-10-29; licensingInvoices.test.tsx). The cases still hold, on every tab
 * the screen has left.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest, redactInternals: (x: unknown) => x, serverMessage: (b: unknown) => (b as { error?: string } | null)?.error ?? null }));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 't', getJwtOrgId: () => 1 }));
vi.mock('../surfaceContext', () => ({ usePublishSurfaceContext: () => {} }));
import { UsageBilling } from '../surfaces/UsageBilling';
const credits = {
  balanceCents: 4200, ledger: [],
  autoReload: { enabled: false, requestedEnabled: false, available: false, thresholdCents: 1000, topupCents: 5000 },
  capabilities: { balanceMode: 'administrative_allocation', purchase: { available: false }, autoReload: { available: false }, usageDebit: { available: false } },
};
const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b } as Response);
function route(reloadRequested = false, portal: unknown = { portalUrl: 'https://billing.stripe.test/s/1' }) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/billing/credits') return ok({ ...credits, autoReload: { ...credits.autoReload, requestedEnabled: reloadRequested } });
    if (method === 'GET') return ok({});
    if (method === 'POST' && url === '/api/billing/portal') return ok(portal);
    if (method === 'PUT' && url === '/api/billing/credits/auto-reload') return ok({ autoReload: { ...credits.autoReload }, auditTrail: { persisted: true, chained: true } });
    throw new Error(`unexpected ${method} ${url}`);
  });
}
const props = { surface: { id: 'usage' } as never, onAsk: () => {}, onNav: () => {}, segment: 'biopharma' };
beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const TABS = ['Usage', 'Rate limits'];

/** Mounts the screen and visits each tab, returning the text every tab showed. */
async function mount(): Promise<string> {
  /* `{...(props as never)}` typechecked as a spread of `never`, which TS
     rejects outright (TS2698). `props` is already shaped to the surface's
     contract above, so it spreads as itself. */
  render(<UsageBilling {...props} />);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/billing/usage/limits'));
  let seen = '';
  for (const name of TABS) {
    const tab = screen.getAllByRole('button').find((b) => (b.textContent ?? '').trim() === name);
    expect(tab, `the ${name} tab must exist`).toBeTruthy();
    fireEvent.click(tab as HTMLButtonElement);
    seen += document.body.textContent ?? '';
  }
  return seen;
}

describe('credits are not presented as metered', () => {
  it('no balance, no Buy more, no auto-reload control, and no credits read', async () => {
    route();
    const seen = await mount();
    expect(screen.queryByRole('button', { name: /buy more/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /turn on|turn off/i })).toBeNull();
    expect(seen).not.toMatch(/\$42\.00|Current balance|Auto-reload/i);
    expect(apiRequest).not.toHaveBeenCalledWith('GET', '/api/billing/credits');
  });

  it('makes no price claim it cannot honour', async () => {
    route();
    expect(await mount()).not.toMatch(/30% off/i);
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
    const seen = await mount();
    expect(seen).not.toMatch(/\$10 in usage credits/i);
    expect(seen).not.toMatch(/Give AnA, get more AnA/i);
    expect(screen.queryByRole('button', { name: /copy link/i })).toBeNull();
  });
});
