/**
 * One signing-authority policy (P-27 follow-up, 2026-10-08).
 *
 * §11.10(g) — may this person sign? — has one answer on the platform:
 * checkSigningAuthority (part11/signing-authority-gate.ts), which reads the role
 * from the membership row and holds it to isSigningAuthorized, and answers a
 * lookup that cannot run with 503 SIGNING_AUTHORITY_UNVERIFIED.
 *
 * The third Submission Center pass found the question still written out in
 * route after route: the role read and the predicate inline, or wrapped in a
 * file-local helper (c2c/actions signingAuthorityRefusal, api/cmc/cmc-signer
 * refusedWithoutSigningAuthority, authoring.router assertSigningAuthority, the
 * ceremony's own assertSigningAuthority). The copies drifted the way copies do:
 * a failed lookup was a 500 in one, an unhandled throw in another; two read the
 * role from the request (resolveUserRole) instead of the membership row; three
 * asked only after the password, so a role that may not sign could still test
 * a password.
 *
 * This pins the population. The predicate may be called directly only where
 * the answer is displayed, not enforced (what a session is offered, a member
 * list's canSign flag) or where it judges another person (a reviewer being
 * assigned) — each listed with its count and reason. A new call anywhere else,
 * or a wrapper by one of the retired names, fails here.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

/** Where isSigningAuthorized may be called directly, how often, and why. */
const PREDICATE_CALLERS: Record<string, { count: number; reason: string }> = {
  'server/services/part11/signing-authority-gate.ts': {
    count: 1,
    reason: 'The gate itself: the one place a signature is admitted or refused.',
  },
  'server/middleware/orgMembership.ts': {
    count: 1,
    reason: 'sessionPermissions: which controls a session is offered. Displayed, not enforced.',
  },
  'server/services/tenant/role-scopes.ts': {
    count: 1,
    reason: 'roleScopesOf: describes what a role may do (records:sign). Displayed, not enforced.',
  },
  'server/routes/tenant-users.ts': {
    count: 1,
    reason: 'The member picker marks who can sign (canSign). Displayed, not enforced.',
  },
  'server/routes/c2c/artifacts.ts': {
    count: 1,
    reason: 'GET /user/permissions canSign: what the client offers. Approve and lock refuse through checkSigningAuthority.',
  },
  'server/routes/authoring.router.ts': {
    count: 1,
    reason: "The document's act gates (what the editor offers, with the role named). The signing routes refuse through checkSigningAuthority.",
  },
  'server/services/protocol-reviews/protocol-reviews-service.ts': {
    count: 1,
    reason: "Judges the reviewer being ASSIGNED, not the caller's signature, and names their role and a missing membership apart.",
  },
  'server/services/vault/vault-signing-posture.ts': {
    count: 1,
    reason: "Lists the members who can sign a Vault version (a picker). Displayed, not enforced; the caller's own posture is checkSigningAuthority.",
  },
};

const RETIRED_WRAPPERS = ['signingAuthorityRefusal', 'refusedWithoutSigningAuthority', 'assertSigningAuthority'];

function serverSources(): Array<{ file: string; code: string }> {
  const out = execSync("git ls-files --cached --others --exclude-standard 'server/**/*.ts' 'server/*.ts'", {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/(^|\/)__tests__\//.test(f) && !/\.(test|spec|dbtest)\.ts$/.test(f) && !f.endsWith('.d.ts'))
    .map((file) => {
      const src = existsSync(path.join(ROOT, file)) ? readFileSync(path.join(ROOT, file), 'utf8') : '';
      // Comments name the history; only code counts.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      return { file, code };
    });
}

describe('one signing-authority policy (P-27)', () => {
  const sources = serverSources();

  it('reads the server tree', () => {
    expect(sources.length).toBeGreaterThan(500);
  });

  it('defines no local signing-authority wrapper by a retired name', () => {
    const defined = sources.flatMap(({ file, code }) =>
      RETIRED_WRAPPERS.filter((name) => new RegExp(`\\bfunction\\s+${name}\\s*\\(|\\b(?:const|let)\\s+${name}\\s*=`).test(code)).map(
        (name) => `${file}: ${name}`,
      ),
    );
    expect(defined, 'a local copy of the signing-authority policy').toEqual([]);
  });

  it('calls the policy predicate directly only where the answer is displayed or judges another person', () => {
    const found: Record<string, number> = {};
    for (const { file, code } of sources) {
      if (file === 'server/services/part11/signing-authority.ts') continue; // its definition
      const n = (code.match(/\bisSigningAuthorized\s*\(/g) ?? []).length;
      if (n > 0) found[file] = n;
    }
    // A ceiling per listed file: a new caller, or one more call in a listed
    // file, fails. (A listed file may hold fewer, so a file another change has
    // not landed yet does not fail this.)
    const over = Object.entries(found)
      .filter(([file, n]) => n > (PREDICATE_CALLERS[file]?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} call(s), ${PREDICATE_CALLERS[file]?.count ?? 0} allowed`);
    expect(over, 'isSigningAuthorized outside checkSigningAuthority: route the check through the gate').toEqual([]);
    for (const [file, { reason }] of Object.entries(PREDICATE_CALLERS)) expect(reason.length, file).toBeGreaterThan(20);
  });
});
