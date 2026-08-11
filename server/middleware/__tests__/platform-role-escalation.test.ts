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

// Imported from the BARE specifier on purpose. server/middleware/auth.js and
// auth.ts both exist and export overlapping names; extension resolution picks
// .js first, so this is the module the 95 bare-specifier call sites actually
// get. Testing auth.ts directly would prove nothing about production.
import { requireRole, requireSameOrganization, PLATFORM_SCOPED_ROLES } from '../auth';

// The .ts twin can only be addressed by its explicit extension — the bare
// specifier resolves to the .js file above. A STATIC `from '../auth.ts'` is
// TS5097 ("an import path can only end with '.ts' when
// allowImportingTsExtensions is enabled"), so the specifier is held in a
// variable: tsc cannot apply TS5097 to a non-literal, and Vite still resolves
// it at runtime. Awkward, and the awkwardness is the point — two modules
// sharing a name is why this test file has to reach for either one by hand.
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
    // NOTE the envelope: the live .js answers {status,message}; auth.ts answers
    // {error:{code:'AUTH_004'}}. Two modules exporting one name, disagreeing on
    // the error contract, is the same shadowing hazard in another dress.
    expect(res.body?.status).toBe('error');
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
    expect(res.body?.status).toBe('error');
  });
});

describe('the shadowing .js and the .ts twin do not drift', () => {
  it('declares the same platform-scoped role set in both files', async () => {
    const { PLATFORM_SCOPED_ROLES: TS_PLATFORM_ROLES } = await loadTsTwin();
    // auth.js's comment used to claim it "Mirrors the canonical auth.ts
    // requireRole" while taking a single role to the other's variadic. Two
    // files exporting the same names is the hazard; this pins the part of
    // them that decides who is staff.
    expect([...PLATFORM_SCOPED_ROLES].sort()).toEqual([...TS_PLATFORM_ROLES].sort());
  });

  it('makes both variadic, so a second role is never silently dropped', async () => {
    // The live .js took (requiredRole) — so requireRole('super_admin',
    // 'platform_admin') discarded the second and denied real platform admins.
    expect(requireRole.length).toBe(0); // rest params report length 0
  });
});

describe('requireSameOrganization (the LIVE .js guard) — platform staff only', () => {
  // The requireOrgAccess block below imports auth.ts explicitly, so it does NOT
  // exercise what production runs. This block does: requireSameOrganization is
  // the bare-specifier export, and it compares req.user.organizationId against
  // req.organizationId (set from the JWT by authenticateJWT).
  const appOrg = (identity: Identity, reqOrgId: number) => {
    const app = express();
    app.use((req, _res, next) => {
      (req as express.Request & { user: Identity; organizationId: number }).user = identity;
      (req as express.Request & { organizationId: number }).organizationId = reqOrgId;
      next();
    });
    app.get('/probe', requireSameOrganization, (_req, res) => res.status(200).json({ ok: true }));
    return app;
  };
  const orgAdmin = { role: 'admin', roles: ['admin'], organizationId: 30 } as unknown as Identity;
  const platform = { role: 'platform_admin', roles: ['platform_admin'], organizationId: 1 } as unknown as Identity;

  it('denies an org admin another organization', async () => {
    // The exemption was `!req.user.roles.includes('admin')` — the guard whose
    // job is blocking cross-tenant access exempted every customer admin.
    expect((await request(appOrg(orgAdmin, 999)).get('/probe')).status).toBe(403);
  });

  it('allows an org admin their own organization', async () => {
    expect((await request(appOrg(orgAdmin, 30)).get('/probe')).status).toBe(200);
  });

  it('allows platform staff any organization', async () => {
    expect((await request(appOrg(platform, 999)).get('/probe')).status).toBe(200);
  });
});

describe('requireOrgAccess (auth.ts twin — not the live module) — platform staff only', () => {
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
