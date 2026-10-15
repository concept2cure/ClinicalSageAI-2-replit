// @vitest-environment jsdom
/**
 * U14 (client half) — with no baseline, AnA Command does not call a program
 * "stable".
 *
 * The continuity service now measures trajectory against a shared, durable
 * baseline (the latest snapshot at least 24 h old, in
 * project_continuity_snapshots). Until one exists it answers
 * `trajectory: 'no_baseline'`. This surface used to look the trajectory up in
 * a map and fall back to 'stable' for anything it did not know, so the honest
 * answer would have been rendered as the very verdict the fix removes
 * (docs/evidence/W2/2026-09-24-multi-task/).
 *
 * RED on the pre-fix client: the lead read "PRG-1 is stable: …" and the chip
 * said "stable".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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

const PID = 302;
const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let continuity: Record<string, unknown>;

function route(method: string, url: string) {
  if (url === '/api/report-os/portfolio/org') return ok({ attentionRanked: [{ projectId: PID, code: 'PRG-1' }] });
  if (method === 'POST' && url === '/api/orchestration/recommendations') return ok({ recommendations: [] });
  if (method === 'POST' && url === '/api/orchestration/continuity') return ok(continuity);
  if (url === '/api/orchestration/templates') return ok({ templates: [] });
  return { ok: false, status: 404, json: async () => ({ error: 'not routed: ' + url }), text: async () => '' };
}

const base = {
  projectId: PID,
  summary: 'Project "PRG-1" readiness: 70% (partial).',
  metrics: { readinessScore: 70, documentCount: 1, validatedCount: 0, blockerCount: 1, taskCompletionPercent: 50 },
  changes: [],
  newlyReady: [],
  needsAttention: [{ type: 'document', id: 9, title: 'Module 2.5', reason: 'Not validated' }],
};

function mount() {
  return render(<AnaCommand surface={'ana-command' as never} onAsk={() => {}} onNav={() => {}} segment="" />);
}

describe('AnaCommand — continuity with no baseline yet', () => {
  beforeEach(() => apiRequest.mockImplementation(async (m: string, u: string) => route(m, u)));
  afterEach(() => { cleanup(); apiRequest.mockReset(); });

  it('says "no baseline yet" and never "stable"', async () => {
    continuity = { ...base, trajectory: 'no_baseline', baseline: null };
    mount();
    const lead = await screen.findByText(/PRG-1.*no baseline yet/i);
    expect(lead.textContent).not.toMatch(/stable/i);
    expect(document.querySelector('.ac-traj')?.textContent).toMatch(/no baseline yet/i);
    expect(document.body.textContent).not.toMatch(/\bstable\b/i);
    // It does not claim nothing became ready — it has nothing to compare with.
    expect(screen.queryByText('Nothing newly ready.')).toBeNull();
  });

  it('still names a real trend against a baseline, with the baseline date', async () => {
    continuity = {
      ...base,
      trajectory: 'improving',
      baseline: { snapshotAt: '2026-09-29T08:00:00.000Z', readinessScore: 58 },
      changesSince: '2026-09-29T08:00:00.000Z',
    };
    mount();
    expect(await screen.findByText(/PRG-1 is improving/)).toBeTruthy();
    expect(screen.getByText(/Since 2026-09-29/)).toBeTruthy();
  });
});
