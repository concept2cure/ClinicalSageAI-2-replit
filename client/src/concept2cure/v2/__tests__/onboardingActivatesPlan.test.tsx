// @vitest-environment jsdom
/**
 * The last button in the onboarding wizard must DO the thing it names.
 *
 * ── The two defects ──────────────────────────────────────────────────────────
 * Onboarding.tsx:816 — "Request Enterprise onboarding". A prospect completed
 * six steps, pressed it, and no request of any kind was created or sent to
 * anyone: `checkoutRequestFor` returned `{ unavailable }` and activate() fell
 * through. The summary said "no plan was provisioned", which was true and
 * beside the point — nothing had been REQUESTED either. All the while
 * POST /api/auth/license-request (server/routes/auth.ts) was the real,
 * rate-limited, zod-validated intake that INSERTS a licence_requests row for
 * the team to work, and it had no caller anywhere in the client.
 *
 * Onboarding.tsx:819 — the free "Researcher" tier (LIC_DTC tier 'free',
 * trialDays 0, so the label reads "Activate workspace"). Pressing Activate
 * provisioned NO plan at all: the checkout path was skipped because there was
 * nothing to charge and nothing replaced it. The billing service had always
 * been able to provision it (createDTCCheckoutSession's free branch sets the
 * tier, invalidates the tenant posture, runs provisionModulesForTier); only the
 * route's request schema refused the word 'free'.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN in both cases — the request that leaves the browser and what the
 * activation summary then states — plus the two refusals that must stay honest:
 * an enterprise request with no address is NOT sent and says so, and a free
 * activation the server refuses is reported as no plan, never as success.
 *
 * `fetch` rather than `apiRequest` is mocked because this surface calls fetch
 * directly: `apiRequest` THROWS on every non-OK status, and activate() is built
 * to record a per-step outcome for each endpoint rather than abort at the first
 * refusal.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/* The signed-in user, for the billing-administration permission. Null (no
   provider) is "unknown", which offers checkout, as every case above assumes. */
const auth = vi.hoisted(() => ({ user: null as { permissions?: string[] } | null }));
vi.mock('@/services/portal/authService', async (original) => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => auth.user,
}));

import { Onboarding } from '../surfaces/Onboarding';
import type { SurfaceViewProps } from '../surfaceViews';
import { completeDiscovery } from './onboardingDiscoveryFixtures';

interface Sent { url: string; body: Record<string, unknown> }
let sent: Sent[];
let responder: (url: string) => { ok: boolean; status: number; body: unknown };
let assigned: string[];
let discoveryRevision: number;

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  sent.push({ url, body });
  if (url === '/api/onboarding/discovery' && init?.method === 'PATCH') discoveryRevision += 1;
  const r = url === '/api/onboarding/discovery' ? {
    ok: true, status: 200, body: { data: { canEdit: true, discovery: {
      schemaVersion: 1, revision: discoveryRevision, answers: completeDiscovery(),
      updatedAt: '2026-10-14T00:00:00.000Z', updatedBy: 1,
      completedAt: init?.method === 'PATCH' && body.complete ? '2026-10-14T00:00:00.000Z' : null,
    } } },
  } : responder(url);
  return Promise.resolve({
    ok: r.ok,
    status: r.status,
    json: async () => r.body,
  } as Response);
});

const PROPS = {
  surface: { id: 'onboarding', label: 'Onboarding' },
  segment: 'biotech',
  onAsk: () => {},
  onNav: () => {},
} as unknown as SurfaceViewProps;

beforeEach(() => {
  sent = [];
  discoveryRevision = 1;
  assigned = [];
  responder = () => ({ ok: true, status: 200, body: {} });
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  // jsdom's location.assign is unimplemented and throws; the wizard calls it
  // on a real checkout, and the free path must NOT reach it at all.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign: (u: string) => assigned.push(u) },
  });
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  auth.user = null;
});

/** Walk the wizard to the review step with `tierName` selected. */
async function toReview(tierName: string) {
  render(<Onboarding {...PROPS} />);
  fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Bright Biosciences' } });
  await waitFor(() => expect((screen.getByRole('button', { name: /^Continue/ }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ })); // client discovery
  fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }));
  await screen.findByTestId('discovery-project');
  fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }));
  await waitFor(() => expect(screen.queryByTestId('discovery-project')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ })); // plan
  const tile = Array.from(document.querySelectorAll('.ob-tier')).find((b) => b.textContent?.includes(tierName));
  if (!tile) throw new Error(`tier tile "${tierName}" not rendered`);
  fireEvent.click(tile);
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ })); // personnel
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ })); // modules
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ })); // security
  fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }));
  await screen.findByTestId('gateway-accounts-setting');
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ })); // review
}

const bodyFor = (path: string) => sent.find((s) => s.url === path)?.body;

describe('Onboarding — Request Enterprise onboarding', () => {
  it('files a real licence request carrying the contact and the configured plan', async () => {
    await toReview('Enterprise');
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Dana Ruiz' } });
    fireEvent.change(screen.getByLabelText('Contact email'), {
      target: { value: 'dana@bright.bio' },
    });
    fireEvent.click(screen.getByText(/Request Enterprise onboarding/));

    await waitFor(() => expect(bodyFor('/api/auth/license-request')).toBeTruthy());
    const req = bodyFor('/api/auth/license-request')!;
    expect(req.name).toBe('Dana Ruiz');
    expect(req.email).toBe('dana@bright.bio');
    expect(req.organization).toBe('Bright Biosciences');
    // The request our team reads must say what the prospect actually chose.
    expect(String(req.message)).toMatch(/Enterprise onboarding requested/);
    expect(String(req.message)).toMatch(/Plan: Enterprise \(enterprise tier\)/);

    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /Request recorded for dana@bright\.bio/,
      ),
    );
    // Still honest about the plan: an enterprise request is not a provisioned
    // plan, and the summary never conflates the two.
    expect(document.body.textContent).toMatch(/no plan was provisioned by this wizard/);
  });

  it('sends nothing — and says nothing was sent — when the intake refuses', async () => {
    responder = (url) =>
      url === '/api/auth/license-request'
        ? { ok: false, status: 429, body: {} }
        : { ok: true, status: 200, body: {} };
    await toReview('Enterprise');
    fireEvent.change(screen.getByLabelText('Contact email'), {
      target: { value: 'dana@bright.bio' },
    });
    fireEvent.click(screen.getByText(/Request Enterprise onboarding/));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/The request was NOT recorded/),
    );
    expect(document.body.textContent).toMatch(/too many requests from here in the last hour/);
  });

  it('cannot be fired at all without an address to reply to', async () => {
    await toReview('Enterprise');
    const btn = screen.getByText(/Request Enterprise onboarding/) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(sent.find((s) => s.url === '/api/auth/license-request')).toBeUndefined();
  });
});

describe('Onboarding — the free tier activates a plan', () => {
  it('provisions the free tier through the real checkout endpoint and does not redirect', async () => {
    responder = (url) =>
      url === '/api/billing/dtc-checkout'
        ? { ok: true, status: 200, body: { url: 'https://app.test/billing?checkout=success', sessionId: 'free' } }
        : { ok: true, status: 200, body: {} };
    await toReview('Researcher');
    expect(screen.getByText(/Activate workspace/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Activate workspace/));

    await waitFor(() => expect(bodyFor('/api/billing/dtc-checkout')).toBeTruthy());
    expect(bodyFor('/api/billing/dtc-checkout')).toEqual({ tier: 'free', billingCycle: 'annual' });

    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /Provisioned — the Researcher plan is active on this organization/,
      ),
    );
    // Nothing to pay means nothing to check out: following the service's
    // success URL would show a "checkout=success" screen for a checkout that
    // never happened.
    expect(assigned).toEqual([]);
  });

  it('reports no plan when the server refuses the free activation', async () => {
    responder = (url) =>
      url === '/api/billing/dtc-checkout'
        ? { ok: false, status: 409, body: { error: 'This organization is already on the professional plan.' } }
        : { ok: true, status: 200, body: {} };
    await toReview('Researcher');
    fireEvent.click(screen.getByText(/Activate workspace/));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /The billing service did not return a checkout link — no plan was provisioned/,
      ),
    );
    expect(assigned).toEqual([]);
  });
});

/* Part 1b of the billing fold (docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/):
   POST /api/billing/checkout and /dtc-checkout refuse anyone the billing guard
   does not admit. Activation already needs an administrator (its discovery save
   admits admin and owner); the wizard now also reads the session's billing:admin
   permission where the checkout is sent: without it, no checkout is sent and the
   summary says who chooses the subscription; a refusal (a stale session) says
   the same, never "did not return a checkout link". */
describe('Onboarding — choosing the subscription is for billing administrators', () => {
  it('a session without the billing permission sends no checkout, and the summary says who chooses', async () => {
    auth.user = { permissions: ['governed:write'] };
    await toReview('Researcher');
    fireEvent.click(screen.getByText(/Activate workspace/));
    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /Choosing the subscription is for billing administrators: your organization’s admins and owners\. No plan was provisioned\./,
      ),
    );
    expect(sent.filter((s) => /\/api\/billing\/(dtc-)?checkout$/.test(s.url))).toEqual([]);
    expect(assigned).toEqual([]);
  });

  it('a 403 from checkout is reported as the role answer, not as a missing link', async () => {
    auth.user = { permissions: ['governed:write', 'billing:admin'] };
    responder = (url) =>
      url === '/api/billing/dtc-checkout'
        ? { ok: false, status: 403, body: { error: { code: 'AUTH_004', message: 'Insufficient permissions' } } }
        : { ok: true, status: 200, body: {} };
    await toReview('Researcher');
    fireEvent.click(screen.getByText(/Activate workspace/));
    await waitFor(() => expect(bodyFor('/api/billing/dtc-checkout')).toBeTruthy());
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Choosing the subscription is for billing administrators/),
    );
    expect(document.body.textContent).not.toMatch(/did not return a checkout link/);
  });

  it('a failed checkout points to the screen that has checkout now, not "Usage & Billing"', async () => {
    responder = (url) =>
      url === '/api/billing/dtc-checkout'
        ? { ok: false, status: 409, body: { error: 'This organization is already on the professional plan.' } }
        : { ok: true, status: 200, body: {} };
    await toReview('Researcher');
    fireEvent.click(screen.getByText(/Activate workspace/));
    await waitFor(() => expect(document.body.textContent).toMatch(/no plan was provisioned\. Retry from Compare subscriptions\./));
    expect(document.body.textContent).not.toMatch(/Usage & Billing/);
  });
});
