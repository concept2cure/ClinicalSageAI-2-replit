// @vitest-environment jsdom
/**
 * A table one level down is still rendered (2026-10-12).
 *
 * `objectTables` tabulates any top-level array-of-objects in an engine result
 * and does NOT descend. That was fine while every engine returned its tables
 * at the top level. It stopped being fine on 2026-10-12, when
 * `restrictedMeanSurvival` began carrying the Kaplan–Meier table it had always
 * computed and then discarded: in the TWO-ARM case `rmstDifference` embeds
 * each arm's whole result, so the curves sit at `treatment.survivalCurve` and
 * `control.survivalCurve` — one level down.
 *
 * The result was that the single-arm RMST call rendered its survival table and
 * the two-arm call — the common case, treatment against control — rendered
 * nothing, silently. The data was on the wire and the screen did not show it,
 * which reads as "this engine has no curve" rather than "this renderer did not
 * look".
 *
 * The alternative was to copy both curves up to the top level of the
 * difference result, which the working agreement forbids: two places holding
 * one table is how they come to disagree. So the renderer descends one level
 * instead, which fixes it for every engine that nests a table rather than for
 * this one.
 *
 * RED before the fix: the two-arm case renders the scalars and no table.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DefensibilitySection, DesignCalculatorsSection } from '../surfaces/BiostatWorkbench';
import { C2CToast, useToast } from '../toast';

/* `BiostatWorkbench` was a registered surface until 2026-11-09, when the merge
   `docs/SURFACE_CONSOLIDATION_2026-08.md` §5 decided ("Survivor: biostatistics.
   Fold the workbench in as a tab") was carried out. Its two capabilities are
   now sections of the one Biostatistics surface. This harness composes them
   exactly as `surfaces/Biostatistics.tsx` does — same components, same toast —
   so every case below still exercises the real thing. */
function BiostatWorkbench(p: { onNav?: (id: string) => void }) {
  const [toast, fireToast] = useToast();
  return (
    <div className="page-inner" data-work-area="biostatistics">
      <DefensibilitySection fireToast={fireToast} />
      <DesignCalculatorsSection fireToast={fireToast} onNav={p.onNav} />
      <C2CToast msg={toast} />
    </div>
  );
}


const props = () => ({ surface: { id: 'biostat-workbench', label: 'Biostat' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const RMST = '/api/biostat/survival/rmst';

/** The engine's real two-arm shape: each arm's whole RmstResult, nested. */
const TWO_ARM = {
  rmstTreatment: 3.1333333333333337,
  rmstControl: 2.2,
  difference: 0.9333333333333337,
  se: 0.6,
  z: 1.5555,
  pValue: 0.1198,
  ciLower: -0.2426,
  ciUpper: 2.1093,
  tau: 4,
  confLevel: 0.95,
  treatment: {
    rmst: 3.1333333333333337, variance: 0.2749, se: 0.5243, tau: 4, tauBeyondData: false,
    survivalCurve: [
      { time: 1, atRisk: 5, events: 1, survival: 0.8 },
      { time: 3, atRisk: 3, events: 1, survival: 0.5333333333333334 },
    ],
  },
  control: {
    rmst: 2.2, variance: 0.11, se: 0.3316, tau: 4, tauBeyondData: false,
    survivalCurve: [
      { time: 1, atRisk: 5, events: 2, survival: 0.6 },
      { time: 2, atRisk: 3, events: 1, survival: 0.4 },
    ],
  },
  provenance: { method: 'rmst:difference', seed: 0, inputs: {}, note: 'deterministic' },
};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, u: string) => {
    if (u === RMST) return { ok: true, status: 200, json: async () => ({ success: true, data: TWO_ARM }) } as Response;
    return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) } as Response;
  });
});
afterEach(() => cleanup());

async function computeTwoArmRmst() {
  render(<BiostatWorkbench {...props()} />);
  fireEvent.click(await screen.findByText(/Restricted mean survival/i));

  const fill = (label: RegExp, value: string) => {
    const node = screen.getAllByText(label).find((n) => n.closest('label'))!;
    const el = node.closest('label')!.querySelector('input, textarea') as HTMLElement;
    fireEvent.change(el, { target: { value } });
  };
  fill(/^Restriction time/, '4');
  // Both arms, so the engine takes the difference path.
  fill(/^Treatment — times/, '1, 2, 3, 4, 5');
  fill(/^Treatment — event flags/, '1, 0, 1, 1, 0');
  fill(/^Control — times/, '1, 1, 2, 3, 6');
  fill(/^Control — event flags/, '1, 1, 1, 0, 1');

  fireEvent.click(screen.getByRole('button', { name: /compute/i }));
  await waitFor(() => expect(screen.getByText(/0\.933333/)).toBeTruthy());
}

/** The label the renderer puts above each table (a div, not a caption). */
const tableLabels = (): string[] =>
  Array.from(document.querySelectorAll('div'))
    .map((d) => (d.firstChild?.nodeType === 3 ? (d.textContent ?? '') : ''))
    .filter((t) => t && t.length < 60);

/** Every table cell, as rendered. Cells carry the engine's value to fifteen significant digits
 *  (engineResultCellText), not the six-decimal `fmt` the scalar rows use. */
const cellTexts = (): string[] =>
  Array.from(document.querySelectorAll('td.mono')).map((t) => t.textContent ?? '');

describe('the two-arm RMST result', () => {
  it('renders each arm’s survival table, which is nested one level down', async () => {
    await computeTwoArmRmst();

    const labels = tableLabels();
    // Labels come from the shared label helper since 2026-11-13 (sentence case; finding 67 below).
    expect(labels, 'no per-arm survival table was rendered').toContain('Treatment · Survival curve');
    expect(labels).toContain('Control · Survival curve');
  });

  it('renders each arm’s OWN rows, so one table is not drawn twice', async () => {
    await computeTwoArmRmst();

    const cells = cellTexts();
    // The treatment arm's t = 3 survival and the control arm's t = 2 survival.
    // They differ, so a single table rendered under two labels would fail here.
    // Fifteen significant digits (engineResultCellText): 0.5333333333333334 prints 0.533333333333333.
    expect(cells).toContain('0.533333333333333');
    expect(cells).toContain('0.4');
    // And the at-risk / event counts that distinguish the arms at t = 1:
    // treatment had 1 event there, control had 2.
    expect(cells.filter((c) => c === '2').length).toBeGreaterThan(0);
  });

  it('still renders the scalars beside the tables', async () => {
    await computeTwoArmRmst();
    // The difference, through scalarRows' six-decimal formatting.
    expect(screen.getByText('0.933333')).toBeTruthy();
    expect((document.body.textContent ?? '')).toMatch(/Tau4/);
  });

  it('leaves the single-arm result rendering its one table, as it already did', async () => {
    apiRequest.mockImplementation(async (_m: string, u: string) => {
      if (u === RMST) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: {
          rmst: 3.1333333333333337, variance: 0.2749, se: 0.5243, tau: 4, tauBeyondData: false,
          survivalCurve: [{ time: 1, atRisk: 5, events: 1, survival: 0.8 }],
        } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) } as Response;
    });

    render(<BiostatWorkbench {...props()} />);
    fireEvent.click(await screen.findByText(/Restricted mean survival/i));
    const node = screen.getAllByText(/^Restriction time/).find((n) => n.closest('label'))!;
    fireEvent.change(node.closest('label')!.querySelector('input')!, { target: { value: '4' } });
    for (const [label, value] of [[/^Treatment — times/, '1, 2, 3, 4, 5'], [/^Treatment — event flags/, '1, 0, 1, 1, 0']] as const) {
      const n = screen.getAllByText(label).find((x) => x.closest('label'))!;
      fireEvent.change(n.closest('label')!.querySelector('input')!, { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: /compute/i }));

    await waitFor(() => expect(screen.getByText('3.133333')).toBeTruthy());
    // Top level, so no arm prefix.
    expect(tableLabels()).toContain('Survival curve');
  });
});

/* S12 biotech sweep, finding 67 (2026-11-09): the group-sequential result's "Per Look" column printed
   the raw per-look array as JSON ('[{"look":1,"informationFraction":0.5,…}]'), cells printed binary
   noise (0.025000000000000005, 0.9750000000000004) and labels read "Type IError". The per-look rows are a
   table of their own, cells carry fifteen significant digits, and labels come from the one label helper
   (shared/biostat-vocabulary.ts humanizeKey). */
describe('the group-sequential result', () => {
  const GS = '/api/biostat/adaptive/oc-exact';
  const look = (k: number, fraction: number, boundary: number, cum: number) => ({
    look: k, informationFraction: fraction, efficacyBoundary: boundary, futilityBoundary: null,
    efficacyStopProbability: cum, futilityStopProbability: 0, stopProbability: cum, cumulativeRejectProbability: cum,
  });
  const RESULT = {
    boundaries: { informationFractions: [0.5, 1], efficacyBoundaries: [2.962707240193933, 1.968902671346611] },
    spending: { spendingFunction: 'obrien-fleming', alpha: 0.025, cumulativeAlpha: [0.0015, 0.025], incrementalAlpha: [0.0015, 0.0235] },
    characteristics: [
      { drift: 0, rejectProbability: 0.025000000000000005, futilityStopProbability: 0.9750000000000004, expectedInformationFraction: 0.9992,
        perLook: [look(1, 0.5, 2.962707240193933, 0.0015), look(2, 1, 1.968902671346611, 0.025000000000000005)] },
      { drift: 2.8, rejectProbability: 0.7965, futilityStopProbability: 0.2035, expectedInformationFraction: 0.91,
        perLook: [look(1, 0.5, 2.962707240193933, 0.1617), look(2, 1, 1.968902671346611, 0.7965)] },
    ],
    typeIError: 0.025000000000000005,
    assurance: null,
    provenance: { method: 'gs-oc:exact', seed: 0, inputs: {}, note: 'deterministic' },
  };

  async function computeGs() {
    apiRequest.mockImplementation(async (_m: string, u: string) => {
      if (u === GS) return { ok: true, status: 200, json: async () => ({ success: true, data: RESULT }) } as Response;
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) } as Response;
    });
    render(<BiostatWorkbench {...props()} />);
    fireEvent.click(await screen.findByText(/Group-sequential operating characteristics/i));
    const node = screen.getAllByText(/^Information fractions/).find((n) => n.closest('label'))!;
    fireEvent.change(node.closest('label')!.querySelector('input, textarea')!, { target: { value: '0.5, 1' } });
    fireEvent.click(screen.getByRole('button', { name: /compute/i }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === GS)).toBe(true));
    await waitFor(() => expect(cellTexts().length).toBeGreaterThan(0));
  }

  it('renders the per-look rows as a table, not as JSON in a cell', async () => {
    await computeGs();
    expect(cellTexts().some((c) => c.startsWith('[{') || c.startsWith('{"'))).toBe(false);
    expect(tableLabels()).toContain('Characteristics · Per look');
    // Each per-look row says which scenario it belongs to.
    expect(cellTexts()).toContain('2.8');
    expect(cellTexts()).toContain('2.96270724019393');
  });

  it('prints the engine’s figures without binary noise', async () => {
    await computeGs();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/0\.025000000000000005|0\.9750000000000004/);
    expect(cellTexts()).toContain('0.025');
    expect(cellTexts()).toContain('0.975');
  });

  it('keeps acronyms and Type I whole in its labels', async () => {
    await computeGs();
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Type I error/);
    expect(text).not.toMatch(/Type IError/);
  });
});
