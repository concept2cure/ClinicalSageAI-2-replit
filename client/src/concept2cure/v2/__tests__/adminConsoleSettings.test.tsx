// @vitest-environment jsdom
/**
 * Setup folds into Admin and access (D2, 2026-10-29; founder direction: "most
 * 'app' into core functionality"). FUNCTION_PARITY.md, "Into administration
 * (`admin-console`) / From `setup`", places every one of Setup's functions on
 * admin-console:
 *
 *   - the organisation's name and client type, changed under a reason, as a
 *     Profile card on Settings (OrganizationProfileCard.tsx, moved out of
 *     AdminSurfaces.tsx Setup);
 *   - the gateway account choice, the session policy (in place of the
 *     read-only "Session timeout" row), Require PDF/A, the retention period and
 *     the legal holds, each its existing card, mounted on Settings;
 *   - the Identity console, a door on the SSO tab;
 *   - AnA's summary of the configuration, in admin-console's own context, and
 *     only while the Settings tab shows it.
 *
 * Each card keeps its own read and its own governed write; this pins that each
 * is reached here, and that the governed acts keep their reasons.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AdminAccess } from '../surfaces/AdminAccess';
import { useActiveSurfaceContext } from '../surfaceContext';

const TOKEN_ORG = 7;
const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenFor = (organizationId: number) => `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'u1', organizationId })}.sig`;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const props = () => ({
  surface: { id: 'admin-console', label: 'Admin and access' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

const SSO = {
  primary: { kind: '—', provider: 'Not configured', status: 'disabled', domain: '', users: 0, lastSync: 'never' },
  fallback: { kind: 'Local', provider: 'Local users', status: 'enabled', domain: '', users: 1, lastSync: 'real-time' },
  proposed: { kind: '—', provider: 'None staged', status: 'none', domain: '', users: 0, lastSync: 'never' },
  scim: { provider: 'Not configured', enabled: false, provisionedAttrs: 0, lastEvent: '' },
  mfaRequired: true,
  sessionTtl: '30m',
};
const admin = (over: Record<string, unknown> = {}) => ({
  data: {
    organizationId: TOKEN_ORG,
    kpis: [],
    members: [
      { id: 'u-1', initials: 'DR', name: 'Dana Reyes', email: 'dana@example.invalid', role: 'Admin', groups: [], sso: '', mfa: true, lastSeen: '', state: 'active', programs: [] },
    ],
    roles: [{ id: 'admin', label: 'Admin', members: 1, desc: '', scopes: [] }],
    grants: [],
    apiKeys: [],
    audit: [],
    settings: [
      { id: 'mfa-required', label: 'Second factor at sign-in', kind: 'policy', value: 'Required for every member', desc: 'Password sign-in asks for a second factor.' },
      { id: 'sso', label: 'Single sign-on', kind: 'toggle', value: 'Disabled', desc: 'SAML / OIDC via your IdP' },
    ],
    sso: SSO,
    ...over,
  },
  meta: { count: 1, unavailable: [] },
});

let adminBody: unknown;
let sent: Array<{ method: string; url: string; body: any }>;

/** What each card's read (and the profile's write) answers, keyed `METHOD url`. */
const routes = (): Record<string, (body?: any) => unknown> => ({
  'GET /api/mdx/admin': () => adminBody,
  [`GET /api/organizations/${TOKEN_ORG}`]: () => ({ success: true, organization: { id: String(TOKEN_ORG), name: 'Northwind Bio' } }),
  [`PATCH /api/organizations/${TOKEN_ORG}/profile`]: (body) => ({ success: true, organization: { name: body?.name } }),
  [`GET /api/organizations/${TOKEN_ORG}/settings`]: () => ({ success: true, settings: {} }),
  'GET /api/gateway-accounts': () => ({ accounts: [] }),
  'GET /api/vault/legal-holds/retention': () => ({
    retention: { years: 25, defaultYears: 25, isDefault: true, reason: null, governingRule: null, setBy: null, setAt: null },
  }),
  'GET /api/vault/legal-holds': () => ({ holds: [] }),
});

function serve() {
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    sent.push({ method, url, body });
    const answer = routes()[`${method} ${url}`];
    return json(answer ? answer(body) : {});
  });
}

let published: ReturnType<typeof useActiveSurfaceContext> = null;
/** Every context the shell would have forwarded, in order, not only the last one. */
let seen: NonNullable<ReturnType<typeof useActiveSurfaceContext>>[] = [];
function ContextProbe() {
  published = useActiveSurfaceContext('admin-console');
  if (published) seen.push(published);
  return null;
}

function mount(p = props()) {
  render(
    <>
      <AdminAccess {...p} />
      <ContextProbe />
    </>,
  );
  return p;
}

async function openTab(label: string) {
  const tab = await waitFor(() => {
    const found = Array.from(document.querySelectorAll('.adm-tab')).find((b) => (b.textContent || '').includes(label));
    expect(found, `the ${label} tab did not render`).toBeTruthy();
    return found as Element;
  });
  fireEvent.click(tab);
}

const nameInput = () => document.querySelector('input[aria-label="Organization name"]') as HTMLInputElement | null;
const reasonInput = () => document.querySelector('input[aria-label="Reason for change"]') as HTMLInputElement;
const saveButton = () =>
  Array.from(document.querySelectorAll('button')).find((b) => /Save to organization|No unsaved changes|Saving/.test(b.textContent || '')) as HTMLButtonElement;

beforeEach(() => {
  sent = [];
  published = null;
  seen = [];
  adminBody = admin();
  apiRequest.mockReset();
  serve();
  sessionStorage.setItem('trialsage_access_token', tokenFor(TOKEN_ORG));
  // useIndustryProfile reads with its own fetch.
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/api/mdx/industry-profile')) {
      return json({ data: { organizationId: TOKEN_ORG, primaryIndustry: 'biotech_pharma', mdxSpecialization: null } });
    }
    return json({ success: false }, 404);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe('Settings carries every governed setting Setup held', () => {
  it('mounts the Profile card and each setting card on the Settings tab', async () => {
    mount();
    await openTab('Settings');
    for (const id of [
      'organization-profile-card',
      'gateway-accounts-setting',
      'pdfa-requirement-setting',
      'retention-period-card',
      'legal-holds-card',
      'claude-connector-setting',
    ]) {
      expect(await screen.findByTestId(id), `Settings has no ${id}`).toBeTruthy();
    }
    expect(screen.getByRole('region', { name: 'Session security policy' })).toBeTruthy();
  });

  it('says that the cards change their settings, not that nothing on the tab does', async () => {
    mount();
    await openTab('Settings');
    await screen.findByTestId('organization-profile-card');
    expect(document.body.textContent).not.toContain('Nothing on this tab changes them yet');
  });

  it('shows the organisation’s name from its record and renames it only under a reason', async () => {
    mount();
    await openTab('Settings');
    await waitFor(() => expect(nameInput()?.value).toBe('Northwind Bio'));
    fireEvent.change(nameInput()!, { target: { value: 'Contoso Bio' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(document.body.textContent).toContain('reason of at least 3 characters'));
    expect(sent.filter((r) => r.method === 'PATCH')).toHaveLength(0);

    fireEvent.change(reasonInput(), { target: { value: 'Legal name change' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(sent.filter((r) => r.method === 'PATCH')).toHaveLength(1));
    expect(sent.find((r) => r.method === 'PATCH')).toMatchObject({
      url: `/api/organizations/${TOKEN_ORG}/profile`,
      body: { name: 'Contoso Bio', reason: 'Legal name change' },
    });
  });

  it('offers the client type chips in words', async () => {
    mount();
    await openTab('Settings');
    const card = await screen.findByTestId('organization-profile-card');
    await waitFor(() => expect(within(card).getByRole('button', { name: 'CRO' })).toBeTruthy());
    expect(within(card).getByRole('button', { name: 'Medical device' })).toBeTruthy();
  });
});

describe('the SSO tab opens the Identity console', () => {
  it('names where SSO and SCIM are governed and opens it', async () => {
    const p = mount();
    await openTab('SSO');
    fireEvent.click(await screen.findByRole('button', { name: /Open Identity console/ }));
    expect(p.onNav).toHaveBeenCalledWith('identity-console');
    expect(p.onAsk).not.toHaveBeenCalled();
  });

  it('still offers the door when the SSO read failed', async () => {
    adminBody = { ...admin({ sso: null }), meta: { count: 1, unavailable: ['sso'] } };
    mount();
    await openTab('SSO');
    expect(await screen.findByText("Couldn't load SSO and provisioning")).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open Identity console/ })).toBeTruthy();
  });
});

describe('AnA summarises the configuration from admin-console’s context', () => {
  it('publishes the name and client type while Settings shows them', async () => {
    mount();
    await openTab('Settings');
    await waitFor(() => expect((published?.facts?.configuration as any)?.savedOrganizationName).toBe('Northwind Bio'));
    const configuration = published!.facts!.configuration as Record<string, unknown>;
    expect(configuration.clientType).toBe('biotech');
    expect(configuration.hasUnsavedChanges).toBe(false);
    expect(published!.summary).toContain('Northwind Bio');
  });

  it('publishes an unsaved change and whether a reason is entered', async () => {
    mount();
    await openTab('Settings');
    await waitFor(() => expect(nameInput()?.value).toBe('Northwind Bio'));
    fireEvent.change(nameInput()!, { target: { value: 'Contoso Bio' } });
    await waitFor(() => expect((published?.facts?.configuration as any)?.hasUnsavedChanges).toBe(true));
    const configuration = published!.facts!.configuration as Record<string, unknown>;
    expect(configuration.editedOrganizationName).toBe('Contoso Bio');
    expect(configuration.reasonForChangeEntered).toBe(false);
    expect(published!.summary).toMatch(/UNSAVED/);
  });

  it('publishes no configuration on another tab', async () => {
    mount();
    await openTab('Settings');
    await waitFor(() => expect(published?.facts?.configuration).toBeTruthy());
    await openTab('Members');
    await waitFor(() => expect(published?.facts?.tab).toBe('members'));
    expect(published?.facts?.configuration).toBeUndefined();
    // Not even for the one render between the tab switch and the card's unmount.
    expect(seen.filter((c) => c.facts?.tab !== 'settings' && c.facts?.configuration)).toEqual([]);
  });

  it('a failed organisation read is published as a failure, never as an empty name', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/admin') return json(adminBody);
      if (method === 'GET' && url === `/api/organizations/${TOKEN_ORG}`) return json({ success: false, error: 'Failed to fetch organization details' }, 500);
      return json({});
    });
    mount();
    await openTab('Settings');
    await waitFor(() => expect((published?.facts?.configuration as any)?.loadFailure).toBeTruthy());
    expect((published!.facts!.configuration as any).savedOrganizationName).toBeUndefined();
    expect(screen.getByText("Couldn't load your organization record")).toBeTruthy();
  });

  it('asks AnA to summarise the configuration from the Settings tab', async () => {
    const p = mount();
    await openTab('Settings');
    fireEvent.click(await screen.findByRole('button', { name: /Ask AnA to summarise/ }));
    expect(p.onAsk).toHaveBeenCalledWith('Summarize my org configuration');
  });
});
