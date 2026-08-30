// @vitest-environment jsdom
/**
 * The IEC 62366-1 summative-evaluation gate cannot be cleared by a click that
 * writes nothing.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * HumanFactors.tsx:239 — "Mitigate" on an unmitigated CRITICAL task was
 *
 *   const mitigate = (idx) => setScenarioEdit(scenarios.map(...mitigated: true))
 *
 * and nothing else. `risk.residualRiskAcceptable` is computed from those same
 * rows, and it drives the gate banner and the section header — so one click on
 * the last unmitigated critical task flipped the §5.9 gate from
 *   "Residual use-related risk not acceptable … must be mitigated before
 *    summative testing"
 * to
 *   "All critical tasks are mitigated — summative usability testing may proceed."
 * with no request made, nothing stored, and a silent revert on reload. A device
 * human-factors reviewer could read CLEAR off a screen whose record said BLOCKED.
 *
 * The element tiles (HumanFactors.tsx:251) had the same shape: `toggleEl` was
 * `setPresentEdit(...)`, so the HFE/UE file-completeness percentage moved with
 * every tick and none of it was written.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN, not the controls:
 *   · clicking Mitigate makes no state change at all — it opens a governed
 *     drawer, and the gate is still BLOCKED while it is open;
 *   · submitting sends PATCH /api/human-factors/scenarios/:id/mitigate carrying
 *     the reason for change;
 *   · a REFUSED write leaves the task unmitigated and the gate BLOCKED, and says
 *     so — the assertion that matters most;
 *   · only a server-acknowledged mitigation clears the gate;
 *   · an element tick reaches PATCH /api/human-factors/elements and adopts the
 *     map the SERVER returned, so completeness cannot drift from the record;
 *   · a refused element tick leaves completeness where it was.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { HumanFactors } from '../surfaces/HumanFactors';

const REASON = 'Alarm escalation redesign verified in formative round 3; risk control RC-14 documented';

/** One critical task, unmitigated: the gate reads BLOCKED. */
const FILE = {
  data: {
    device: 'BX-204 CGM — continuous glucose monitor',
    framework: 'IEC 62366-1',
    present: { useSpecification: true, userProfiles: true },
    scenarios: [
      {
        id: 'hfs-1',
        task: 'Low-glucose alert response',
        useError: 'Alert dismissed without acting',
        potentialHarmSeverity: 'critical',
        mitigated: false,
      },
    ],
  },
  meta: { count: 1, source: 'hf_engineering_files' },
};

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });

function mount() {
  return render(<HumanFactors surface={{ id: 'human-factors', label: 'Human factors' } as never}
    onAsk={vi.fn()} onNav={vi.fn()} segment="device" />);
}

/** The one sentence the gate prints when it is CLEAR. */
/* Was /summative usability testing may proceed/i. That sentence was removed on
   purpose: summative readiness rests on the whole HFE/UE file, and under
   IEC 62366-1 residual-risk acceptability is a documented manufacturer
   determination — neither follows from a count of unmitigated critical tasks,
   so the screen no longer asserts either. The gate still clears; it now reports
   what the analysis FOUND, and that is what this matcher looks for. */
const CLEAR = /No unmitigated critical tasks/i;
const BLOCKED = /must be mitigated before summative testing/i;

/** The completeness sentence is split across <b> nodes, so read the tree. */
const bodyText = () => document.body.textContent || '';
/** The ROW's control. The AnswerLead offers "Mitigate <task>"; this is the
 *  bare one in the use-related risk table. */
const rowMitigate = () => screen.getByRole('button', { name: 'Mitigate' });

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string) =>
    method === 'GET' ? ok(FILE) : ok({ data: null }),
  );
});

describe('HumanFactors — the summative gate reads the record', () => {
  it('starts BLOCKED on an unmitigated critical task', async () => {
    mount();
    await waitFor(() => expect(screen.getByText(BLOCKED)).toBeTruthy());
    expect(screen.queryByText(CLEAR)).toBeNull();
  });

  it('clicking Mitigate writes nothing and does NOT clear the gate', async () => {
    mount();
    await waitFor(() => expect(screen.getByText(BLOCKED)).toBeTruthy());
    apiRequest.mockClear();

    fireEvent.click(rowMitigate());

    // No request is made by the click itself…
    expect(apiRequest).not.toHaveBeenCalled();
    // …and the gate is still blocked with the drawer open.
    expect(screen.getByText(BLOCKED)).toBeTruthy();
    expect(screen.queryByText(CLEAR)).toBeNull();
    expect(screen.getByText(/Record a mitigation/)).toBeTruthy();
  });

  it('a REFUSED mitigation leaves the task unmitigated and the gate BLOCKED', async () => {
    mount();
    await waitFor(() => expect(screen.getByText(BLOCKED)).toBeTruthy());
    fireEvent.click(rowMitigate());

    apiRequest.mockImplementation(async (method: string) => {
      if (method === 'GET') return ok(FILE);
      throw new ApiRequestError('The HFE/UE file is locked for summative review.', 409, null, 'CONFLICT');
    });
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Record mitigation/ }));

    await waitFor(() =>
      expect(screen.getByText(/Mitigation not recorded/)).toBeTruthy(),
    );
    expect(screen.getByText(/locked for summative review/)).toBeTruthy();
    expect(screen.getByText(/summative gate is unchanged/)).toBeTruthy();
    expect(screen.getByText(BLOCKED)).toBeTruthy();
    expect(screen.queryByText(CLEAR)).toBeNull();
  });

  it('carries the reason for change to PATCH …/scenarios/:id/mitigate and only then clears the gate', async () => {
    mount();
    await waitFor(() => expect(screen.getByText(BLOCKED)).toBeTruthy());
    fireEvent.click(rowMitigate());
    apiRequest.mockClear();
    apiRequest.mockImplementation(async (method: string) =>
      method === 'GET'
        ? ok(FILE)
        : ok({ data: { ...FILE.data.scenarios[0], mitigated: true } }),
    );

    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Record mitigation/ }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [method, path, body] = apiRequest.mock.calls[0];
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/human-factors/scenarios/hfs-1/mitigate');
    expect(body).toEqual({ reasonForChange: REASON });

    await waitFor(() => expect(screen.getByText(CLEAR)).toBeTruthy());
    expect(screen.queryByText(BLOCKED)).toBeNull();
  });

  it('refuses a reason for change too short to be one, without calling the server', async () => {
    mount();
    await waitFor(() => expect(screen.getByText(BLOCKED)).toBeTruthy());
    fireEvent.click(rowMitigate());
    apiRequest.mockClear();

    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: 'typo' } });
    fireEvent.click(screen.getByRole('button', { name: /Record mitigation/ }));

    await waitFor(() => expect(screen.getByText(/at least 8 characters/)).toBeTruthy());
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByText(BLOCKED)).toBeTruthy();
  });
});

describe('HumanFactors — HFE/UE completeness reads the record', () => {
  it('writes an element tick to PATCH /api/human-factors/elements and adopts the stored map', async () => {
    mount();
    await waitFor(() => expect(bodyText()).toMatch(/20% complete against IEC 62366-1/));
    apiRequest.mockClear();
    apiRequest.mockImplementation(async (method: string) =>
      method === 'GET'
        ? ok(FILE)
        : ok({
            data: {
              device: FILE.data.device,
              framework: 'IEC 62366-1',
              // The SERVER's map is what the surface must show — note it stored
              // three elements, not the two the click implied.
              present: { useSpecification: true, userProfiles: true, useEnvironments: true },
            },
          }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Use environments/ }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [method, path, body] = apiRequest.mock.calls[0];
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/human-factors/elements');
    expect(body).toEqual({ element: 'useEnvironments', present: true });

    await waitFor(() => expect(bodyText()).toMatch(/30% complete against IEC 62366-1/));
  });

  it('a REFUSED element tick leaves completeness where the record has it', async () => {
    mount();
    await waitFor(() => expect(bodyText()).toMatch(/20% complete against IEC 62366-1/));
    apiRequest.mockImplementation(async (method: string) => {
      if (method === 'GET') return ok(FILE);
      throw new ApiRequestError('Human-factors store is not provisioned yet.', 503, null, 'PENDING_STORE');
    });

    fireEvent.click(screen.getByRole('button', { name: /Use environments/ }));
    await waitFor(() => expect(screen.getByText(/Element not saved/)).toBeTruthy());
    expect(screen.getByText(/not provisioned yet/)).toBeTruthy();
    expect(bodyText()).toMatch(/20% complete against IEC 62366-1/);
  });
});
