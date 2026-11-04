// @vitest-environment jsdom
/** Native React/useLiveData coverage; only auth identity and HTTP are synthetic. */
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  user: { id: 5, organizationId: 7 } as { id: number; organizationId: number } | null,
  apiRequest: vi.fn(),
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: h.apiRequest,
}));
vi.mock('../shellProject', () => ({ useShellProject: () => null }));
import { NavEntitlementsProvider, useNavEntitlements } from '../navEntitlements';
const payload = (organizationId = 7, platformAdmin = true) => ({ organizationId,
  tier: 'enterprise', industryMode: 'cro', resolved: true, masterAdmin: false, platformAdmin,
  launchScope: { enforced: true },
  surfaces: [{ id: 'cmc', label: 'CMC', entitled: true, source: 'included', requiredTier: 'professional' }],
});
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
function Probe() {
  const value = useNavEntitlements();
  return <output data-testid="verdict">{JSON.stringify({ resolved: value.resolved,
    admin: value.platformAdmin, owner: value.masterAdmin, tier: value.tier,
    cmc: value.verdictFor('cmc')?.entitled ?? null })}</output>;
}
const view = () => <NavEntitlementsProvider><Probe /></NavEntitlementsProvider>;
const current = () => JSON.parse(screen.getByTestId('verdict').textContent!);
beforeEach(() => { h.user = { id: 5, organizationId: 7 }; h.apiRequest.mockReset(); });
afterEach(cleanup);

it('clears earlier-organization indicators on the first new render while its read is pending', async () => {
  const next = deferred();
  h.apiRequest.mockResolvedValueOnce(response(payload())).mockImplementation(() => next.promise);
  const mounted = render(view());
  await waitFor(() => expect(current().admin).toBe(true));
  h.user = { id: 5, organizationId: 8 }; mounted.rerender(view());
  expect(current()).toMatchObject({ resolved: false, admin: false, owner: false, tier: null, cmc: null });
  await act(async () => { next.resolve(response(payload(8, false))); await next.promise; });
  await waitFor(() => expect(current()).toMatchObject({ resolved: true, admin: false, cmc: true }));
  expect(h.apiRequest).toHaveBeenCalledTimes(2);
});
it('clears administration when another user enters the same organization', async () => {
  const next = deferred();
  h.apiRequest.mockResolvedValueOnce(response(payload())).mockImplementation(() => next.promise);
  const mounted = render(view()); await waitFor(() => expect(current().admin).toBe(true));
  h.user = { id: 6, organizationId: 7 }; mounted.rerender(view());
  expect(current().admin).toBe(false); expect(current().resolved).toBe(false);
  await act(async () => { next.resolve(response(payload(7, false))); await next.promise; });
  await waitFor(() => expect(current()).toMatchObject({ resolved: true, admin: false }));
});
it('discards an earlier HTTP completion after an account switch', async () => {
  const old = deferred(), next = deferred();
  h.apiRequest.mockImplementationOnce(() => old.promise).mockImplementation(() => next.promise);
  const mounted = render(view()); await waitFor(() => expect(h.apiRequest).toHaveBeenCalledTimes(1));
  h.user = { id: 6, organizationId: 8 }; mounted.rerender(view());
  await act(async () => { old.resolve(response(payload())); await old.promise; });
  expect(current()).toMatchObject({ resolved: false, admin: false });
  await act(async () => { next.resolve(response(payload(8, false))); await next.promise; });
  await waitFor(() => expect(current()).toMatchObject({ resolved: true, admin: false }));
});
it('never revives the first read on an A to B to A visit', async () => {
  const first = deferred(), second = deferred(), third = deferred();
  const accountA = h.user;
  h.apiRequest.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    .mockImplementation(() => third.promise);
  const mounted = render(view());
  h.user = { id: 6, organizationId: 8 }; mounted.rerender(view());
  h.user = accountA; mounted.rerender(view());
  await act(async () => { first.resolve(response(payload())); await first.promise; });
  expect(current().resolved).toBe(false);
  await act(async () => { third.resolve(response(payload(7, false))); await third.promise; });
  await waitFor(() => expect(current()).toMatchObject({ resolved: true, admin: false }));
  expect(h.apiRequest).toHaveBeenCalledTimes(3);
});
it('removes all prior indicators on logout and performs no signed-out fetch', async () => {
  h.apiRequest.mockResolvedValue(response(payload()));
  const mounted = render(view()); await waitFor(() => expect(current().admin).toBe(true));
  h.user = null; mounted.rerender(view());
  expect(current()).toMatchObject({ resolved: false, admin: false, owner: false, tier: null, cmc: null });
  expect(h.apiRequest).toHaveBeenCalledTimes(1);
});
it('does not publish a valid-looking response for another organization', async () => {
  h.apiRequest.mockResolvedValue(response(payload(8)));
  render(view());
  await act(async () => { await new Promise(done => setTimeout(done, 0)); });
  expect(current()).toMatchObject({ resolved: false, admin: false, tier: null, cmc: null });
});
