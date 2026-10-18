// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const CHALLENGE = 'eyJhbGciOiJIUzI1NiJ9.eyJ0eXBlIjoibWZhX2NoYWxsZW5nZSJ9.signature';
const json = (status: number, body: unknown): Response => ({
  ok: status < 400, status, statusText: String(status), headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => body, text: async () => JSON.stringify(body), clone: () => json(status, body),
}) as Response;
beforeEach(() => { vi.resetModules(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });
describe('SAML challenge adoption uses only the canonical factor verifier', () => {
  it('stores only a tab-scoped challenge and remains anonymous when the server refuses the code', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(json(401, { success: false, error: { code: 'AUTH_004', message: 'Incorrect code' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const { authService } = await import('../authService');
    expect(authService.adoptMfaChallenge(CHALLENGE)).toBe(true);
    expect(sessionStorage.getItem('trialsage_mfa_challenge')).toBe(CHALLENGE);
    expect(localStorage.getItem('trialsage_mfa_challenge')).toBeNull();
    expect(authService.isAuthenticated()).toBe(false);
    const result = await authService.verifyMfa({ method: 'totp', code: '123456' });
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Incorrect code');
    expect(authService.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('trialsage_access_token')).toBeNull();
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    const [path, init] = fetchSpy.mock.calls[0];
    expect(path).toBe('/api/v1/auth/mfa/verify');
    expect(JSON.parse(init.body)).toEqual({ method: 'totp', code: '123456', challengeId: CHALLENGE });
    expect(new Headers(init.headers).get('Authorization')).toBeNull();
    expect(sessionStorage.getItem('trialsage_mfa_challenge')).toBe(CHALLENGE);
  });
  it('authenticates only from a successful canonical verification response, then erases the challenge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, {
      success: true, accessToken: 'verified-access', refreshToken: 'verified-refresh', expiresIn: 86400,
      user: { id: '7', email: 'alice@acme.test', organizationId: '42', roles: ['manager'] },
    })));
    const { authService } = await import('../authService');
    expect(authService.adoptMfaChallenge('malformed')).toBe(false);
    expect(authService.adoptMfaChallenge(CHALLENGE)).toBe(true);
    const result = await authService.verifyMfa({ method: 'totp', code: '123456' });
    expect(result.success).toBe(true);
    expect(authService.getUser()?.organizationId).toBe('42');
    expect(authService.isAuthenticated()).toBe(true);
    expect(sessionStorage.getItem('trialsage_mfa_challenge')).toBeNull();
    expect(localStorage.getItem('trialsage_mfa_challenge')).toBeNull();
    expect(localStorage.getItem('trialsage_access_token')).toBe('verified-access');
  });
});
