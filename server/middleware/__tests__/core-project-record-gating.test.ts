/**
 * The project record (/api/c2c/projects) is served to an organization that
 * holds Projects, under module enforcement.
 *
 * /api/c2c/projects is the program record: the Projects list and the New
 * project wizard (GET and POST /), Project home (/:id and its dossier, team,
 * activity, records, sources, source changes, conversation files, adopt and
 * document dispositions), and the reads Vault, the editor, Review, Quality,
 * CMC and the shell make of /:id and /:id/sources. Until 2026-10-29 only
 * submission-center and ivd-completeness claimed it. Both are `standard`
 * modules, and Projects is `free`
 * (db/migrations/20260823_module_catalog_commercial_packaging.sql). So with
 * MODULE_ENFORCEMENT=enforce, an organization holding Projects but neither of
 * those was refused its own project list and record (403 MODULE_NOT_LICENSED):
 * a free-tier organization without the launch grants, or a self-serve one
 * whose administrator had switched Submission Center off.
 *
 * `projects` now claims the prefix too, as `/api/projects` is claimed by
 * projects and project-home. The gate serves a path when the organization
 * holds ANY claimant, so nobody loses access
 * (docs/evidence/D2-ONE-ANA/2026-10-29/core-project-record-gating/).
 *
 * Asked of the real registry, the calls the launch-scope walk reads from the
 * screens' own code, every route the two project-record routers mount, the
 * gate production builds, and the real canAccessModule. Only the database is
 * stood in for: each module's tier is read from the packaging migration.
 */
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sql = vi.hoisted(() => vi.fn());
vi.mock('../../db.js', () => ({
  pool: { query: (...a: unknown[]) => sql(...a) },
  query: (...a: unknown[]) => sql(...a),
}));
vi.mock('../../services/auditService.js', () => ({ default: { logAction: vi.fn() } }));

import { invalidateEnforcementModeCache } from '../../services/entitlements/enforcement-mode';
import { LAUNCH_MODULE_IDS, LAUNCH_SURFACE_IDS } from '../../../shared/constants/launch-scope';
import { checkLaunchScopeApi, REAL } from '../../../scripts/ci/check-launch-scope-api';
import { buildPrefixMap, moduleEntitlementGate } from '../moduleEntitlementGate';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Each live module's lowest tier, as the packaging migration assigns it. */
const TIER: ReadonlyMap<string, string> = (() => {
  const src = read('db/migrations/20260823_module_catalog_commercial_packaging.sql');
  const block = src.slice(src.indexOf('INSERT INTO module_packaging'), src.indexOf('DO $$'));
  return new Map([...block.matchAll(/\('([a-z0-9-]+)',\s*'(free|standard|professional|enterprise)'\)/g)].map((m) => [m[1], m[2]]));
})();

interface Org { tier: string; granted: readonly string[]; switchedOff: readonly string[] }
const launchGrants = (...except: string[]) => LAUNCH_MODULE_IDS.filter((m) => !except.includes(m));
const ORGS: Record<number, Org> = {
  /** Free tier, no grant row: Projects, Vault, Tasks and the rest of the free tier, by tier alone. */
  301: { tier: 'free', granted: [], switchedOff: [] },
  /** Self-serve signup (free tier, the launch grants); an administrator switched Submission Center off. */
  302: { tier: 'free', granted: launchGrants('submission-center'), switchedOff: ['submission-center'] },
  /** A paying organization with the launch grants. */
  303: { tier: 'standard', granted: launchGrants(), switchedOff: [] },
  /** Free tier; an administrator switched Projects and Submission Center off. */
  304: { tier: 'free', granted: launchGrants('projects', 'submission-center'), switchedOff: ['projects', 'submission-center'] },
  /** Free tier, Submission Center granted, Projects switched off: holds only a claimant that was there before. */
  305: { tier: 'free', granted: ['submission-center'], switchedOff: ['projects'] },
};

/** The statements license-manager issues, answered from ORGS and TIER. Anything else reads as no rows. */
sql.mockImplementation(async (statement: string, params: unknown[] = []) => {
  const s = String(statement);
  if (/SELECT id, tier, industry_mode/.test(s)) {
    const org = ORGS[Number(params[0])];
    return { rows: org ? [{ id: Number(params[0]), tier: org.tier, industry_mode: 'biotech', max_users: 5, max_projects: 10, max_storage: 5 }] : [] };
  }
  if (/FROM module_subscriptions\s+WHERE organization_id = \$1 AND enabled = true/.test(s)) {
    return { rows: (ORGS[Number(params[0])]?.granted ?? []).map((module_id) => ({ module_id, expires_at: null })) };
  }
  if (/FROM available_modules am/.test(s)) {
    const [moduleId, orgId] = [String(params[0]), Number(params[1])];
    const tier = TIER.get(moduleId);
    if (!tier) return { rows: [] };
    const org = ORGS[orgId];
    const enabled = org?.switchedOff.includes(moduleId) ? false : org?.granted.includes(moduleId) ? true : null;
    return { rows: [{ metadata: { tiers: [tier], industries: [] }, enabled, expires_at: null }] };
  }
  return { rows: [] };
});

async function ask(orgId: number, p: string) {
  const gate = moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' });
  const res = {
    statusCode: 0,
    body: null as null | { code?: string; module?: string },
    status(c: number) { this.statusCode = c; return this; },
    json(b: { code?: string; module?: string }) { this.body = b; return this; },
  };
  const next = vi.fn();
  await gate({ path: p, originalUrl: p, tenantContext: { organizationId: orgId } } as never, res as never, next);
  return next.mock.calls.length === 1 ? 'served' : `${res.statusCode} ${res.body?.code ?? ''}`.trim();
}

beforeEach(() => {
  invalidateEnforcementModeCache();
  vi.unstubAllEnvs();
  vi.stubEnv('MODULE_ENFORCEMENT', 'enforce');
});

describe('the project record under module enforcement', () => {
  const RECORD = '/api/c2c/projects';
  const walk = checkLaunchScopeApi(REAL, buildPrefixMap(), LAUNCH_SURFACE_IDS);
  /** Every project-record path a launch or shell screen names. */
  const named = [...walk.all].filter(([p]) => p === RECORD || p.startsWith(`${RECORD}/`));
  /** Every route the two routers mounted at /api/c2c/projects serve (register-inline-routes.ts). */
  const mounted = ['server/routes/c2c/projects.ts', 'server/routes/c2c/document-data-dispositions.ts'].flatMap((f) =>
    [...read(f).matchAll(/router\.(?:get|post|put|patch|delete)\(\s*'([^']*)'/g)].map((m) => `${RECORD}${m[1] === '/' ? '' : m[1]}`),
  );
  const requests = [...new Set([...named.map(([p]) => p), ...mounted]
    .map((p) => p.replace(/:p\b|:id\b/g, 'prog-1').replace(/:evId\b/g, 'ev-1')))]
    .sort();
  const verdicts = async (orgId: number) =>
    Object.fromEntries(await Promise.all(requests.map(async (r) => [r, await ask(orgId, r)] as const)));
  const all = (v: string) => Object.fromEntries(requests.map((r) => [r, v]));

  it('reads the calls from the screens and the routes from the routers', () => {
    // A walk or a router read that lost them would make every case below pass over nothing.
    const projectHome = named.filter(([, e]) => e.surfaces.has('project-home')).map(([p]) => p);
    expect(projectHome).toEqual(expect.arrayContaining([
      `${RECORD}/:p`, `${RECORD}/:p/activity`, `${RECORD}/:p/adopt`, `${RECORD}/:p/conversation-files`,
      `${RECORD}/:p/document-dispositions`, `${RECORD}/:p/dossier`, `${RECORD}/:p/records`, `${RECORD}/:p/source-changes`,
      `${RECORD}/:p/sources`, `${RECORD}/:p/team`,
    ]));
    expect([...named.find(([p]) => p === RECORD)![1].surfaces]).toEqual(expect.arrayContaining(['projects', '(shell chrome)']));
    expect(mounted.length).toBeGreaterThanOrEqual(21);
    // 18 distinct paths: a GET and a POST (or DELETE) on one path are one request to the gate.
    expect(requests.length).toBeGreaterThanOrEqual(18);
    // The tiers the cases rest on, read from the packaging migration.
    expect([TIER.get('projects'), TIER.get('submission-center'), TIER.get('ivd-completeness')]).toEqual(['free', 'standard', 'standard']);
  });

  it('serves it to a free-tier organization that holds Projects by tier and has no grant', async () => {
    expect(await verdicts(301)).toEqual(all('served'));
  });

  it('serves it to a self-serve organization whose administrator switched Submission Center off', async () => {
    expect(await verdicts(302)).toEqual(all('served'));
  });

  it('serves it to a paying organization with the launch grants, as before', async () => {
    expect(await verdicts(303)).toEqual(all('served'));
  });

  it('serves it, as before, to an organization that holds Submission Center and not Projects', async () => {
    expect(await verdicts(305)).toEqual(all('served'));
  });

  it('refuses it to an organization that holds no claimant: Projects and Submission Center switched off, free tier', async () => {
    expect(await verdicts(304)).toEqual(all('403 MODULE_NOT_LICENSED'));
  });

  it('is claimed by projects beside the claims it already had', () => {
    expect([...(buildPrefixMap().get(RECORD) ?? [])].sort()).toEqual(['ivd-completeness', 'projects', 'submission-center']);
  });
});
