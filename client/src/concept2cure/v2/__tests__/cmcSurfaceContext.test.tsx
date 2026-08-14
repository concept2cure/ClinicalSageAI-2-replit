// @vitest-environment jsdom
/**
 * What AnA is told about the CMC screen the user is actually on.
 *
 * ── The gap ───────────────────────────────────────────────────────────────────
 * `useAnaChat` forwards a surface's published context to the orchestrator as
 * `module_context` (see ../surfaceContext). The shell alone knows only that the
 * active surface is "cmc" — not which of the twelve sub-tabs is open, nor
 * anything on it. So a generic question ("what should I do next?") could not be
 * answered here without the user restating their situation.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 * These tests drive the REAL surface and read the store through the same public
 * hook the shell uses — no mock of the channel itself:
 *
 *   • the context follows the sub-tab, so it describes the screen in view;
 *   • measured facts appear only once the readiness endpoint has RESOLVED;
 *     while it is loading or errored they are ABSENT, because telling AnA a
 *     percentage nobody measured makes her confidently wrong, which is the
 *     failure this channel is most able to cause;
 *   • the context is withdrawn on unmount, so the next surface never inherits it;
 *   • `availableActions` names the module's real screens and governed actions,
 *     giving her a vocabulary for "drive the screen" requests.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import { useActiveSurfaceContext, toModuleContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const cmcProps = () => ({
  surface: { id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface'],
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

/** Reads the store exactly as the shell does, so the test exercises the real path. */
let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('cmc');
  return null;
}

function renderCmc() {
  return render(
    <>
      <CmcModule {...cmcProps()} />
      <Probe />
    </>,
  );
}

/** Only the readiness endpoint is interesting; everything else is an empty list. */
const wire = (readiness: unknown, opts: { throws?: boolean } = {}) => {
  apiRequest.mockImplementation(async (_m?: string, u?: string) => {
    if (typeof u === 'string' && u.startsWith('/api/cmc/module3-os/readiness/')) {
      if (opts.throws) throw Object.assign(new Error('service unavailable'), { status: 503 });
      return res(readiness);
    }
    return res({ success: true, data: [] });
  });
};

afterEach(() => {
  cleanup();
  seen = null;
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});
beforeEach(() => apiRequest.mockReset());

describe('CMC publishes what the screen is showing', () => {
  it('describes the sub-tab in view, and follows the user to another', async () => {
    wire({ success: true, data: null });
    renderCmc();

    await waitFor(() => expect(seen).not.toBeNull());
    expect(seen!.surfaceId).toBe('cmc');
    expect(seen!.facts?.tabLabel).toBe('Overview');
    expect(seen!.summary).toMatch(/Overview tab of the CMC Module 3 operating system/);

    fireEvent.click(screen.getByRole('button', { name: /Stability/ }));
    await waitFor(() => expect(seen!.facts?.tabLabel).toBe('Stability'));
    expect(seen!.summary).toMatch(/Stability tab/);
  });

  it('gives AnA a vocabulary for driving the screen', async () => {
    wire({ success: true, data: null });
    renderCmc();
    await waitFor(() => expect(seen?.availableActions?.length).toBeGreaterThan(5));

    const actions = seen!.availableActions!;
    expect(actions).toContain('open the Module 3 build tab');
    expect(actions).toContain('compile Module 3 from the canonical sources');
    expect(actions).toContain('check the final-export gate');
    expect(actions.some((a) => /ICH Q1E/.test(a))).toBe(true);
  });

  it('publishes MEASURED readiness once the endpoint resolves', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wire({
      success: true,
      data: {
        totalSections: 10, approvedSections: 4, staleSections: 2,
        openCriticalContradictions: 1, exportReady: false,
      },
    });
    renderCmc();

    await waitFor(() => expect(seen?.facts?.sectionsApproved).toBe(4));
    expect(seen!.facts).toMatchObject({
      sectionsTotal: 10,
      staleSections: 2,
      openCriticalContradictions: 1,
      exportReady: false,
    });
    // The summary states the same numbers, so her prose and her facts agree.
    expect(seen!.summary).toMatch(/4 of 10 §3\.2 sections are approved/);
    expect(seen!.summary).toMatch(/2 went stale after approval/);
    expect(seen!.summary).toMatch(/Final export is blocked/);
  });

  it('says the gate would pass when it would', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wire({
      success: true,
      data: {
        totalSections: 6, approvedSections: 6, staleSections: 0,
        openCriticalContradictions: 0, exportReady: true,
      },
    });
    renderCmc();
    await waitFor(() => expect(seen?.facts?.exportReady).toBe(true));
    expect(seen!.summary).toMatch(/Final export would pass/);
    // Nothing that is zero is narrated as a problem.
    expect(seen!.summary).not.toMatch(/stale|unresolved/);
  });

  it('publishes NO measured fact when the readiness read fails', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wire(null, { throws: true });
    renderCmc();

    await waitFor(() => expect(seen).not.toBeNull());
    // The tab is still described — that is known from the screen itself.
    expect(seen!.facts?.tabLabel).toBe('Overview');
    // But nothing is asserted about a state nobody measured.
    for (const k of ['sectionsApproved', 'sectionsTotal', 'staleSections', 'openCriticalContradictions', 'exportReady']) {
      expect(seen!.facts).not.toHaveProperty(k);
    }
    expect(seen!.summary).not.toMatch(/approved|blocked|would pass/);
  });

  it('publishes no measured fact without a project either', async () => {
    wire({ success: true, data: null });
    renderCmc();
    await waitFor(() => expect(seen).not.toBeNull());
    expect(seen!.facts).not.toHaveProperty('sectionsTotal');
  });

  it('withdraws its context on unmount, so the next surface inherits nothing', async () => {
    wire({ success: true, data: null });
    const { unmount } = renderCmc();
    await waitFor(() => expect(seen).not.toBeNull());
    unmount();
    // Read the store directly: the probe is gone with the tree.
    expect(toModuleContext(null)).toBeNull();
    render(<Probe />);
    expect(seen).toBeNull();
  });

  it('shapes onto the wire without empty keys', async () => {
    wire({ success: true, data: null });
    renderCmc();
    await waitFor(() => expect(seen).not.toBeNull());
    const wireCtx = toModuleContext(seen)!;
    expect(wireCtx.surface).toBe('cmc');
    expect(typeof wireCtx.summary).toBe('string');
    expect(wireCtx.available_actions).toBeDefined();
  });
});
