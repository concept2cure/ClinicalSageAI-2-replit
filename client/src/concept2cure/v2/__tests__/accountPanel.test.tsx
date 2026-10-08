// @vitest-environment jsdom
/**
 * The account panel (P-25, docs/LAUNCH_DEFINITION_OF_DONE.md): from the shell's
 * account menu a signed-in person sees their profile, changes their password
 * and enrols or removes an authenticator app. Until this panel the server's
 * /mfa/setup and /mfa/enable had no client caller, so the authenticator ADR-0014
 * expects of signers could not be enrolled anywhere in the product.
 *
 * Nothing on the client side is stubbed but the network: the real AuthProvider
 * and the real authService singleton run, and `fetch` answers at the server's
 * own route paths (server/routes/auth.ts) with the server's own bodies. That is
 * what makes the 401 rule (authService `unauthorizedMeansSession`, QA 2026-10-08
 * j9) testable on this screen: a wrong current password or a wrong code is a
 * 401 the server sends as a refusal, and it must read as that refusal — never
 * as "Session expired", never with a refresh, never with a sign-out.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 1 }),
}));

import { AuthProvider, authService } from '@/services/portal/authService';
import { NavEntitlementsProvider } from '../navEntitlements';
import { Rail } from '../Shell';
import { AccountPanel } from '../AccountPanel';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The user GET /api/v1/auth/session answers (auth.ts `/session`), membership role first. */
function sessionUser(over: Record<string, unknown> = {}) {
  return {
    id: '33',
    email: 'ada.rowe@c2c.test',
    firstName: 'Ada',
    lastName: 'Rowe',
    displayName: 'Ada Rowe',
    roles: ['reviewer', 'user'],
    permissions: [],
    organizationId: '1',
    organizationName: 'Northwind Bio',
    mfaEnabled: false,
    mfaMethods: [{ type: 'email', isEnabled: true, isPrimary: true }],
    mustChangePassword: false,
    ...over,
  };
}
const sessionBody = (over: Record<string, unknown> = {}) => ({
  authenticated: true,
  user: sessionUser(over),
  session: { idleMinutes: 15, lifetimeHours: 12 },
});

type Route = () => Response | Promise<Response>;
const routes = new Map<string, Route>();
const calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
const callsTo = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);
const refreshed = () => calls.some((c) => c.path.endsWith('/refresh'));

const SESSION = '/api/v1/auth/session';
const PASSWORD_CHANGE = '/api/v1/auth/password/change';
const MFA_SETUP = '/api/v1/auth/mfa/setup';
const MFA_ENABLE = '/api/v1/auth/mfa/enable';
const MFA_DISABLE = '/api/v1/auth/mfa/disable';
const LOGOUT = '/api/v1/auth/logout';

/** What /mfa/setup issues (mfaService.generateSecret): a base32 key, its URI, a server-drawn data: URL. */
// nosemgrep: detected-generic-secret -- the RFC 6238 / Google Authenticator documentation example key, a public test fixture, not a credential
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const SETUP_BODY = {
  success: true,
  secret: SECRET,
  otpauthUrl: `otpauth://totp/Concept2Cure%3Aada.rowe%40c2c.test?secret=${SECRET}&issuer=Concept2Cure`,
  qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
};

beforeEach(() => {
  routes.clear();
  calls.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const method = (init?.method ?? 'GET').toUpperCase();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({
        method,
        path,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        auth: headers.Authorization ?? null,
      });
      const route = routes.get(`${method} ${path}`);
      if (!route) return json(404, { error: { code: 'NOT_MOCKED', message: `unexpected ${method} ${path}` } });
      return route();
    }),
  );
  routes.set(`GET ${SESSION}`, () => json(200, sessionBody()));
  routes.set(`POST ${LOGOUT}`, () => json(200, { success: true }));
  // A live session, as after a sign-in: the singleton holds it and the provider reads it back.
  authService.setToken('access-token-for-test', sessionUser() as never, 'refresh-token-for-test', 3600);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === '/api/module-subscriptions/navigation'
      ? json(200, { organizationId: 1, tier: 'standard', industryMode: 'biotech', masterAdmin: false, platformAdmin: false, resolved: true, surfaces: [] })
      : json(200, { data: [] }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

/** Mount the panel as the shell does, inside the real provider, and wait for the account read. */
async function openPanel() {
  const onClose = vi.fn();
  render(
    <AuthProvider>
      <AccountPanel onClose={onClose} />
    </AuthProvider>,
  );
  const dialog = await screen.findByRole('dialog', { name: 'Account' });
  await within(dialog).findByDisplayValue('ada.rowe@c2c.test');
  return { dialog, onClose };
}

const field = (dialog: HTMLElement, label: string) => within(dialog).getByLabelText(label) as HTMLInputElement;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('the account menu offers the panel', () => {
  it('lists Account, and choosing it opens the panel on the server\'s account', async () => {
    render(
      <AuthProvider>
        <NavEntitlementsProvider>
          <Rail activeId="projects" onNav={vi.fn()} collapsed={false} setCollapsed={() => {}} segment="biotech" setSegment={() => {}} />
        </NavEntitlementsProvider>
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByTitle('Ada Rowe'));
    const items = screen.getAllByRole('menuitem').map((b) => b.textContent);
    expect(items[0]).toBe('Account');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Account' }));
    expect(screen.queryByRole('menu')).toBeNull();
    const dialog = await screen.findByRole('dialog', { name: 'Account' });
    await within(dialog).findByDisplayValue('ada.rowe@c2c.test');
    // The panel read the account from the server when it opened, not from storage.
    expect(callsTo('GET', SESSION).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Account' })).toBeNull();
    // Focus returns to the control that opened the menu.
    expect(document.activeElement).toBe(screen.getByTitle('Ada Rowe'));
  });
});

describe('profile', () => {
  it('shows name, e-mail, organisation and the membership role, as the server reports them', async () => {
    const { dialog } = await openPanel();
    expect(field(dialog, 'Name').value).toBe('Ada Rowe');
    expect(field(dialog, 'E-mail').value).toBe('ada.rowe@c2c.test');
    expect(field(dialog, 'Organisation').value).toBe('Northwind Bio');
    expect(field(dialog, 'Role').value).toBe('reviewer');
    // Read-only: the person sees them; administrators manage membership.
    for (const label of ['Name', 'E-mail', 'Organisation', 'Role']) expect(field(dialog, label).readOnly).toBe(true);
  });

  it('a session with no organisation says so, and names none (P-25)', async () => {
    // GET /session answers null when the token names no organisation or its record is missing.
    routes.set(`GET ${SESSION}`, () => json(200, sessionBody({ organizationName: null })));
    const { dialog } = await openPanel();
    expect(field(dialog, 'Organisation').value).toBe('None on this session');
    expect(within(dialog).queryByDisplayValue(/Concept2Cure|Organization/)).toBeNull();
  });

  it('a failed account read is an error with a way to retry, never an empty panel', async () => {
    let fail = true;
    routes.set(`GET ${SESSION}`, () =>
      fail ? json(500, { authenticated: false, error: { code: 'AUTH_010', message: 'Internal server error' } }) : json(200, sessionBody()),
    );
    render(
      <AuthProvider>
        <AccountPanel onClose={vi.fn()} />
      </AuthProvider>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Account' });
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toMatch(/Your account could not be read/);
    expect(alert.textContent).toMatch(/Internal server error/);
    expect(within(dialog).queryByLabelText('E-mail')).toBeNull();
    expect(within(dialog).queryByLabelText('Current password')).toBeNull();

    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByDisplayValue('ada.rowe@c2c.test')).toBeTruthy();
  });
});

describe('password', () => {
  async function submitPassword(dialog: HTMLElement, current: string, next: string, confirm = next) {
    type(field(dialog, 'Current password'), current);
    type(field(dialog, 'New password'), next);
    type(field(dialog, 'Confirm new password'), confirm);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
  }

  it('a wrong current password shows the server\'s refusal — not "Session expired" — and the session stays', async () => {
    routes.set(`POST ${PASSWORD_CHANGE}`, () =>
      json(401, { success: false, error: { code: 'AUTH_001', message: 'Current password is incorrect' } }),
    );
    const { dialog } = await openPanel();
    await submitPassword(dialog, 'not-it', 'Another-long-pass-1!');

    const refusal = await within(dialog).findByText('Current password is incorrect');
    expect(refusal.closest('[role="alert"]')).not.toBeNull();
    expect(dialog.textContent).not.toMatch(/Session expired/i);
    expect(refreshed()).toBe(false);
    expect(callsTo('POST', LOGOUT)).toHaveLength(0);
    expect(authService.isAuthenticated()).toBe(true);
    // The route reads two fields; the request sends those two and nothing invented.
    expect(callsTo('POST', PASSWORD_CHANGE)[0].body).toEqual({ currentPassword: 'not-it', newPassword: 'Another-long-pass-1!' });
    expect(callsTo('POST', PASSWORD_CHANGE)[0].auth).toBe('Bearer access-token-for-test');
  });

  it('shows every policy refusal the server lists, in its words', async () => {
    routes.set(`POST ${PASSWORD_CHANGE}`, () =>
      json(400, {
        success: false,
        error: {
          code: 'AUTH_001',
          message: 'Password must contain at least one number',
          details: { errors: ['Password must contain at least one number', 'Password must contain at least one special character'] },
        },
      }),
    );
    const { dialog } = await openPanel();
    await submitPassword(dialog, 'current-Pass-1!', 'NoDigitsHereAtAll');
    expect(await within(dialog).findByText('Password must contain at least one number')).toBeTruthy();
    expect(within(dialog).getByText('Password must contain at least one special character')).toBeTruthy();
  });

  it('a confirmation that differs is caught before anything is sent', async () => {
    const { dialog } = await openPanel();
    await submitPassword(dialog, 'current-Pass-1!', 'Another-long-pass-1!', 'Another-long-pass-2!');
    expect(await within(dialog).findByText('The new passwords do not match.')).toBeTruthy();
    expect(callsTo('POST', PASSWORD_CHANGE)).toHaveLength(0);
  });

  it('a change says that every session has ended, this one included, and signs out on request', async () => {
    routes.set(`POST ${PASSWORD_CHANGE}`, () => json(200, { success: true, message: 'Password changed successfully' }));
    const { dialog } = await openPanel();
    await submitPassword(dialog, 'current-Pass-1!', 'Another-long-pass-1!');

    const done = await within(dialog).findByRole('status', { name: /Password changed/ });
    expect(done.textContent).toMatch(/this one included/);
    expect(within(dialog).queryByLabelText('Current password')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in again' }));
    await waitFor(() => expect(callsTo('POST', LOGOUT)).toHaveLength(1));
    await waitFor(() => expect(authService.isAuthenticated()).toBe(false));
  });
});

describe('authenticator app', () => {
  it('enrolment shows the server\'s QR code and key, confirms a code, then shows the recovery codes once', async () => {
    let enrolled = false;
    routes.set(`GET ${SESSION}`, () => json(200, sessionBody({ mfaEnabled: enrolled })));
    routes.set(`POST ${MFA_SETUP}`, () => json(200, SETUP_BODY));
    routes.set(`POST ${MFA_ENABLE}`, () => {
      enrolled = true;
      return json(200, { success: true, message: 'MFA has been enabled successfully', backupCodes: ['a1b2-c3d4', 'e5f6-a7b8'] });
    });
    const { dialog } = await openPanel();
    expect(within(dialog).getByText(/Not set up/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Set up authenticator app' }));
    expect(await within(dialog).findByText(SECRET)).toBeTruthy();
    const qr = within(dialog).getByRole('img', { name: /QR code/ }) as HTMLImageElement;
    expect(qr.getAttribute('src')).toBe(SETUP_BODY.qrCode);

    const confirm = within(dialog).getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    type(field(dialog, 'Code from the app'), '123 456');
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await within(dialog).findByText('a1b2-c3d4');
    expect(within(dialog).getByText('e5f6-a7b8')).toBeTruthy();
    expect(callsTo('POST', MFA_ENABLE)[0].body).toEqual({ code: '123456' });
    // The key is gone once enrolment is confirmed, and was never stored.
    expect(within(dialog).queryByText(SECRET)).toBeNull();
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain('a1b2-c3d4');
    // The status is the server's, re-read after the change.
    await waitFor(() => expect(within(dialog).getByText(/^Set up\./)).toBeTruthy());

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(within(dialog).queryByText('a1b2-c3d4')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Remove authenticator' })).toBeTruthy();
  });

  it('a wrong confirmation code shows the server\'s refusal, not "Session expired", and keeps the key on screen', async () => {
    const refusal =
      'Invalid verification code. Ensure your authenticator app is synced; each code works once, so if you just used it, wait for the next.';
    routes.set(`POST ${MFA_SETUP}`, () => json(200, SETUP_BODY));
    routes.set(`POST ${MFA_ENABLE}`, () => json(401, { success: false, error: { code: 'AUTH_004', message: refusal } }));
    const { dialog } = await openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set up authenticator app' }));
    await within(dialog).findByText(SECRET);
    type(field(dialog, 'Code from the app'), '000000');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await within(dialog).findByText(refusal)).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/Session expired/i);
    expect(refreshed()).toBe(false);
    expect(authService.isAuthenticated()).toBe(true);
    expect(within(dialog).getByText(SECRET)).toBeTruthy();
  });

  it('a refused setup is shown in the server\'s words', async () => {
    const msg =
      'Two-step verification is already on for this account. To use a different authenticator, turn it off with a current code first.';
    routes.set(`POST ${MFA_SETUP}`, () => json(409, { success: false, error: { code: 'MFA_ALREADY_ENABLED', message: msg } }));
    const { dialog } = await openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set up authenticator app' }));
    expect(await within(dialog).findByText(msg)).toBeTruthy();
  });

  it('never loads a QR code from anywhere but the server\'s own data: URL', async () => {
    routes.set(`POST ${MFA_SETUP}`, () =>
      json(200, { ...SETUP_BODY, qrCode: `https://api.qrserver.com/v1/create-qr-code/?data=otpauth%3A%2F%2Ftotp%3Fsecret%3D${SECRET}` }),
    );
    const { dialog } = await openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set up authenticator app' }));
    expect(await within(dialog).findByText(SECRET)).toBeTruthy();
    expect(within(dialog).queryByRole('img', { name: /QR code/ })).toBeNull();
  });

  it('removal sends a current code; the server\'s refusal is shown, and a good code removes it', async () => {
    let enrolled = true;
    let accept = false;
    routes.set(`GET ${SESSION}`, () => json(200, sessionBody({ mfaEnabled: enrolled })));
    routes.set(`POST ${MFA_DISABLE}`, () => {
      if (!accept) return json(401, { success: false, error: { code: 'AUTH_004', message: 'Invalid verification code' } });
      enrolled = false;
      return json(200, { success: true, message: 'MFA has been disabled' });
    });
    const { dialog } = await openPanel();
    expect(within(dialog).getByText(/^Set up\./)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove authenticator' }));
    type(field(dialog, 'Current code from the app'), '654321');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await within(dialog).findByText('Invalid verification code')).toBeTruthy();
    expect(dialog.textContent).not.toMatch(/Session expired/i);
    expect(refreshed()).toBe(false);
    expect(callsTo('POST', MFA_DISABLE)[0].body).toEqual({ code: '654321' });

    accept = true;
    type(field(dialog, 'Current code from the app'), '112233');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    });
    await waitFor(() => expect(within(dialog).getByText(/^Not set up\./)).toBeTruthy());
    expect(within(dialog).getByText(/Authenticator removed/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Set up authenticator app' })).toBeTruthy();
  });
});

describe('authenticator app: what removal costs where signing needs it (P-25 follow-up)', () => {
  it('where signing needs an authenticator, removal warns that it stops signing (P-25 follow-up)', async () => {
    routes.set(`GET ${SESSION}`, () =>
      json(200, sessionBody({ mfaEnabled: true, signing: { authenticatorRequired: true, authenticatorEnrolled: true } })),
    );
    const { dialog } = await openPanel();
    expect(within(dialog).queryByText('Removing it stops you signing.')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove authenticator' }));
    expect(within(dialog).getByText('Removing it stops you signing.')).toBeTruthy();
  });

  it('where signing does not need one, removal carries no such warning', async () => {
    routes.set(`GET ${SESSION}`, () =>
      json(200, sessionBody({ mfaEnabled: true, signing: { authenticatorRequired: false, authenticatorEnrolled: true } })),
    );
    const { dialog } = await openPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove authenticator' }));
    expect(field(dialog, 'Current code from the app')).toBeTruthy();
    expect(within(dialog).queryByText('Removing it stops you signing.')).toBeNull();
  });
});
