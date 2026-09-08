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

import { Onboarding } from '../surfaces/Onboarding';
import type { SurfaceViewProps } from '../surfaceViews';

interface Sent { url: string; body: Record<string, unknown> }
let sent: Sent[];
let responder: (url: string) => { ok: boolean; status: number; body: unknown };
let assigned: string[];

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  sent.push({ url, body });
  const r = responder(url);
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
});

/** Walk the wizard to the review step with `tierName` selected. */
async function toReview(tierName: string) {
  render(<Onboarding {...PROPS} />);
  fireEvent.change(screen.getByLabelText('Organization name'), {
    target: { value: 'Bright Biosciences' },
  });
  fireEvent.click(screen.getByText(/Continue/));                  // → pricing model
  fireEvent.click(screen.getByText(/Continue/));                  // → choose plan
  const tile = Array.from(document.querySelectorAll('.ob-tier')).find((b) =>
    b.textContent?.includes(tierName),
  );
  if (!tile) throw new Error(`tier tile "${tierName}" not rendered`);
  fireEvent.click(tile);
  fireEvent.click(screen.getByText(/Continue/));                  // → invite personnel
  fireEvent.click(screen.getByText(/Continue/));                  // → modules
  fireEvent.click(screen.getByText(/Continue/));                  // → review & activate
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
