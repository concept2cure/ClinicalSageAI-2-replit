// @vitest-environment jsdom
/**
 * Mission Control — proves the surface reads the real PM engine and reports it
 * honestly.
 *
 * ── What was wrong before this surface existed ───────────────────────────────
 * `server/routes/mission-control.ts` mounts thirty-eight endpoints at
 * `/api/mission-control` and the string "mission-control" appeared nowhere in
 * `client/src`. The regulatory program engine — readiness, artifacts, evidence,
 * risks, stale dependencies, Part 11 provenance — had no interface at all.
 *
 * ── The properties worth pinning ─────────────────────────────────────────────
 * Not "it renders". Three things that decide whether a program lead can trust
 * what they are looking at:
 *
 *   1. Readiness is NOT recomputed in the browser. The server owns the
 *      weighting and is the number that gets defended to a regulator; a second
 *      implementation here would drift from it silently.
 *   2. A failed load is distinguishable from a bad score. A readiness of 0% and
 *      a readiness that could not be loaded are different facts and only one of
 *      them means the program is in trouble — rendering zeros for both is the
 *      failure mode that makes a dashboard untrustworthy.
 *   3. A partial response does not crash the surface. Same class as the
 *      `ectd-compile` defect: `.length` on a list the server did not send.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { MissionControl } from '../surfaces/MissionControl';

const props = () => ({ surface: { id: 'mission-control', label: 'Mission Control' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ data }) } as Response;
}
function fail(status: number, error?: string) {
  return { ok: false, status, json: async () => ({ error }) } as Response;
}

const PROGRAMS = [
  { id: 7, name: 'C2C-101', code: 'IND-2201', customerTrack: 'biotech', indication: 'NSCLC' },
  { id: 8, name: 'C2C-202', customerTrack: 'pharma' },
];

const READINESS = {
  readiness: {
    artifactCompleteness: 62, evidenceAdequacy: 41, reviewMaturity: 80,
    approvalMaturity: 25, consistencyIntegrity: 85, routeFit: 70,
    authorityConfidence: 45, complianceIntegrity: 85, timelineConfidence: 76,
  },
  overallConfidence: 61,
  summary: { totalArtifacts: 8, openRisks: 3, criticalRisks: 1, staleDependencies: 1 },
  blockers: [
    { type: 'evidence-gap', message: 'Evidence adequacy at 41% — weak evidence chains detected', severity: 'high' },
    { type: 'critical-risks', message: '1 critical risk(s) unresolved', severity: 'critical' },
  ],
  nextActions: [
    { action: 'Start drafting', target: 'Module 2.5 Clinical Overview', priority: 'high', reason: '3 artifacts still in planned state' },
  ],
};

/** Default backend: everything answers. */
function wireHappyPath() {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.endsWith('/programs')) return ok(PROGRAMS);
    if (url.endsWith('/readiness')) return ok(READINESS);
    if (url.endsWith('/artifacts')) return ok([{ id: 1, title: 'Module 2.5', artifactType: 'ctd-section', lifecycleState: 'drafting' }]);
    if (url.endsWith('/risks')) return ok([{ id: 2, title: 'Comparator supply', severity: 'critical', status: 'open' }]);
    if (url.endsWith('/decisions')) return ok([]);
    if (url.endsWith('/dependencies/stale')) return ok([{ id: 3, upstreamId: 11, downstreamId: 12, dependencyType: 'derives-from' }]);
    return ok([]);
  });
}

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); wireHappyPath(); });

describe('Mission Control — reads the real program engine', () => {
  it('lists programs from /api/mission-control/programs', async () => {
    render(<MissionControl {...props()} />);
    expect(await screen.findByRole('button', { name: /C2C-101/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /C2C-202/ })).toBeTruthy();
    expect(apiRequest.mock.calls.some(c => c[1] === '/api/mission-control/programs')).toBe(true);
  });

  it('renders the SERVER’s readiness, and does not recompute it', async () => {
    render(<MissionControl {...props()} />);
    // 61 is the server's weighted overall. The nine dimensions average to 58.8,
    // so a browser-side recomputation would show a different number — asserting
    // 61 specifically is what pins that the server owns the weighting.
    expect(await screen.findByText(/61% overall confidence/)).toBeTruthy();
    expect(screen.getByText('Artifact completeness')).toBeTruthy();
    expect(screen.getByText('41%')).toBeTruthy();
  });

  it('shows the blockers and next actions the engine derived', async () => {
    render(<MissionControl {...props()} />);
    expect(await screen.findByText(/weak evidence chains detected/)).toBeTruthy();
    expect(screen.getByText(/1 critical risk\(s\) unresolved/)).toBeTruthy();
    expect(screen.getByText(/Module 2.5 Clinical Overview/)).toBeTruthy();
  });

  it('distinguishes "could not load" from a bad score', async () => {
    // The property that makes the dashboard trustworthy. Rendering 0% for a
    // failed request would tell a program lead their programme is in trouble
    // when the truth is that a request failed.
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.endsWith('/programs')) return ok(PROGRAMS);
      if (url.endsWith('/readiness')) return fail(503, 'readiness store unavailable');
      return ok([]);
    });
    render(<MissionControl {...props()} />);
    expect(await screen.findByText(/Couldn’t load readiness/)).toBeTruthy();
    expect(screen.getByText('readiness store unavailable')).toBeTruthy();
    expect(screen.queryByText(/overall confidence/)).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('survives a readiness body with no readiness map', async () => {
    // Same class as the ectd-compile crash: a list or map the server did not
    // send must render an empty state, never throw.
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.endsWith('/programs')) return ok(PROGRAMS);
      if (url.endsWith('/readiness')) return ok({ overallConfidence: 0 });
      return ok([]);
    });
    render(<MissionControl {...props()} />);
    expect(await screen.findByText(/No readiness signal yet/)).toBeTruthy();
  });

  it('survives list endpoints that answer with a non-array', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.endsWith('/programs')) return ok(PROGRAMS);
      if (url.endsWith('/readiness')) return ok(READINESS);
      return ok({ unexpected: 'shape' });
    });
    render(<MissionControl {...props()} />);
    expect(await screen.findByText(/No artifacts on this program yet/)).toBeTruthy();
    expect(screen.getByText(/No risks logged/)).toBeTruthy();
  });

  it('says to sign in on a 401 instead of showing an empty program list', async () => {
    apiRequest.mockImplementation(async () => fail(401));
    render(<MissionControl {...props()} />);
    expect(await screen.findByText(/Sign in to your tenant/)).toBeTruthy();
    // Not "No programs yet" — that would tell a signed-out user their
    // organization has no programs, which is a claim about their data.
    expect(screen.queryByText('No programs yet')).toBeNull();
  });

  it('offers the empty state when the organization genuinely has no programs', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.endsWith('/programs') ? ok([]) : ok([]));
    render(<MissionControl {...props()} />);
    expect(await screen.findByText('No programs yet')).toBeTruthy();
  });

  it('creates a program through the real endpoint and reloads the list', async () => {
    render(<MissionControl {...props()} />);
    await screen.findByRole('button', { name: /C2C-101/ });
    fireEvent.click(screen.getByRole('button', { name: /New program/ }));
    fireEvent.change(screen.getByLabelText(/Program name/), { target: { value: 'C2C-303' } });
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find(c => c[0] === 'POST' && c[1] === '/api/mission-control/programs');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ name: 'C2C-303', customerTrack: 'biotech' });
      // A blank optional field is omitted, not sent as an empty string.
      expect('indication' in call![2]).toBe(false);
    });
  });

  it('refuses to create a program with no name, and says so out loud', async () => {
    render(<MissionControl {...props()} />);
    await screen.findByRole('button', { name: /C2C-101/ });
    fireEvent.click(screen.getByRole('button', { name: /New program/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

    // The toast is the only channel for this refusal, so it has to be a live
    // region — otherwise a screen-reader user presses Create and hears nothing.
    // Selected by class rather than by role: EmptyState is also a live region,
    // so `getByRole('status')` is ambiguous and would break on any surface that
    // renders both. Asserting on the toast specifically is the narrower claim.
    const toast = await waitFor(() => {
      const el = document.querySelector('.de-toast');
      if (!el) throw new Error('no toast');
      return el as HTMLElement;
    });
    expect(toast.textContent).toContain('Enter a program name.');
    // The create was REFUSED, so the toast interrupts (`role="alert"`) and
    // carries the error tone. It previously asserted `status` + `polite`,
    // which was the only thing a one-tone toast could produce.
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.getAttribute('data-tone')).toBe('error');
    expect(apiRequest.mock.calls.some(c => c[0] === 'POST')).toBe(false);
  });

  it('gives its tables explicit column headers', () => {
    render(<MissionControl {...props()} />);
    // scope="col" is the documented technique; inference is not guaranteed.
    return screen.findByRole('button', { name: /C2C-101/ }).then(() => {
      for (const th of Array.from(document.querySelectorAll('thead th'))) {
        expect(th.getAttribute('scope')).toBe('col');
      }
    });
  });

  it('switching programs refetches that program’s records', async () => {
    render(<MissionControl {...props()} />);
    await screen.findByRole('button', { name: /C2C-101/ });
    await waitFor(() => expect(apiRequest.mock.calls.some(c => c[1] === '/api/mission-control/programs/7/readiness')).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: /C2C-202/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some(c => c[1] === '/api/mission-control/programs/8/readiness')).toBe(true));
  });

  it('marks the selected program for assistive technology, not by colour alone', async () => {
    render(<MissionControl {...props()} />);
    const first = await screen.findByRole('button', { name: /C2C-101/ });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /C2C-202/ }).getAttribute('aria-pressed')).toBe('false');
  });
});
