// @vitest-environment jsdom
/**
 * AdminAccess tells a fresh organisation the truth (launch row D2, 2026-09-23
 * empty-org sweep of `admin-console`).
 *
 *  - Second factor: the KPI no longer reads "MFA enabled 0 of 1" beside a
 *    Settings row saying MFA is required; a member without an authenticator is
 *    "Emailed code", not "Pending"; the sign-in policy row is not offered as a
 *    setting to change.
 *  - A facet the server reports in meta.unavailable renders "couldn't be read",
 *    never "0 API keys" or "No admin audit entries yet".
 *  - Audit rows, API keys and "Last seen" show names and locale times, not
 *    u-1 / user_login / a cut UUID / ISO strings.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AdminAccess } from '../surfaces/AdminAccess';

const props = () => ({
  surface: { id: 'admin-console', label: 'Admin and access' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

const LAST_LOGIN = '2026-09-23T14:28:37.818Z';
const AUDIT_AT = '2026-09-23T14:28:37.830Z';
const localWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The payload GET /api/mdx/admin returns for a fresh org on a dev server. */
const payload = (unavailable: string[] = [], over: Record<string, unknown> = {}) => ({
  data: {
    kpis: [],
    members: [
      { id: 'u-1', initials: 'JS', name: 'JM Smith', email: 'jm.smith@concept2cure.pro', role: 'Admin', groups: [], sso: '', mfa: false, lastSeen: LAST_LOGIN, state: 'active', programs: [] },
    ],
    roles: [{ id: 'admin', label: 'Admin', members: 1, desc: '', scopes: [] }],
    grants: [{ user: 'u-1', program: '*', scope: 'edit', granted: 'Org admin' }],
    apiKeys: [
      { id: 'key-7', keyId: 7, prefix: 'c2c_ab12', name: 'ingest key', owner: 'JM Smith', scopes: ['documents:read'], created: '2026-09-01', lastUsed: 'never', rotateIn: '' },
    ],
    audit: [
      { id: '322439ff-0b2a-4ad5-9d6e-1f0c2b7e9a11', when: AUDIT_AT, actor: 'JM Smith', action: 'Signed in on a development server: second factor skipped', target: 'JM Smith', sha: 'ea14…c436' },
    ],
    settings: [
      { id: 'mfa-required', label: 'Second factor at sign-in', kind: 'policy', value: 'Skipped on this development server', desc: 'Development sign-in is on here.' },
      { id: 'sso', label: 'Single sign-on', kind: 'toggle', value: 'Disabled', desc: 'SAML / OIDC via your IdP' },
    ],
    sso: {
      primary: { kind: '—', provider: 'Not configured', status: 'disabled', domain: '', users: 0, lastSync: 'never' },
      fallback: { kind: 'Local', provider: 'Local users', status: 'enabled', domain: '', users: 1, lastSync: 'real-time' },
      proposed: { kind: '—', provider: 'None staged', status: 'none', domain: '', users: 0, lastSync: 'never' },
      scim: { provider: 'Not configured', enabled: false, provisionedAttrs: 0, lastEvent: '' },
      mfaRequired: false, sessionTtl: '',
    },
    ...over,
  },
  meta: { count: 1, unavailable },
});

function serve(body: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/admin') {
      return { ok: true, status: 200, json: async () => body } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

function kpi(label: string) {
  const card = Array.from(document.querySelectorAll('.metric-card')).find((el) =>
    (el.querySelector('.metric-label')?.textContent || '') === label,
  );
  return {
    value: card?.querySelector('.metric-val')?.textContent?.trim() ?? null,
    meta: card?.querySelector('.metric-meta')?.textContent?.trim() ?? null,
  };
}

function clickTab(label: string) {
  const btn = Array.from(document.querySelectorAll('.adm-tab')).find((b) =>
    (b.textContent || '').includes(label),
  );
  fireEvent.click(btn as Element);
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('second factor — one answer on one screen', () => {
  it('labels the count as authenticator enrolment and a member without one as "Emailed code"', async () => {
    serve(payload());
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('JM Smith');

    expect(kpi('MFA enabled').value).toBeNull();
    expect(kpi('Authenticator app')).toEqual({ value: '0', meta: 'of 1 members enrolled' });
    expect(screen.getByText('Emailed code')).toBeTruthy();
    expect(screen.queryByText('Pending')).toBeNull();
  });

  it('shows the sign-in policy row as a fact, not a setting to change', async () => {
    const p = props();
    serve(payload());
    render(<AdminAccess {...p} />);
    await screen.findAllByText('JM Smith');
    clickTab('Settings');

    const policy = await screen.findByText('Skipped on this development server');
    expect(policy.closest('button')).toBeNull();
    // An ordinary setting is still offered for a governed change.
    fireEvent.click(screen.getByText('Single sign-on').closest('button') as Element);
    expect(p.onAsk).toHaveBeenCalledTimes(1);
  });
});

describe('a facet the server could not read is not rendered as empty', () => {
  it('API keys: "--" and "Couldn\'t load", not "0" and "No API keys"', async () => {
    serve(payload(['apiKeys'], { apiKeys: [] }));
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('JM Smith');

    expect(kpi('API keys')).toEqual({ value: '--', meta: 'Could not be read' });
    clickTab('API keys');
    expect(await screen.findByText("Couldn't load API keys")).toBeTruthy();
    expect(screen.queryByText(/^No API keys/)).toBeNull();
    expect(document.body.textContent).not.toContain('0 keys');
  });

  it('audit: "Couldn\'t load the admin audit", not "No admin audit entries yet"', async () => {
    serve(payload(['audit'], { audit: [] }));
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('JM Smith');

    expect(screen.getByText("Couldn't load the admin audit")).toBeTruthy();
    expect(screen.queryByText(/No admin audit entries yet/)).toBeNull();
    expect(document.body.textContent).not.toContain('0 actions shown');
  });

  it('settings and SSO: say they could not be read', async () => {
    serve(payload(['settings', 'sso'], {
      settings: [{ id: 'mfa-required', label: 'Second factor at sign-in', kind: 'policy', value: 'Required for every member', desc: '' }],
      sso: null,
    }));
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('JM Smith');

    clickTab('Settings');
    expect(await screen.findByText("Couldn't load org settings")).toBeTruthy();
    expect(screen.getByText('Required for every member')).toBeTruthy();
    clickTab('SSO');
    expect(await screen.findByText("Couldn't load SSO and provisioning")).toBeTruthy();
  });

  it('retries the read from the error', async () => {
    serve(payload(['audit'], { audit: [] }));
    render(<AdminAccess {...props()} />);
    await screen.findByText("Couldn't load the admin audit");
    serve(payload());
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);
    expect(await screen.findByText('Signed in on a development server: second factor skipped')).toBeTruthy();
  });
});

describe('names and times, not ids and ISO strings', () => {
  it('renders the audit band and Last seen for a reader', async () => {
    serve(payload());
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('JM Smith');

    const row = document.querySelector('.adm-audit-row') as HTMLElement;
    expect(row.textContent).toContain('Signed in on a development server: second factor skipped');
    expect(row.textContent).toContain(localWhen(AUDIT_AT));
    // No ISO instant, no cut UUID, no u-<id>, anywhere on the page.
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(document.body.textContent).not.toMatch(/322439ff|u-1\b/i);
    expect(screen.getAllByText(localWhen(LAST_LOGIN)).length).toBeGreaterThan(0);
  });

  it('shows an API key by prefix and owner name, and revokes it by its numeric id', async () => {
    serve(payload());
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('JM Smith');
    clickTab('API keys');

    await screen.findByText('ingest key');
    expect(screen.getByText('c2c_ab12…')).toBeTruthy();
    expect(screen.queryByText('key-7')).toBeNull();

    fireEvent.click(screen.getByTestId('apikey-revoke'));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke key' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith('DELETE', '/api/api-keys/7'),
    );
  });
});

/**
 * QA 2026-10-08 (j9, finding 4): the server now reports an invitee who has not
 * set a password as `invited`. The KPI counts active members only and says how
 * many are invited; the Invited filter finds them.
 */
describe('invited members are not counted as active', () => {
  const invitee = { id: 'u-2', userId: 2, self: false, initials: 'PP', name: 'Pat Pending', email: 'pat@c2c.test', role: 'Manager', groups: [], sso: '', mfa: false, lastSeen: '', state: 'invited', programs: [] };

  it('the Members KPI reads "1 active · 1 invited", and the Invited filter lists the invitee', async () => {
    const p = payload();
    serve(payload([], { members: [...(p.data.members as object[]), invitee] }));
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('JM Smith');

    expect(kpi('Members')).toEqual({ value: '2', meta: '1 active · 1 invited' });
    fireEvent.click(Array.from(document.querySelectorAll('.seg-btn')).find((b) => b.textContent === 'Invited') as Element);
    const rows = Array.from(document.querySelectorAll('button.ctable-row')).map((r) => r.textContent || '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Pat Pending');
  });
});
