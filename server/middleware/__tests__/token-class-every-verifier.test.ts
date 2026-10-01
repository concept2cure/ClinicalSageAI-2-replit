/**
 * IAM-23 (2026-10-01): every server file that verifies a platform JWT applies
 * the token-class rule (middleware/tokenType.ts). A refresh token, a pre-MFA
 * challenge token or a connector token carries the same signature as an access
 * token; a verifier that checks only the signature admits all three. Four
 * in-route verifiers did (tenantContext, approval-workflow, contentAssembly SSE,
 * cortex-unified threads). A file listed below checks a class of its own
 * instead, for the reason given.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const OWN_CLASS: Record<string, string> = {
  'services/mfaService.ts': 'verifyMfaChallengeToken admits only type mfa_challenge, the one class it exists to read',
  'services/email-verification.ts': 'admits only type email_verification, the one class it exists to read',
  'services/token-revocation.ts': 'verifyLiveToken is the shared signature, revocation and standing primitive; each caller applies the class it expects (an access route the access rule, the refresh route the refresh class)',
};

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.ts$/.test(name) && !/\.(test|spec|d)\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('every JWT verifier applies the token-class rule (IAM-23)', () => {
  it('no file calls verifyJwtWithRotation without requireAccessTokenReason / nonAccessTokenReason', () => {
    const unchecked = sources(ROOT)
      .filter((file) => !file.endsWith(path.join('utils', 'jwtVerify.ts')))
      .filter((file) => /verifyJwtWithRotation\s*(<[^>]*>)?\(/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
      .filter((rel) => !OWN_CLASS[rel])
      .filter((rel) => !/requireAccessTokenReason|nonAccessTokenReason/.test(readFileSync(path.join(ROOT, rel), 'utf8')));
    expect(unchecked).toEqual([]);
  });
});
