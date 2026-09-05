// @vitest-environment jsdom
/**
 * An HFE/UE file nothing has examined may not read like one examined and found
 * controlled — and no state of this screen may draw the two regulatory
 * conclusions it is not entitled to draw.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * `risk.residualRiskAcceptable` is `unmitigatedCriticalTasks === 0`, and that
 * count is a filter over the scenario rows. An HFE/UE file with NO hazard-
 * related use scenarios recorded has zero of everything, so it took exactly the
 * branch of a file that had been analysed and found controlled. The surface then
 * told a regulatory director, over an analysis that had never run:
 *
 *   "Every critical task has a documented mitigation — residual use-related risk
 *    is acceptable and you're clear to run summative."
 *   "Residual use-related risk acceptable"
 *   "All critical tasks are mitigated — summative usability testing may proceed."
 *   summative gate: clear
 *
 * and offered "Draft the HFE/UE report" — a report over an empty analysis, which
 * asserts a conclusion nothing supports. It also reassured, in the state that can
 * least justify it. An empty findings set is not a finding of "none"
 * (assessmentState.ts); clearance is a positive claim needing positive evidence.
 *
 * ── The second, separate defect ──────────────────────────────────────────────
 * Even where the analysis HAD run and every critical task was mitigated, those
 * sentences were still not this screen's to say. Under IEC 62366-1 the
 * acceptability of residual use-related risk is a DOCUMENTED MANUFACTURER
 * DETERMINATION, and readiness for summative evaluation rests on the whole
 * HFE/UE file. Neither follows from a count of unmitigated critical tasks. So
 * the conclusions are gone from every state, cleared included, and what is
 * reported is what the analysis found: no unmitigated critical tasks.
 *
 * ── What these assert ────────────────────────────────────────────────────────
 *   (a) nothing recorded  → says no analysis has run, withholds reassurance,
 *                           and does not borrow the cleared wording or treatment;
 *   (b) a FAILED read     → reads as a failure, never as an empty or clear file;
 *   (c) OVER-CORRECTION   → a genuinely analysed, fully mitigated file still
 *                           reaches CLEAR, with reassurance, and still declines
 *                           the two conclusions.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { HumanFactors } from '../surfaces/HumanFactors';

/* ── The three sentences the surface is no longer entitled to say ──────────── */
const RESIDUAL_ACCEPTABLE = /residual use-related risk is acceptable/i;
const CLEAR_TO_RUN = /clear to run summative/i;
const MAY_PROCEED = /summative usability testing may proceed/i;
const CARD_TITLE_ACCEPTABLE = /^Residual use-related risk acceptable$/;

/** The reassurance line — the AnswerLead renders it, and only it, as `.al-re`. */
const reassurance = () => document.querySelector('.al-re');
/** The gate card's tone class carries the visual treatment of "cleared". */
const gateCard = () => document.querySelector('.hf-gate');
const bodyText = () => document.body.textContent || '';

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });

/** A real HFE/UE file for a real device — with NOTHING analysed on it. */
const NO_SCENARIOS = {
  data: {
    device: 'BX-204 CGM — continuous glucose monitor',
    framework: 'IEC 62366-1',
    present: { useSpecification: true, userProfiles: true },
    scenarios: [],
  },
  meta: { count: 0, source: 'hf_engineering_files' },
};

/**
 * The same file ANALYSED: hazard-related use scenarios on the record, the
 * critical one carrying a documented mitigation. This is the positive evidence
 * clearance requires, and the case the fix must not over-correct away.
 */
const ANALYSED_AND_MITIGATED = {
  data: {
    ...NO_SCENARIOS.data,
    scenarios: [
      {
        id: 'hfs-1',
        task: 'Low-glucose alert response',
        useError: 'Alert dismissed without acting',
        potentialHarmSeverity: 'critical',
        mitigated: true,
      },
      {
        id: 'hfs-2',
        task: 'Sensor insertion',
        useError: 'Applicator seated at the wrong angle',
        potentialHarmSeverity: 'minor',
        mitigated: false,
      },
    ],
  },
  meta: { count: 2, source: 'hf_engineering_files' },
};

/** The same file analysed and NOT controlled — the blocked state, for contrast. */
const ANALYSED_UNMITIGATED = {
  data: {
    ...NO_SCENARIOS.data,
    scenarios: [{ ...ANALYSED_AND_MITIGATED.data.scenarios[0], mitigated: false }],
  },
  meta: { count: 1, source: 'hf_engineering_files' },
};

function mount() {
  return render(
    <HumanFactors
      {...({
        surface: { id: 'human-factors', label: 'Human factors' },
        onAsk: vi.fn(),
        onNav: vi.fn(),
        segment: 'device',
      } as any)}
    />,
  );
}

/** Serve one GET payload; every write is irrelevant to these cases. */
const serve = (payload: unknown) =>
  apiRequest.mockImplementation(async (method: string) =>
    method === 'GET' ? ok(payload) : ok({ data: null }),
  );

afterEach(() => cleanup());
beforeEach(() => apiRequest.mockReset());

describe('HumanFactors — an unexamined HFE/UE file says so', () => {
  it('states that no use-related risk analysis has run', async () => {
    serve(NO_SCENARIOS);
    mount();

    await waitFor(() =>
      expect(
        screen.getByText(/No hazard-related use scenarios are recorded, so no use-related risk analysis has run/i),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Critical-task gate not assessed')).toBeTruthy();
    expect(bodyText()).toMatch(/critical-task gate: not assessed/i);
  });

  it('withholds reassurance in the state that cannot justify it', async () => {
    serve(NO_SCENARIOS);
    mount();
    // Anchored on copy the surface prints in EVERY assessed state, so this case
    // fails on the reassurance itself rather than on the absence of new wording.
    await waitFor(() => expect(bodyText()).toMatch(/complete against IEC 62366-1/));

    expect(reassurance()).toBeNull();
    expect(bodyText()).not.toMatch(/you approve each one/i);
  });

  it('borrows neither the vocabulary nor the visual treatment of cleared', async () => {
    serve(NO_SCENARIOS);
    mount();
    // Version-neutral anchor, for the same reason as above: the point of this
    // case is the four sentences that must NOT be here.
    await waitFor(() => expect(bodyText()).toMatch(/complete against IEC 62366-1/));

    expect(bodyText()).not.toMatch(RESIDUAL_ACCEPTABLE);
    expect(bodyText()).not.toMatch(CLEAR_TO_RUN);
    expect(bodyText()).not.toMatch(MAY_PROCEED);
    expect(bodyText()).not.toMatch(/Every critical task has a documented mitigation/i);
    expect(screen.queryByText('No unmitigated critical tasks')).toBeNull();
    expect(bodyText()).not.toMatch(/critical-task gate: clear/i);
    // The cleared card is `tone-ok`; the unassessed one must not be.
    expect(gateCard()?.className).not.toMatch(/tone-ok/);
  });

  it('offers the step that would produce an answer, not a report over an empty analysis', async () => {
    serve(NO_SCENARIOS);
    mount();
    await waitFor(() => expect(bodyText()).toMatch(/complete against IEC 62366-1/));

    expect(screen.getByRole('button', { name: /Record a hazard-related use scenario/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Draft the HFE\/UE report/i })).toBeNull();
  });
});

describe('HumanFactors — a failed read reads as a failure', () => {
  it('never renders an unreadable file as an empty or a cleared one', async () => {
    apiRequest.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === '/api/human-factors') {
        throw new ApiRequestError('Human-factors store is not provisioned yet.', 503, null, 'PENDING_STORE');
      }
      return ok({ data: null });
    });
    mount();

    await waitFor(() => expect(screen.getByText(/Couldn't load the HFE\/UE file/i)).toBeTruthy());

    expect(bodyText()).not.toMatch(RESIDUAL_ACCEPTABLE);
    expect(bodyText()).not.toMatch(CLEAR_TO_RUN);
    expect(bodyText()).not.toMatch(MAY_PROCEED);
    expect(bodyText()).not.toMatch(/critical-task gate/i);
    // Not "nothing is recorded" either — nobody established that.
    expect(bodyText()).not.toMatch(/No hazard-related use scenarios are recorded/i);
    expect(reassurance()).toBeNull();
  });
});

describe('HumanFactors — the gate still reaches CLEAR when it is earned', () => {
  it('OVER-CORRECTION GUARD: an analysed, fully mitigated file reads clear and reassures', async () => {
    serve(ANALYSED_AND_MITIGATED);
    mount();

    await waitFor(() => expect(screen.getByText('No unmitigated critical tasks')).toBeTruthy());
    expect(bodyText()).toMatch(/critical-task gate: clear/i);
    expect(bodyText()).toMatch(/Every critical task has a documented mitigation/i);
    // Cleared is the one state that may reassure, and it still does.
    expect(reassurance()).not.toBeNull();
    expect(gateCard()?.className).toMatch(/tone-ok/);
    expect(screen.getByRole('button', { name: /Draft the HFE\/UE report/i })).toBeTruthy();
    // …and it is NOT the unassessed copy.
    expect(screen.queryByText('Critical-task gate not assessed')).toBeNull();
  });

  it('reports what the analysis found and stops short of the two determinations', async () => {
    serve(ANALYSED_AND_MITIGATED);
    mount();
    await waitFor(() => expect(bodyText()).toMatch(/complete against IEC 62366-1/));

    expect(bodyText()).not.toMatch(RESIDUAL_ACCEPTABLE);
    expect(bodyText()).not.toMatch(CLEAR_TO_RUN);
    expect(bodyText()).not.toMatch(MAY_PROCEED);
    expect(screen.queryByText(CARD_TITLE_ACCEPTABLE)).toBeNull();
  });

  it('an analysed file with an unmitigated critical task is neither clear nor unassessed', async () => {
    serve(ANALYSED_UNMITIGATED);
    mount();

    await waitFor(() => expect(screen.getByText('Unmitigated critical tasks')).toBeTruthy());
    expect(bodyText()).toMatch(/critical-task gate: blocked/i);
    expect(screen.queryByText('Critical-task gate not assessed')).toBeNull();
    expect(screen.queryByText('No unmitigated critical tasks')).toBeNull();
    expect(gateCard()?.className).toMatch(/tone-err/);
  });
});
