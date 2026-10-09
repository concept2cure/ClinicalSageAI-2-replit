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
 * Like the sibling suite, everything runs against in-memory fixture data.
 *
 * Surfaces no longer fall back to fixtures when a fetch fails — a silent
 * fixture is indistinguishable from real regulated data, so the fallback
 * was removed. Example content is now reachable only through sample mode,
 * which this suite enables explicitly in beforeEach. That is the supported
 * way to ask for populated surfaces, and it keeps the test measuring what
 * it was written to measure: that every handler survives a click on a rich
 * surface, rather than that a 404 happens to render one.
 */

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { AnalyticsSurface }   from '../../client/src/concept2cure/mdx/surfaces/AnalyticsSurface';
import { PostmarketSurface }  from '../../client/src/concept2cure/mdx/surfaces/PostmarketSurface';
import { EngineeringSurface } from '../../client/src/concept2cure/mdx/surfaces/EngineeringSurface';
import { UdiSurface }         from '../../client/src/concept2cure/mdx/surfaces/UdiSurface';
import { PathwayPanes }       from '../../client/src/concept2cure/mdx/surfaces/pathway/PathwayPanes';

import { setSampleMode } from '../../client/src/concept2cure/mdx/lib/sampleMode';

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
  /* Opt in to the canonical example content. Must come *after* the
     localStorage clear above, which would otherwise wipe the flag —
     surfaces would then render their empty states with nothing to click. */
  setSampleMode(true);
});

/* Sample mode is global state; leaving it on would silently populate any
   suite that runs after this one in the same worker. */
afterEach(() => setSampleMode(false));

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

/**
 * Click every enabled <button> the surface can *reach*, not just the ones it
 * paints first.
 *
 * The original helper took one `querySelectorAll('button')` snapshot and
 * clicked that list. That measured the whole surface only while every panel
 * rendered flat. Engineering and UDI now hold their rich content — DHF strip,
 * ISO 14971 heatmap, design-controls trace, change requests, device registry,
 * ISO 15223-1 symbols, MRI matrix — inside the "Situational awareness"
 * accordion, collapsed on first paint by design (the surfaces' own module docs
 * say so). A single snapshot therefore saw two controls: the accordion head and
 * one `DataGate` retry. Clicking the head revealed the rest *after* the list
 * had already been taken, so the suite drove none of it — which is the opposite
 * of what its name claims.
 *
 * So: click, re-query, click whatever the last click revealed, until the set
 * closes. Elements are tracked by DOM identity, so a control that survives a
 * re-render is clicked exactly once and an accordion is never toggled shut by
 * this helper; a genuinely remounted control (tab switch) is a new node and is
 * driven again, which is the handler-safety property under test. `maxRounds`
 * bounds a surface that ping-pongs between two panels.
 *
 * After every click the container must still hold rendered content (the surface
 * didn't crash and unmount itself). Returns the number of buttons clicked, so
 * the test fails fast if a surface degenerates to a handful of interactive
 * controls — a refactor that accidentally removed interactivity, or a
 * disclosure control that no longer discloses anything.
 */
function clickEveryButton(container: HTMLElement, maxRounds = 8): { clicked: number } {
  const seen = new Set<Element>();
  let clicked = 0;
  for (let round = 0; round < maxRounds; round++) {
    const fresh = (
      Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
    ).filter((b) => !b.disabled && !seen.has(b));
    if (fresh.length === 0) break;
    for (const b of fresh) {
      seen.add(b);
      fireEvent.click(b);
      clicked++;
    }
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

  // No MemorySurface case: the kit's AnA Memory surface was retired — v2 `ana-memory` reads the same /api/mdx/ana/memory endpoint and is write-capable, so two of them was one duplicate too many.

  it('Engineering: every risk-matrix cell click is handler-safe', () => {
    const { container } = wrap(
      <EngineeringSurface program={MOCK_PROGRAM} onAskAna={askAna} />,
    );
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(5);
  });

  it('UDI: every label-preview / format-picker click is handler-safe', () => {
    const { container } = wrap(<UdiSurface onAskAna={askAna} />);
    /* The controls this case is named for are per-document: the row-open button
       and the Ask-AnA chip inside "documents in flight". The panel frame draws
       its framework chips whether or not a single row reached it, so the button
       count alone cannot tell "the gate rendered" from "the gate's rows reached
       the panel" — which is exactly the defect that was here. Pin the rows. */
    expect(container.querySelectorAll('.docs-row').length).toBeGreaterThan(0);
    const { clicked } = clickEveryButton(container);
    expect(clicked).toBeGreaterThan(5);
  });

  // No AdminSurface case: the kit's admin surface was never imported by its own app and is deleted; admin is product-level (v2 `admin-console`).
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
