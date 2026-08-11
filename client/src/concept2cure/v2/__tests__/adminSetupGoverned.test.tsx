// @vitest-environment jsdom
/**
 * Admin → Setup — what an administrator is told they changed, versus what was
 * actually written.
 *
 * The panel used to keep the organization name, an "MFA required" switch, an
 * "SSO enabled" switch and the whole translation-workspace policy in
 * `localStorage['c2c_admin_settings']`. It looked like an org console. It was a
 * per-browser scratchpad seeded with an invented company ("Acme Bio") and three
 * invented target languages, and it published a `window.TXW_ADMIN` global that
 * nothing in the repository read. Two people administering the same
 * organization from two laptops saw two different answers, and neither was the
 * organization's.
 *
 * Three classes of defect are pinned here, because none of them is visible in a
 * screenshot — every one of them looks correct on screen:
 *
 * 1. IDENTITY. The governed routes take an organization id in the URL, and
 *    validateOrgOwnership pins a non-staff caller to their own org. The id must
 *    come from the caller's OWN token claim (getJwtOrgId), not from the
 *    `currentOrganizationId` localStorage value a stale session can leave
 *    behind. The fixtures below deliberately disagree — token says 7,
 *    localStorage says 999 — so a regression to the wrong resolver fails rather
 *    than quietly addressing another tenant's record.
 *
 * 2. "SAVED" MUST MEAN SAVED. Two governed PATCHes go out per save. If one is
 *    refused (requireOrgAdmin returns 403 to a member without the admin role),
 *    the section it belonged to must stay dirty and unsaved. The sharp
 *    assertion is the SECOND save: only the failed section may be re-sent.
 *
 * 3. NO SWITCH MAY IMPLY A CONTROL IT DOES NOT HAVE. Three translation
 *    "policy" toggles read Enforced/Disabled while approvalGuard() applied
 *    DEFAULT_GUARDRAILS — a module constant — to every approval and consulted
 *    no org setting. Turning one off changed nothing server-side and told an
 *    administrator they had relaxed a 21 CFR Part 11 control. They are gone as
 *    switches, and the enforced guardrails are written back on every save so
 *    the stored record cannot describe a laxer policy than the server applies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { Setup } from '../surfaces/AdminSurfaces';

const Surface = Setup as unknown as React.ComponentType<Record<string, unknown>>;

/** The org id in the caller's token claim — every governed URL must use it. */
const TOKEN_ORG = 7;
/** A stale `currentOrganizationId`. Nothing may address this org. */
const STALE_ORG = 999;

/** A JWT whose payload carries organizationId, shaped as getJwtOrgId parses it. */
function tokenFor(organizationId: number): string {
  const b64url = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256' })}.${b64url({ organizationId })}.sig`;
}

interface Sent {
  url: string;
  method: string;
  body: any;
}
let sent: Sent[];

/** Per-test overrides for what each governed write answers with. */
let profilePatch: { status: number; body: unknown };
let settingsPatch: { status: number; body: unknown };
let orgGet: { status: number; body: unknown };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const liveSettings = (translation: Record<string, unknown> = {}) => ({
  success: true,
  settings: {
    translation: {
      enabled: true,
      targets: ['de-DE'],
      defaultEngine: 'DeepL Pro',
      glossaryScope: 'org',
      requireBackTranslation: true,
      twoPersonRule: true,
      blockMachineApproval: true,
      ...translation,
    },
  },
});

beforeEach(() => {
  sent = [];
  profilePatch = { status: 200, body: { success: true, organization: { name: 'Contoso Bio' } } };
  settingsPatch = { status: 200, body: { success: true, message: 'ok' } };
  orgGet = { status: 200, body: { success: true, organization: { id: '7', name: 'Northwind Bio' } } };

  sessionStorage.setItem('trialsage_access_token', tokenFor(TOKEN_ORG));
  // The trap: a stale org id in the tier getOrgId() reads first.
  localStorage.setItem('currentOrganizationId', String(STALE_ORG));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init: any = {}) => {
      const url = String(input);
      const method = String(init.method || 'GET');
      const body = init.body ? JSON.parse(init.body) : null;
      sent.push({ url, method, body });

      if (url.includes('/api/mdx/industry-profile')) return json(200, { data: null });
      if (method === 'PATCH' && url.includes('/profile')) {
        return json(profilePatch.status, profilePatch.body);
      }
      if (method === 'PATCH' && url.includes('/settings')) {
        return json(settingsPatch.status, settingsPatch.body);
      }
      if (url.includes('/settings')) return json(200, liveSettings());
      if (url.includes('/api/organizations/')) return json(orgGet.status, orgGet.body);
      return json(404, { success: false, error: 'unexpected ' + url });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

const renderSurface = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Surface onAsk={() => {}} onNav={() => {}} segment="biotech" />
    </QueryClientProvider>,
  );
};

const nameInput = (c: HTMLElement) =>
  c.querySelector('input[aria-label="Organization name"]') as HTMLInputElement;
const reasonInput = (c: HTMLElement) =>
  c.querySelector('input[aria-label="Reason for change"]') as HTMLInputElement;
const saveButton = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find(b =>
    /Save to organization|No unsaved changes|Saving/.test(b.textContent || ''),
  ) as HTMLButtonElement;
const chipByText = (c: HTMLElement, text: string) =>
  Array.from(c.querySelectorAll('button.txw-pchip')).find(b =>
    (b.textContent || '').includes(text),
  ) as HTMLButtonElement;

const patches = (kind: 'profile' | 'settings') =>
  sent.filter(r => r.method === 'PATCH' && r.url.includes(`/${kind}`));

/** Wait for both governed reads to have landed in the rendered fields. */
async function loaded(container: HTMLElement) {
  await waitFor(() => expect(nameInput(container)?.value).toBe('Northwind Bio'));
  await waitFor(() => expect(chipByText(container, 'German')).toBeTruthy());
  return container;
}

describe('Admin → Setup reads the organization record', () => {
  it('shows the organization’s real name, not an invented default', async () => {
    const { container } = renderSurface();
    await loaded(container);
    expect(nameInput(container).value).toBe('Northwind Bio');
    // The old fabricated seed must not survive anywhere in the rendered panel.
    expect(container.textContent).not.toContain('Acme Bio');
  });

  it('seeds the translation policy from the persisted section', async () => {
    const { container } = renderSurface();
    await loaded(container);
    // 'de-DE' is the only persisted target; the old fixture seeded three.
    expect(chipByText(container, 'German').getAttribute('data-on')).toBe('true');
    expect(chipByText(container, 'Japanese').hasAttribute('data-on')).toBe(false);
    const engine = container.querySelector(
      'select[aria-label="Default MT engine"]',
    ) as HTMLSelectElement;
    expect(engine.value).toBe('DeepL Pro');
  });

  it('addresses the org from the token claim, never the stale localStorage id', async () => {
    const { container } = renderSurface();
    await loaded(container);
    const orgCalls = sent.filter(r => r.url.includes('/api/organizations/'));
    expect(orgCalls.length).toBeGreaterThan(0);
    for (const call of orgCalls) {
      expect(call.url).toContain(`/api/organizations/${TOKEN_ORG}`);
    }
    expect(sent.some(r => r.url.includes(String(STALE_ORG)))).toBe(false);
  });

  it('writes nothing to the browser-local settings blob it replaced', async () => {
    const { container } = renderSurface();
    await loaded(container);
    fireEvent.change(nameInput(container), { target: { value: 'Contoso Bio' } });
    fireEvent.click(chipByText(container, 'Japanese'));
    expect(localStorage.getItem('c2c_admin_settings')).toBeNull();
  });
});

describe('Admin → Setup governed save', () => {
  it('sends nothing until something has changed', async () => {
    const { container } = renderSurface();
    await loaded(container);
    expect(saveButton(container).disabled).toBe(true);
    fireEvent.change(nameInput(container), { target: { value: 'Contoso Bio' } });
    expect(saveButton(container).disabled).toBe(false);
  });

  it('refuses to write without a reason, because the route audits one', async () => {
    const { container } = renderSurface();
    await loaded(container);
    fireEvent.change(nameInput(container), { target: { value: 'Contoso Bio' } });
    fireEvent.change(reasonInput(container), { target: { value: 'ab' } });
    fireEvent.click(saveButton(container));
    await waitFor(() =>
      expect(container.textContent).toContain('reason of at least 3 characters'),
    );
    // The assertion that matters: no request left the browser.
    expect(patches('profile')).toHaveLength(0);
    expect(patches('settings')).toHaveLength(0);
  });

  it('PATCHes both governed routes with the reason and the token’s org id', async () => {
    const { container } = renderSurface();
    await loaded(container);
    fireEvent.change(nameInput(container), { target: { value: 'Contoso Bio' } });
    fireEvent.click(chipByText(container, 'Japanese'));
    fireEvent.change(reasonInput(container), { target: { value: 'Onboarding review' } });
    fireEvent.click(saveButton(container));

    await waitFor(() => expect(patches('settings')).toHaveLength(1));
    const profile = patches('profile')[0];
    expect(profile.url).toBe(`/api/organizations/${TOKEN_ORG}/profile`);
    expect(profile.body).toEqual({ name: 'Contoso Bio', reason: 'Onboarding review' });

    const settings = patches('settings')[0];
    expect(settings.url).toBe(`/api/organizations/${TOKEN_ORG}/settings`);
    expect(settings.body.reason).toBe('Onboarding review');
    expect(settings.body.settings.translation.targets.sort()).toEqual(['de-DE', 'ja-JP']);
  });

  it('never carries a stale record’s “guardrail off” claim back to the server', async () => {
    // `organizations.settings` is free-form jsonb, so a record written before
    // this surface existed — or by hand — can claim the guardrails are off.
    // approvalGuard() enforces them regardless, so persisting that claim would
    // leave the org's stored policy describing weaker Part 11 controls than the
    // platform actually applies: an audit finding, invisible on screen.
    //
    // Scope note, so nobody over-reads this test. Two independent lines make it
    // pass — readTranslationPolicy pins the guardrails on the way IN, and the
    // save re-pins them on the way OUT — and removing EITHER alone still leaves
    // it green. That redundancy is deliberate, and it means this test pins the
    // outcome (nothing false reaches the wire), not any one implementation of
    // it. Removing both does fail it.
    const stale = liveSettings({
      requireBackTranslation: false,
      twoPersonRule: false,
      blockMachineApproval: false,
    });
    (globalThis.fetch as any).mockImplementation(async (input: any, init: any = {}) => {
      const url = String(input);
      const method = String(init.method || 'GET');
      sent.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
      if (url.includes('/api/mdx/industry-profile')) return json(200, { data: null });
      if (method === 'PATCH' && url.includes('/settings')) return json(200, { success: true });
      if (url.includes('/settings')) return json(200, stale);
      if (url.includes('/api/organizations/')) return json(orgGet.status, orgGet.body);
      return json(404, { success: false, error: 'unexpected ' + url });
    });

    const { container } = renderSurface();
    await loaded(container);
    fireEvent.click(chipByText(container, 'Japanese'));
    fireEvent.change(reasonInput(container), { target: { value: 'Add PMDA target' } });
    fireEvent.click(saveButton(container));

    await waitFor(() => expect(patches('settings')).toHaveLength(1));
    expect(patches('settings')[0].body.settings.translation).toMatchObject({
      requireBackTranslation: true,
      twoPersonRule: true,
      blockMachineApproval: true,
    });
  });

  it('leaves a refused section dirty, and re-sends only that section', async () => {
    // requireOrgAdmin refuses the settings write; the profile write succeeds.
    settingsPatch = {
      status: 403,
      body: { success: false, error: 'Organization admin role required for this action' },
    };
    const { container } = renderSurface();
    await loaded(container);
    fireEvent.change(nameInput(container), { target: { value: 'Contoso Bio' } });
    fireEvent.click(chipByText(container, 'Japanese'));
    fireEvent.change(reasonInput(container), { target: { value: 'Onboarding review' } });
    fireEvent.click(saveButton(container));

    // The server's own words, not a generic "couldn't save".
    await waitFor(() =>
      expect(container.textContent).toContain('Organization admin role required for this action'),
    );
    // A refused write must not read as an unreachable server.
    expect(container.textContent).not.toContain('could not be reached');
    // Still dirty: the translation section was never persisted.
    expect(saveButton(container).disabled).toBe(false);

    // THE assertion. Saving again must re-send the refused section and NOT the
    // one that already landed — a baseline that advanced for both would repeat
    // the profile write and, worse, would have marked the refused one clean.
    settingsPatch = { status: 200, body: { success: true } };
    fireEvent.click(saveButton(container));
    await waitFor(() => expect(patches('settings')).toHaveLength(2));
    expect(patches('profile')).toHaveLength(1);
    await waitFor(() => expect(saveButton(container).disabled).toBe(true));
  });

  it('reports an unreachable server as unreachable, not as a refusal', async () => {
    const { container } = renderSurface();
    await loaded(container);
    (globalThis.fetch as any).mockImplementation(async () =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    fireEvent.change(nameInput(container), { target: { value: 'Contoso Bio' } });
    fireEvent.change(reasonInput(container), { target: { value: 'Rename' } });
    fireEvent.click(saveButton(container));
    await waitFor(() => expect(container.textContent).toContain('could not be reached'));
    expect(saveButton(container).disabled).toBe(false);
  });
});

describe('Admin → Setup claims no control it does not have', () => {
  it('has no switch for anything enforced elsewhere or per user', async () => {
    const { container } = renderSurface();
    await loaded(container);
    for (const label of [
      'MFA required',
      'SSO enabled',
      'Block machine-only approval',
      'Require back-translation',
      'Two-person rule',
    ]) {
      expect(container.querySelector(`[aria-label="${label}"]`)).toBeNull();
    }
  });

  it('states the approval guardrails as always enforced', async () => {
    const { container } = renderSurface();
    await loaded(container);
    const text = container.textContent || '';
    expect(text).toContain('Machine-only segments are never approvable');
    expect(text).toContain('Verified back-translation before approval');
    expect(text).toContain('Separation of duties on approval');
    // Three rows, each carrying the enforced marker rather than a toggle.
    expect((text.match(/Always enforced/g) || []).length).toBe(3);
  });

  it('discloses that the editable translation preferences are not yet read', async () => {
    const { container } = renderSurface();
    await loaded(container);
    expect(container.textContent).toContain('the translation service does not read them yet');
  });

  it('does not offer edits it cannot persist when the record fails to load', async () => {
    orgGet = { status: 500, body: { success: false, error: 'Failed to fetch organization details' } };
    const { container } = renderSurface();
    await waitFor(() =>
      expect(container.textContent).toContain("Couldn't load your organization record"),
    );
    expect(nameInput(container).disabled).toBe(true);
    expect(nameInput(container).value).toBe('');
    expect(saveButton(container).disabled).toBe(true);
  });
});
