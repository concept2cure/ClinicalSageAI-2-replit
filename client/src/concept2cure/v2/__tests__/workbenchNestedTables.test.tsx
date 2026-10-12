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

import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';

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

/** Every table cell, as rendered. Cells carry the raw value (String(v)), not
 *  the six-decimal `fmt` the scalar rows use. */
const cellTexts = (): string[] =>
  Array.from(document.querySelectorAll('td.mono')).map((t) => t.textContent ?? '');

describe('the two-arm RMST result', () => {
  it('renders each arm’s survival table, which is nested one level down', async () => {
    await computeTwoArmRmst();

    const labels = tableLabels();
    expect(labels, 'no per-arm survival table was rendered').toContain('Treatment · Survival Curve');
    expect(labels).toContain('Control · Survival Curve');
  });

  it('renders each arm’s OWN rows, so one table is not drawn twice', async () => {
    await computeTwoArmRmst();

    const cells = cellTexts();
    // The treatment arm's t = 3 survival and the control arm's t = 2 survival.
    // They differ, so a single table rendered under two labels would fail here.
    expect(cells).toContain(String(0.5333333333333334));
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
    expect(tableLabels()).toContain('Survival Curve');
  });
});
