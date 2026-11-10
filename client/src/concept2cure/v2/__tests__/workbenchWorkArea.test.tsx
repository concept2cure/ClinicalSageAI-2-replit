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

import { Biostatistics } from '../surfaces/Biostatistics';

const props = () => ({ surface: { id: 'biostatistics', label: 'Biostatistics' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const BiostatWorkbench = Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;
/** The work area, named as missing rather than thrown through as a null. */
function area(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-work-area="biostatistics"]');
  if (!el) throw new Error('the workbench rendered no [data-work-area="biostatistics"] root');
  return el;
}

afterEach(() => cleanup());

describe('Biostatistics — the work-area pattern (D5-4), on the one surface', () => {
  it('carries exactly one filled primary, and it is the editor hand-off', () => {
    render(<BiostatWorkbench {...props()} />);
    /* §WA.4.2 rule 7: one primary per view. The merged surface's primary is
       taking the document into the one editor. "Assess defensibility" was the
       retired surface's primary and is a plain button here — otherwise the fold
       would have put two orange fills on one page. */
    const primaries = [...area().querySelectorAll('.btn.primary')].map((el) => el.textContent?.trim());
    expect(primaries, 'a work area has one primary (§WA.4.2 rule 7)').toHaveLength(1);
    expect(primaries[0]).toMatch(/editor/i);
  });

  it('offers the engines as a choice, not as twenty-nine next actions', () => {
    render(<BiostatWorkbench {...props()} />);
    const pills = [...area().querySelectorAll<HTMLButtonElement>('.wb-engines .btn')];
    expect(pills.length).toBeGreaterThan(20);
    expect(pills.some((el) => el.classList.contains('primary')), 'the chosen engine is still an orange fill').toBe(false);
    // The choice is still announced — it moved from a colour to a state.
    expect(pills.filter((el) => el.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('frames the page with one heading', () => {
    render(<BiostatWorkbench {...props()} />);
    const h1 = area().querySelectorAll('h1.ph-title');
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe('Biostatistics');
  });

  it('never repeats the page title as one of its section headings', () => {
    /* The first build of this slice headed the engine list "Design
       calculators" — the page's own `h1`, twelve lines above it. */
    render(<BiostatWorkbench {...props()} />);
    const title = area().querySelector('h1.ph-title')!.textContent;
    const sections = [...area().querySelectorAll('.pj-sec h2')].map((el) => el.textContent);
    expect(sections).not.toContain(title);
    /* The two capabilities folded in from the retired `biostat-workbench` on
       2026-11-09 are sections of this surface, named as themselves. "Engines"
       became "Design calculators" when it stopped repeating a page title that
       no longer exists. Asserted by presence rather than as an exact list: the
       rule under test is that no section repeats the page's own title. */
    expect(sections).toContain('Statistical defensibility');
    expect(sections).toContain('Design calculators');
    expect(new Set(sections).size, 'two sections share a heading').toBe(sections.length);
  });
});
