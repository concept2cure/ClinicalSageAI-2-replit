/**
 * The one token both "forgot password" and "invite a member" mint. Its
 * contract: 256 bits of entropy, only the SHA-256 stored, an expiry that is
 * the caller's TTL and nothing else, and a link the login page can redeem.
 */
import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import {
  INVITATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  hashPasswordSetupToken,
  mintPasswordSetupToken,
  passwordSetupUrl,
  resolveAppBaseUrl,
  unusableInvitePasswordHash,
} from '../../server/services/password-setup-token';

const savedAppUrl = process.env.APP_URL;
afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = savedAppUrl;
});

describe('mintPasswordSetupToken', () => {
  it('mints a 32-byte hex token, stores only its SHA-256, and expires exactly TTL later', () => {
    const now = 1_800_000_000_000;
    const t = mintPasswordSetupToken(PASSWORD_RESET_TTL_MS, now);
    expect(t.token).toMatch(/^[0-9a-f]{64}$/);
    expect(t.tokenHash).toBe(crypto.createHash('sha256').update(t.token).digest('hex'));
    expect(t.tokenHash).toBe(hashPasswordSetupToken(t.token));
    expect(t.tokenHash).not.toBe(t.token);
    expect(t.expiresAt.getTime()).toBe(now + 15 * 60 * 1000);
  });

  it('two mints never share a token', () => {
    const a = mintPasswordSetupToken(INVITATION_TTL_MS);
    const b = mintPasswordSetupToken(INVITATION_TTL_MS);
    expect(a.token).not.toBe(b.token);
  });

  it('the invitation TTL is 21 days; the reset TTL is 15 minutes', () => {
    expect(INVITATION_TTL_MS).toBe(21 * 24 * 60 * 60 * 1000);
    expect(PASSWORD_RESET_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('refuses a TTL that is not a positive number', () => {
    expect(() => mintPasswordSetupToken(0)).toThrow(/positive/);
    expect(() => mintPasswordSetupToken(Number.NaN)).toThrow(/positive/);
    expect(() => mintPasswordSetupToken(-1)).toThrow(/positive/);
  });
});

describe('passwordSetupUrl / resolveAppBaseUrl', () => {
  it('links to the login page’s reset view with the token as the query', () => {
    expect(passwordSetupUrl('https://app.example.com', 'abc123')).toBe(
      'https://app.example.com/concept2cure/password-reset?token=abc123',
    );
    // A trailing slash on the base does not double up.
    expect(passwordSetupUrl('https://app.example.com/', 'abc123')).toBe(
      'https://app.example.com/concept2cure/password-reset?token=abc123',
    );
  });

  it('APP_URL wins; otherwise the request origin', () => {
    const req = { protocol: 'https', get: (h: string) => (h === 'host' ? 'req.example.com' : undefined) };
    process.env.APP_URL = 'https://configured.example.com';
    expect(resolveAppBaseUrl(req)).toBe('https://configured.example.com');
    delete process.env.APP_URL;
    expect(resolveAppBaseUrl(req)).toBe('https://req.example.com');
  });
});

describe('unusableInvitePasswordHash', () => {
  it('is never a bcrypt hash, so bcrypt.compare cannot match it', async () => {
    const h = unusableInvitePasswordHash();
    expect(h).toMatch(/^invite:[0-9a-f-]{36}$/);
    const bcrypt = (await import('bcryptjs')).default;
    expect(await bcrypt.compare('anything', h)).toBe(false);
    expect(await bcrypt.compare(h, h)).toBe(false);
  });
});
