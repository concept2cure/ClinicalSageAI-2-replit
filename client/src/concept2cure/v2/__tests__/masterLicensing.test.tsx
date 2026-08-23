// @vitest-environment jsdom
/**
 * Master Licensing — the platform owner's control room, held to its contract.
 *
 * This surface can change the commercial model of the whole platform and the
 * plan of any single customer. Three things about it are load-bearing, and each
 * fails in a way nobody would notice from the screen alone:
 *
 *   1. IT MUST NOT FABRICATE. A licensing console that renders an empty table
 *      when the read failed is saying "this platform licenses nothing", which
 *      is the opposite of "we could not load the licensing model". An operator
 *      acting on that difference makes it worse.
 *   2. IT MUST NOT LIE ABOUT A WRITE. Every mutation here is optimistic. A
 *      revert that does not happen leaves a tier change sitting on screen
 *      looking applied when the server refused it — and the next person to look
 *      reads a commercial decision that was never made.
 *   3. IT MUST NOT WRITE WITHOUT A REASON. The server requires one (min 3
 *      chars) and audit-logs it verbatim under Part 11. A client that PATCHes
 *      before collecting it produces a governed action with no justification,
 *      or a round trip that can only 400.
 *
 * These tests exist because the surface shipped with none: it was written by an
 * agent that hit a spend limit before writing its suite, and merged anyway.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/* The network is stubbed at the ONE convention this repo uses (queryClient's
   `apiRequest`), so `useLiveData` and `apiCall` both run their real code paths
   — including the shape guards and the error envelope reader, which are where
   two of the three contracts above are actually enforced. */
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({
  apiRequest,
  redactInternals: (s: unknown) => s,
  serverMessage: (b: unknown) => (b as { error?: string } | null)?.error ?? null,
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getJwtOrgId: () => 1 }));

import { MasterLicensing } from '../surfaces/MasterLicensing';

const LICENSING = '/api/admin/master/licensing';
const FLAGS = '/api/admin/master/feature-flags';

const MODULE = {
  moduleId: 'pv-cockpit',
  name: 'PV cockpit',
  category: 'Science & intelligence',
  minTier: 'professional' as const,
  industries: [],
  deprecated: false,
  grantedOrgs: 3,
  revokedOrgs: 1,
};

const ORG = {
  id: 42,
  name: 'Northwind Bio',
  slug: 'northwind',
  tier: 'standard',
  industryMode: 'biotech',
  status: 'active',
  grants: 12,
  revocations: 2,
};

const PAYLOAD = {
  tiers: ['free', 'standard', 'professional', 'enterprise'],
  modules: [MODULE],
  organizations: [ORG],
};

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body } as unknown as Response);

/** apiRequest THROWS for every non-OK status except 401 — mirror that here, or
 *  the error paths under test are never actually reached. */
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

/** Default: every read succeeds, no write is expected. */
function routeReads(over: { patch?: (url: string) => Promise<Response> } = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === LICENSING) return ok(PAYLOAD);
    if (method === 'GET' && url === FLAGS) return ok({ flags: [] });
    if (method === 'PATCH' && over.patch) return over.patch(url);
    throw apiError(404, { error: `unrouted ${method} ${url}` });
  });
}

async function mount() {
  render(<MasterLicensing />);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', LICENSING));
  await screen.findByText(MODULE.name);
}

/** Drive GovernedConfirmDialog: type a reason, type the confirm word, submit. */
async function completeConfirmDialog(reason = 'moving to professional') {
  const dialog = await screen.findByRole('dialog');
  const textarea = dialog.querySelector('textarea');
  expect(textarea, 'the reason field must exist').toBeTruthy();
  fireEvent.change(textarea as HTMLTextAreaElement, { target: { value: reason } });
  const confirmInput = dialog.querySelector('input[type="text"]');
  expect(confirmInput, 'the confirm-word field must exist').toBeTruthy();
  fireEvent.change(confirmInput as HTMLInputElement, { target: { value: 'yes' } });
  const submit = Array.from(dialog.querySelectorAll('button')).find((b) =>
    /confirm|apply|save|continue/i.test(b.textContent ?? ''),
  );
  expect(submit, 'the dialog must offer a confirm control').toBeTruthy();
  fireEvent.click(submit as HTMLButtonElement);
}

const patchCalls = () =>
  apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'PATCH');

beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('Master Licensing — reads', () => {
  it('renders the live matrix', async () => {
    routeReads();
    await mount();
    expect(screen.getByText(MODULE.name)).toBeTruthy();
    // The current tier must be visible, not merely held in state — this is the
    // value the operator is about to change.
    expect(document.body.textContent).toMatch(/Professional/);
  });

  /* CONTRACT 1. "We could not load the licensing model" and "this platform
     licenses nothing" are opposite facts. A console that renders the second
     when the first is true invites an operator to go fix a catalog that is
     actually fine. */
  it('renders an error state, not an empty table, when the read fails', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === LICENSING) throw apiError(503, { error: 'database unavailable' });
      if (method === 'GET' && url === FLAGS) return ok({ flags: [] });
      throw apiError(404, { error: 'unrouted' });
    });
    render(<MasterLicensing />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', LICENSING));

    await waitFor(() => {
      const text = document.body.textContent ?? '';
      // Something must say the load failed. An empty grid is the failure.
      expect(
        /couldn|could not|unavailable|didn|failed|error|retry/i.test(text),
        `expected an error state, got: ${text.slice(0, 400)}`,
      ).toBe(true);
    });
    // And it must NOT present the catalog as legitimately empty.
    expect(document.body.textContent).not.toMatch(/no modules|nothing licensed|0 modules/i);
  });

  it('surfaces a 403 as a refusal rather than an empty console', async () => {
    // requirePlatformAdmin guards these endpoints. A non-platform admin who
    // reaches the surface must be told they are not permitted, not shown a
    // blank licensing model.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === LICENSING) throw apiError(403, { error: 'Platform admin access required.' });
      if (method === 'GET' && url === FLAGS) return ok({ flags: [] });
      throw apiError(404, { error: 'unrouted' });
    });
    render(<MasterLicensing />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', LICENSING));
    await waitFor(() => {
      expect(
        /admin|permission|not permitted|access|couldn|could not|error/i.test(
          document.body.textContent ?? '',
        ),
      ).toBe(true);
    });
  });
});

describe('Master Licensing — governed writes', () => {
  /* CONTRACT 3. The server requires a reason and audit-logs it verbatim. A
     PATCH fired before one is collected is either a governed action with no
     justification, or a guaranteed 400. */
  it('does not PATCH until a reason has been given', async () => {
    routeReads({ patch: async () => ok({ moduleId: MODULE.moduleId, minTier: 'enterprise' }) });
    await mount();

    const enterprise = screen
      .getAllByRole('button')
      .find((b) => /^enterprise$/i.test((b.textContent ?? '').trim()));
    expect(enterprise, 'the packaging tab must offer an Enterprise control').toBeTruthy();
    fireEvent.click(enterprise as HTMLButtonElement);

    // A dialog opens; nothing has been written yet.
    await screen.findByRole('dialog');
    expect(patchCalls()).toHaveLength(0);

    // Dismissing it must also write nothing.
    const dialog = screen.getByRole('dialog');
    const cancel =
      dialog.querySelector('[aria-label="Cancel"]') ??
      Array.from(dialog.querySelectorAll('button')).find((b) => /cancel/i.test(b.textContent ?? ''));
    fireEvent.click(cancel as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(patchCalls()).toHaveLength(0);
  });

  it('sends the reason the operator typed, to the right endpoint', async () => {
    routeReads({ patch: async () => ok({ moduleId: MODULE.moduleId, minTier: 'enterprise' }) });
    await mount();

    const enterprise = screen
      .getAllByRole('button')
      .find((b) => /^enterprise$/i.test((b.textContent ?? '').trim()));
    fireEvent.click(enterprise as HTMLButtonElement);
    await completeConfirmDialog('regrading for the enterprise bundle');

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const [, url, body] = patchCalls()[0] as [string, string, Record<string, unknown>];
    expect(url).toBe(`${LICENSING}/modules/${MODULE.moduleId}`);
    expect(body.minTier).toBe('enterprise');
    // Verbatim — the audit record is only worth having if it is what was typed.
    expect(body.reason).toBe('regrading for the enterprise bundle');
  });

  /* CONTRACT 2. The write is optimistic. If the revert does not happen, the
     screen shows a commercial decision the server refused. */
  it('reverts the optimistic change and shows the server reason when a write fails', async () => {
    routeReads({
      patch: async () => {
        throw apiError(400, { error: 'minTier must be one of free, standard, professional, enterprise, or null.' });
      },
    });
    await mount();

    const enterprise = screen
      .getAllByRole('button')
      .find((b) => /^enterprise$/i.test((b.textContent ?? '').trim()));
    fireEvent.click(enterprise as HTMLButtonElement);
    await completeConfirmDialog('deliberate failure');

    await waitFor(() => expect(patchCalls()).toHaveLength(1));

    // The server's own sentence, not one this surface invented.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/minTier must be one of/);
    });

    // And the module must be back at its real tier. Asserted through the
    // control's own pressed/selected state so this cannot pass merely because
    // the word "Professional" appears somewhere on the page.
    await waitFor(() => {
      const professional = screen
        .getAllByRole('button')
        .find((b) => /^professional$/i.test((b.textContent ?? '').trim()));
      expect(professional, 'the Professional control must still exist').toBeTruthy();
      const el = professional as HTMLButtonElement;
      const selected =
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-checked') === 'true' ||
        el.getAttribute('data-on') === 'true' ||
        el.dataset.on !== undefined;
      expect(selected, 'after a failed write the module must read as Professional again').toBe(true);
    });
  });
});
