// @vitest-environment jsdom
/**
 * An SAE case nobody has assessed must not read as a case found non-reportable.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * `pv/expedited-reporting-clock.ts` returns `category: 'none'` for TWO different
 * cases, and says so in its own comment: "Absent (null/undefined) is 'not
 * assessed'; a recorded empty list is 'assessed, no criterion met'. Both yield
 * the same determination — only the stated reason differs, and only one of them
 * is true of an unassessed case." It carries `unassessedInputs` precisely so a
 * reader can tell them apart, and `sae-cases-view-assembler.ts` passes it
 * through as `reportingUnassessedInputs`.
 *
 * `SafetyNarrative.tsx` declared that field on its row type and read it
 * NOWHERE. Both cases rendered the same bold headline — "No expedited reporting
 * clock." — in the same neutral box, with only the smaller continuation
 * sentence differing. A false non-reportable on a 7- or 15-calendar-day IND
 * safety report (21 CFR 312.32(c)(1)(i)) is a reportability miss, so the
 * headline must state the absence of a determination, never a determination of
 * absence.
 *
 * (The coverage review recorded this as both cases rendering identically. That
 * overstates it — the `basis` sentence was always rendered and always honest.
 * What was identical was the headline, the border and the background: the three
 * things a reader takes in first.)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SafetyNarrative } from '../surfaces/SafetyNarrative';

const props = () => ({ surface: { id: 'safety-narrative', label: 'Safety' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

/** One case row as `/api/safety-narratives/cases` assembles it. */
const caseRow = (over: Record<string, unknown> = {}) => ({
  id: 'SAE-0001',
  clock: 'Day 0',
  patient: { id: 'P-1', age: 54, sex: 'F' },
  drug: 'DrugX',
  events: [{ term: 'Hepatotoxicity', onset: '2026-09-01' }],
  outcome: 'recovered',
  narrative: 'A deterministic narrative.',
  reportingCategory: 'none',
  reportingClockStart: null,
  reportingDueDate: null,
  reportingDaysRemaining: null,
  reportingOverdue: false,
  ...over,
});

/** The clock service's own wording for each of the two `category: 'none'` cases. */
const ASSESSED_BASIS = 'No expedited reporting clock — not serious, not unexpected (listed), no suspected causality.';
const UNASSESSED_BASIS =
  'No expedited reporting clock has been established — seriousness not assessed, expectedness not assessed, causality not assessed. ' +
  'This is NOT a determination that the case is non-reportable: seriousness, expectedness, causality have not been assessed.';

function renderWith(row: Record<string, unknown>) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    const body = url.startsWith('/api/safety-narratives/cases') ? [row] : {};
    return { ok: true, status: 200, json: async () => ({ success: true, data: body }) } as Response;
  });
  render(<SafetyNarrative {...props()} />);
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
});

describe('an unassessed SAE case is not a non-reportable one', () => {
  it('does not head an unassessed case with "No expedited reporting clock"', async () => {
    renderWith(caseRow({
      reportingBasis: UNASSESSED_BASIS,
      reportingUnassessedInputs: ['seriousness', 'expectedness', 'causality'],
    }));
    const box = await screen.findByTestId('sae-reporting-clock');
    // The defect: the determination's own headline on a case nobody assessed.
    expect(box.textContent).not.toMatch(/^No expedited reporting clock/);
    expect(box.textContent).toMatch(/Reportability not determined/);
    expect(box.textContent).toMatch(/not been assessed/);
    // And it says plainly what it is NOT.
    expect(box.textContent).toMatch(/not a finding that no report is required/);
  });

  it('names which of the three inputs carry no assessment', async () => {
    renderWith(caseRow({
      reportingBasis: UNASSESSED_BASIS,
      reportingUnassessedInputs: ['expectedness'],
    }));
    const box = await screen.findByTestId('sae-reporting-clock');
    expect(box.textContent).toMatch(/Expectedness has not been assessed/);
  });

  it('marks the two cases as different states, so neither reads as the other', async () => {
    renderWith(caseRow({
      reportingBasis: UNASSESSED_BASIS,
      reportingUnassessedInputs: ['causality'],
    }));
    expect((await screen.findByTestId('sae-reporting-clock')).getAttribute('data-state')).toBe('not-assessed');
  });

  it('still states the determination when the case WAS assessed and found non-reportable', async () => {
    renderWith(caseRow({ reportingBasis: ASSESSED_BASIS, reportingUnassessedInputs: [] }));
    const box = await screen.findByTestId('sae-reporting-clock');
    // A real determination keeps its headline — the fix must not turn every
    // non-reportable case into "not determined".
    expect(box.textContent).toMatch(/No expedited reporting clock/);
    expect(box.textContent).not.toMatch(/Reportability not determined/);
    expect(box.getAttribute('data-state')).toBe('determined-none');
  });

  it('reads an older server that returns no such field as a determination, not as not-assessed', async () => {
    // Absent is not evidence of an unassessed case; inventing the state would be
    // the mirror of the defect.
    renderWith(caseRow({ reportingBasis: ASSESSED_BASIS }));
    const box = await screen.findByTestId('sae-reporting-clock');
    expect(box.getAttribute('data-state')).toBe('determined-none');
    expect(box.textContent).not.toMatch(/Reportability not determined/);
  });

  /* ── The boundary the FIRST version of this fix got wrong (C-7c) ──────────
     It inferred "no verdict" as `unassessedInputs.length > 0`. Decision P-20's
     follow-up (docs/LAUNCH_DEFINITION_OF_DONE.md) and `classifyIndSafetyReport`'s
     Gate 0 both hold that an event recorded NON-SERIOUS, or not suspected, is
     not expedited on those stated facts — a determination — even with
     expectedness still blank. So a decided case was headed "Reportability not
     determined", which is the mirror of the defect this screen was fixed for.
     The engine now decides (`reportabilityDetermined`) and this screen reads it. */
  it('does NOT say "not determined" for a case ruled out on its stated facts', async () => {
    renderWith(caseRow({
      // Recorded not serious; expectedness and causality never assessed.
      reportingUnassessedInputs: ['expectedness', 'causality'],
      reportingDetermined: true,
      reportingBasis:
        'No expedited reporting clock — not serious. Decided on the facts recorded; expectedness, causality are not assessed and does not change it.',
    }));
    const box = await screen.findByTestId('sae-reporting-clock');
    expect(box.getAttribute('data-state')).toBe('determined-none');
    expect(box.textContent).not.toMatch(/Reportability not determined/);
    expect(box.textContent).toMatch(/No expedited reporting clock/);
  });

  it('still says "not determined" when the engine says there is no verdict', async () => {
    renderWith(caseRow({
      reportingUnassessedInputs: ['expectedness'],
      reportingDetermined: false,
      reportingBasis: UNASSESSED_BASIS,
    }));
    const box = await screen.findByTestId('sae-reporting-clock');
    expect(box.getAttribute('data-state')).toBe('not-assessed');
    expect(box.textContent).toMatch(/Reportability not determined/);
  });

  it('falls back to the old inference on a server that does not send the verdict', async () => {
    // Previous behaviour, not a guess at a field the server did not send.
    renderWith(caseRow({ reportingUnassessedInputs: ['causality'], reportingBasis: UNASSESSED_BASIS }));
    expect((await screen.findByTestId('sae-reporting-clock')).getAttribute('data-state')).toBe('not-assessed');
  });

  it('leaves a real 15-day clock alone', async () => {
    renderWith(caseRow({
      reportingCategory: '15-day',
      reportingClockStart: '2026-09-02',
      reportingDueDate: '2026-09-17',
      reportingDaysRemaining: 5,
      reportingBasis: 'Serious + unexpected + suspected causality (not fatal/life-threatening) → 15-calendar-day IND safety report (21 CFR 312.32(c)(1)(i)).',
      reportingUnassessedInputs: [],
    }));
    const box = await screen.findByTestId('sae-reporting-clock');
    expect(box.textContent).toMatch(/15-day expedited report — due 2026-09-17/);
    expect(box.getAttribute('data-state')).toBe('due');
  });
});
