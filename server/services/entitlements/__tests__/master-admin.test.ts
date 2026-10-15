/**
 * Master-admin identity — the platform owner's unconditional licence grant.
 *
 * WHY THESE TESTS EXIST. `isMasterAdminIdentity` is the one predicate that can
 * turn every licensable module on for a request. Two properties of it are
 * security boundaries rather than conveniences, and neither is visible from a
 * passing integration test against a normal user:
 *
 *   1. The ROLE SET is deliberately narrower than `requirePlatformAdmin`'s.
 *      `platform_admin` and `support` are staff roles; if either drifted into
 *      MASTER_ADMIN_ROLES, every support engineer would silently hold a blanket
 *      commercial unlock on every tenant they opened, and the entitlement layer
 *      would report something untrue about that tenant's contract. The negative
 *      cases below are the assertion that the boundary is still where the
 *      module docs say it is.
 *   2. There is NO built-in owner. Until 2026-09-28 a source constant named
 *      one personal address and applied whenever MASTER_ADMIN_EMAILS was
 *      unset — every deployment Terraform provisions. The address was the
 *      grant, so whoever held a session carrying it held a cross-organization
 *      power (finding 43; security audit 2026-09-24, INF-27). Unset is now an
 *      empty allowlist, and a federated session's e-mail never matches it.
 *
 * That the grant also requires platform administration is pinned where the
 * resolver runs: master-admin-designation.test.ts and
 * module-subscriptions-platform-admin.test.ts.
 *
 * Everything here is pure: `isMasterAdminIdentity` / `masterAdminEmails` take
 * plain values, and `isMasterAdmin` is exercised with a plain object cast to
 * Request (it only reads fields an auth middleware has already resolved, so
 * there is nothing to fabricate). No database, no HTTP.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MASTER_ADMIN_ROLES,
  masterAdminEmails,
  isMasterAdminIdentity,
  isMasterAdmin,
} from '../master-admin';

/** An allowlisted address, configured per test — no address is the owner by default. */
const OWNER = 'owner@example.com';

/**
 * MASTER_ADMIN_EMAILS is read at call time, and the suite runs in a shared
 * process (vitest `singleFork`), so a test that leaves the variable set would
 * silently grant an owner signal in every file after it. Snapshot and restore
 * around every test — including the ones that never touch it.
 */
let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.MASTER_ADMIN_EMAILS;
  delete process.env.MASTER_ADMIN_EMAILS;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.MASTER_ADMIN_EMAILS;
  else process.env.MASTER_ADMIN_EMAILS = savedEnv;
});

describe('masterAdminEmails — the allowlist', () => {
  it('is empty when MASTER_ADMIN_EMAILS is unset — no address is the owner by default', () => {
    expect(masterAdminEmails().size).toBe(0);
  });

  it('is empty when the value is blank or whitespace-only', () => {
    for (const blank of ['', '   ', '\t', '\n  ', ',,,']) {
      process.env.MASTER_ADMIN_EMAILS = blank;
      expect(masterAdminEmails().size, JSON.stringify(blank)).toBe(0);
    }
  });

  it('names no address in the source: the owner is configuration, not code', () => {
    // The removed constant was a literal personal address. Any e-mail literal
    // back in this module is an owner chosen by whoever edits the source.
    const src = readFileSync(fileURLToPath(new URL('../master-admin.ts', import.meta.url)), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/['"`][^'"`\s]+@[^'"`\s]+\.[a-z]{2,}['"`]/i);
  });

  it('parses a comma-separated list, trimming and lower-casing each entry', () => {
    process.env.MASTER_ADMIN_EMAILS = ' Owner@Example.COM , second@example.com ';
    expect(masterAdminEmails()).toEqual(
      new Set(['owner@example.com', 'second@example.com']),
    );
  });

  it('drops empty entries produced by stray commas', () => {
    process.env.MASTER_ADMIN_EMAILS = 'a@example.com,,  ,b@example.com,';
    expect(masterAdminEmails()).toEqual(new Set(['a@example.com', 'b@example.com']));
  });
});

describe('isMasterAdminIdentity — email signal', () => {
  it('no address carries the signal when MASTER_ADMIN_EMAILS is unset', () => {
    expect(isMasterAdminIdentity({ email: OWNER })).toBe(false);
  });

  it('matches an allowlisted address case- and whitespace-insensitively', () => {
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    // Identity providers are not consistent about casing, and a stored address
    // may carry padding. Neither is a reason to lock the owner out.
    for (const variant of ['OWNER@EXAMPLE.COM', 'Owner@Example.com', '  owner@example.com  ', '\tOwner@EXAMPLE.com\n']) {
      expect(isMasterAdminIdentity({ email: variant }), variant).toBe(true);
    }
  });

  it('moving the allowlist moves the signal', () => {
    process.env.MASTER_ADMIN_EMAILS = 'newowner@example.com';
    expect(isMasterAdminIdentity({ email: OWNER })).toBe(false);
    expect(isMasterAdminIdentity({ email: 'NewOwner@Example.com ' })).toBe(true);
  });

  it('does not match an unrelated address', () => {
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    expect(isMasterAdminIdentity({ email: 'someone@example.com' })).toBe(false);
    // No substring or domain matching — the allowlist is exact addresses.
    expect(isMasterAdminIdentity({ email: 'evil+owner@example.com' })).toBe(false);
    expect(isMasterAdminIdentity({ email: 'owner@example.com.evil.test' })).toBe(false);
  });

  it("does not match a federated (SAML) session: its e-mail is the identity provider's word", () => {
    // A tenant's IdP can assert any address. The same rule requirePlatformAdmin
    // applies to PLATFORM_ADMIN_EMAILS (audit IAM-03).
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    expect(isMasterAdminIdentity({ email: OWNER, provider: 'saml' })).toBe(false);
    expect(isMasterAdminIdentity({ email: OWNER, provider: ' SAML ' })).toBe(false);
    // The owner's own password sign-in still matches.
    expect(isMasterAdminIdentity({ email: OWNER, provider: 'local-jwt' })).toBe(true);
    // No request role is a signal on any provider (D6, 2026-10-05, below).
    expect(isMasterAdminIdentity({ role: 'super_admin', provider: 'saml' })).toBe(false);
  });
});

describe('isMasterAdminIdentity — no request role is a signal', () => {
  /* D6, 2026-10-05 (docs/evidence/D6/2026-10-05-platform-standing/). These two
     cases read "grants super_admin via the primary `role` field / `roles[]`"
     and pinned the defect. The comment above them called the role "the
     platform's record", but on every authenticated route it is the TENANT
     membership role (server/auth.ts reads organization_users), a column with
     no CHECK. The owner signal is the allowlist (own sign-in) or a super_admin
     platform_role_grants row (resolveAdminStanding), never a membership. */
  it('a role of super_admin is not the owner signal, however it is spelled', () => {
    expect(isMasterAdminIdentity({ role: 'super_admin' })).toBe(false);
    expect(isMasterAdminIdentity({ role: '  Super_Admin  ' })).toBe(false);
  });

  it('a roles[] entry of super_admin is not the owner signal', () => {
    expect(isMasterAdminIdentity({ roles: ['member', 'super_admin'] })).toBe(false);
    expect(isMasterAdminIdentity({ roles: ['SUPER_ADMIN'] })).toBe(false);
    expect(isMasterAdminIdentity({ roles: [null, undefined, 'super_admin'] })).toBe(false);
  });

  it('MASTER_ADMIN_ROLES contains super_admin and nothing else', () => {
    // Pinned deliberately: this set is the security boundary, so widening it
    // must be a conscious edit that breaks a test, not a quiet one-word diff.
    expect([...MASTER_ADMIN_ROLES]).toEqual(['super_admin']);
  });

  it('does NOT grant staff or tenant roles — the boundary vs requirePlatformAdmin', () => {
    // platform_admin and support ARE admitted by requirePlatformAdmin for route
    // access. They are NOT owners: a blanket commercial unlock would make the
    // entitlement layer misreport the tenant they are looking at.
    const notOwners = [
      'platform_admin',
      'support',
      'admin',
      'owner',
      'business_admin',
      'member',
    ];
    for (const role of notOwners) {
      expect(isMasterAdminIdentity({ role }), `role=${role}`).toBe(false);
      expect(isMasterAdminIdentity({ roles: [role] }), `roles=[${role}]`).toBe(false);
      // …and not via a combination either.
      expect(
        isMasterAdminIdentity({ role, roles: [role, 'member'] }),
        `role+roles=${role}`,
      ).toBe(false);
    }
  });

  it('does not grant a role that merely contains super_admin as a substring', () => {
    expect(isMasterAdminIdentity({ role: 'not_super_admin' })).toBe(false);
    expect(isMasterAdminIdentity({ roles: ['super_admin_readonly'] })).toBe(false);
  });
});

describe('isMasterAdminIdentity — absent identity', () => {
  it('an empty identity is never the owner', () => {
    expect(isMasterAdminIdentity({})).toBe(false);
  });

  it('null/undefined/empty fields are never the owner', () => {
    expect(isMasterAdminIdentity({ email: null, role: null, roles: null })).toBe(false);
    expect(isMasterAdminIdentity({ email: undefined, role: undefined })).toBe(false);
    expect(isMasterAdminIdentity({ email: '', role: '', roles: [] })).toBe(false);
    // Whitespace-only values normalize to empty, not to a match.
    expect(isMasterAdminIdentity({ email: '   ', role: '  ', roles: ['  '] })).toBe(false);
  });
});

describe('isMasterAdmin(req) — the request adapter', () => {
  /** Only the fields the adapter reads; auth resolved them upstream. */
  function reqOf(fields: {
    userEmail?: string | null;
    userRole?: string | null;
    identity?: { provider?: string };
    user?: { email?: string | null; role?: string | null; roles?: string[] | null; provider?: string };
  }): Request {
    return fields as unknown as Request;
  }

  it('reads the top-level userEmail set by auth middleware', () => {
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    expect(isMasterAdmin(reqOf({ userEmail: OWNER }))).toBe(true);
  });

  it('falls back to req.user.email when userEmail is absent', () => {
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    expect(isMasterAdmin(reqOf({ user: { email: OWNER } }))).toBe(true);
  });

  it('reads the session provider the authenticator recorded, and refuses a federated e-mail', () => {
    process.env.MASTER_ADMIN_EMAILS = OWNER;
    expect(isMasterAdmin(reqOf({ userEmail: OWNER, identity: { provider: 'saml' } }))).toBe(false);
    expect(isMasterAdmin(reqOf({ userEmail: OWNER, user: { email: OWNER, provider: 'saml' } }))).toBe(false);
    expect(isMasterAdmin(reqOf({ userEmail: OWNER, identity: { provider: 'local-jwt' } }))).toBe(true);
  });

  it('does not read userRole or req.user.role / req.user.roles (the tenant membership role)', () => {
    // Inverted 2026-10-05: it read "reads userRole and req.user.role / roles"
    // and pinned the defect (see "no request role is a signal" above).
    expect(isMasterAdmin(reqOf({ userRole: 'super_admin' }))).toBe(false);
    expect(isMasterAdmin(reqOf({ user: { role: 'super_admin' } }))).toBe(false);
    expect(isMasterAdmin(reqOf({ user: { roles: ['super_admin'] } }))).toBe(false);
  });

  it('an unauthenticated request is never the owner', () => {
    // No token parsing happens here, so a request auth never touched has no
    // fields to read and must fall through to false.
    expect(isMasterAdmin(reqOf({}))).toBe(false);
    expect(isMasterAdmin(reqOf({ userEmail: null, userRole: null }))).toBe(false);
    expect(isMasterAdmin(reqOf({ user: { email: null, role: null, roles: null } }))).toBe(false);
  });

  it('a normal tenant admin request is not the owner', () => {
    expect(
      isMasterAdmin(
        reqOf({ userEmail: 'admin@customer.test', userRole: 'admin', user: { roles: ['admin'] } }),
      ),
    ).toBe(false);
  });

  it('honors a relocated allowlist through the request path too', () => {
    process.env.MASTER_ADMIN_EMAILS = 'ops@example.com';
    expect(isMasterAdmin(reqOf({ userEmail: OWNER }))).toBe(false);
    expect(isMasterAdmin(reqOf({ userEmail: 'Ops@Example.com' }))).toBe(true);
  });
});
