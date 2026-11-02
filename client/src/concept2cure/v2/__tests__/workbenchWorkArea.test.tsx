// @vitest-environment jsdom
/**
 * The design calculators are a work area, and a work area has one primary.
 *
 * ── What it was ──────────────────────────────────────────────────────────────
 * Four stacked `.pj-card`s inside `.cm-body`, headed by an intro card whose
 * heading row carried a ghost button reading "Your study designs and
 * documents" as the only way back. The orange fill — the colour that says
 * "this is the next thing to do" — was on four controls at once:
 *
 *   • "Assess defensibility", which is the page's one real action;
 *   • "Compute", in the calculator panel;
 *   • whichever of the TWENTY-NINE engine buttons was selected, so the
 *     strongest colour on the screen marked a choice the reader had already
 *     made;
 *   • "Open plan", a lookup by id in the adaptive-monitoring panel.
 *
 * (A fifth, "Sign decision…", appears only once a plan is loaded. Its
 * ceremony's own confirm is inside `EsignModal`, so the button that opens the
 * dialog is not the primary either.)
 *
 * ── What these assert ────────────────────────────────────────────────────────
 * D5 §B.4 steps 9–11 and §B.6.1. jsdom has no stylesheet, so these read the
 * class that carries the fill rather than the computed colour; the
 * running-app probe in `docs/evidence/DESIGN/D5/2026-11-02-d5-4/` measures the
 * colour itself, at 1440 light and dark and at 390.
 *
 * They live in their own file rather than in `biostatWorkbench.test.tsx`
 * because that file is at the repository's 500-line ceiling, and the
 * focused-file pattern is this directory's own (`workbenchHazardRatioLabel`,
 * `workbenchRendersNotComputedReason`).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';

const props = () => ({ surface: { id: 'biostat-workbench', label: 'Biostat' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
/** The work area, named as missing rather than thrown through as a null. */
function area(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-work-area="biostat-workbench"]');
  if (!el) throw new Error('the workbench rendered no [data-work-area="biostat-workbench"] root');
  return el;
}

afterEach(() => cleanup());

describe('BiostatWorkbench — the work-area pattern (D5-4)', () => {
  it('carries exactly one filled primary, and it is the defensibility assessment', () => {
    render(<BiostatWorkbench {...props()} />);
    expect(
      [...area().querySelectorAll('.btn.primary')].map((el) => el.textContent?.trim()),
      'a work area has one primary (§WA.4.2 rule 7)',
    ).toEqual(['Assess defensibility']);
  });

  it('offers the engines as a choice, not as twenty-nine next actions', () => {
    render(<BiostatWorkbench {...props()} />);
    const pills = [...area().querySelectorAll<HTMLButtonElement>('.wb-engines .btn')];
    expect(pills.length).toBeGreaterThan(20);
    expect(pills.some((el) => el.classList.contains('primary')), 'the chosen engine is still an orange fill').toBe(false);
    // The choice is still announced — it moved from a colour to a state.
    expect(pills.filter((el) => el.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('frames the page with the back link and one heading, not an intro card', () => {
    render(<BiostatWorkbench {...props()} />);
    expect(area().querySelector('.pj-back')?.textContent).toMatch(/Biostatistics/);
    const h1 = area().querySelectorAll('h1.ph-title');
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe('Design calculators');
    expect(area().querySelector('.pj-card'), 'a card is left inside the work area').toBeNull();
  });

  it('never repeats the page title as one of its section headings', () => {
    /* The first build of this slice headed the engine list "Design
       calculators" — the page's own `h1`, twelve lines above it. */
    render(<BiostatWorkbench {...props()} />);
    const title = area().querySelector('h1.ph-title')!.textContent;
    const sections = [...area().querySelectorAll('.pj-sec h2')].map((el) => el.textContent);
    expect(sections).not.toContain(title);
    expect(sections).toEqual(['Statistical defensibility', 'Engines', 'Adaptive monitoring', 'Method precedent']);
  });
});
