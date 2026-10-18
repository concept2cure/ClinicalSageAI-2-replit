// @vitest-environment jsdom
/**
 * An interim decision is signed, and the dialog offers only what the server allows.
 *
 * An adaptive decision stops a trial, resizes it, drops an arm or enriches a
 * population, on unblinded data. Until 2026-10-13 the route behind this panel
 * was a Drizzle insert that stamped `approved_by` from the session user with no
 * ceremony at all — no meaning, no reason, no re-authentication, no signature
 * manifest. The server now runs the Part 11 ceremony
 * (`adaptive-decision-signature.ts`), and this pins the client half of it:
 *
 *   · the decision cannot be signed until a look is selected and the decision
 *     is stated — a signature over a blank is a signature over nothing;
 *   · the dialog offers `approval` and `responsibility` and NOTHING else,
 *     because those are the two the server's `ADAPTIVE_DECISION_MEANINGS`
 *     accepts. A third option would collect a password for a signature the
 *     server then refuses;
 *   · the password and the authenticator code leave as `reauth`, with the
 *     rationale as the signature's reason;
 *   · a look with no recorded blinding flag reads "not recorded", never
 *     "unblinded" — the difference between an unknown and an assertion about
 *     who saw the data.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuthUser: () => ({ displayName: 'R. Mbeki', email: 'r@example.org', mfaEnabled: false }),
}));

import { AdaptiveMonitoringPanel } from '../surfaces/adaptiveMonitoring';

/** The real EsignModal verifies the password through react-query. */
function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** One look, with no blinding flag recorded. */
const SNAPSHOT = {
  id: 55,
  lookNumber: 2,
  informationFraction: 0.5,
  enrolledCount: 220,
  isBlinded: null,
  testStatistic: 2.31,
  conditionalPower: 0.78,
  predictivePower: 0.64,
};

const PLAN = {
  id: 12,
  title: 'ABC-301 adaptive plan',
  designType: 'group_sequential',
  spendingFunction: 'obrien_fleming',
  maxSampleSize: 640,
  snapshots: [SNAPSHOT],
  decisions: [],
};

const ok = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as unknown as Response;

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

/** Open plan 12 and select its only look. */
async function openPlanAndSelect() {
  apiRequest.mockImplementation(async (_m: string, path: string) => {
    if (path === '/api/biostat/adaptive/12') return ok(PLAN);
    return ok({ signedAt: '2026-10-13T12:00:00.000Z', sha256Chain: 'abc' });
  });
  render(<AdaptiveMonitoringPanel />);
  fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: /Open plan/i }));
  await waitFor(() => expect(screen.getByText('ABC-301 adaptive plan')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /^Select$/ }));
}

describe('the adaptive monitoring panel', () => {
  it('a look with no blinding flag reads "not recorded", not "unblinded"', async () => {
    await openPlanAndSelect();
    expect(screen.getByText('not recorded')).toBeTruthy();
    expect(screen.queryByText('unblinded')).toBeNull();
  });

  it('a non-integer plan id is refused here, not requested from the server', async () => {
    apiRequest.mockImplementation(async () => ok(PLAN));
    render(<AdaptiveMonitoringPanel />);
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Open plan/i }));
    await waitFor(() => expect(screen.getByText(/positive integer/i)).toBeTruthy());
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('a plan that cannot be read says so, and offers a retry', async () => {
    apiRequest.mockImplementation(
      async () =>
        ({ ok: false, status: 404, json: async () => ({ success: false, message: 'No such plan.' }) }) as unknown as Response,
    );
    render(<AdaptiveMonitoringPanel />);
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Open plan/i }));
    await waitFor(() => expect(screen.getByText(/The plan was not read/i)).toBeTruthy());
    expect(screen.getByText('No such plan.')).toBeTruthy();
  });

  it('the sign button is unavailable until a look is selected and a decision stated', async () => {
    apiRequest.mockImplementation(async () => ok(PLAN));
    render(<AdaptiveMonitoringPanel />);
    fireEvent.change(screen.getByPlaceholderText('e.g. 12'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Open plan/i }));
    await waitFor(() => expect(screen.getByText('ABC-301 adaptive plan')).toBeTruthy());

    const sign = screen.getByRole('button', { name: /Sign decision/i }) as HTMLButtonElement;
    expect(sign.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^Select$/ }));
    expect((screen.getByRole('button', { name: /Sign decision/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('e.g. Increase N to 640'), { target: { value: 'Increase N to 640' } });
    expect((screen.getByRole('button', { name: /Sign decision/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers exactly the two meanings the server accepts', async () => {
    await openPlanAndSelect();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase N to 640'), { target: { value: 'Increase N to 640' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign decision/i }));

    await waitFor(() => expect(screen.getByRole('radiogroup', { name: /Signature meaning/i })).toBeTruthy());
    const offered = screen.getAllByRole('radio').map((r) => (r.textContent ?? '').trim().toLowerCase());
    expect(offered).toHaveLength(2);
    expect(offered.join('|')).toMatch(/approv/);
    expect(offered.join('|')).toMatch(/responsib/);
    // Nobody authors a decision about observed data, and an IDMC
    // recommendation is not a review of someone's work.
    expect(offered.join('|')).not.toMatch(/author/);
    expect(offered.join('|')).not.toMatch(/review/);
  });

  it('binds the look, and says so where the signer reads it', async () => {
    await openPlanAndSelect();
    fireEvent.change(screen.getByPlaceholderText('e.g. Increase N to 640'), { target: { value: 'Increase N to 640' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign decision/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(screen.getByText(/information fraction 0\.5/i)).toBeTruthy();
    expect(screen.getByText(/binds this look's data/i)).toBeTruthy();
  });
});
