/**
 * @vitest-environment jsdom
 *
 * Runtime smoke tests for the live Concept2Cure MDX design-system surfaces.
 * Verifies each surface:
 *   1. Mounts without throwing
 *   2. Renders its page-title h1
 *   3. Doesn't log any unexpected errors to the console
 *
 * Scope note: this suite covers the surfaces still wired into the live MDX
 * shell (`mdx/App.tsx`) — DocumentsPanel plus the Phase 4 lifecycle/system
 * surfaces. The older `mdx/surfaces/*` prototypes (Vault/Audit/Ivd/Cdx/etc.)
 * were superseded by the workbench architecture and removed as dead code, so
 * their smoke cases were dropped with them.
 *
 * These are NOT exhaustive — they're a smoke test that catches:
 *   - import path errors that escaped tsc
 *   - data-shape mismatches at runtime (DocumentsPanel adapter casts)
 *   - hook errors during initial fixture-fallback render
 *   - missing icon refs
 *   - JSX intrinsic prop errors
 *
 * Mock context:
 *   - `fetch` returns 404 for every /api/* call, forcing every hook into
 *     fixture-fallback mode. This is also the realistic dev state since
 *     the new endpoints aren't wired yet.
 *   - `localStorage` resets between tests so view-mode preferences don't bleed.
 *   - onAskAna / onOpenEditor are no-op spies.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as React from 'react';

// ─── Component imports (live MDX surfaces wired into mdx/App.tsx) ─
import { DocumentsPanel } from '../../client/src/concept2cure/mdx/components/DocumentsPanel';
import { EngineeringSurface } from '../../client/src/concept2cure/mdx/surfaces/EngineeringSurface';
import { UdiSurface } from '../../client/src/concept2cure/mdx/surfaces/UdiSurface';
import { PostmarketSurface } from '../../client/src/concept2cure/mdx/surfaces/PostmarketSurface';
import { AnalyticsSurface } from '../../client/src/concept2cure/mdx/surfaces/AnalyticsSurface';
import { MemorySurface } from '../../client/src/concept2cure/mdx/surfaces/MemorySurface';
import { AdminSurface } from '../../client/src/concept2cure/mdx/surfaces/AdminSurface';

import type { Program } from '../../client/src/concept2cure/mdx/data/programs';

const MOCK_PROGRAM: Program = {
  id: 'p-test',
  title: 'BX-204 CGM',
  code: 'BX-204',
  pathway: 'k510',
  stage: 'Verification',
  stageIdx: 5,
  readiness: 64,
  status: 'active',
  lead: 'Jordan Chen',
  owners: ['JC'],
  nextBlocker: null,
  dueLabel: 'Filing · Q3 2026',
  dueTone: 'ok',
  lastActivity: '3h ago',
  meta: 'Continuous glucose monitor',
};

const askAna = vi.fn();
const openEditor = vi.fn();

const errorLog: unknown[] = [];
let origError: typeof console.error;
let origWarn: typeof console.warn;

beforeEach(() => {
  cleanup();
  askAna.mockClear();
  openEditor.mockClear();
  errorLog.length = 0;
  // jsdom doesn't ship a fetch polyfill in older versions — provide one.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => 'Not Found',
    json: async () => ({ data: null }),
  }) as unknown as typeof fetch;

  // Capture React/JSX warnings as errors so we surface things like
  // "function components cannot have refs" or invalid prop types.
  origError = console.error;
  origWarn = console.warn;
  console.error = (...args: unknown[]) => {
    errorLog.push(['error', ...args]);
  };
  console.warn = (...args: unknown[]) => {
    // Most React warnings (key prop, ref issues) come through console.error,
    // but capture warn too just in case.
    errorLog.push(['warn', ...args]);
  };

  // Reset localStorage so view-mode prefs don't bleed between tests.
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom may not implement localStorage in some configs — ignore */
  }
});

function assertNoReactErrors() {
  // Filter to React-specific complaints — ignore expected fetch-loading
  // info-level traffic. React errors all go through console.error.
  const reactErrors = errorLog.filter((entry) => {
    const [, ...rest] = entry as [string, unknown];
    const text = rest.map((x) => String(x)).join(' ');
    if (text.includes('not wrapped in act')) return false; // common test-mode noise
    if (text.includes('jsdom')) return false;
    return true;
  });
  // Restore console first so any failure assertion message prints.
  console.error = origError;
  console.warn = origWarn;
  if (reactErrors.length > 0) {
    throw new Error(
      `React surface logged ${reactErrors.length} error/warning(s):\n` +
        reactErrors
          .map((e) => JSON.stringify(e).slice(0, 240))
          .join('\n'),
    );
  }
}

describe('design-system surface smoke tests', () => {
  it('DocumentsPanel renders an empty doc list without error', () => {
    const { container } = render(<DocumentsPanel docs={[]} />);
    expect(container.querySelector('section.section')).toBeTruthy();
    assertNoReactErrors();
  });

  // ─── Phase 4 ─────────────────────────────────────────────────────────
  it('EngineeringSurface renders with program context', () => {
    const { getByText } = render(
      <EngineeringSurface
        program={MOCK_PROGRAM}
        onAskAna={askAna}
        onOpenEditor={openEditor}
      />,
    );
    expect(getByText('Device engineering')).toBeTruthy();
    assertNoReactErrors();
  });

  it('EngineeringSurface renders with null program', () => {
    render(
      <EngineeringSurface program={null} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    assertNoReactErrors();
  });

  it('UdiSurface renders', () => {
    const { getByText } = render(<UdiSurface onAskAna={askAna} onOpenEditor={openEditor} />);
    expect(getByText('UDI and labeling')).toBeTruthy();
    assertNoReactErrors();
  });

  it('PostmarketSurface renders', () => {
    const { getByText } = render(
      <PostmarketSurface onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(getByText('Post-market vigilance')).toBeTruthy();
    assertNoReactErrors();
  });

  it('AnalyticsSurface renders', () => {
    const { getByText } = render(<AnalyticsSurface onAskAna={askAna} />);
    expect(getByText('Analytics')).toBeTruthy();
    assertNoReactErrors();
  });

  it('MemorySurface renders', () => {
    const { getByText } = render(<MemorySurface onAskAna={askAna} />);
    expect(getByText('AnA memory')).toBeTruthy();
    assertNoReactErrors();
  });

  it('AdminSurface renders members tab by default', () => {
    const { getByText } = render(<AdminSurface onAskAna={askAna} />);
    expect(getByText('Admin and access')).toBeTruthy();
    assertNoReactErrors();
  });
});
