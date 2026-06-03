/**
 * @vitest-environment jsdom
 *
 * Interactive runtime smoke for the 6 rich MDX surfaces. The sibling
 * `design-system-surfaces-smoke.test.tsx` mounts each surface and asserts the
 * h1 + no console errors — but it never clicks a button, so a handler that
 * throws on filter/tab/cell interaction (a real regression class) slips
 * through. This suite drives every visible <button> on each surface in turn
 * and asserts the surface stays alive in the DOM after every click.
 *
 * Plus a focused check on the FilesTreePane's five filesystem roots, the
 * specific regression that started the 2026-06-02 reconciliation round.
 *
 * Like the sibling suite, everything runs against in-memory fixture data;
 * fetch is mocked to 404 to force fixture-fallback mode.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { AnalyticsSurface }   from '../../client/src/concept2cure/mdx/surfaces/AnalyticsSurface';
import { PostmarketSurface }  from '../../client/src/concept2cure/mdx/surfaces/PostmarketSurface';
import { MemorySurface }      from '../../client/src/concept2cure/mdx/surfaces/MemorySurface';
import { EngineeringSurface } from '../../client/src/concept2cure/mdx/surfaces/EngineeringSurface';
import { UdiSurface }         from '../../client/src/concept2cure/mdx/surfaces/UdiSurface';
import { AdminSurface }       from '../../client/src/concept2cure/mdx/surfaces/AdminSurface';
import { PathwayPanes }       from '../../client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes';

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

beforeEach(() => {
  cleanup();
  askAna.mockClear();
  openEditor.mockClear();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => 'Not Found',
    json: async () => ({ data: null }),
  }) as unknown as typeof fetch;
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

/**
 * Click every enabled <button> in the rendered container in turn. After all
 * clicks, the container must still hold rendered content (the surface didn't
 * crash and unmount itself). Returns the number of buttons clicked so the
 * test fails fast if a surface degenerates to zero interactive controls — a
 * symptom of a refactor that accidentally removed all interactivity.
 */
function clickEveryButton(container: HTMLElement): { clicked: number } {
  const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
  let clicked = 0;
  for (const b of buttons) {
    if (b.disabled) continue;
    fireEvent.click(b);
    clicked++;
  }
  const remainingText = (container.textContent || '').trim();
  if (remainingText.length === 0) {
    throw new Error('Surface unmounted after click sequence (rendered empty)');
  }
  return { clicked };
}

describe('MDX rich-surface interactive smoke', () => {
  it('Analytics: every button click is handler-safe', () => {
    const { container } = wrap(<AnalyticsSurface onAskAna={askAna} />);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(5);
  });

  it('Postmarket: every button click is handler-safe', () => {
    const { container } = wrap(<PostmarketSurface onAskAna={askAna} />);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(5);
  });

  it('Memory: every category/importance/unverified toggle is handler-safe', () => {
    const { container } = wrap(<MemorySurface onAskAna={askAna} />);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(10);
  });

  it('Engineering: every risk-matrix cell click is handler-safe', () => {
    const { container } = wrap(
      <EngineeringSurface program={MOCK_PROGRAM} onAskAna={askAna} />,
    );
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(5);
  });

  it('UDI: every label-preview / format-picker click is handler-safe', () => {
    const { container } = wrap(<UdiSurface onAskAna={askAna} />);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(5);
  });

  it('Admin: every tab/role/state filter across 715 lines is handler-safe', () => {
    const { container } = wrap(<AdminSurface onAskAna={askAna} />);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(10);
  });
});

describe('MDX Files tab — root structure', () => {
  it('renders all five filesystem roots on PathwayPanes(k510)', () => {
    const { container, getByRole } = wrap(
      <PathwayPanes
        pathway="k510"
        workspace={<div data-testid="ws">workspace</div>}
        onAskAna={askAna}
        onOpenEditor={openEditor}
        programId={null}
      />,
    );
    // Click into the Files tab.
    fireEvent.click(getByRole('tab', { name: /Files/i }));
    // Each of the five roots must appear (path strings or label text).
    for (const root of ['Dossier', 'Correspondence', 'Approvals', 'Audit', 'Sources']) {
      expect(container.textContent || '').toContain(root);
    }
  });
});
