// @vitest-environment jsdom
/**
 * Time-limited grants panel — the operator has to be able to tell four states apart.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 *
 * "Expired" and "covered by the plan" are independent, and the combination is
 * the whole answer:
 *
 *   ended + covered      → the customer lost nothing; chasing this is waste
 *   ended + not covered  → the customer HAS lost the module; act now
 *   live  + covered      → nothing will happen when it ends
 *   live  + not covered  → the customer will lose it on that date
 *
 * Collapsing those to "expired / active" turns the screen into a list of dates
 * that an operator has to redo the tier ladder against in their head. The two
 * mistakes that follow are chasing a renewal nobody needed, and finding out
 * from a support ticket that a paying customer lost a module a week ago.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  redactInternals: (s: unknown) => s,
  serverMessage: (b: unknown) => (b as { error?: string } | null)?.error ?? null,
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getJwtOrgId: () => 1 }));

import { TrialsPanel } from '../surfaces/licensing/TrialsPanel';

const TRIALS = '/api/admin/master/licensing/trials';

const trial = (over: Partial<Record<string, unknown>> = {}) => ({
  organizationId: 42,
  organizationName: 'Northwind Bio',
  organizationSlug: 'northwind',
  tier: 'standard',
  moduleId: 'pv-cockpit',
  moduleName: 'PV cockpit',
  expiresAt: '2099-01-01T00:00:00.000Z',
  expired: false,
  setBy: null,
  setAt: null,
  coveredByPlan: false,
  ...over,
});

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body } as unknown as Response);

/** apiRequest THROWS for every non-OK status except 401 — mirror it. */
function apiError(status: number, body: unknown) {
  const e = new Error((body as { error?: string })?.error ?? `HTTP ${status}`) as Error & {
    name: string; status: number; payload: unknown;
  };
  e.name = 'ApiRequestError';
  e.status = status;
  e.payload = body;
  return e;
}

const LICENSING = '/api/admin/master/licensing';

/* The two pickers read the licensing matrix — the same endpoint the Packaging
   and Tenants tabs use. Northwind is on `standard`; `pv-cockpit` needs
   `professional` (so a grant does something) and `basic-module` needs
   `standard` (so a grant would change nothing). */
const MATRIX = {
  modules: [
    { moduleId: 'pv-cockpit', name: 'PV cockpit', minTier: 'professional' },
    { moduleId: 'basic-module', name: 'Basic module', minTier: 'standard' },
  ],
  organizations: [{ id: 42, name: 'Northwind Bio', tier: 'standard' }],
};

function wire(trials: unknown[], over: { post?: (u: string) => Promise<Response> } = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === LICENSING) return ok(MATRIX);
    if (method === 'GET' && url === TRIALS) {
      const rows = trials as Array<{ expired: boolean }>;
      return ok({
        trials,
        live: rows.filter((t) => !t.expired).length,
        lapsed: rows.filter((t) => t.expired).length,
      });
    }
    if (method === 'POST' && over.post) return over.post(url);
    throw apiError(404, { error: `unrouted ${method} ${url}` });
  });
}

async function mount(trials: unknown[], over?: { post?: (u: string) => Promise<Response> }) {
  wire(trials, over);
  render(<TrialsPanel />);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', TRIALS));
  await screen.findByTestId('ml-trial-open');
}

/** YYYY-MM-DD, N days out — the same arithmetic the control uses. */
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function choose(org: string, mod: string, until: string) {
  fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: org } });
  fireEvent.change(screen.getByLabelText('Module'), { target: { value: mod } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: until } });
}

async function completeConfirmDialog(reason = 'purchase order received') {
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

/* Block bodies, not concise arrows. `apiRequest.mockReset()` RETURNS the mock,
   and vitest calls a hook's return value as that hook's teardown — so
   `beforeEach(() => apiRequest.mockReset())` quietly invokes the mock itself
   after every test, which lands in the unrouted branch below and fails the
   test that just passed. */
beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('TrialsPanel — the four states', () => {
  it('ENDED and the plan does not cover it: says access is gone, and raises it', async () => {
    await mount([trial({ expired: true, coveredByPlan: false, expiresAt: '2026-01-01T00:00:00.000Z' })]);

    expect(await screen.findByText('Northwind Bio')).toBeTruthy();
    expect(document.body.textContent).toMatch(/has lost access/i);
    // This is the row somebody must act on, so it is not left to be spotted.
    expect(screen.getByTestId('ml-trials-losing').textContent).toMatch(/lost a module/i);
  });

  it('ENDED but the plan covers it: says the workspace still has it, and raises nothing', async () => {
    await mount([trial({ expired: true, coveredByPlan: true, expiresAt: '2026-01-01T00:00:00.000Z' })]);

    expect(await screen.findByText('Northwind Bio')).toBeTruthy();
    expect(document.body.textContent).toMatch(/still has it/i);
    expect(document.body.textContent).not.toMatch(/has lost access/i);
    // Chasing this renewal would waste the operator's time and the customer's.
    expect(screen.queryByTestId('ml-trials-losing')).toBeNull();
  });

  it('LIVE and not covered: names the loss that is coming', async () => {
    await mount([trial({ expired: false, coveredByPlan: false })]);
    expect(await screen.findByText('Northwind Bio')).toBeTruthy();
    expect(document.body.textContent).toMatch(/loses access when this ends/i);
  });

  it('LIVE and covered: says plainly that nothing changes', async () => {
    await mount([trial({ expired: false, coveredByPlan: true })]);
    expect(await screen.findByText('Northwind Bio')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Nothing changes when this ends/i);
  });
});

describe('TrialsPanel — honest reads', () => {
  it('renders an error, never an empty list, when the read fails', async () => {
    apiRequest.mockImplementation(async () => {
      throw apiError(500, { error: 'could not read grants' });
    });
    render(<TrialsPanel />);
    expect(await screen.findByTestId('ml-trials-error')).toBeTruthy();
    expect(screen.queryByTestId('ml-trials-empty')).toBeNull();
  });

  it('a genuinely empty list says every grant is permanent', async () => {
    await mount([]);
    expect(await screen.findByTestId('ml-trials-empty')).toBeTruthy();
  });

  it('puts the workspaces that have lost a module first', async () => {
    await mount([
      trial({ moduleId: 'live', moduleName: 'Live one', expired: false, coveredByPlan: false }),
      trial({ moduleId: 'harmless', moduleName: 'Harmless', expired: true, coveredByPlan: true, expiresAt: '2026-01-01T00:00:00.000Z' }),
      trial({ moduleId: 'losing', moduleName: 'Lost one', expired: true, coveredByPlan: false, expiresAt: '2026-02-01T00:00:00.000Z' }),
    ]);
    await screen.findByText('Lost one');
    const order = Array.from(document.querySelectorAll('.ml-row .ml-name')).map((n) => n.textContent);
    // A plain date sort buries the row that costs a customer something.
    expect(order.indexOf('Lost one')).toBeLessThan(order.indexOf('Harmless'));
    expect(order.indexOf('Lost one')).toBeLessThan(order.indexOf('Live one'));
  });
});

describe('TrialsPanel — governed writes', () => {
  it('does not write until a reason has been given', async () => {
    const post = vi.fn(async () => ok({ expiresAt: null }));
    await mount([trial()], { post });

    fireEvent.click(await screen.findByRole('button', { name: /Make permanent/ }));
    await screen.findByRole('dialog');
    expect(post).not.toHaveBeenCalled();

    await completeConfirmDialog('purchase order received');
    await waitFor(() => expect(post).toHaveBeenCalled());
    const sent = apiRequest.mock.calls.find((c: unknown[]) => c[0] === 'POST');
    expect(sent?.[1]).toBe(`${TRIALS}/convert`);
    expect((sent?.[2] as { reason?: string })?.reason).toBe('purchase order received');
  });

  it('offers "End now" only while the grant is still running', async () => {
    await mount([trial({ expired: true, expiresAt: '2026-01-01T00:00:00.000Z' })]);
    await screen.findByText('Northwind Bio');
    // Ending something that already ended is a control that can only confuse.
    expect(screen.queryByRole('button', { name: /End now/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Make permanent/ })).toBeTruthy();
  });

  it('surfaces the server reason when a write fails', async () => {
    const post = vi.fn(async () => {
      throw apiError(404, { error: 'Tenant not found.' });
    });
    await mount([trial()], { post });

    fireEvent.click(await screen.findByRole('button', { name: /Make permanent/ }));
    await completeConfirmDialog('purchase order received');
    // The server's own sentence, not a generic "something went wrong".
    await waitFor(() => expect(document.body.textContent).toMatch(/Tenant not found/i));
  });

  it('will not submit a reason shorter than the server floor', async () => {
    // The dialog's minReason is set to 3 to match the API exactly. A looser
    // client would produce a round trip that can only 400; a stricter one would
    // refuse writes the platform actually allows.
    const post = vi.fn(async () => ok({ expiresAt: null }));
    await mount([trial()], { post });

    fireEvent.click(await screen.findByRole('button', { name: /Make permanent/ }));
    await completeConfirmDialog('ok');
    await new Promise((r) => setTimeout(r, 0));
    expect(post).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Opening a grant

   The panel shipped able to convert and end trials and unable to create one:
   POST /licensing/trials had no caller at all, so the only way to open a
   30-day trial was a hand-written request. A screen that can only edit records
   it cannot produce is the same defect as an endpoint nothing calls.
   ══════════════════════════════════════════════════════════════════════════ */

describe('TrialsPanel — opening a grant', () => {
  it('offers the control even when no trial exists yet', async () => {
    // The empty state is exactly when somebody needs to open the first one.
    await mount([]);
    expect(screen.getByTestId('ml-trials-empty')).toBeTruthy();
    expect(screen.getByTestId('ml-trial-open')).toBeTruthy();
  });

  it('will not submit until a workspace, a module and a date are all chosen', async () => {
    await mount([]);
    const btn = () => screen.getByRole('button', { name: /Open the grant/ }) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Workspace'), { target: { value: '42' } });
    expect(btn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'pv-cockpit' } });
    expect(btn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: inDays(30) } });
    expect(btn().disabled).toBe(false);
  });

  it('refuses a date in the past — an expiry already behind us grants nothing', async () => {
    await mount([]);
    choose('42', 'pv-cockpit', inDays(-1));
    expect(
      (screen.getByRole('button', { name: /Open the grant/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('says the grant would change nothing when the plan already includes the module', async () => {
    await mount([]);
    choose('42', 'basic-module', inDays(30));
    // Northwind is on standard and basic-module needs standard. Recording a
    // trial here and telling a customer it is running would be a lie.
    expect(screen.getByTestId('ml-trial-consequence').textContent).toMatch(
      /already includes Basic module/i,
    );
  });

  it('says what access the grant actually buys when the plan does not include it', async () => {
    await mount([]);
    choose('42', 'pv-cockpit', inDays(30));
    const note = screen.getByTestId('ml-trial-consequence').textContent ?? '';
    expect(note).toMatch(/does not include PV cockpit/i);
    expect(note).toMatch(/access ends when it does/i);
  });

  it('posts the end date as end-of-day, with the reason, and clears the form', async () => {
    const post = vi.fn(async () => ok({ expiresAt: null }));
    await mount([], { post });
    const until = inDays(30);
    choose('42', 'pv-cockpit', until);

    fireEvent.click(screen.getByRole('button', { name: /Open the grant/ }));
    await screen.findByRole('dialog');
    expect(post).not.toHaveBeenCalled();

    await completeConfirmDialog('30-day evaluation');
    await waitFor(() => expect(post).toHaveBeenCalled());

    const sent = apiRequest.mock.calls.find(
      (c: unknown[]) => c[0] === 'POST' && c[1] === TRIALS,
    );
    expect(sent?.[2]).toMatchObject({
      organizationId: 42,
      moduleId: 'pv-cockpit',
      reason: '30-day evaluation',
    });
    // End-of-day, so a grant "until the 23rd" includes the 23rd rather than
    // lapsing as it begins.
    expect((sent?.[2] as { until: string }).until).toBe(`${until}T23:59:59.000Z`);

    await waitFor(() =>
      expect((screen.getByLabelText('Module') as HTMLSelectElement).value).toBe(''),
    );
  });

  it('leaves the form filled when the write fails, and says why', async () => {
    const post = vi.fn(async () => {
      throw apiError(404, { error: 'Tenant not found.' });
    });
    await mount([], { post });
    choose('42', 'pv-cockpit', inDays(30));

    fireEvent.click(screen.getByRole('button', { name: /Open the grant/ }));
    await completeConfirmDialog('30-day evaluation');

    await waitFor(() => expect(document.body.textContent).toMatch(/Tenant not found/i));
    // Clearing a form whose write was refused throws away the operator's work
    // and reads as success.
    expect((screen.getByLabelText('Module') as HTMLSelectElement).value).toBe('pv-cockpit');
  });

  it('offers no pickers when the workspace list cannot be read', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === TRIALS) return ok({ trials: [], live: 0, lapsed: 0 });
      throw apiError(500, { error: 'matrix unavailable' });
    });
    render(<TrialsPanel />);
    // Empty dropdowns over a failed read would look like "no workspaces exist".
    expect(await screen.findByTestId('ml-trials-matrix-error')).toBeTruthy();
    expect(screen.queryByTestId('ml-trial-open')).toBeNull();
  });
});
