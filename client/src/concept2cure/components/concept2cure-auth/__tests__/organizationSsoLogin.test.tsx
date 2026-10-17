// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import authCopy from '../../../../../public/locales/en/auth.json';
const auth = vi.hoisted(() => ({
  login: vi.fn(), verifyMfa: vi.fn(), adoptSession: vi.fn(), adoptMfaChallenge: vi.fn(), setLocation: vi.fn(),
}));
vi.mock('wouter', () => ({ useLocation: () => ['/concept2cure/login', auth.setLocation] }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ login: auth.login, verifyMfa: auth.verifyMfa }),
  authService: { adoptSession: auth.adoptSession, adoptMfaChallenge: auth.adoptMfaChallenge, getUser: () => ({ id: '7', organizationId: '42', roles: ['member'] }) },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => key.split('.').reduce((value: any, part) => value?.[part], authCopy) ?? options?.defaultValue ?? key }),
  Trans: () => null,
}));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
import { Concept2CureLogin } from '../Concept2CureLogin';
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
const CHALLENGE = 'eyJhbGciOiJIUzI1NiJ9.eyJ0eXBlIjoibWZhX2NoYWxsZW5nZSJ9.signature';
beforeEach(() => {
  for (const mock of Object.values(auth)) mock.mockReset();
  auth.adoptMfaChallenge.mockReturnValue(true);
  auth.verifyMfa.mockResolvedValue({ success: true });
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/concept2cure/login');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
async function findSso(slug = 'acme') {
  render(<Concept2CureLogin />);
  fireEvent.click(screen.getByRole('button', { name: 'Use organization SSO' }));
  fireEvent.change(screen.getByLabelText('Organization identifier'), { target: { value: slug } });
  fireEvent.click(screen.getByRole('button', { name: 'Find organization SSO' }));
}
describe('D07 organization SSO in the active login', () => {
  it('discovers only the supplied slug and links to the canonical configured SAML flow with safe continuation', async () => {
    window.history.replaceState(null, '', '/concept2cure/login?returnTo=%2Fconcept2cure%2Fvault%3Fprogram%3Dp-7');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { success: true, provider: 'saml', organization: 'acme', configured: true }));
    await findSso();
    const link = await screen.findByRole('link', { name: 'Continue with SSO' });
    const handoff = new URL(link.getAttribute('href')!, window.location.origin);
    expect(handoff.origin).toBe(window.location.origin);
    expect(handoff.pathname).toBe('/api/auth/sso/saml/initiate');
    expect(handoff.searchParams.get('org')).toBe('acme');
    expect(handoff.searchParams.get('returnTo')).toBe('/concept2cure/vault?program=p-7');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/auth/sso/saml/configuration?org=acme');
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.adoptSession).not.toHaveBeenCalled();
  });
  it('refuses unknown and malformed successful replies without offering a provider handoff', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(404, { success: false, error: 'SAML_NOT_CONFIGURED' }));
    await findSso();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/not configured/));
    expect(screen.queryByRole('link', { name: 'Continue with SSO' })).toBeNull();
  });
  it('does not trust an external URL or another organization in a successful discovery reply', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { success: true, provider: 'saml', organization: 'default', configured: true, initiateUrl: 'https://evil.test/' }));
    await findSso();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Continue with SSO' })).toBeNull();
  });
  it('reports a lookup connection failure without suggesting SSO is configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await findSso();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/could not be checked/));
    expect(screen.queryByRole('link', { name: 'Continue with SSO' })).toBeNull();
  });
  it('a changed slug invalidates the previous handoff and an unsafe continuation uses the safe landing path', async () => {
    window.history.replaceState(null, '', '/concept2cure/login?returnTo=https%3A%2F%2Fevil.test');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { success: true, provider: 'saml', organization: 'acme', configured: true }));
    await findSso();
    const link = await screen.findByRole('link', { name: 'Continue with SSO' });
    expect(new URL(link.getAttribute('href')!, window.location.origin).searchParams.get('returnTo')).toBe('/concept2cure');
    fireEvent.change(screen.getByLabelText('Organization identifier'), { target: { value: 'other' } });
    expect(screen.queryByRole('link', { name: 'Continue with SSO' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Google|Microsoft/i })).toBeNull();
  });
  it('a SAML MFA handoff clears its fragment, shows the existing factor UI and preserves continuation after verification', async () => {
    window.history.replaceState(null, '', `/concept2cure/login#mfa=${CHALLENGE}&method=totp&provider=saml&returnTo=%2Fconcept2cure%2Fvault%3Fprogram%3Dp-7`);
    render(<Concept2CureLogin />);
    expect(await screen.findByRole('heading', { name: "Verify it's you" })).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(auth.adoptMfaChallenge).toHaveBeenCalledWith(CHALLENGE);
    expect(auth.adoptSession).not.toHaveBeenCalled();
    fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(auth.verifyMfa).toHaveBeenCalledWith({ method: 'totp', code: '123456' }));
    await waitFor(() => expect(auth.setLocation).toHaveBeenCalledWith('/concept2cure/vault?program=p-7'));
  });
  it('an invalid MFA fragment does not authenticate or enter the factor UI', () => {
    window.history.replaceState(null, '', '/concept2cure/login#mfa=invalid&method=email&provider=saml');
    render(<Concept2CureLogin />);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(auth.adoptMfaChallenge).not.toHaveBeenCalled();
    expect(auth.adoptSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });
});
