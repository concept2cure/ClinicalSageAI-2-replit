// @vitest-environment jsdom
/**
 * Every failure on this surface offers the way out its own copy promises.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Three error states — workflow runs, approval gates, readiness — each ended
 * their hint with "sign in and retry", and none of them rendered anything to
 * retry with. The instruction named an action the screen did not provide, which
 * leaves a regulatory director with a dead panel and a sentence telling them to
 * do something impossible. UI standards §8, quoted in dataConnect.tsx: a
 * failure always offers a way out.
 *
 * None of this needed new machinery. `setRdEpoch`, `setRunsEpoch` and
 * `setCpsReloadKey` all already existed and are already dependencies of their
 * reads — they were simply never wired to the failure that needs them. The
 * fourth error state on this surface (a readiness payload that arrived and
 * could not be read) already had its retry, which is what made the other three
 * visible as an omission.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────
 * That the control EXISTS and that pressing it causes a real re-read. A retry
 * button that re-renders without re-fetching would satisfy a DOM-only
 * assertion and still leave the user stuck, so each case counts requests to the
 * failing endpoint across the click.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
// `connected()` gates every read on a session token existing.
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { Orchestration } from '../surfaces/Orchestration';

const PID = 301;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const boom = { ok: false, status: 503, json: async () => ({ error: 'unavailable' }), text: async () => '' };

/* The surface resolves its program from the portfolio read before any panel
   endpoint is called, so that one must succeed for the panels to be reachable —
   `pid == null` short-circuits the runs and readiness reads to null. */
function route(url: string, failing: string) {
  if (url.includes(failing)) return boom;
  if (url === '/api/report-os/portfolio/org') return ok({ attentionRanked: [{ projectId: PID, code: 'PRG-1' }] });
  if (url === '/api/orchestration/templates') return ok({ templates: [] });
  if (url === `/api/orchestration/project/${PID}`) return ok({ workflows: [] });
  if (url === '/api/orchestration/checkpoints') return ok({ data: [], meta: { count: 0 } });
  if (url === `/api/orchestration/projects/${PID}/readiness`) return ok({ overallScore: 71, status: 'at_risk', blockers: [], assessedAt: '2026-08-04T10:00:00Z' });
  return { ok: false, status: 404, json: async () => ({ error: 'not routed: ' + url }), text: async () => '' };
}

/** Count requests per endpoint so a retry is proven to REFETCH, not just repaint. */
const hits = (url: string) => apiRequest.mock.calls.filter((c) => String(c[1]).includes(url)).length;

const mount = () => render(<Orchestration {...({ surface: { id: 'orchestration' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />);

afterEach(() => cleanup());

describe('Orchestration — a failure offers a way out, and it really re-reads', () => {
  /* The third element is the view tab the panel lives under — 'Runs' is the
     default, so only the gates case has to switch. */
  const cases: [string, string, RegExp, string | null][] = [
    ['workflow runs', `/api/orchestration/project/${PID}`, /Couldn't load workflow runs/i, null],
    ['approval gates', '/api/orchestration/checkpoints', /Couldn't load approval gates/i, 'Approvals'],
  ];

  for (const [name, endpoint, title, tab] of cases) {
    it(`${name}: renders a retry, and pressing it issues another request`, async () => {
      apiRequest.mockReset();
      apiRequest.mockImplementation(async (_m: string, url: string) => route(String(url), endpoint));
      mount();

      if (tab) fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${tab}`) }));
      await waitFor(() => expect(screen.getByText(title)).toBeTruthy());

      const before = hits(endpoint);
      const btn = document.querySelector('.c2c-error-retry') as HTMLButtonElement | null;
      expect(btn, 'the failure must offer a control, not only tell the user to retry').toBeTruthy();

      fireEvent.click(btn!);
      await waitFor(() => expect(hits(endpoint)).toBeGreaterThan(before));
    });
  }

  /**
   * The copy half of the same defect. Telling someone to "sign in and retry" on
   * a 503 is doubly wrong — it is not an auth failure, and the screen offered
   * no retry. The instruction now matches what is actually on screen.
   */
  it('no longer instructs the user to "sign in and retry"', async () => {
    apiRequest.mockReset();
    const endpoint = `/api/orchestration/project/${PID}`;
    apiRequest.mockImplementation(async (_m: string, url: string) => route(String(url), endpoint));
    mount();

    await waitFor(() => expect(screen.getByText(/Couldn't load workflow runs/i)).toBeTruthy());
    expect(/sign in and retry/i.test(document.body.textContent ?? '')).toBe(false);
  });
});
