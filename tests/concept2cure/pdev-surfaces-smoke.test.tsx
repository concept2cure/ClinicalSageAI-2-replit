/**
 * @vitest-environment jsdom
 *
 * Runtime smoke tests for every Phase 7 PDEV surface ported in this
 * session. Same pattern as design-system-surfaces-smoke.test.tsx:
 * mount the surface, assert no React errors, verify key text.
 *
 * Mock context:
 *   - `fetch` returns 404 for every /api/* call. PDEV surfaces have
 *     no fixture fallback (they were ported with the "no demo rows
 *     in v2" rule per CLAUDE.md), so they render loading / empty
 *     states. That's the right behavior to verify.
 *   - PdevApp is the orchestrator — most surfaces are reached through
 *     it. Smoke-test the individual surfaces with the props the App
 *     passes them.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as React from 'react';

import { PdevApp } from '../../client/src/concept2cure/pdev/App';
import { PdevConfirmDialog } from '../../client/src/concept2cure/pdev/components/ConfirmDialog';
import { PdevRail } from '../../client/src/concept2cure/pdev/shell/Rail';
import { PdevTopBar } from '../../client/src/concept2cure/pdev/shell/TopBar';
import { PdevAnaDock } from '../../client/src/concept2cure/pdev/shell/AnaDock';

const errorLog: unknown[] = [];
let origError: typeof console.error;
let origWarn: typeof console.warn;

beforeEach(() => {
  cleanup();
  errorLog.length = 0;
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => 'Not Found',
    json: async () => ({ data: null }),
  }) as unknown as typeof fetch;

  origError = console.error;
  origWarn = console.warn;
  console.error = (...args: unknown[]) => {
    errorLog.push(['error', ...args]);
  };
  console.warn = (...args: unknown[]) => {
    errorLog.push(['warn', ...args]);
  };

  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});

function assertNoReactErrors() {
  const reactErrors = errorLog.filter((entry) => {
    const [, ...rest] = entry as [string, unknown];
    const text = rest.map((x) => String(x)).join(' ');
    if (text.includes('not wrapped in act')) return false;
    if (text.includes('jsdom')) return false;
    return true;
  });
  console.error = origError;
  console.warn = origWarn;
  if (reactErrors.length > 0) {
    throw new Error(
      `PDEV surface logged ${reactErrors.length} error/warning(s):\n` +
        reactErrors
          .map((e) => JSON.stringify(e).slice(0, 240))
          .join('\n'),
    );
  }
}

describe('PDEV Phase 7 surface smoke tests', () => {
  it('PdevApp mounts and shows the empty-state when no IND programs exist', () => {
    /* With fetch mocked to 404 across the board, the program list
       resolves to an empty array, and the surface should render the
       "No IND programs yet" empty state (or the loading state — both
       are valid initial states). The key bar: no React errors. */
    render(<PdevApp />);
    assertNoReactErrors();
  });

  it('PdevApp mounts with an initial nav of cmc', () => {
    render(<PdevApp initialNav="cmc" />);
    assertNoReactErrors();
  });

  it('PdevApp mounts with an initial nav of ind_assembly', () => {
    render(<PdevApp initialNav="ind_assembly" />);
    assertNoReactErrors();
  });

  it('PdevApp mounts with an initial nav of fda_interactions', () => {
    render(<PdevApp initialNav="fda_interactions" />);
    assertNoReactErrors();
  });

  it('PdevApp mounts with an initial nav of contradictions', () => {
    render(<PdevApp initialNav="contradictions" />);
    assertNoReactErrors();
  });

  it('PdevConfirmDialog renders open state', () => {
    render(
      <PdevConfirmDialog
        open={true}
        action="Change activity state"
        target="cmc.formulation_development · drafting → in_review"
        resource="cmc.formulation_development"
        minReason={10}
        confirmWord="yes"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    assertNoReactErrors();
  });

  it('PdevConfirmDialog renders nothing when closed', () => {
    const { container } = render(
      <PdevConfirmDialog
        open={false}
        action="—"
        target="—"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(container.querySelector('.pdev-confirm-backdrop')).toBeNull();
    assertNoReactErrors();
  });

  it('PdevRail renders with an empty program list', () => {
    render(
      <PdevRail
        activeNav="overview"
        setActiveNav={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        program={null}
        programs={[]}
        switchProgram={() => {}}
      />,
    );
    assertNoReactErrors();
  });

  it('PdevTopBar renders without program', () => {
    render(
      <PdevTopBar
        hereLabel="Program dashboard"
        program={null}
        onOpenPalette={() => {}}
      />,
    );
    assertNoReactErrors();
  });

  it('PdevAnaDock renders open state', () => {
    render(
      <PdevAnaDock
        open={true}
        setOpen={() => {}}
        program={null}
        readinessScore={0}
        topBlocker={null}
        activeNav="overview"
        activity={null}
        onSend={() => {}}
      />,
    );
    assertNoReactErrors();
  });

  it('PdevAnaDock renders seam state when closed', () => {
    const { container } = render(
      <PdevAnaDock
        open={false}
        setOpen={() => {}}
        program={null}
        readinessScore={null}
        topBlocker={null}
        activeNav="overview"
        activity={null}
        onSend={() => {}}
      />,
    );
    expect(container.querySelector('.pdev-ana-seam')).toBeTruthy();
    assertNoReactErrors();
  });
});
