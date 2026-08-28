// @vitest-environment jsdom
/**
 * The enforcement mode control — the one place a platform owner can switch a
 * live product to refusing requests.
 *
 * Four things about it are load-bearing, and each fails silently from the
 * screen alone:
 *
 *   1. IT MUST NOT INVENT A CURRENT VALUE. A failed read must render an error,
 *      not a selector positioned at a guess. An operator who "changes" the mode
 *      from a state the console made up does not know what they just did.
 *   2. IT MUST SAY WHERE THE VALUE CAME FROM. A stored mode and one inherited
 *      from the deployment look identical and behave differently — the second
 *      is put back by the next deploy.
 *   3. IT MUST SHOW WHAT REFUSING WOULD COST, BEFORE THE CONFIRMATION. And it
 *      must not turn "nothing has been recorded" into an all-clear.
 *   4. IT MUST NOT WRITE WITHOUT A REASON, AND MUST NOT REPORT A REFUSED WRITE
 *      AS APPLIED.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/* Stubbed at the ONE fetch convention this repo uses, so `useLiveData`'s shape
   guard and `apiCall`'s error envelope both run their real code. */
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  redactInternals: (s: unknown) => s,
  serverMessage: (b: unknown) => (b as { error?: string } | null)?.error ?? null,
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getJwtOrgId: () => 1 }));

import EnforcementModeControl, {
  ENFORCEMENT_MODE_PATH,
  enforceWarning,
  type EnforcementModeState,
} from '../surfaces/licensing/EnforcementModeControl';

const STATE: EnforcementModeState = {
  mode: 'report',
  source: 'deployment',
  storedMode: null,
  deploymentMode: 'report',
  modes: ['off', 'report', 'enforce'],
  updatedAt: null,
  updatedBy: null,
  reason: null,
  degraded: false,
  propagationSeconds: 30,
  impact: {
    organizationsAffected: 3,
    modulesAffected: ['pv-cockpit'],
    observations: 11,
    observingSince: '2026-08-20T10:00:00.000Z',
    perProcess: true,
  },
};

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body } as unknown as Response);

/** apiRequest THROWS for every non-OK status except 401 — mirror that here. */
function apiError(status: number, body: unknown) {
  const e = new Error((body as { error?: string })?.error ?? `HTTP ${status}`) as Error & {
    name: string;
    status: number;
    payload: unknown;
  };
  e.name = 'ApiRequestError';
  e.status = status;
  e.payload = body;
  return e;
}

function route(state: Partial<EnforcementModeState>, over: { patch?: () => Promise<Response> } = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === ENFORCEMENT_MODE_PATH) return ok({ ...STATE, ...state });
    if (method === 'PATCH' && url === ENFORCEMENT_MODE_PATH && over.patch) return over.patch();
    throw apiError(404, { error: `unrouted ${method} ${url}` });
  });
}

async function mount(state: Partial<EnforcementModeState> = {}, over?: { patch?: () => Promise<Response> }) {
  route(state, over);
  render(<EnforcementModeControl />);
  await screen.findByTestId('ml-enf-mode');
}

/** Drive GovernedConfirmDialog: reason, confirm word, submit. */
async function completeConfirmDialog(reason = 'blast radius reviewed and accepted') {
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(dialog.querySelector('textarea') as HTMLTextAreaElement, {
    target: { value: reason },
  });
  fireEvent.change(dialog.querySelector('input[type="text"]') as HTMLInputElement, {
    target: { value: 'yes' },
  });
  const submit = Array.from(dialog.querySelectorAll('button')).find((b) =>
    /confirm|apply|save|continue/i.test(b.textContent ?? ''),
  );
  fireEvent.click(submit as HTMLButtonElement);
}

const patchCalls = () => apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'PATCH');

beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
});

/* ── Contract 1 ─────────────────────────────────────────────────────────── */

describe('it never offers a choice it cannot ground', () => {
  it('renders an error with a retry when the mode cannot be read', async () => {
    apiRequest.mockImplementation(async () => {
      throw apiError(500, { error: 'settings unavailable' });
    });
    render(<EnforcementModeControl />);

    expect(await screen.findByTestId('ml-enf-mode-error')).toBeTruthy();
    // And NOT a selector sitting at a value nobody confirmed.
    expect(screen.queryByTestId('ml-enf-mode-off')).toBeNull();
    expect(screen.queryByTestId('ml-enf-mode-enforce')).toBeNull();
  });

  it('treats a 200 that is not the documented payload as a failed read', async () => {
    apiRequest.mockImplementation(async () => ok({ unexpected: true }));
    render(<EnforcementModeControl />);
    expect(await screen.findByTestId('ml-enf-mode-error')).toBeTruthy();
    expect(screen.queryByTestId('ml-enf-mode-enforce')).toBeNull();
  });
});

/* ── Contract 2 ─────────────────────────────────────────────────────────── */

describe('it says where the value in force came from', () => {
  it('says an inherited mode is inherited, and will stop being so once set', async () => {
    await mount({ source: 'deployment', storedMode: null });
    const line = screen.getByTestId('ml-enf-mode-source').textContent ?? '';
    expect(line).toMatch(/inherited from how this platform is deployed/i);
    expect(line).toMatch(/no mode has been set here/i);
  });

  it('says a stored mode was set here, with the reason recorded', async () => {
    await mount({
      mode: 'enforce',
      source: 'stored',
      storedMode: 'enforce',
      deploymentMode: 'off',
      updatedAt: '2026-08-24T09:00:00.000Z',
      updatedBy: 4,
      reason: 'denials reviewed, packaging correct',
    });
    const line = screen.getByTestId('ml-enf-mode-source').textContent ?? '';
    expect(line).toMatch(/set in this console/i);
    expect(line).toMatch(/denials reviewed, packaging correct/);
    expect(line).not.toMatch(/inherited/i);
  });

  it('states the window a change takes to reach every server', async () => {
    await mount({ propagationSeconds: 30 });
    expect(screen.getByTestId('ml-enf-mode-source').textContent).toMatch(
      /within 30 seconds, with no restart/i,
    );
  });

  it('says so when the stored value could not be read, rather than presenting it as confirmed', async () => {
    await mount({ degraded: true, mode: 'report', deploymentMode: 'enforce' });
    const card = screen.getByTestId('ml-enf-mode-degraded');
    expect(card.textContent).toMatch(/could not be read/i);
    expect(card.textContent).toMatch(/will not have increased/i);
  });
});

/* ── Contract 3 ─────────────────────────────────────────────────────────── */

describe('it shows what refusing would cost', () => {
  it('names the number of workspaces that would start being refused', async () => {
    await mount({ mode: 'report', impact: { ...STATE.impact, organizationsAffected: 3 } });
    expect(screen.getByTestId('ml-enf-mode-impact').textContent).toMatch(
      /3 workspaces recorded here would start being refused/i,
    );
  });

  it('repeats the count in the confirmation, not only on the panel', async () => {
    await mount({ mode: 'report', impact: { ...STATE.impact, organizationsAffected: 3 } });
    fireEvent.click(screen.getByTestId('ml-enf-mode-enforce'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/3 recorded workspaces would be refused/i);
    expect(dialog.textContent).toMatch(/Start refusing requests/i);
  });

  it('does not turn an empty record into an all-clear', async () => {
    // The failure this catches: "nothing recorded" and "nothing would be
    // refused" render identically and mean opposite things. Only one of them
    // is a green light to switch a live product to refusing.
    await mount({
      mode: 'report',
      impact: { ...STATE.impact, organizationsAffected: 0, observations: 0, observingSince: null },
    });
    const text = screen.getByTestId('ml-enf-mode-impact').textContent ?? '';
    expect(text).toMatch(/not the same as knowing that no workspace would be refused/i);
    expect(text).not.toMatch(/safe to (turn|switch)/i);
  });

  it('informs without obstructing — refusing is still reachable with workspaces at risk', async () => {
    const patch = vi.fn(async () => ok({ ...STATE, mode: 'enforce', source: 'stored' }));
    await mount({ mode: 'report' }, { patch });
    fireEvent.click(screen.getByTestId('ml-enf-mode-enforce'));
    await completeConfirmDialog();
    await waitFor(() => expect(patch).toHaveBeenCalled());
  });

  it('warns about an unmeasured platform when enforcement is not even observing', async () => {
    await mount({
      mode: 'off',
      impact: { ...STATE.impact, organizationsAffected: 0, observations: 0, observingSince: null },
    });
    expect(screen.getByTestId('ml-enf-mode-impact').textContent).toMatch(
      /nothing has been measured on this server/i,
    );
  });

  it('enforceWarning separates the three states it must never collapse', () => {
    const base = STATE;
    expect(enforceWarning(base)).toMatch(/3 workspaces/);
    expect(
      enforceWarning({ ...base, impact: { ...base.impact, organizationsAffected: 0 } }),
    ).toBeNull();
    expect(
      enforceWarning({
        ...base,
        impact: { ...base.impact, organizationsAffected: 0, observingSince: null },
      }),
    ).toMatch(/not the same as knowing/i);
  });
});

/* ── Contract 4 ─────────────────────────────────────────────────────────── */

describe('every change is governed, and reported honestly', () => {
  it('sends nothing until a reason has been given', async () => {
    const patch = vi.fn(async () => ok({ ...STATE, mode: 'enforce' }));
    await mount({ mode: 'report' }, { patch });

    fireEvent.click(screen.getByTestId('ml-enf-mode-enforce'));
    await screen.findByRole('dialog');
    expect(patch).not.toHaveBeenCalled();
    expect(patchCalls()).toHaveLength(0);
  });

  it('sends the chosen mode and the reason verbatim', async () => {
    const patch = vi.fn(async () => ok({ ...STATE, mode: 'enforce', source: 'stored' }));
    await mount({ mode: 'report' }, { patch });

    fireEvent.click(screen.getByTestId('ml-enf-mode-enforce'));
    await completeConfirmDialog('denials reviewed with sales, all correct');
    await waitFor(() => expect(patch).toHaveBeenCalled());

    const sent = patchCalls()[0];
    expect(sent[2]).toEqual({ mode: 'enforce', reason: 'denials reviewed with sales, all correct' });
  });

  it('does not send anything when the same mode is chosen again', async () => {
    const patch = vi.fn(async () => ok(STATE));
    await mount({ mode: 'report' }, { patch });
    fireEvent.click(screen.getByTestId('ml-enf-mode-report'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(patch).not.toHaveBeenCalled();
  });

  it('reports the refusal in the server words, and leaves the mode where it was', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === ENFORCEMENT_MODE_PATH) return ok(STATE);
      throw apiError(400, { error: 'A reason (min 3 chars) is required for this action.' });
    });
    render(<EnforcementModeControl />);
    await screen.findByTestId('ml-enf-mode');

    fireEvent.click(screen.getByTestId('ml-enf-mode-enforce'));
    await completeConfirmDialog();

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/A reason \(min 3 chars\) is required/),
    );
    // The panel must still show the mode the server actually holds.
    expect(screen.getByTestId('ml-enf-mode-report').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('ml-enf-mode-enforce').getAttribute('aria-pressed')).toBe('false');
  });

  it('re-reads after a successful change rather than trusting its own optimism', async () => {
    let mode = 'report';
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === ENFORCEMENT_MODE_PATH) {
        return ok({ ...STATE, mode, source: mode === 'report' ? 'deployment' : 'stored' });
      }
      if (method === 'PATCH' && url === ENFORCEMENT_MODE_PATH) {
        mode = 'enforce';
        return ok({ ...STATE, mode, source: 'stored' });
      }
      throw apiError(404, { error: 'unrouted' });
    });
    render(<EnforcementModeControl />);
    await screen.findByTestId('ml-enf-mode');

    fireEvent.click(screen.getByTestId('ml-enf-mode-enforce'));
    await completeConfirmDialog();

    await waitFor(() =>
      expect(screen.getByTestId('ml-enf-mode-enforce').getAttribute('aria-pressed')).toBe('true'),
    );
    expect(apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'GET')).toHaveLength(2);
  });
});
