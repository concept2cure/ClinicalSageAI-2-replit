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
 *   2. MASTER_ADMIN_EMAILS REPLACES the built-in default rather than appending
 *      to it. An operator who moves the grant expects the old address to stop
 *      working — an "append" implementation would leave the previous owner
 *      entitled forever, which is the kind of defect that never shows up until
 *      it matters.
 *
 * Everything here is pure: `isMasterAdminIdentity` / `masterAdminEmails` take
 * plain values, and `isMasterAdmin` is exercised with a plain object cast to
 * Request (it only reads fields an auth middleware has already resolved, so
 * there is nothing to fabricate). No database, no HTTP.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import {
  MASTER_ADMIN_ROLES,
  DEFAULT_MASTER_ADMIN_EMAILS,
  masterAdminEmails,
  isMasterAdminIdentity,
  isMasterAdmin,
} from '../master-admin';

/** The built-in owner address — the grant a fresh deployment ships with. */
const DEFAULT_OWNER = 'jonmichaelpsmith@gmail.com';

/**
 * MASTER_ADMIN_EMAILS is read at call time, and the suite runs in a shared
 * process (vitest `singleFork`), so a test that leaves the variable set would
 * silently move the owner grant for every file after it. Snapshot and restore
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
  it('falls back to the built-in owner address when MASTER_ADMIN_EMAILS is unset', () => {
    // A fresh deployment must have exactly one owner without configuration:
    // an empty allowlist would leave the platform with nobody able to
    // demonstrate a module they have not sold themselves.
    expect(masterAdminEmails()).toEqual(new Set(DEFAULT_MASTER_ADMIN_EMAILS));
    expect(masterAdminEmails().has(DEFAULT_OWNER)).toBe(true);
  });

  it('treats a blank or whitespace-only value as unset (the default applies)', () => {
    // A variable that exists in the environment but was never filled in is an
    // unfinished config, not a decision to remove the owner.
    for (const blank of ['', '   ', '\t', '\n  ']) {
      process.env.MASTER_ADMIN_EMAILS = blank;
      expect(masterAdminEmails().has(DEFAULT_OWNER)).toBe(true);
    }
  });

  it('REPLACES the default rather than appending to it', () => {
    process.env.MASTER_ADMIN_EMAILS = 'ops@example.com';
    const emails = masterAdminEmails();
    expect(emails.has('ops@example.com')).toBe(true);
    // The load-bearing half: moving the grant must actually move it.
    expect(emails.has(DEFAULT_OWNER)).toBe(false);
    expect(emails.size).toBe(1);
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

  it('a value with no usable entries removes the grant entirely', () => {
    // ',,,' is not blank, so it is an explicit (if clumsy) instruction: no
    // owner. That differs from '' on purpose — see the blank test above.
    process.env.MASTER_ADMIN_EMAILS = ',,,';
    expect(masterAdminEmails().size).toBe(0);
    expect(isMasterAdminIdentity({ email: DEFAULT_OWNER })).toBe(false);
  });
});

describe('isMasterAdminIdentity — email signal', () => {
  it('grants the built-in owner when MASTER_ADMIN_EMAILS is unset', () => {
    expect(isMasterAdminIdentity({ email: DEFAULT_OWNER })).toBe(true);
  });

  it('matches the owner address case- and whitespace-insensitively', () => {
    // Identity providers are not consistent about casing, and a stored address
    // may carry padding. Neither is a reason to lock the owner out.
    for (const variant of [
      'JONMICHAELPSMITH@GMAIL.COM',
      'JonMichaelPSmith@Gmail.com',
      '  jonmichaelpsmith@gmail.com  ',
      '\tJonMichaelPSmith@GMAIL.com\n',
    ]) {
      expect(isMasterAdminIdentity({ email: variant }), variant).toBe(true);
    }
  });

  it('stops granting the default address once MASTER_ADMIN_EMAILS names someone else', () => {
    process.env.MASTER_ADMIN_EMAILS = 'newowner@example.com';
    expect(isMasterAdminIdentity({ email: DEFAULT_OWNER })).toBe(false);
    expect(isMasterAdminIdentity({ email: 'newowner@example.com' })).toBe(true);
    expect(isMasterAdminIdentity({ email: 'NewOwner@Example.com ' })).toBe(true);
  });

  it('does not grant an unrelated address', () => {
    expect(isMasterAdminIdentity({ email: 'someone@example.com' })).toBe(false);
    // No substring or domain matching — the allowlist is exact addresses.
    expect(isMasterAdminIdentity({ email: 'evil+jonmichaelpsmith@gmail.com' })).toBe(false);
    expect(isMasterAdminIdentity({ email: 'jonmichaelpsmith@gmail.com.evil.test' })).toBe(false);
  });
});

describe('isMasterAdminIdentity — role signal', () => {
  it('grants super_admin via the primary `role` field', () => {
    expect(isMasterAdminIdentity({ role: 'super_admin' })).toBe(true);
    expect(isMasterAdminIdentity({ role: '  Super_Admin  ' })).toBe(true);
  });

  it('grants super_admin via the `roles[]` array', () => {
    expect(isMasterAdminIdentity({ roles: ['member', 'super_admin'] })).toBe(true);
    expect(isMasterAdminIdentity({ roles: ['SUPER_ADMIN'] })).toBe(true);
    // Nulls in the array are tolerated, not treated as a match.
    expect(isMasterAdminIdentity({ roles: [null, undefined, 'super_admin'] })).toBe(true);
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
    user?: { email?: string | null; role?: string | null; roles?: string[] | null };
  }): Request {
    return fields as unknown as Request;
  }

  it('reads the top-level userEmail set by auth middleware', () => {
    expect(isMasterAdmin(reqOf({ userEmail: DEFAULT_OWNER }))).toBe(true);
  });

  it('falls back to req.user.email when userEmail is absent', () => {
    expect(isMasterAdmin(reqOf({ user: { email: DEFAULT_OWNER } }))).toBe(true);
  });

  it('reads userRole and req.user.role / req.user.roles', () => {
    expect(isMasterAdmin(reqOf({ userRole: 'super_admin' }))).toBe(true);
    expect(isMasterAdmin(reqOf({ user: { role: 'super_admin' } }))).toBe(true);
    expect(isMasterAdmin(reqOf({ user: { roles: ['super_admin'] } }))).toBe(true);
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
    expect(isMasterAdmin(reqOf({ userEmail: DEFAULT_OWNER }))).toBe(false);
    expect(isMasterAdmin(reqOf({ userEmail: 'Ops@Example.com' }))).toBe(true);
  });
});
