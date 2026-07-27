// @vitest-environment jsdom
/**
 * Live price-book merge + first-run onboarding wizard wiring.
 *
 * livePricing: adopts the /api/billing price book over the curated fixtures —
 * locks the null→0 guard (a sales-led "Custom" tier must never render as $0
 * even though the serializer collapses null price cents to 0) and the
 * tier-key matching (unknown live rows ignored, unmatched fixtures keep their
 * curated price).
 *
 * OnboardingWizard: "Finish setup" performs the REAL calls — governed
 * PATCH /api/organizations/:id/profile and one POST /api/tenant-users per
 * teammate — and the Ready step reports what actually happened; "Enter
 * workspace" persists onboardingComplete to users.preferences.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { mergeB2bPricing, mergeDtcPricing } from '../livePricing';
import { LIC_DTC, LIC_PRICING } from '../fixtures/licensing';
import { OnboardingWizard } from '../surfaces/OnboardingWizard';

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  sessionStorage.clear();
  localStorage.clear();
});

describe('livePricing — price-book merge', () => {
  it('adopts live DTC prices by tier key but never turns a Custom tier into $0', () => {
    const merged = mergeDtcPricing(LIC_DTC, {
      tiers: [
        { tier: 'standard', priceMonthly: 549, annualDiscountPct: 20, trialDays: 21 },
        { tier: 'enterprise', priceMonthly: 0, annualDiscountPct: 0, trialDays: 30 }, // serializer null→0
        { tier: 'nonexistent', priceMonthly: 1 },
      ],
    });
    expect(merged).not.toBeNull();
    const std = merged!.find((t) => t.tier === 'standard')!;
    expect(std.baseMonthly).toBe(549);
    expect(std.annualDiscountPct).toBe(20);
    expect(std.trialDays).toBe(21);
    // Custom tier stays Custom.
    expect(merged!.find((t) => t.tier === 'enterprise')!.baseMonthly).toBeNull();
    // Unmatched fixture tier keeps its curated price.
    expect(merged!.find((t) => t.tier === 'professional')!.baseMonthly).toBe(
      LIC_DTC.find((t) => t.tier === 'professional')!.baseMonthly,
    );
  });

  it('fails closed on malformed payloads', () => {
    expect(mergeDtcPricing(LIC_DTC, null)).toBeNull();
    expect(mergeDtcPricing(LIC_DTC, { tiers: [] })).toBeNull();
    expect(mergeDtcPricing(LIC_DTC, { tiers: 'nope' })).toBeNull();
    expect(mergeB2bPricing(LIC_PRICING.pharma, { nope: true })).toBeNull();
  });

  it('adopts live B2B per-user prices and keeps curated feature copy', () => {
    const merged = mergeB2bPricing(LIC_PRICING.pharma, {
      tiers: [{ tier: 'standard', perUserMonthly: 479, annualDiscountPct: 10 }],
    });
    const std = merged!.find((t) => t.tier === 'standard')!;
    expect(std.perUserMonthly).toBe(479);
    expect(std.annualDiscountPct).toBe(10);
    expect(std.features.length).toBeGreaterThan(0); // curated copy retained
  });
});

describe('OnboardingWizard — real first-run setup', () => {
  function authed() {
    sessionStorage.setItem('token', 'test-token');
    localStorage.setItem('currentOrganizationId', '2');
  }

  async function walkToInvites() {
    fireEvent.click(screen.getByText(/Get started/));
    fireEvent.change(screen.getByPlaceholderText('Acme Bio, Inc.'), {
      target: { value: 'Bright Biosciences' },
    });
    fireEvent.click(screen.getByText('Biotech'));
    fireEvent.click(screen.getByText('Regulatory affairs'));
    fireEvent.click(screen.getByText(/Continue/));
    // Modules step → Translation step → Invite step
    fireEvent.click(screen.getByText(/Continue/));
    fireEvent.click(screen.getByText(/Continue/));
    expect(await screen.findByText('Invite your team')).toBeTruthy();
  }

  it('Finish setup PATCHes the org profile, POSTs invites, and reports honestly', async () => {
    authed();
    const calls: Array<{ method: string; url: string; body: any }> = [];
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      calls.push({ method, url, body });
      if (method === 'PATCH') return { ok: true, status: 200, json: async () => ({ success: true }) };
      if (method === 'POST' && String(body && (body as any).email).includes('outside')) {
        return { ok: true, status: 202, json: async () => ({ pendingInvitation: true }) };
      }
      return { ok: true, status: 201, json: async () => ({ id: 9 }) };
    });

    const onEnter = vi.fn();
    render(<OnboardingWizard onEnter={onEnter} />);
    await walkToInvites();

    const inputs = screen.getAllByPlaceholderText('colleague@company.com');
    fireEvent.change(inputs[0], { target: { value: 'riley@brightbio.test' } });
    fireEvent.change(inputs[1], { target: { value: 'outside@other-org.test' } });
    fireEvent.click(screen.getByText(/Finish setup/));

    expect(await screen.findByText(/Workspace ready/)).toBeTruthy();
    expect(screen.getByText(/Organization profile saved -- audited/)).toBeTruthy();
    expect(screen.getByText(/1 teammate added -- 1 pending consent/)).toBeTruthy();

    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toBe('/api/organizations/2/profile');
    expect(patch.body.clientType).toBe('biotech');
    expect(String(patch.body.reason).length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/tenant-users')).toHaveLength(2);

    // Entering persists onboardingComplete to the per-user store.
    fireEvent.click(screen.getByText(/Enter workspace/));
    await waitFor(() => {
      const put = calls.concat(apiRequest.mock.calls.map(([m, u, b]) => ({ method: m, url: u, body: b })))
        .find((c) => c.method === 'PUT' && c.url === '/api/users/me/preferences');
      expect(put).toBeTruthy();
      expect((put as any).body.onboardingComplete).toBe(true);
    });
    expect(onEnter).toHaveBeenCalled();
    expect(localStorage.getItem('c2c_onboarding_done')).toBe('1');
  });

  it('signed out: provisions nothing and says so', async () => {
    const onEnter = vi.fn();
    render(<OnboardingWizard onEnter={onEnter} />);
    await walkToInvites();
    fireEvent.click(screen.getByText(/Finish setup/));
    expect(await screen.findByText('Walkthrough complete')).toBeTruthy();
    expect(screen.getByText(/no organization profile or teammates were saved/)).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
