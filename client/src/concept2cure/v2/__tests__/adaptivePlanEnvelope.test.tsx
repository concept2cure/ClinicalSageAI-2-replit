// @vitest-environment jsdom
/**
 * The adaptive plan panel reads the envelope the server actually sends.
 *
 * ── The defect, found by running it ──────────────────────────────────────────
 * `GET /api/biostat/adaptive/:planId` answers
 *
 *   { plan: { id, title, designType, spendingFunction, maxSampleSize, … },
 *     snapshots: [...], decisions: [...], reports: [...] }
 *
 * — the plan's own fields NESTED under `plan`. `adaptiveMonitoringApi.ts` typed
 * them at the top level, so every one of them was `undefined` on a real server
 * and the panel's header rendered "Plan undefined", "design type not recorded"
 * and an em dash for the maximum sample size, while the interim looks beside it
 * rendered correctly because `snapshots` IS top-level.
 *
 * Nothing caught this: the panel's own suite answers with the shape the type
 * declared, so it agreed with itself. It took seeding a plan against a running
 * server and reading it back (2026-11-09). ONE_DESIGN_PLAN §2 is right that a
 * simulated DOM is not evidence a screen works — this is what it looks like
 * when it is taken as evidence.
 *
 * The fixtures below are the server's real answer, copied from that run.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuthUser: () => ({ displayName: 'R. Mbeki', email: 'r@example.org', mfaEnabled: false }),
}));

import { AdaptiveMonitoringPanel } from '../surfaces/adaptiveMonitoring';

/** Exactly what the server returned for the seeded demo plan. */
const SERVER_ANSWER = {
  plan: {
    id: 1,
    threadId: null,
    title: '[Demo · Biotech] C2C-101-201 — group-sequential monitoring plan',
    designType: 'group_sequential',
    spendingFunction: 'obrien-fleming',
    maxSampleSize: 240,
    adaptations: [{ type: 'sample_size_reestimation' }],
    interimLooks: [{ lookNumber: 1, informationFraction: 0.5 }],
  },
  snapshots: [
    { id: 1, lookNumber: 1, informationFraction: 0.5, enrolledCount: 120, isBlinded: true, testStatistic: 3.9958398, conditionalPower: 0.9999999, predictivePower: null },
    { id: 2, lookNumber: 2, informationFraction: 0.75, enrolledCount: 180, isBlinded: false, testStatistic: 6.1481705, conditionalPower: 1, predictivePower: null },
  ],
  decisions: [],
  reports: [],
};

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, path: string) => {
    if (path === '/api/biostat/adaptive/1') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: SERVER_ANSWER }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) } as Response;
  });
});

async function openPlanOne() {
  render(<AdaptiveMonitoringPanel />);
  fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: /Open plan/i }));
  await waitFor(() => expect(screen.getByRole('table', { name: /Interim looks/i })).toBeTruthy());
}

describe('the adaptive plan the server really sends', () => {
  it('names the plan, instead of "Plan undefined"', async () => {
    await openPlanOne();
    expect(screen.getByText(SERVER_ANSWER.plan.title)).toBeTruthy();
    expect(screen.queryByText(/Plan undefined/)).toBeNull();
  });

  it('shows the design type and the spending function it was planned with', async () => {
    await openPlanOne();
    expect(screen.getByText(/group_sequential/)).toBeTruthy();
    expect(screen.getByText(/obrien-fleming/)).toBeTruthy();
    expect(screen.queryByText('design type not recorded')).toBeNull();
  });

  it('shows the maximum sample size as a figure, not an em dash', async () => {
    await openPlanOne();
    expect(screen.getByText('240')).toBeTruthy();
  });

  /* The guard: the looks already rendered before this fix, because `snapshots`
     is top-level. If they stop, the envelope mapping broke them. */
  it('still shows both interim looks and their engine figures', async () => {
    await openPlanOne();
    expect(screen.getByText('3.99584')).toBeTruthy();
    // num() rounds to 6 dp: 6.1481705 renders 6.148171, not 6.14817.
    expect(screen.getByText('6.148171')).toBeTruthy();
  });

  it('counts the looks and the decisions honestly', async () => {
    await openPlanOne();
    expect(screen.getByText('Looks recorded')).toBeTruthy();
    expect(screen.getByText('Decisions signed')).toBeTruthy();
  });
});
