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

describe('Master Licensing — applying a plan', () => {
  const TENANT_DETAIL = {
    organization: { id: 42, name: 'Northwind Bio', slug: 'northwind', tier: 'standard', industryMode: 'biotech', status: 'active' },
    modules: [
      { moduleId: 'pv-cockpit', name: 'PV cockpit', category: null, minTier: 'professional', subscriptionState: 'enabled', effective: true, source: 'subscribed' },
    ],
  };

  function routeTenant(patch?: (url: string, body: unknown) => Promise<Response>) {
    apiRequest.mockImplementation(async (method: string, url: string, body: unknown) => {
      if (method === 'GET' && url === LICENSING) return ok(PAYLOAD);
      if (method === 'GET' && url === FLAGS) return ok({ flags: [] });
      if (method === 'GET' && url.startsWith(`${LICENSING}/tenants/`)) return ok(TENANT_DETAIL);
      if ((method === 'POST' || method === 'PATCH') && patch) return patch(url, body);
      throw apiError(404, { error: `unrouted ${method} ${url}` });
    });
  }

  async function openTenant() {
    render(<MasterLicensing />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', LICENSING));
    const tenantsTab = screen.getAllByRole('button').find((b) => /^tenants$/i.test((b.textContent ?? '').trim()));
    expect(tenantsTab, 'a Tenants tab must exist').toBeTruthy();
    fireEvent.click(tenantsTab as HTMLButtonElement);
    const row = await screen.findByText(ORG.name);
    fireEvent.click(row.closest('button') ?? row);
    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c: unknown[]) => String(c[1]).startsWith(`${LICENSING}/tenants/`))).toBe(true),
    );
  }

  /* THE DOWNGRADE CASE. provision_org_modules grants and never revokes, so
     applying a plan after a downgrade adds nothing and removes nothing. A
     console that reports only "provisioned" lets an operator conclude that
     capability was withdrawn when the customer still has all of it — wrong in
     the most expensive direction available. Both halves must render. */
  it('names the grants a downgraded tenant KEEPS above its new plan', async () => {
    routeTenant(async (url) => {
      if (url.endsWith('/provision')) {
        return ok({
          id: 42,
          name: 'Northwind Bio',
          tier: 'standard',
          granted: 0,
          enabledTotal: 4,
          retainedAboveTier: [{ moduleId: 'pv-cockpit', name: 'PV cockpit' }],
        });
      }
      throw apiError(404, { error: 'unrouted' });
    });
    await openTenant();

    const apply = screen.getAllByRole('button').find((b) => /apply plan/i.test(b.textContent ?? ''));
    expect(apply, 'the tenant view must offer a way to apply the plan').toBeTruthy();
    fireEvent.click(apply as HTMLButtonElement);
    await completeConfirmDialog('applying the standard plan');

    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c: unknown[]) => c[0] === 'POST' && String(c[1]).endsWith('/provision'))).toBe(true),
    );

    // It must say nothing was granted AND name what is still held above tier.
    await waitFor(() => {
      const text = document.body.textContent ?? '';
      expect(/no new modules to grant/i.test(text), `expected the zero-grant sentence, got: ${text.slice(0, 300)}`).toBe(true);
      expect(/PV cockpit/.test(text), 'the retained module must be named').toBe(true);
      expect(/never revoke|until turned off|above this plan/i.test(text), 'it must say applying a plan does not revoke').toBe(true);
    });
  });

  it('reports the real grant count from the server, not a guess', async () => {
    routeTenant(async (url) => {
      if (url.endsWith('/provision')) {
        return ok({ id: 42, name: 'Northwind Bio', tier: 'standard', granted: 7, enabledTotal: 7, retainedAboveTier: [] });
      }
      throw apiError(404, { error: 'unrouted' });
    });
    await openTenant();
    const apply = screen.getAllByRole('button').find((b) => /apply plan/i.test(b.textContent ?? ''));
    fireEvent.click(apply as HTMLButtonElement);
    await completeConfirmDialog('applying the plan');
    await waitFor(() => expect(document.body.textContent).toMatch(/7 modules granted/i));
  });

  it('reports nothing at all when provisioning fails', async () => {
    // A provisioning result that did not happen must never appear.
    routeTenant(async (url) => {
      if (url.endsWith('/provision')) throw apiError(500, { error: 'Provisioning failed. Apply the pending migrations first.' });
      throw apiError(404, { error: 'unrouted' });
    });
    await openTenant();
    const apply = screen.getAllByRole('button').find((b) => /apply plan/i.test(b.textContent ?? ''));
    fireEvent.click(apply as HTMLButtonElement);
    await completeConfirmDialog('deliberate failure');
    await waitFor(() => expect(document.body.textContent).toMatch(/Provisioning failed/));
    expect(document.body.textContent).not.toMatch(/modules granted|no new modules to grant/i);
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

/* ══════════════════════════════════════════════════════════════════════════
   Enforcement tab

   This panel exists to answer ONE question — is it safe to start refusing
   requests? — and the way it fails is by answering "yes" when it means "I don't
   know". An empty observation buffer renders as no rows whether the platform
   would refuse nothing or whether this server restarted a minute ago, and only
   `observingSince` separates them. Every test below is that distinction.
   ══════════════════════════════════════════════════════════════════════════ */

const ENFORCEMENT = `${LICENSING}/enforcement`;

const REPORT = {
  mode: 'report',
  observingSince: '2026-08-01T10:00:00.000Z',
  perProcess: true,
  capacity: 500,
  truncated: false,
  organizationsAffected: 1,
  modulesAffected: ['pv-cockpit'],
  observations: [
    {
      path: '/api/pv-cockpit/signals',
      organizationId: 42,
      modules: ['pv-cockpit'],
      reasons: ['pv-cockpit: Requires the Professional plan'],
      enforced: false,
      firstSeen: '2026-08-01T10:00:00.000Z',
      lastSeen: '2026-08-02T09:30:00.000Z',
      count: 17,
    },
  ],
};

function routeEnforcement(report: unknown, over: { del?: () => Promise<Response> } = {}) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === LICENSING) return ok(PAYLOAD);
    if (method === 'GET' && url === FLAGS) return ok({ flags: [] });
    if (method === 'GET' && url === ENFORCEMENT) return ok(report);
    if (method === 'DELETE' && url === ENFORCEMENT && over.del) return over.del();
    throw apiError(404, { error: `unrouted ${method} ${url}` });
  });
}

async function openEnforcement(report: unknown, over?: { del?: () => Promise<Response> }) {
  routeEnforcement(report, over);
  await mount();
  fireEvent.click(screen.getByRole('button', { name: /Enforcement/ }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', ENFORCEMENT));
}

describe('Master Licensing — enforcement report', () => {
  it('says NOT ENOUGH IS KNOWN when nothing has been observed — never an all-clear', async () => {
    await openEnforcement({ ...REPORT, observingSince: null, observations: [], organizationsAffected: 0, modulesAffected: [] });

    const card = await screen.findByTestId('ml-enf-nothing-yet');
    const text = card.textContent ?? '';
    // The claim it must make: no evidence held.
    expect(text).toMatch(/since this server last restarted/i);
    expect(text).toMatch(/not the same as knowing nothing would be refused/i);
    // The claim it must NOT make.
    expect(text).not.toMatch(/safe to (turn|switch) on/i);
    expect(screen.queryByTestId('ml-enf-observed')).toBeNull();
  });

  it('distinguishes "not switched on" from "observing and quiet"', async () => {
    await openEnforcement({ ...REPORT, mode: 'off', observingSince: null, observations: [] });

    const card = await screen.findByTestId('ml-enf-off');
    expect(card.textContent).toMatch(/not checking entitlement/i);
    // Different state, different card — the two must never share one branch.
    expect(screen.queryByTestId('ml-enf-nothing-yet')).toBeNull();
  });

  it('reports what would be refused, and says it was served', async () => {
    await openEnforcement(REPORT);

    const card = await screen.findByTestId('ml-enf-observed');
    expect(card.textContent).toMatch(/observing only/i);
    expect(card.textContent).toMatch(/everything below was served/i);
    // Named by the WORKSPACE and MODULE an operator can act on, not by an id.
    expect(screen.getByText(ORG.name)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Requires the Professional plan/);
    expect(document.body.textContent).toMatch(/17/);
  });

  it('says refusals are real once enforcement is on', async () => {
    await openEnforcement({
      ...REPORT,
      mode: 'enforce',
      observations: [{ ...REPORT.observations[0], enforced: true }],
    });

    const card = await screen.findByTestId('ml-enf-observed');
    expect(card.textContent).toMatch(/Enforcement is on/i);
    expect(card.textContent).not.toMatch(/observing only/i);
    expect(document.body.textContent).toMatch(/Refused/);
  });

  it('always states the per-server caveat, so the report is not read as a total', async () => {
    await openEnforcement(REPORT);
    await screen.findByTestId('ml-enf-observed');
    expect(document.body.textContent).toMatch(/cleared when it restarts/i);
    expect(document.body.textContent).toMatch(/sample, not a total/i);
  });

  it('says so when the buffer is full, rather than presenting a truncated report as complete', async () => {
    await openEnforcement({ ...REPORT, truncated: true });
    await screen.findByTestId('ml-enf-observed');
    expect(document.body.textContent).toMatch(/older ones have been dropped/i);
  });

  it('surfaces a failed read as an error, never as an empty report', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === LICENSING) return ok(PAYLOAD);
      if (method === 'GET' && url === FLAGS) return ok({ flags: [] });
      if (method === 'GET' && url === ENFORCEMENT) throw apiError(500, { error: 'read failed' });
      throw apiError(404, { error: `unrouted ${method} ${url}` });
    });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Enforcement/ }));

    expect(await screen.findByTestId('ml-enf-error')).toBeTruthy();
    expect(screen.queryByTestId('ml-enf-nothing-yet')).toBeNull();
    expect(screen.queryByTestId('ml-enf-off')).toBeNull();
  });

  it('will not discard the record without a reason', async () => {
    const del = vi.fn(async () => ok({ ...REPORT, observingSince: null, observations: [] }));
    await openEnforcement(REPORT, { del });
    await screen.findByTestId('ml-enf-observed');

    fireEvent.click(screen.getByRole('button', { name: /Start a new window/i }));
    // The dialog is up and NOTHING has been sent yet.
    await screen.findByRole('dialog');
    expect(del).not.toHaveBeenCalled();

    await completeConfirmDialog('packaging fixed, measuring again');
    await waitFor(() => expect(del).toHaveBeenCalled());
    const sent = apiRequest.mock.calls.find((c: unknown[]) => c[0] === 'DELETE');
    expect((sent?.[2] as { reason?: string })?.reason).toBe('packaging fixed, measuring again');
  });
});
