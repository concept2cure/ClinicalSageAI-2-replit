/**
 * requireRole / requireOrgAccess — an org admin is a customer, not staff.
 *
 * ── What this is defending ──────────────────────────────────────────────────
 * Self-service signup mints the ORG-scoped role `admin` for the first user of
 * every new organization (server/routes/auth.ts). The org vocabulary is
 * admin / manager / member / viewer. `super_admin` / `platform_admin` are a
 * different trust boundary — they see across every tenant.
 *
 * `requireRole` used to end with `if (!hasRole && !userRoles.includes('admin'))`,
 * which made every guard also accept that free org `admin`. Four tenant-
 * management routes were guarded as `requireRole('super_admin','platform_admin')`,
 * so an external audit reproduced this against the running system:
 *
 *     POST /api/auth/signup  → JWT role:"admin", org 30
 *     DELETE /api/tenants/28 → 200 {"…\"VICTIM PHARMA\" … permanently deleted"}
 *
 * Those routes now use `requirePlatformAdmin`, which closed that exploit. What
 * remained was the rule itself living in a comment — "any new platform-operator
 * guard MUST use requirePlatformAdmin, never requireRole('super_admin', …)".
 * These tests pin the mechanical version: a platform-scoped requirement gets no
 * org-admin stand-in, no matter who writes the call site.
 *
 * ── The stand-in is load-bearing, and that is tested too ────────────────────
 * `regulatory-author` is asked for by 284 of ~297 requireRole call sites and is
 * granted to NOBODY — it appears only in guards and in API docs that say those
 * routes "require a regulatory-author (or admin) role". Deleting the stand-in
 * outright, as the shortest reading of the audit suggests, would 403 the entire
 * authoring surface for every customer. So there is a test below asserting an
 * org admin still reaches an author-guarded route; a fix that breaks it is not
 * a fix.
 *
 * ── No test doubles in this file ────────────────────────────────────────────
 * No vi.mock, no stubbed fetch, no hand-rolled req/res object. Each test builds
 * a real Express app, mounts the real middleware, and drives it over a real
 * HTTP request with supertest. The only thing supplied is `req.user`, which is
 * the authenticated identity `authMiddleware` would have resolved — that is the
 * input to the unit under test, not a stand-in for it.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

// Imported from the BARE specifier on purpose — the same way the 95 call sites
// import it. This used to reach a DIFFERENT implementation than production:
// server/middleware/auth.js was a hand-written twin of auth.ts, and which one
// wins is resolver-dependent (measured): esbuild (production build) and tsx
// (dev) both pick auth.TS, Vite/vitest picks auth.JS. So every test in this
// file exercised code that never shipped. auth.js is now a re-export shim, so
// the bare specifier and the explicit .ts are the same module — asserted below
// rather than assumed.
import { requireRole, requireSameOrganization, PLATFORM_SCOPED_ROLES } from '../auth';

// Addressing auth.ts by its explicit extension, kept so the identity assertion
// below can compare the two specifiers and prove no twin has reappeared. A
// STATIC `from '../auth.ts'` is TS5097 ("an import path can only end with '.ts'
// when allowImportingTsExtensions is enabled"), so the specifier is held in a
// variable: tsc cannot apply TS5097 to a non-literal, and Vite still resolves
// it at runtime.
const TS_TWIN_SPECIFIER = '../auth.ts';
type TsTwin = {
  requireOrgAccess: express.RequestHandler;
  PLATFORM_SCOPED_ROLES: Set<string>;
};
const loadTsTwin = async (): Promise<TsTwin> =>
  (await import(/* @vite-ignore */ TS_TWIN_SPECIFIER)) as unknown as TsTwin;

type Identity = { role?: string; roles?: string[]; organizationId?: string };

/** A real app whose only injected value is the resolved identity. */
function appWith(identity: Identity, guard: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: Identity }).user = identity;
    next();
  });
  // Two registrations rather than ':organizationId?' — Express 5's path-to-regexp
  // rejects the optional-parameter suffix.
  const reached: express.RequestHandler = (_req, res) => res.status(200).json({ reached: true });
  app.get('/probe', guard, reached);
  app.get('/probe/:organizationId', guard, reached);
  return app;
}

/** The identity self-service signup hands the first user of a new org. */
const ORG_ADMIN: Identity = { role: 'admin', roles: ['admin'], organizationId: '30' };
const PLATFORM: Identity = { role: 'platform_admin', roles: ['platform_admin'] };
const MEMBER: Identity = { role: 'member', roles: ['member'], organizationId: '30' };

describe('requireRole — an org admin cannot stand in for platform staff', () => {
  it('refuses an org admin on a platform-scoped guard', async () => {
    // The exact guard the vulnerable tenant-management routes carried.
    const res = await request(appWith(ORG_ADMIN, requireRole('super_admin', 'platform_admin')))
      .get('/probe');
    expect(res.status).toBe(403);
    // One module, one error contract. This used to read `res.body.status ===
    // 'error'` because the bare specifier resolved to a .js twin with its own
    // envelope; auth.js is now a re-export shim, so the canonical
    // {error:{code}} envelope is the only one there is.
    expect(res.body?.error?.code).toBe('AUTH_004');
  });

  it('refuses an org admin for every platform role spelling', async () => {
    // Over-listing spellings in PLATFORM_SCOPED_ROLES can only make the guard
    // stricter; this pins that each one actually denies.
    for (const role of PLATFORM_SCOPED_ROLES) {
      const res = await request(appWith(ORG_ADMIN, requireRole(role))).get('/probe');
      expect(res.status, `role ${role} must not admit an org admin`).toBe(403);
    }
  });

  it('still admits genuine platform staff', async () => {
    const res = await request(appWith(PLATFORM, requireRole('super_admin', 'platform_admin')))
      .get('/probe');
    expect(res.status).toBe(200);
  });

  it('honours an explicit grant of admin alongside platform roles', async () => {
    // /api/admin/audit/siem is tenant-scoped (org id from the JWT, never from
    // input) and deliberately lists 'admin'. An explicit grant must still win,
    // otherwise this change would silently revoke a legitimate one.
    const guard = requireRole('super_admin', 'platform_admin', 'admin', 'compliance_officer');
    const res = await request(appWith(ORG_ADMIN, guard)).get('/probe');
    expect(res.status).toBe(200);
  });
});

describe('requireRole — the org-scoped stand-in survives, because it must', () => {
  it('still lets an org admin reach an author-guarded route', async () => {
    // 284 call sites ask for this role and nothing ever grants it. If this
    // 403s, the authoring surface is dead for every customer.
    const res = await request(appWith(ORG_ADMIN, requireRole('regulatory-author'))).get('/probe');
    expect(res.status).toBe(200);
  });

  it('does not extend the stand-in to non-admin org roles', async () => {
    const res = await request(appWith(MEMBER, requireRole('regulatory-author'))).get('/probe');
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated caller before any role logic', async () => {
    const app = express();
    app.get('/probe', requireRole('regulatory-author'), (_req, res) => res.status(200).json({}));
    const res = await request(app).get('/probe');
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('AUTH_003');
  });
});

describe('there is no second implementation to drift from', () => {
  it('resolves the bare specifier and the explicit .ts to the SAME module', async () => {
    // This file used to assert that two separate implementations agreed,
    // because two existed: vite resolved `../auth` to a hand-written auth.js
    // twin while esbuild and tsx resolved it to auth.ts, so tests and
    // production ran different code. auth.js is now nothing but
    // `export * from './auth.ts'`.
    //
    // Identity is the stronger property, so it replaces the agreement check: if
    // anyone reintroduces a real implementation in auth.js, these stop being the
    // same function object and this fails immediately — whereas a field-by-field
    // comparison only catches the drift someone thought to compare.
    const tsTwin = await loadTsTwin();
    expect(tsTwin.requireOrgAccess).toBe(requireSameOrganization);
    expect(tsTwin.PLATFORM_SCOPED_ROLES).toBe(PLATFORM_SCOPED_ROLES);
  });

  it('makes requireRole variadic, so a second role is never silently dropped', () => {
    // The removed .js twin took (requiredRole) — so
    // requireRole('super_admin', 'platform_admin') discarded the second and
    // denied real platform admins.
    expect(requireRole.length).toBe(0); // rest params report length 0
  });
});

describe('requireSameOrganization — the alias is the same hardened guard', () => {
  // requireSameOrganization is `export const requireSameOrganization =
  // requireOrgAccess`, so it must deny exactly what requireOrgAccess denies.
  //
  // The removed .js twin compared req.user.organizationId against
  // req.organizationId, which its own authenticateJWT had set FROM THE JWT —
  // i.e. it compared the caller's org against the caller's org. The canonical
  // guard reads the requested org from request INPUT (route param, body or
  // query), which is the value an attacker actually controls, so these drive it
  // through a route parameter.
  it('denies an org admin another organization', async () => {
    const res = await request(appWith(ORG_ADMIN, requireSameOrganization)).get('/probe/999');
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('AUTH_005');
  });

  it('allows an org admin their own organization', async () => {
    const res = await request(appWith(ORG_ADMIN, requireSameOrganization)).get('/probe/30');
    expect(res.status).toBe(200);
  });

  it('allows platform staff any organization', async () => {
    const res = await request(appWith(PLATFORM, requireSameOrganization)).get('/probe/999');
    expect(res.status).toBe(200);
  });
});

describe('requireOrgAccess — platform staff only', () => {
  it('denies an org admin another organization’s id', async () => {
    const { requireOrgAccess } = await loadTsTwin();
    const res = await request(appWith(ORG_ADMIN, requireOrgAccess)).get('/probe/999');
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('AUTH_005');
  });

  it('still allows an org admin their own organization', async () => {
    const { requireOrgAccess } = await loadTsTwin();
    const res = await request(appWith(ORG_ADMIN, requireOrgAccess)).get('/probe/30');
    expect(res.status).toBe(200);
  });

  it('allows platform staff any organization', async () => {
    const { requireOrgAccess } = await loadTsTwin();
    const res = await request(appWith(PLATFORM, requireOrgAccess)).get('/probe/999');
    expect(res.status).toBe(200);
  });
});
