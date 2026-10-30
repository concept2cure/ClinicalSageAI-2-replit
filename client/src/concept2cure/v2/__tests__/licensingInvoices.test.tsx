// @vitest-environment jsdom
/**
 * Invoices on Licensing (D2, fold billing into Licensing, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * The invoice list was the Billing tab of UsageBilling.tsx, shown to every
 * member. It now sits on Licensing under the plan status, for billing
 * administrators, and the route refuses anyone else
 * (server/routes/__tests__/billing-invoices-admin-gate.test.ts).
 *
 * The cases from usageBillingLive.test.tsx's invoice block are carried here
 * (mapped rows, a View link only where Stripe gave one, an honest empty, a
 * failed read never shown as "no invoices"), with what the move adds:
 *  - a member is told who sees invoices and no request is made;
 *  - a 403 is a refusal, not a failure;
 *  - no Stripe customer reads "Billing is not set up", never "No invoices yet";
 *  - a failed read offers Try again;
 *  - each page says which invoices are on screen and whether older ones are not;
 *  - AnA reads the same facts, in every one of those states.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  user: { permissions: ['governed:write', 'billing:admin'] } as { permissions?: string[] } | null,
  published: {} as Record<string, { summary: string; facts: Record<string, unknown> } | null>,
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: h.apiRequest,
}));
vi.mock('@/services/portal/authService', async (original) => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => h.user,
}));
vi.mock('../surfaceContext', async (original) => ({
  ...(await original<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (id: string, ctx: { summary: string; facts: Record<string, unknown> } | null) => {
    h.published[id] = ctx;
  },
}));

import { LicensingSurface } from '../surfaces/LicensingSurface';

const STATUS = { tier: 'professional', paymentStatus: 'active', billingCycle: 'annual', seats: 5, currentPeriodEnd: null };
const FIRST = '/api/billing/invoices?limit=10';

function invoice(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `in_${n}`, number: `INV-${String(n).padStart(4, '0')}`, date: '2026-07-01T10:00:00.000Z',
    amount: 42.5, amountPaid: 42.5, status: 'paid', pdfUrl: null,
    hostedUrl: `https://stripe.example/inv_${n}`, currency: 'usd', periodStart: null, periodEnd: null,
    ...over,
  };
}

const TWO = {
  billingSetUp: true,
  hasMore: false,
  nextCursor: null,
  invoices: [
    invoice(42),
    invoice(41, { date: '2026-06-01T10:00:00.000Z', amount: 19, amountPaid: 0, status: 'open', hostedUrl: null }),
  ],
};

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'refused' }) }) as Response;

function serve(invoices: Record<string, () => Response | Promise<Response>>) {
  h.apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/billing/status') return ok(STATUS);
    if (method === 'GET' && url in invoices) return invoices[url]();
    throw new Error(`unexpected ${method} ${url}`);
  });
}
const invoiceCalls = () => h.apiRequest.mock.calls.filter(([, url]) => String(url).startsWith('/api/billing/invoices'));

const mount = () =>
  render(<LicensingSurface surface={{ id: 'licensing', label: 'Compare subscriptions' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);

afterEach(() => {
  cleanup();
  h.apiRequest.mockReset();
  h.user = { permissions: ['governed:write', 'billing:admin'] };
  h.published = {};
});

const facts = () => h.published.licensing?.facts ?? {};

describe('a billing administrator', () => {
  it('reads the first page under the plan status: mapped rows, a View link only where Stripe gave one', async () => {
    serve({ [FIRST]: () => ok(TWO) });
    const { container } = mount();
    expect(await screen.findByText('Jul 1, 2026')).toBeTruthy();
    expect(screen.getByText('$42.50')).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    const views = screen.getAllByText('View');
    expect(views).toHaveLength(1);
    expect(views[0].getAttribute('href')).toBe('https://stripe.example/inv_42');
    expect(invoiceCalls().map(([, url]) => url)).toEqual([FIRST]);

    // Under the plan status: the subscription card comes first.
    const text = container.textContent ?? '';
    expect(text.indexOf('Current subscription')).toBeGreaterThan(-1);
    expect(text.indexOf('Current subscription')).toBeLessThan(text.indexOf('Invoices'));
    expect(screen.getByText('Showing invoices 1 to 2 of 2. There are no older invoices.')).toBeTruthy();
  });

  it('says billing is not set up when there is no Stripe customer — never "No invoices yet"', async () => {
    serve({ [FIRST]: () => ok({ billingSetUp: false, invoices: [], hasMore: false, nextCursor: null }) });
    mount();
    expect(await screen.findByText('Billing is not set up')).toBeTruthy();
    expect(screen.queryByText('No invoices yet')).toBeNull();
    expect(screen.queryByText(/Showing invoice/)).toBeNull();
  });

  it('says "No invoices yet" when billing is set up and Stripe has issued none', async () => {
    serve({ [FIRST]: () => ok({ billingSetUp: true, invoices: [], hasMore: false, nextCursor: null }) });
    mount();
    expect(await screen.findByText('No invoices yet')).toBeTruthy();
    expect(screen.queryByText('Billing is not set up')).toBeNull();
  });

  it('a failed read is an error with Try again, never an empty list, and the retry reads again', async () => {
    let calls = 0;
    serve({ [FIRST]: () => (++calls === 1 ? fail(500) : ok(TWO)) });
    mount();
    expect(await screen.findByText("Couldn't load invoices")).toBeTruthy();
    expect(screen.queryByText('No invoices yet')).toBeNull();
    expect(screen.queryByText('Billing is not set up')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Jul 1, 2026')).toBeTruthy();
    expect(invoiceCalls()).toHaveLength(2);
  });

  it('an unreachable service is an error, never an empty list', async () => {
    serve({ [FIRST]: () => Promise.reject(new Error('network down')) });
    mount();
    expect(await screen.findByText("Couldn't load invoices")).toBeTruthy();
    expect(screen.queryByText('No invoices yet')).toBeNull();
  });

  it.each([
    ['a bare array', []],
    ['a non-array list', { billingSetUp: true, invoices: 'nope', hasMore: false, nextCursor: null }],
    // Every other key valid: only the verdict that separates "not set up" from "none yet" is missing.
    ['no billingSetUp verdict', { invoices: [], hasMore: false, nextCursor: null }],
    ['no cursor field', { billingSetUp: true, invoices: [], hasMore: false }],
    ['null rows', { billingSetUp: true, invoices: [null], hasMore: false, nextCursor: null }],
  ])('a body that is not an invoice page (%s) is an error, not "no invoices"', async (_label, body) => {
    serve({ [FIRST]: () => ok(body) });
    mount();
    expect(await screen.findByText("Couldn't load invoices")).toBeTruthy();
    expect(screen.queryByText('No invoices yet')).toBeNull();
    expect(screen.queryByText('Billing is not set up')).toBeNull();
  });

  it('a 403 is a refusal for the role, not a failure', async () => {
    serve({ [FIRST]: () => fail(403) });
    mount();
    expect(await screen.findByText('Invoices are for billing administrators')).toBeTruthy();
    expect(screen.queryByText("Couldn't load invoices")).toBeNull();
    expect(screen.queryByText('No invoices yet')).toBeNull();
  });

  it('pages by Stripe cursor and says which invoices are on screen', async () => {
    const first = { billingSetUp: true, hasMore: true, nextCursor: 'in_31', invoices: Array.from({ length: 10 }, (_, i) => invoice(40 - i)) };
    const second = { billingSetUp: true, hasMore: false, nextCursor: null, invoices: [invoice(30), invoice(29), invoice(28)] };
    const SECOND = `${FIRST}&startingAfter=in_31`;
    serve({ [FIRST]: () => ok(first), [SECOND]: () => ok(second) });
    mount();
    expect(await screen.findByText('Showing invoices 1 to 10. Older invoices are on the next page.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Newer' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(await screen.findByText('Showing invoices 11 to 13 of 13. There are no older invoices.')).toBeTruthy();
    expect(screen.getAllByText('View')).toHaveLength(3);
    expect((screen.getByRole('button', { name: 'Older' }) as HTMLButtonElement).disabled).toBe(true);
    expect(invoiceCalls().map(([, url]) => url)).toEqual([FIRST, SECOND]);

    fireEvent.click(screen.getByRole('button', { name: 'Newer' }));
    expect(await screen.findByText('Showing invoices 1 to 10. Older invoices are on the next page.')).toBeTruthy();
    expect(invoiceCalls().map(([, url]) => url)).toEqual([FIRST, SECOND, FIRST]);
  });
});

describe('a member', () => {
  it('is told who sees invoices, and no invoice request is made', async () => {
    h.user = { permissions: ['governed:write'] };
    serve({});
    mount();
    expect(await screen.findByText(/Invoices and subscription changes are for billing administrators/)).toBeTruthy();
    await waitFor(() => expect(h.apiRequest).toHaveBeenCalledWith('GET', '/api/billing/status'));
    expect(invoiceCalls()).toHaveLength(0);
    expect(screen.queryByText("Couldn't load invoices")).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('what AnA reads on Licensing', () => {
  it('the page on screen, row by row', async () => {
    serve({ [FIRST]: () => ok(TWO) });
    mount();
    await screen.findByText('Jul 1, 2026');
    await waitFor(() => expect(facts().invoices).toBeTruthy());
    expect(facts().invoices).toEqual({
      billingSetUp: true,
      first: 1,
      last: 2,
      hasMore: false,
      rows: [
        { number: 'INV-0042', date: '2026-07-01T10:00:00.000Z', amount: 42.5, currency: 'usd', status: 'paid' },
        { number: 'INV-0041', date: '2026-06-01T10:00:00.000Z', amount: 19, currency: 'usd', status: 'open' },
      ],
    });
    expect(facts().invoicesUnavailable).toBeNull();
    expect(h.published.licensing?.summary).toMatch(/Invoices 1 to 2 are on screen/);
  });

  it('a failed read is said to be a failure, with no rows', async () => {
    serve({ [FIRST]: () => fail(500) });
    mount();
    await screen.findByText("Couldn't load invoices");
    await waitFor(() => expect(facts().invoicesUnavailable).toBe('the invoice read failed'));
    expect(facts().invoices).toBeNull();
    expect(h.published.licensing?.summary).toMatch(/not a finding that there are no invoices/);
  });

  it('billing not set up is its own fact', async () => {
    serve({ [FIRST]: () => ok({ billingSetUp: false, invoices: [], hasMore: false, nextCursor: null }) });
    mount();
    await screen.findByText('Billing is not set up');
    await waitFor(() => expect(facts().invoices).toEqual({ billingSetUp: false, rows: [] }));
    expect(h.published.licensing?.summary).toMatch(/Billing is not set up/);
  });

  it('for a member, says the list was not read and why', async () => {
    h.user = { permissions: [] };
    serve({});
    mount();
    await screen.findByText(/Invoices and subscription changes are for billing administrators/);
    await waitFor(() => expect(facts().invoicesUnavailable).toMatch(/not a billing administrator/));
    expect(facts().invoices).toBeNull();
  });
});
