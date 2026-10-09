// @vitest-environment jsdom
/**
 * AnA Command — the portfolio rollup says what the server answered (launch
 * sweep findings 42, 6 and 9).
 *
 * An empty organisation was rendered as "Couldn't load the portfolio rollup —
 * the org-wide rollup didn't respond … sign in and retry, or check your plan"
 * to a signed-in, entitled admin, because the route answered zero programs
 * with a 404. The route now answers `200 { data: null }` (pinned in
 * server/routes/__tests__/report-os-portfolio-empty.test.ts); this file pins
 * that the surface renders each outcome as itself, and that the role lens is
 * not offered with nothing to filter.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { AnaCommand } from '../surfaces/AnaCommand';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const PORTFOLIO = '/api/report-os/portfolio/org';
const BLAMES_SIGN_IN_OR_PLAN = /didn.t respond|sign in and retry|check your plan/i;
let portfolio: () => unknown;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === PORTFOLIO) return portfolio();
    return ok({});
  });
});
afterEach(() => cleanup());

const mount = () => render(<AnaCommand surface={'ana-command' as never} onAsk={() => {}} onNav={() => {}} segment="" />);

describe('an organisation with no programs', () => {
  it('is the empty state, not a failed read that blames sign-in or plan', async () => {
    portfolio = () => ok({ data: null });
    mount();
    expect(await screen.findByText('No programs in this organization yet')).toBeTruthy();
    expect(screen.queryByText("Couldn't load the portfolio rollup")).toBeNull();
    expect(screen.queryByText(BLAMES_SIGN_IN_OR_PLAN)).toBeNull();
  });

  it('offers no role lens, which would filter nothing', async () => {
    portfolio = () => ok({ data: null });
    mount();
    await screen.findByText('No programs in this organization yet');
    expect(screen.queryByText('Lens')).toBeNull();
  });
});

describe('a read that did not succeed says what the server answered', () => {
  it('shows the plan gate in its own words, with no retry', async () => {
    portfolio = () => { throw new ApiRequestError('Portfolio rollup requires the enterprise plan.', 403); };
    mount();
    expect(await screen.findByText('Portfolio rollup requires the enterprise plan.')).toBeTruthy();
    expect(screen.queryByText(/didn.t respond/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /retry|try again/i })).toBeNull();
  });

  it('shows a server failure as a failure with a retry, not as sign-in or plan', async () => {
    let calls = 0;
    portfolio = () => { calls += 1; throw new ApiRequestError('Internal error', 500); };
    mount();
    expect(await screen.findByText(/not an empty portfolio/i)).toBeTruthy();
    expect(screen.queryByText(BLAMES_SIGN_IN_OR_PLAN)).toBeNull();
    const before = calls;
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });
});

describe('an organisation with programs', () => {
  it('still offers the role lens', async () => {
    portfolio = () => ok({ data: { attentionRanked: [{ projectId: 7, code: 'PRG-7' }] } });
    mount();
    expect(await screen.findByText('Lens')).toBeTruthy();
  });
});
