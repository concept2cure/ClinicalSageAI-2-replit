/**
 * Grant continuity across folds (decision P-61 item 4, 2026-10-29;
 * server/services/entitlements/folded-module-successors.ts;
 * docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/).
 *
 * A subscription to a folded module entitles its holder to the fold's target.
 * Asked of the real resolver (license-manager's readLicenseInfo,
 * canAccessModule and getModuleCatalog, and navigation's
 * resolveNavEntitlements), the real registry (buildPrefixMap over UI_SURFACES),
 * the gate as production builds it with MODULE_ENFORCEMENT=enforce, and a
 * catalogue built by replaying every catalogue writer of C2C_MIGRATION_FILES in
 * deploy order on PGlite, as catalog-module-claims.contract.test.ts does.
 *
 * The database is a deployed one: each folded module's row is written as it
 * stood before its fold and the whole catalogue set is replayed over it, so the
 * row is deprecated (20260810 step 1) and its grants are kept, which is what a
 * fold leaves behind. Every organization is on the free plan, so a target above
 * free is entitled only by a grant.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ pg: null as null | { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> } }));
vi.mock('../../../db.js', () => ({
  pool: { query: (text: string, params?: unknown[]) => db.pg!.query(text, params) },
  query: (text: string, params?: unknown[]) => db.pg!.query(text, params),
}));
vi.mock('../master-admin', () => ({ resolveMasterAdmin: vi.fn(async () => false) }));

import { canAccessModule, getModuleCatalog } from '../../license-manager';
import { invalidateEnforcementModeCache } from '../enforcement-mode';
import { resolveNavEntitlements } from '../navigation-entitlements';
import { FOLDED_MODULE_SUCCESSORS, FOLDED_WITHOUT_CATALOGUE_ROW } from '../folded-module-successors';
import { buildPrefixMap, modulesForPath, moduleEntitlementGate } from '../../../middleware/moduleEntitlementGate';
import express from 'express';
import request from 'supertest';
import masterLicensing from '../../../routes/admin/master-licensing';
import { getSurface } from '../../../../shared/constants/ui-surface-registry';
import { DEEP_LINK_ALIASES } from '../../../../client/src/concept2cure/v2/registryModel';

const REPO = path.resolve(__dirname, '../../../..');
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8');

/**
 * Every fold made so far, as decided. `tier` is the folded module's packaging
 * before its fold (the replay at the fold's parent commit, README).
 */
const CARRIED = [
  { source: 'device-tasks', target: 'tasks', fold: '2168fd56', tier: 'standard' },
  { source: 'device-vault', target: 'vault', fold: 'b9de04c62', tier: 'standard' },
  { source: 'artifacts-center', target: 'vault', fold: 'b9de04c62', tier: 'free' },
  { source: 'ectd-publishing', target: 'ectd-compile', fold: '302d632db', tier: 'standard' },
  // Fold F1c (product 59b1482d2, 79d00b348) and fold F2 (product 1a6701ea6), retired in the change that adds them.
  { source: 'risk', target: 'device-engineering', fold: 'F1c', tier: 'standard' },
  { source: 'design-controls', target: 'device-engineering', fold: 'F1c', tier: 'standard' },
  { source: 'ivd-completeness', target: 'device-diagnostics', fold: 'F2', tier: 'standard' },
  // Fold F5 item 2 (P-61 item 2): the organization-wide blocker list retired into
  // each filing's readiness; its address opens Submission Center.
  { source: 'device-validation', target: 'submission-center', fold: 'F5', tier: 'standard' },
  // Fold F5 item 1 (P-61 item 1): the device submission-packages screen folded
  // into Submission Center's device filings, over the one device-filing store.
  { source: 'device-submission', target: 'submission-center', fold: 'F5', tier: 'standard' },
] as const;

/** Folded screens that never had a catalogue row: nothing to carry. */
const NOT_CATALOGUED = [
  { source: 'part11-console', target: 'audit-trail', fold: '66efa6179' },
  { source: 'ana-memory', target: 'conversation-thread', fold: '78877084f' },
  { source: 'setup', target: 'admin-console', fold: 'beede0408' },
  { source: 'billing', target: 'licensing', fold: 'd140aefa5' },
] as const;

const PAST = '2026-01-01T00:00:00.000Z';

/** One organization per case, all on the free plan. */
interface Org { id: number; grants: Array<{ module: string; enabled: boolean; expires?: string }> }
let nextOrg = 640_000;
const orgs = new Map<string, Org>();
function org(key: string, grants: Org['grants'] = []): Org {
  const o = { id: nextOrg++, grants };
  orgs.set(key, o);
  return o;
}
for (const c of CARRIED) {
  org(`${c.source}:only`, [{ module: c.source, enabled: true }]);
  org(`${c.source}:neither`);
}
const precedence = CARRIED.find((c) => c.source === 'ectd-publishing')!;
org('target-revoked', [{ module: precedence.source, enabled: true }, { module: precedence.target, enabled: false }]);
org('source-lapsed', [{ module: precedence.source, enabled: true, expires: PAST }]);
org('source-revoked', [{ module: precedence.source, enabled: false }]);
org('target-own-grant', [{ module: precedence.target, enabled: true }]);
const O = (key: string) => orgs.get(key)!.id;

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  db.pg = pg as never;
  const base = read('migrations/0000_sweet_joseph.sql');
  for (const t of ['organizations', 'users', 'projects', 'module_subscriptions', 'available_modules',
    'concept2cure_artifacts', 'concept2cure_messages', 'activity_feed']) {
    await pg.exec(base.match(new RegExp(`CREATE TABLE "${t}" \\([\\s\\S]*?\\n\\);`))![0]);
  }
  await pg.exec(read('db/migrations/20260824_module_grant_expiry.sql'));
  // The stored enforcement mode: none, so the deployment's MODULE_ENFORCEMENT decides.
  await pg.exec('CREATE TABLE platform_settings (setting_key text PRIMARY KEY, setting_value text, updated_at timestamptz, updated_by integer, reason text)');

  const { C2C_MIGRATION_FILES } = (await import(path.join(REPO, 'scripts/db/migration-set.mjs'))) as { C2C_MIGRATION_FILES: string[] };
  /* A set entry whose file is not on disk (a session mid-change in the shared
     tree) writes no catalogue row; every other entry is read. */
  const writers = C2C_MIGRATION_FILES
    .filter((f) => fs.existsSync(path.join(REPO, f)))
    .filter((f) => /(INSERT\s+INTO|UPDATE)\s+(public\.)?"?available_modules"?/i.test(read(f)));
  const replay = async () => { for (const f of writers) await pg.exec(read(f)); };
  await replay();
  // Each folded module's row as it stood before its fold, then the deploy that follows it.
  for (const c of CARRIED) {
    await pg.query(
      `INSERT INTO available_modules (module_id, name, description, category, metadata)
       VALUES ($1, $1, '', 'Folded', $2::json) ON CONFLICT (module_id) DO NOTHING`,
      [c.source, JSON.stringify({ tiers: [c.tier], industries: [] })],
    );
  }
  await replay();
  await pg.exec(`ALTER TABLE module_subscriptions ADD CONSTRAINT module_subscriptions_module_id_available_modules_module_id_fk
    FOREIGN KEY (module_id) REFERENCES available_modules(module_id) ON DELETE CASCADE`);
  for (const [key, o] of orgs) {
    await pg.query(`INSERT INTO organizations (id, name, slug, tier, industry_mode) VALUES ($1, $2, $2, 'free', 'medtech')`, [o.id, key]);
    for (const g of o.grants) {
      await pg.query(
        'INSERT INTO module_subscriptions (organization_id, module_id, enabled, expires_at) VALUES ($1, $2, $3, $4)',
        [o.id, g.module, g.enabled, g.expires ?? null],
      );
    }
  }
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

beforeEach(() => {
  invalidateEnforcementModeCache();
  vi.unstubAllEnvs();
  vi.stubEnv('MODULE_ENFORCEMENT', 'enforce');
});

const prefixMap = () => buildPrefixMap();

async function ask(orgId: number, p: string): Promise<string> {
  const gate = moduleEntitlementGate(prefixMap(), { launchScope: 'on', unattributed: 'enforce' });
  const res = {
    statusCode: 0,
    body: null as null | { code?: string },
    status(c: number) { this.statusCode = c; return this; },
    json(b: { code?: string }) { this.body = b; return this; },
  };
  const next = vi.fn();
  await gate({ path: p, originalUrl: p, tenantContext: { organizationId: orgId } } as never, res as never, next);
  return next.mock.calls.length === 1 ? 'served' : `${res.statusCode} ${res.body?.code ?? ''}`.trim();
}

/** The target's gated paths, from the real registry, with the modules claiming each. */
function targetPaths(target: string): Array<{ path: string; claimants: Set<string> }> {
  const map = prefixMap();
  return getSurface(target)!.apiPrefixes
    .map((p) => ({ path: p, claimants: modulesForPath(p.toLowerCase(), map) }))
    .filter((x): x is { path: string; claimants: Set<string> } => x.claimants != null && x.claimants.size > 0);
}

async function verdicts(orgId: number, target: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const { path: p } of targetPaths(target)) out[p] = await ask(orgId, p);
  return out;
}
const each = (target: string, v: string) => Object.fromEntries(targetPaths(target).map(({ path: p }) => [p, v]));

describe('the mapping', () => {
  it('maps every catalogued fold to its target, and names the folds that had no catalogue row', () => {
    expect(FOLDED_MODULE_SUCCESSORS).toEqual(Object.fromEntries(CARRIED.map((c) => [c.source, c.target])));
    expect([...FOLDED_WITHOUT_CATALOGUE_ROW].sort()).toEqual(NOT_CATALOGUED.map((c) => c.source).sort());
  });

  it('agrees with the screens: each folded id opens its target', () => {
    for (const c of [...CARRIED, ...NOT_CATALOGUED]) expect(DEEP_LINK_ALIASES[c.source], c.source).toBe(c.target);
  });

  it('carries to live catalogue modules only; the uncatalogued folds have no row to hold a grant', async () => {
    const rows = await pg.query<{ module_id: string; deprecated: boolean }>(
      `SELECT module_id, COALESCE((metadata::jsonb->>'deprecated')::boolean, false) AS deprecated FROM available_modules`);
    const live = new Set(rows.rows.filter((r) => !r.deprecated).map((r) => r.module_id));
    const all = new Set(rows.rows.map((r) => r.module_id));
    for (const c of CARRIED) {
      expect(live.has(c.target), `${c.target} is a live catalogue module`).toBe(true);
      expect(live.has(c.source), `${c.source} is deprecated by its fold`).toBe(false);
      expect(all.has(c.source), `${c.source}'s row is kept`).toBe(true);
    }
    for (const c of NOT_CATALOGUED) expect(all.has(c.source), c.source).toBe(false);
  });
});

describe('the module gate, MODULE_ENFORCEMENT=enforce', () => {
  for (const c of CARRIED) {
    it(`serves ${c.target}'s paths to an organization holding only ${c.source}`, async () => {
      expect(targetPaths(c.target).length).toBeGreaterThan(0);
      expect(await verdicts(O(`${c.source}:only`), c.target)).toEqual(each(c.target, 'served'));
    });
  }

  it('refuses a tiered target\'s own paths to an organization holding neither', async () => {
    for (const c of CARRIED) {
      const family = new Set<string>([c.target, ...CARRIED.filter((x) => x.target === c.target).map((x) => x.source)]);
      const own = targetPaths(c.target).filter((x) => [...x.claimants].every((m) => family.has(m)));
      const got = await verdicts(O(`${c.source}:neither`), c.target);
      const tiered = (await pg.query<{ tiers: string[] }>(
        "SELECT metadata::jsonb->'tiers' AS tiers FROM available_modules WHERE module_id = $1", [c.target])).rows[0].tiers;
      if (tiered.includes('free')) {
        // Tasks and the Vault are included at free: every plan has them, so a
        // grant carried to them changes no answer today.
        for (const x of own) expect(got[x.path], `${c.target} ${x.path}`).toBe('served');
      } else {
        expect(own.length, c.target).toBeGreaterThan(0);
        for (const x of own) expect(got[x.path], `${c.target} ${x.path}`).toBe('403 MODULE_NOT_LICENSED');
      }
    }
  });

  it('a revocation written on the target stands: the carried grant does not undo it', async () => {
    expect(await verdicts(O('target-revoked'), precedence.target)).toEqual(each(precedence.target, '403 MODULE_NOT_LICENSED'));
  });

  it('a lapsed or revoked grant of the folded module carries nothing', async () => {
    expect(await verdicts(O('source-lapsed'), precedence.target)).toEqual(each(precedence.target, '403 MODULE_NOT_LICENSED'));
    expect(await verdicts(O('source-revoked'), precedence.target)).toEqual(each(precedence.target, '403 MODULE_NOT_LICENSED'));
  });

  it('the target\'s own grant serves as before', async () => {
    expect(await verdicts(O('target-own-grant'), precedence.target)).toEqual(each(precedence.target, 'served'));
  });
});

describe('the resolver\'s other answers read the same carried grant', () => {
  it('canAccessModule allows the target and names the folded module that carries it', async () => {
    for (const c of CARRIED) {
      expect(await canAccessModule(O(`${c.source}:only`), c.target), c.target).toMatchObject({ allowed: true });
    }
    expect(await canAccessModule(O(`${precedence.source}:only`), precedence.target))
      .toEqual({ allowed: true, heldThrough: precedence.source });
    expect(await canAccessModule(O(`${precedence.source}:neither`), precedence.target)).toMatchObject({ allowed: false });
  });

  it('the target revoked: refused for use, but an administrator may switch it back on', async () => {
    expect(await canAccessModule(O('target-revoked'), precedence.target)).toMatchObject({
      allowed: false, reason: expect.stringMatching(/turned off/),
    });
    expect(await canAccessModule(O('target-revoked'), precedence.target, { ignoreRevocation: true }))
      .toEqual({ allowed: true, heldThrough: precedence.source });
  });

  it('the Apps catalogue lists the target as subscribed through the folded module, and not the folded module', async () => {
    const catalog = await getModuleCatalog(O(`${precedence.source}:only`));
    const target = catalog.find((m) => m.moduleId === precedence.target)!;
    expect(target).toMatchObject({ subscriptionState: 'enabled', isEnabled: true, heldThrough: precedence.source });
    expect(catalog.some((m) => m.moduleId === precedence.source)).toBe(false);
    const neither = (await getModuleCatalog(O(`${precedence.source}:neither`))).find((m) => m.moduleId === precedence.target)!;
    expect(neither).toMatchObject({ subscriptionState: 'none', isEnabled: false, isAvailable: false });
    expect(neither.heldThrough).toBeUndefined();
    const revoked = (await getModuleCatalog(O('target-revoked'))).find((m) => m.moduleId === precedence.target)!;
    expect(revoked).toMatchObject({ subscriptionState: 'disabled', isEnabled: false });
    expect(revoked.heldThrough).toBeUndefined();
  });

  it('the rail, ⌘K and AnA\'s targets: the target is entitled, as subscribed', async () => {
    for (const c of CARRIED) {
      const nav = await resolveNavEntitlements(O(`${c.source}:only`), { masterAdmin: false });
      expect(nav.resolved).toBe(true);
      expect(nav.surfaces.find((s) => s.id === c.target), c.target).toMatchObject({ entitled: true, source: 'subscribed' });
      expect(nav.surfaces.some((s) => s.id === c.source), c.source).toBe(false);
    }
    const neither = await resolveNavEntitlements(O(`${precedence.source}:neither`), { masterAdmin: false });
    expect(neither.surfaces.find((s) => s.id === precedence.target)).toMatchObject({ entitled: false, source: 'tier' });
    const revoked = await resolveNavEntitlements(O('target-revoked'), { masterAdmin: false });
    expect(revoked.surfaces.find((s) => s.id === precedence.target)).toMatchObject({ entitled: false, source: 'disabled' });
  });
});

describe('the operator console answers as the rail does', () => {
  // Mounted bare: production mounts it behind authMiddleware and requirePlatformAdmin.
  const app = express().use(masterLicensing);

  it('shows the target held through the folded module, entitled as subscribed', async () => {
    const res = await request(app).get(`/licensing/tenants/${O(`${precedence.source}:only`)}`);
    expect(res.status).toBe(200);
    const row = (res.body.modules as Array<Record<string, unknown>>).find((m) => m.moduleId === precedence.target);
    expect(row).toMatchObject({ subscriptionState: 'enabled', heldThrough: precedence.source, effective: true, source: 'subscribed' });
  });

  it('shows a revoked target as revoked, and a tenant holding neither as below its tier', async () => {
    const revoked = await request(app).get(`/licensing/tenants/${O('target-revoked')}`);
    expect((revoked.body.modules as Array<Record<string, unknown>>).find((m) => m.moduleId === precedence.target))
      .toMatchObject({ subscriptionState: 'disabled', effective: false, source: 'disabled' });
    const neither = await request(app).get(`/licensing/tenants/${O(`${precedence.source}:neither`)}`);
    const row = (neither.body.modules as Array<Record<string, unknown>>).find((m) => m.moduleId === precedence.target);
    expect(row).toMatchObject({ subscriptionState: 'none', effective: false, source: 'tier' });
    expect(row).not.toHaveProperty('heldThrough');
  });
});

describe('the mapping is consulted in exactly one place', () => {
  const ROOTS = ['server', 'shared', 'client/src', 'scripts'];
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '__tests__') out.push(...sources(rel));
      } else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.(test|spec|dbtest)\./.test(e.name)) {
        out.push(rel);
      }
    }
    return out;
  }
  const files = ROOTS.flatMap(sources);
  /* The tree is shared with other sessions: a file listed a moment ago may be
     gone when it is read. A vanished file names nothing. */
  const text = (f: string) => { try { return read(f); } catch { return ''; } };
  const naming = (re: RegExp) => files.filter((f) => re.test(text(f))).sort();

  it('only its own module names the mapping', () => {
    expect(naming(/\bFOLDED_MODULE_SUCCESSORS\b/)).toEqual(['server/services/entitlements/folded-module-successors.ts']);
  });

  it('only the licence read derives the carried grants, once', () => {
    expect(naming(/\bgrantsHeldThroughFolds\b/)).toEqual([
      'server/services/entitlements/folded-module-successors.ts',
      'server/services/license-manager.ts',
    ]);
    expect(read('server/services/license-manager.ts').match(/\bgrantsHeldThroughFolds\(/g)).toHaveLength(1);
  });
});
