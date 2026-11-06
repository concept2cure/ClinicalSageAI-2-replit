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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const credentialOwner = vi.hoisted(() => ({ value: { actor: '7:admin', key: 1, sameRevision: () => true } }));
vi.mock('../editor/authoringCurrentRead', async importOriginal => ({
  ...(await importOriginal<typeof import('../editor/authoringCurrentRead')>()), useAuthoringReadSession: () => credentialOwner.value,
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AdminAccess } from '../surfaces/AdminAccess';
import { ClientCredentialVaultCard } from '../surfaces/AdminSettings';
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


const credentialMetadata = (organizationId = 7, canManage = true, held = false) => ({ organizationId, canManage, credentialCards: [{
  id: 'llm_openai', name: 'OpenAI', kind: 'llm', purpose: 'Model requests under your client account',
  status: held ? 'stored_unvalidated' : 'missing', fields: [{ name: 'apiKey', label: 'Provider API key', secret: true, required: true }],
  scopes: ['model_inference', 'embedding'], grantedScopes: held ? ['model_inference'] : [], expiresAt: null,
  lastChangedAt: null, secretFieldsHeld: held ? ['apiKey'] : [], canManage,
}] });

describe('client administration credential vault', () => {
  let held: boolean;
  beforeEach(() => {
    credentialOwner.value = { actor: '7:admin', key: 1, sameRevision: () => true };
    held = false;
    apiRequest.mockImplementation(async (method: string, path: string, body: any) => {
      sent.push({ method, url: path, body });
      return json(method === 'GET' ? credentialMetadata(7, true, held) : { success: true, organizationId: 7 });
    });
  });
  const enter = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Store credential…' }));
    const input = screen.getByLabelText(/Provider API key/) as HTMLInputElement;
    expect(input.type).toBe('password'); expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: 'CREDENTIAL_UI_CANARY' } });
    fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Client administrator capture' } });
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'REAUTH_UI_CANARY' } });
  };
  it('captures a key through the governed route, clears entry and never displays saved or reflected values', async () => {
    apiRequest.mockImplementation(async (method: string, path: string, body: any) => {
      sent.push({ method, url: path, body });
      if (method === 'POST') { held = true; return json({ success: true, organizationId: 7, secret: 'CREDENTIAL_UI_CANARY', message: 'REAUTH_UI_CANARY' }); }
      return json({ ...credentialMetadata(7, true, held), secret: 'SAVED_VALUE_UI_CANARY' });
    });
    render(<ClientCredentialVaultCard />); await enter();
    expect(document.body.textContent).not.toContain('CREDENTIAL_UI_CANARY');
    fireEvent.click(screen.getByRole('button', { name: 'Store credential' }));
    await screen.findByText('Stored · not validated');
    const post = sent.find(x => x.method === 'POST');
    expect(post).toMatchObject({ url: '/api/deep-research/connectors', body: { connectorId: 'llm_openai', action: 'capture', credentials: { apiKey: 'CREDENTIAL_UI_CANARY' }, scopes: ['model_inference'], reauth: { password: 'REAUTH_UI_CANARY' } } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toMatch(/CREDENTIAL_UI_CANARY|REAUTH_UI_CANARY|SAVED_VALUE_UI_CANARY/);
    expect(JSON.stringify(localStorage)).not.toMatch(/CREDENTIAL_UI_CANARY|REAUTH_UI_CANARY/);
    fireEvent.click(screen.getByRole('button', { name: 'Replace credential…' }));
    expect((screen.getByLabelText(/Provider API key/) as HTMLInputElement).value).toBe('');
  });
  it('closes on failed submit and uses a fixed refusal without server response text', async () => {
    apiRequest.mockImplementation(async (method: string) => method === 'GET' ? json(credentialMetadata()) : json({ error: { message: 'CREDENTIAL_UI_CANARY' } }, 401));
    render(<ClientCredentialVaultCard />); await enter();
    fireEvent.click(screen.getByRole('button', { name: 'Store credential' }));
    await screen.findByText(/identity could not be confirmed/);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.body.textContent).not.toContain('CREDENTIAL_UI_CANARY');
  });
  it('revokes without sending any credential material', async () => {
    held = true; render(<ClientCredentialVaultCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke…' }));
    expect(screen.queryByLabelText(/Provider API key/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Client revoked the provider grant' } });
    fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'fixture password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke credential' }));
    await waitFor(() => expect(sent.some(x => x.method === 'POST')).toBe(true));
    const post = sent.find(x => x.method === 'POST'); expect(post?.body.action).toBe('revoke'); expect(post?.body.credentials).toBeUndefined();
  });
  it('takes capability from the backend and shows a failed read without fabricating status', async () => {
    apiRequest.mockResolvedValue(json(credentialMetadata(7, false))); const view = render(<ClientCredentialVaultCard />);
    await screen.findByText(/Only your organisation/); expect(screen.queryByRole('button', { name: 'Store credential…' })).toBeNull();
    view.unmount(); apiRequest.mockRejectedValue(new Error('CREDENTIAL_UI_CANARY'));
    render(<ClientCredentialVaultCard />); await screen.findByText(/could not be read/);
    expect(document.body.textContent).not.toContain('CREDENTIAL_UI_CANARY'); expect(screen.queryByText('Not stored')).toBeNull();
  });
  it('drops a secret drawer and late old-tenant metadata on an organisation switch', async () => {
    const view = render(<ClientCredentialVaultCard />); await enter();
    credentialOwner.value = { actor: '8:other', key: 2, sameRevision: () => true };
    view.rerender(<ClientCredentialVaultCard />);
    expect(screen.queryByRole('dialog')).toBeNull(); expect(document.body.textContent).not.toContain('CREDENTIAL_UI_CANARY');
    await screen.findByText(/could not be read/); // the old org response cannot populate the new visit
    expect(screen.queryByText('OpenAI')).toBeNull(); expect(sent.some(x => x.method === 'POST')).toBe(false);
  });
  it('cancels without retaining a key on reopen', async () => {
    render(<ClientCredentialVaultCard />); await enter(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Store credential…' }));
    expect((screen.getByLabelText(/Provider API key/) as HTMLInputElement).value).toBe('');
  });
});


it('keeps portal credentials explicitly storage-only', async () => {
  credentialOwner.value = { actor: '7:admin', key: 1, sameRevision: () => true };
  const response = credentialMetadata(7, true, true);
  Object.assign(response.credentialCards[0], { id: 'clinical_trials_prs', name: 'ClinicalTrials.gov PRS',
    purpose: 'Store your own PRS login. Portal actions are not connected.', status: 'stored_not_connected',
    scopes: ['account_reference'], grantedScopes: ['account_reference'] });
  apiRequest.mockResolvedValue(json(response));
  render(<ClientCredentialVaultCard />);
  await screen.findByText('Stored · portal actions not connected');
  expect(screen.getByText(/Keep account reference only/)).toBeTruthy();
  expect(screen.queryByText('Connected')).toBeNull();
});

it('cannot apply an old tenant write receipt after the organisation changes', async () => {
  credentialOwner.value = { actor: '7:admin', key: 1, sameRevision: () => true };
  let finish: (response: Response) => void = () => undefined;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  apiRequest.mockImplementation(async (method: string, _path: string, body: unknown) => {
    if (method === 'POST') { sent.push({ method, url: '/api/deep-research/connectors', body }); return pending; }
    const org = Number(credentialOwner.value.actor.split(':')[0]);
    const metadata = credentialMetadata(org); metadata.credentialCards[0].name = `Tenant ${org} provider`;
    return json(metadata);
  });
  const view = render(<ClientCredentialVaultCard />);
  fireEvent.click(await screen.findByRole('button', { name: 'Store credential…' }));
  fireEvent.change(screen.getByLabelText(/Provider API key/), { target: { value: 'LATE_WRITE_UI_CANARY' } });
  fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Initial tenant provider rotation' } });
  fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'fixture password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Store credential' }));
  await waitFor(() => expect(sent.some(x => x.method === 'POST')).toBe(true));
  credentialOwner.value = { actor: '8:other', key: 2, sameRevision: () => true };
  view.rerender(<ClientCredentialVaultCard />); await screen.findByText('Tenant 8 provider');
  await act(async () => { finish(json({ success: true, organizationId: 7, secret: 'LATE_WRITE_UI_CANARY' })); });
  expect(screen.queryByText(/Credential change recorded/)).toBeNull();
  expect(screen.getByText('Tenant 8 provider')).toBeTruthy();
  expect(document.body.textContent).not.toContain('LATE_WRITE_UI_CANARY');
});


it('does not call an unconfirmed write response a recorded credential change', async () => {
  credentialOwner.value = { actor: '7:admin', key: 1, sameRevision: () => true };
  apiRequest.mockImplementation(async (method: string) => json(method === 'GET' ? credentialMetadata() : { success: true, organizationId: 99 }));
  render(<ClientCredentialVaultCard />);
  fireEvent.click(await screen.findByRole('button', { name: 'Store credential…' }));
  fireEvent.change(screen.getByLabelText(/Provider API key/), { target: { value: 'UNCONFIRMED_UI_CANARY' } });
  fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Confirm matching tenant receipt' } });
  fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'fixture password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Store credential' }));
  await screen.findByText(/could not be confirmed/);
  expect(screen.queryByText(/Credential change recorded/)).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
});


// Independent client/API contract fixture: inventories every previously authenticated adapter.
const inventoryCredentialCards = () => {
  const field = (name: string, secret = false, required = true, multiline?: boolean) => ({ name, label: name, secret, required, ...(multiline === undefined ? {} : { multiline }) });
  const repositories = ['connector_search', 'connector_fetch', 'connector_upload'];
  const read = ['connector_search', 'connector_fetch'];
  const spec = (id: string, fields: ReturnType<typeof field>[], scopes = read, kind = 'connector') => ({
    id, name: id, kind, purpose: `Client-owned ${id} credential`, status: 'missing', fields, scopes,
    grantedScopes: [], expiresAt: null, lastChangedAt: null, secretFieldsHeld: [], canManage: true,
  });
  return { organizationId: 7, canManage: true, credentialCards: [
    spec('veeva_vault', [field('baseUrl'), field('username', false, false), field('password', true, false), field('apiKey', true, false)], repositories),
    spec('llm_anthropic', [field('apiKey', true)], ['model_inference'], 'llm'),
    spec('llm_openai', [field('apiKey', true)], ['model_inference', 'embedding'], 'llm'),
    spec('llm_moonshot', [field('apiKey', true)], ['model_inference'], 'llm'),
    spec('clinical_trials_prs', [field('username'), field('password', true)], ['account_reference']),
    spec('fda_portal', [field('username'), field('password', true)], ['account_reference']),
    spec('google_drive', [field('clientId'), field('clientSecret', true, true, true), field('username', false, false)], repositories),
    spec('box', [field('clientId'), field('clientSecret', true), field('baseUrl')], repositories),
    spec('onedrive', [field('clientId'), field('clientSecret', true), field('tenantId'), field('username', false, false)], repositories),
    spec('sharepoint', [field('clientId'), field('clientSecret', true), field('tenantId')], repositories),
    spec('medidata_rave', [field('baseUrl'), field('username'), field('password', true)]),
    spec('fhir-r4', [field('baseUrl'), field('apiKey', true, false), field('clientId', false, false), field('clientSecret', true, false)]),
    spec('sam_exclusions', [field('apiKey', true)]),
    spec('ellucian_banner', [field('baseUrl'), field('apiKey', true)]),
  ] };
};

it('accepts the complete 14-card metadata contract and keeps all eight existing adapter management forms reachable', async () => {
  credentialOwner.value = { actor: '7:admin', key: 1, sameRevision: () => true };
  const response = inventoryCredentialCards();
  apiRequest.mockResolvedValue(json({ ...response, credentials: { apiKey: 'METADATA_CAPTURE_UI_CANARY' } }));
  render(<ClientCredentialVaultCard />);
  await screen.findByTestId('credential-card-google_drive');
  expect(screen.getAllByTestId(/^credential-card-/)).toHaveLength(14);
  const legacy = ['google_drive', 'box', 'onedrive', 'sharepoint', 'medidata_rave', 'fhir-r4', 'sam_exclusions', 'ellucian_banner'];
  for (const id of legacy) {
    fireEvent.click(within(screen.getByTestId(`credential-card-${id}`)).getByRole('button', { name: 'Store credential…' }));
    const card = response.credentialCards.find(item => item.id === id)!;
    for (const f of card.fields) {
      const input = within(screen.getByRole('dialog')).getByLabelText(new RegExp(`^${f.label}`)) as HTMLInputElement;
      expect(input.value).toBe('');
      if (f.secret) expect(input.type).toBe('password');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  }
  expect(document.body.textContent).not.toContain('METADATA_CAPTURE_UI_CANARY');
});

it('captures the Google private key without a raw DOM value and sends exact PEM newlines', async () => {
  credentialOwner.value = { actor: '7:admin', key: 1, sameRevision: () => true };
  apiRequest.mockImplementation(async (method: string, url: string, body: any) => {
    sent.push({ method, url, body });
    return json(method === 'GET' ? inventoryCredentialCards() : { success: true, organizationId: 7 });
  });
  render(<ClientCredentialVaultCard />);
  fireEvent.click(within(await screen.findByTestId('credential-card-google_drive')).getByRole('button', { name: 'Store credential…' }));
  const input = screen.getByLabelText(/^clientSecret/) as HTMLInputElement;
  expect(input.type).toBe('password'); expect(input.readOnly).toBe(true);
  const pem = '-----BEGIN PRIVATE KEY-----\nGOOGLE_MULTILINE_UI_CANARY\n-----END PRIVATE KEY-----\n';
  fireEvent.paste(input, { clipboardData: { getData: () => pem } });
  expect(input.value).toBe('********'); expect(document.body.innerHTML).not.toContain('GOOGLE_MULTILINE_UI_CANARY');
  fireEvent.click(screen.getByRole('button', { name: 'Clear captured credential' }));
  expect(input.value).toBe('');
  fireEvent.paste(input, { clipboardData: { getData: () => pem } });
  fireEvent.change(screen.getByLabelText(/^clientId/), { target: { value: 'service-account@example.invalid' } });
  fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Capture client-owned Drive credentials' } });
  fireEvent.change(screen.getByLabelText(/Your password/), { target: { value: 'fixture password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Store credential' }));
  await waitFor(() => expect(sent.some(item => item.method === 'POST')).toBe(true));
  const post = sent.find(item => item.method === 'POST');
  expect(post?.body).toMatchObject({ connectorId: 'google_drive', credentials: { clientId: 'service-account@example.invalid', clientSecret: pem }, scopes: ['connector_search'] });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.body.innerHTML).not.toContain('GOOGLE_MULTILINE_UI_CANARY');
});
