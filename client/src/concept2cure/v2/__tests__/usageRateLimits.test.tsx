// @vitest-environment jsdom
/**
 * The usage screen's rate limits are the limits the product enforces, read
 * from GET /api/billing/rate-limits (D2, fold billing Part 2; decision P-68;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * The "Rate limits by tier" tab rendered a client copy (USAGE_RATE_LIMITS) of a
 * server grid nothing enforced, and highlighted the organisation's tier in it,
 * so a customer read 60 requests a minute on Standard and 500 on Enterprise,
 * neither of which any limiter applies. The tab now shows what the route says
 * the platform applies (server/config/platform-limits.ts), the same for every
 * subscription, with no per-tier comparison; a tier that is not recorded is
 * said to be not recorded; a failed or malformed read is an error with Try
 * again, never an empty table.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  published: {} as Record<string, { summary: string; facts: Record<string, unknown> } | null>,
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: h.apiRequest,
}));
vi.mock('../surfaceContext', async (original) => ({
  ...(await original<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (id: string, ctx: { summary: string; facts: Record<string, unknown> } | null) => {
    h.published[id] = ctx;
  },
}));

import { UsageBilling } from '../surfaces/UsageBilling';

const LIMITS = {
  tier: 'professional',
  tierRecorded: true,
  sameForEverySubscription: true,
  limits: [
    { category: 'api', label: 'General requests', windowSeconds: 60, perSignedInUser: 600, perAddress: 100, exemptRoles: [] },
    { category: 'ai', label: 'AI requests', windowSeconds: 60, perSignedInUser: 30, perAddress: 30, exemptRoles: ['admin', 'super_admin'] },
    { category: 'upload', label: 'File uploads', windowSeconds: 60, perSignedInUser: 60, perAddress: 10, exemptRoles: [] },
  ],
  sharedRouteLimits: {
    appliesTo: ['Submission Center', 'eTMF'],
    limits: [{ category: 'api', label: 'General requests', windowSeconds: 60, perSignedInUser: 600, perAddress: 60, exemptRoles: [] }],
  },
};
const SNAPSHOT = { plan: 'professional', planLabel: 'Professional', weekly: [], lastUpdated: null };

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'down' }) }) as Response;

function serve(rateLimits: () => Response | Promise<Response>) {
  h.apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/billing/usage/limits') return ok(SNAPSHOT);
    if (method === 'GET' && url === '/api/billing/rate-limits') return rateLimits();
    throw new Error(`unexpected ${method} ${url}`);
  });
}
const reads = () => h.apiRequest.mock.calls.filter(([, url]) => url === '/api/billing/rate-limits');

async function openLimits() {
  render(<UsageBilling surface={{ id: 'usage', label: 'Usage & limits' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Rate limits' }));
}

afterEach(() => {
  cleanup();
  h.apiRequest.mockReset();
  h.published = {};
});

describe('Rate limits on the usage screen', () => {
  it('shows the enforced limits from the route, the same for every subscription, with no tier comparison', async () => {
    serve(() => ok(LIMITS));
    await openLimits();
    const table = await screen.findByRole('table', { name: 'Rate limits' });
    const rows = within(table).getAllByRole('row').slice(1)
      .map((r) => within(r).getAllByRole('cell').map((c) => (c.textContent ?? '').trim()).join(' '));
    expect(rows).toEqual([
      'General requests 600 100 1 min',
      'AI requests 30 30 1 min',
      'File uploads 60 10 1 min',
    ]);
    expect(screen.getByText(/the same for every subscription, including your organization’s \(professional\)/)).toBeTruthy();
    expect(screen.getByText(/Administrators are not limited on AI requests/)).toBeTruthy();
    expect(screen.getByText(/Submission Center and eTMF also count/)).toBeTruthy();
    // No per-tier grid, no tier chips.
    expect(document.body.textContent).not.toMatch(/Rate limits by tier|Req \/ day|Tokens \/ min/);
    for (const tier of ['free', 'standard', 'enterprise']) expect(screen.queryByText(tier)).toBeNull();
    expect(reads()).toHaveLength(1);
  });

  it('says the tier is not recorded rather than naming one', async () => {
    serve(() => ok({ ...LIMITS, tier: null, tierRecorded: false }));
    await openLimits();
    expect(await screen.findByText(/Your organization’s subscription tier is not recorded/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/including your organization’s \(/);
  });

  it('a failed read is an error with Try again, never an empty table, and the retry reads again', async () => {
    let n = 0;
    serve(() => (++n === 1 ? fail(500) : ok(LIMITS)));
    await openLimits();
    expect(await screen.findByText("Couldn't load rate limits")).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Rate limits' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Rate limits' })).toBeTruthy();
    expect(reads()).toHaveLength(2);
  });

  it.each([
    ['a bare array', []],
    ['no limits list', { tier: 'free', tierRecorded: true, sameForEverySubscription: true }],
    // Every other field valid: only the numbers are missing or not numbers.
    ['a row without numbers', { ...LIMITS, limits: [{ category: 'api', label: 'General requests', exemptRoles: [] }] }],
    ['a row whose ceiling is not a number', { ...LIMITS, limits: [{ ...LIMITS.limits[0], perSignedInUser: 'many' }] }],
    ['no second-limiter record', { ...LIMITS, sharedRouteLimits: undefined }],
  ])('a body that is not the enforced limits (%s) is an error', async (_label, body) => {
    serve(() => ok(body));
    await openLimits();
    expect(await screen.findByText("Couldn't load rate limits")).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Rate limits' })).toBeNull();
  });

  it('AnA reads the same limits, and a failure as a failure', async () => {
    serve(() => ok(LIMITS));
    await openLimits();
    await screen.findByRole('table', { name: 'Rate limits' });
    await waitFor(() => expect(h.published.usage?.facts.rateLimits).toBeTruthy());
    expect(h.published.usage?.facts.rateLimits).toMatchObject({
      sameForEverySubscription: true,
      tier: 'professional',
      tierRecorded: true,
      limits: [{ label: 'General requests', perSignedInUser: 600, perAddress: 100, windowSeconds: 60 }, expect.anything(), expect.anything()],
    });
    cleanup();
    h.published = {};
    serve(() => fail(500));
    await openLimits();
    await screen.findByText("Couldn't load rate limits");
    await waitFor(() => expect(h.published.usage?.facts.rateLimitsUnavailable).toBe('the rate-limit read failed'));
    expect(h.published.usage?.facts.rateLimits).toBeNull();
  });
});
