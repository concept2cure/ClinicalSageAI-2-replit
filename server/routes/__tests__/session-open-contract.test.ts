/**
 * Every sign-in mints its session through openSession, which registers the
 * session against the account's concurrent-session limit (security audit
 * 2026-09-24, IAM-06; plan P1-1). A mint that calls newSessionClaims directly
 * would open a session the limit never sees, so the routes may not call it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (file: string) => readFileSync(join(here, '..', file), 'utf8');

describe('sign-in mints register their session', () => {
  it('no route mints session claims without registering them', () => {
    for (const file of ['auth.ts', 'authEnterprise.ts', 'sso.ts']) {
      expect(read(file), `${file} mints a session the concurrent-session limit never sees`).not.toMatch(/\bnewSessionClaims\(/);
    }
  });

  it('each sign-in door opens its session through openSession', () => {
    // auth.ts: the dev sign-in, the sign-in, the sign-up, the MFA completion.
    expect(read('auth.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    // authEnterprise.ts: the MFA completion.
    expect(read('authEnterprise.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    // sso.ts: the SAML callback and the development callback.
    expect(read('sso.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
