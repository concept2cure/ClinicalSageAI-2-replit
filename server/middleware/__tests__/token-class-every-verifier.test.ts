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
  'services/ana-ri/proposal-seal.ts': 'openProposalSeal admits only type ana_proposal_seal, for the organization, person, command and params it was minted over; it restores a proposer, never an identity',
  'services/email-verification.ts': 'admits only type email_verification, the one class it exists to read',
  'middleware/sign-in-limits.ts': 'partialTokenUserId admits only a token with mfaPending: true (the enterprise partial), and only to key the per-account second-factor limiter; it authorises nothing',
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

/** A call of verifyJwtWithRotation, generics and all (`<Record<string, unknown>>(`, a type over several lines). */
const CALL = /verifyJwtWithRotation\s*(?:<|\()/;
/** The token-class rule, applied at the call site: within this many lines after the call. */
const RULE_WINDOW_LINES = 30;
/** A reasoned exception at one call site: `// token-class: <reason>` within this many lines above it. */
const MARKER = /\/\/\s*token-class:\s*\S.{8,}/;
const MARKER_WINDOW_LINES = 3;

/** Every call site in a file, as 1-based line numbers; comments and imports are not calls. */
function callSites(text: string): number[] {
  const lines = text.split('\n');
  const sites: number[] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*') || t.startsWith('import')) return;
    if (CALL.test(line)) sites.push(i + 1);
  });
  return sites;
}

/** A call site with neither the rule after it nor a reasoned marker above it. */
function unclassedSites(rel: string, text: string): string[] {
  const lines = text.split('\n');
  return callSites(text)
    .filter((n) => {
      const after = lines.slice(n - 1, n - 1 + RULE_WINDOW_LINES).join('\n');
      if (/requireAccessTokenReason|nonAccessTokenReason/.test(after)) return false;
      const above = lines.slice(Math.max(0, n - 1 - MARKER_WINDOW_LINES), n - 1).join('\n');
      return !MARKER.test(above);
    })
    .map((n) => `${rel}:${n}`);
}

describe('every JWT verifier applies the token-class rule (IAM-23)', () => {
  it('no file calls verifyJwtWithRotation without requireAccessTokenReason / nonAccessTokenReason', () => {
    const unchecked = sources(ROOT)
      .filter((file) => !file.endsWith(path.join('utils', 'jwtVerify.ts')))
      .filter((file) => CALL.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
      .filter((rel) => !OWN_CLASS[rel])
      .filter((rel) => !/requireAccessTokenReason|nonAccessTokenReason|\/\/\s*token-class:/.test(readFileSync(path.join(ROOT, rel), 'utf8')));
    expect(unchecked).toEqual([]);
  });

  /* Per call site (DT3 review, IAM-34). The file-level check above passed for
     server/routes/auth.ts because the file names requireAccessTokenReason
     elsewhere, while its public /logout read a token with ignoreExpiration and
     no class test, and stopped a person's AnA runs on that reading. Each call
     now applies the rule within RULE_WINDOW_LINES after it, or carries a
     `// token-class: <reason>` marker saying why it reads a class of its own
     or changes nothing on the token's say-so. */
  it('every call site applies the rule, or says at the site why it need not', () => {
    const unclassed = sources(ROOT)
      .filter((file) => !file.endsWith(path.join('utils', 'jwtVerify.ts')))
      .map((file) => ({ rel: path.relative(ROOT, file).split(path.sep).join('/'), text: readFileSync(file, 'utf8') }))
      .filter(({ rel, text }) => !OWN_CLASS[rel] && CALL.test(text))
      .flatMap(({ rel, text }) => unclassedSites(rel, text));
    expect(unclassed).toEqual([]);
  });

  it('the per-site check sees a call with nested generics and no rule after it', () => {
    const text = [
      'function attributed(token: string) {',
      '  const claims = verifyJwtWithRotation<Record<string, unknown>>(token, { ignoreExpiration: true });',
      '  return claims.userId;',
      '}',
    ].join('\n');
    expect(unclassedSites('x.ts', text)).toEqual(['x.ts:2']);
    const marked = text.replace('  const claims', '  // token-class: attribution only, changes nothing\n  const claims');
    expect(unclassedSites('x.ts', marked)).toEqual([]);
  });
});
