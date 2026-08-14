// @vitest-environment jsdom
/**
 * AnA's context is attached to the WORK on screen, not just to the module.
 *
 * ── What was wrong ────────────────────────────────────────────────────────────
 * `getAnaContext(surfaceId, segment)` is reference config keyed on the surface
 * id alone. A module with twelve sub-tabs handed AnA the same sentence on all
 * twelve, and told her nothing about the state in front of the user. Its own
 * comment says `program / stage / readiness / evidence / activity` are omitted
 * because no endpoint supplied real values — and instructs that when one exists,
 * the values be populated from its response and never from a constant.
 *
 * ── What must be true now ─────────────────────────────────────────────────────
 *   • a surface publishes its live context and the rail merges it;
 *   • a patch from a surface the user has LEFT can never describe the screen
 *     they are now on;
 *   • the honesty rule holds: while the underlying fetch is loading or errored,
 *     the measured fields are ABSENT and the rail keeps the honest config —
 *     a readiness percentage assembled from an unresolved fetch is the exact
 *     fabrication the original comment refused.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import {
  clearAnaSurfaceContext,
  mergeAnaContext,
  publishAnaSurfaceContext,
  readAnaSurfaceContext,
  subscribeAnaSurfaceContext,
} from '../anaSurfaceContext';
import type { AnaContext } from '../registryModel';
import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

/** The surface props the shell passes, as the other v2 render suites build them. */
const cmcProps = () => ({
  surface: { id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface'],
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const BASE: AnaContext = {
  module: 'CMC',
  here: 'the CMC workspace',
  focus: 'CMC',
  section: null,
  actions: [],
  suggestions: ['static one', 'static two'],
};

afterEach(() => {
  cleanup();
  clearAnaSurfaceContext('cmc');
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});
beforeEach(() => apiRequest.mockReset());

describe('mergeAnaContext', () => {
  it('returns the static config untouched when nothing is published', () => {
    expect(mergeAnaContext(BASE, 'cmc', null)).toEqual(BASE);
  });

  it('ignores a patch published by a DIFFERENT surface', () => {
    const stale = { surfaceId: 'vault', focus: 'Vault documents' };
    expect(mergeAnaContext(BASE, 'cmc', stale)).toEqual(BASE);
  });

  it('overrides only the fields the surface actually knows', () => {
    const merged = mergeAnaContext(BASE, 'cmc', {
      surfaceId: 'cmc',
      focus: 'Module 3 build',
      readiness: 42,
      stage: undefined, // knows its readiness, not its stage
    });
    expect(merged.focus).toBe('Module 3 build');
    expect(merged.readiness).toBe(42);
    expect('stage' in merged).toBe(false);
    // Untouched fields survive.
    expect(merged.module).toBe('CMC');
    expect(merged.suggestions).toEqual(['static one', 'static two']);
  });

  it('never lets a patch rewrite the module identity', () => {
    const merged = mergeAnaContext(BASE, 'cmc', {
      surfaceId: 'cmc',
      // @ts-expect-error — the type forbids it; this proves the runtime does too.
      module: 'Something else',
    });
    expect(merged.module).toBe('CMC');
  });
});

describe('publish / subscribe', () => {
  it('notifies subscribers and clears only its own surface', () => {
    const seen: unknown[] = [];
    const stop = subscribeAnaSurfaceContext((p) => seen.push(p));
    publishAnaSurfaceContext({ surfaceId: 'cmc', focus: 'Stability' });
    expect(readAnaSurfaceContext()?.focus).toBe('Stability');

    // A different surface's clear must not wipe this one.
    clearAnaSurfaceContext('vault');
    expect(readAnaSurfaceContext()?.focus).toBe('Stability');

    clearAnaSurfaceContext('cmc');
    expect(readAnaSurfaceContext()).toBeNull();
    expect(seen.length).toBeGreaterThanOrEqual(2);
    stop();
  });
});

describe('CmcModule publishes what the screen knows', () => {
  const wire = (readiness: unknown, status = 200) => {
    apiRequest.mockImplementation(async (_m?: string, u?: string) => {
      if (typeof u === 'string' && u.startsWith('/api/cmc/module3-os/readiness/')) return res(readiness, status);
      return res({ success: true, data: [] });
    });
  };

  it('follows the sub-tab the user is on', async () => {
    wire({ success: true, data: null });
    render(<CmcModule {...cmcProps()} />);

    await waitFor(() => expect(readAnaSurfaceContext()?.surfaceId).toBe('cmc'));
    expect(readAnaSurfaceContext()?.focus).toBe('Overview');

    fireEvent.click(screen.getByRole('button', { name: /Stability/ }));
    await waitFor(() => expect(readAnaSurfaceContext()?.focus).toBe('Stability'));
    // The starters follow the tab too, so her suggestions match the work.
    expect(readAnaSurfaceContext()?.suggestions?.[0]).toMatch(/shelf life|stability|Q1E/i);
  });

  it('offers AnA the module’s own screens, and switching one actually moves the UI', async () => {
    wire({ success: true, data: null });
    render(<CmcModule {...cmcProps()} />);
    await waitFor(() => expect(readAnaSurfaceContext()?.screens?.length).toBeGreaterThan(5));

    const ctx = readAnaSurfaceContext()!;
    expect(ctx.screens?.map((s) => s.id)).toContain('build');
    ctx.goToScreen!('build');
    await waitFor(() => expect(readAnaSurfaceContext()?.focus).toBe('Module 3 build'));
    expect(screen.getByText('Module 3 build', { selector: 'h1' })).toBeTruthy();
  });

  it('refuses a screen id the module does not have', async () => {
    wire({ success: true, data: null });
    render(<CmcModule {...cmcProps()} />);
    await waitFor(() => expect(readAnaSurfaceContext()?.goToScreen).toBeTypeOf('function'));
    readAnaSurfaceContext()!.goToScreen!('not-a-tab');
    // Still on Overview rather than rendering a blank surface.
    await waitFor(() => expect(readAnaSurfaceContext()?.focus).toBe('Overview'));
  });

  it('publishes MEASURED readiness once the endpoint resolves', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wire({
      success: true,
      data: { totalSections: 10, approvedSections: 4, staleSections: 2, openCriticalContradictions: 1, exportReady: false },
    });
    render(<CmcModule {...cmcProps()} />);

    await waitFor(() => expect(readAnaSurfaceContext()?.readiness).toBe(40));
    const ctx = readAnaSurfaceContext()!;
    expect(ctx.stage).toMatch(/1 critical contradiction blocking/);
    // Zero-count evidence is omitted rather than shown as a hollow "0".
    expect(ctx.evidence).toEqual([
      { count: 4, label: 'approved §3.2 sections' },
      { count: 2, label: 'stale sections' },
      { count: 1, label: 'critical contradictions' },
    ]);
  });

  it('publishes NO readiness while the fetch has not resolved honestly', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    // A failed readiness read: the rail must fall back to the honest config
    // rather than describing a percentage nobody measured.
    apiRequest.mockImplementation(async (_m?: string, u?: string) => {
      if (typeof u === 'string' && u.startsWith('/api/cmc/module3-os/readiness/')) {
        throw Object.assign(new Error('service unavailable'), { status: 503 });
      }
      return res({ success: true, data: [] });
    });
    render(<CmcModule {...cmcProps()} />);

    await waitFor(() => expect(readAnaSurfaceContext()?.surfaceId).toBe('cmc'));
    const ctx = readAnaSurfaceContext()!;
    expect(ctx.readiness).toBeUndefined();
    expect(ctx.stage).toBeUndefined();
    expect(ctx.evidence).toBeUndefined();
    // And the merge leaves the static config's honest omission intact.
    const merged = mergeAnaContext(BASE, 'cmc', ctx);
    expect('readiness' in merged).toBe(false);
  });

  it('withdraws its context when the surface unmounts', async () => {
    wire({ success: true, data: null });
    const { unmount } = render(
      <CmcModule {...cmcProps()} />,
    );
    await waitFor(() => expect(readAnaSurfaceContext()).not.toBeNull());
    unmount();
    expect(readAnaSurfaceContext()).toBeNull();
  });
});
