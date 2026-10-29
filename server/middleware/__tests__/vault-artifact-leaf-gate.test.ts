/**
 * The project Vault's governed-artifact leaf under module enforcement (fold F3
 * slice B, D2, 2026-10-29).
 *
 * The leaf reaches two existing families: the governed DOCX export,
 * GET /api/artifacts-center/:artifactId/export, and the artifact's versions and
 * audit report, GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/….
 *
 * - /api/artifacts-center was claimed only by the Artifacts center, so with
 *   MODULE_ENFORCEMENT=enforce an organization entitled to the Vault and not
 *   the Artifacts center was refused the export. `vault` now also claims it
 *   (a86ed04ed's method). The gate admits a path when the organization holds
 *   ANY claimant, so an Artifacts-center-only organization kept its export
 *   until the Artifacts center folded into the Vault (slice C, below).
 * - /api/concept2cure/projects is claimed only by project-home and
 *   conversation-thread, which have no catalog row, so under enforcement it is
 *   refused to every organization (core-project-record-gating, "Left as
 *   found"). It is NOT claimed by `vault` here: the prefix holds 97 routes, 49
 *   of them writes, and that claim is its own decision
 *   (docs/evidence/D2-ONE-ANA/2026-10-29/vault-artifact-leaf/README.md). The
 *   leaf says so when it is refused: "not enabled for your organization".
 *
 * The real registry, the leaf's calls as the launch-scope walk reads them from
 * the screen's own code, the gate production builds, and organizations by what
 * they hold.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The modules each test organization holds. */
const HOLDS: Record<number, ReadonlySet<string>> = {
  501: new Set(['vault']),
  502: new Set(['artifacts-center']),
  503: new Set(['projects']),
};
vi.mock('../../services/license-manager.js', () => ({
  canAccessModule: vi.fn(async (orgId: number, moduleId: string) =>
    HOLDS[orgId]?.has(moduleId)
      ? { allowed: true }
      : { allowed: false, reason: `Module '${moduleId}' is not held by organization ${orgId}` }),
}));
vi.mock('../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import { invalidateEnforcementModeCache } from '../../services/entitlements/enforcement-mode';
import { LAUNCH_SURFACE_IDS } from '../../../shared/constants/launch-scope';
import { checkLaunchScopeApi, REAL } from '../../../scripts/ci/check-launch-scope-api';
import { buildPrefixMap, moduleEntitlementGate } from '../moduleEntitlementGate';

/** The walk records each file relative to the repository root. */
const LEAF = ['Vault.tsx', 'VaultGovernedArtifacts.tsx'].map((f) => `client/src/concept2cure/v2/surfaces/${f}`);
const FAMILIES = ['/api/artifacts-center', '/api/concept2cure/projects'];

async function ask(orgId: number, p: string) {
  const gate = moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' });
  const res = { statusCode: 0, body: null as null | { code?: string }, status(c: number) { this.statusCode = c; return this; }, json(b: { code?: string }) { this.body = b; return this; } };
  const next = vi.fn();
  await gate({ path: p, originalUrl: p, tenantContext: { organizationId: orgId } } as never, res as never, next);
  return next.mock.calls.length === 1 ? 'served' : `${res.statusCode} ${res.body?.code ?? ''}`.trim();
}

beforeEach(() => {
  invalidateEnforcementModeCache();
  vi.unstubAllEnvs();
  vi.stubEnv('MODULE_ENFORCEMENT', 'enforce');
});

describe('the Vault’s governed-artifact leaf, under module enforcement', () => {
  const walk = checkLaunchScopeApi(REAL, buildPrefixMap(), LAUNCH_SURFACE_IDS);
  const walked = [...walk.all]
    .filter(([p, e]) => LEAF.some((f) => e.files.has(f)) && FAMILIES.some((fam) => p.startsWith(`${fam}/`)))
    .map(([p]) => p.replace(/:p/g, 'x1'));
  /* The requests asked of the gate are named, so no verdict below can pass over
     an empty list; the first case ties them to what the screen's code calls. */
  const exportCall = '/api/artifacts-center/x1/export';
  const projectCalls = [
    '/api/concept2cure/projects/x1/artifacts/x1/audit-report',
    '/api/concept2cure/projects/x1/artifacts/x1/versions',
  ];
  const verdicts = async (orgId: number, list: string[]) =>
    Object.fromEntries(await Promise.all(list.map(async (c) => [c, await ask(orgId, c)] as const)));
  const all = (list: string[], v: string) => Object.fromEntries(list.map((c) => [c, v]));

  it('reads the leaf’s calls from the Vault’s own code', () => {
    // A walk that lost the leaf would leave the cases below asking about calls no screen makes.
    expect([...walked].sort()).toEqual([exportCall, ...projectCalls].sort());
  });

  it('serves the export to an organization entitled to the Vault only', async () => {
    expect(await ask(501, exportCall)).toBe('served');
  });

  it('refuses the versions and audit read to that organization, as before: the prefix is not claimed here', async () => {
    expect(await verdicts(501, projectCalls)).toEqual(all(projectCalls, '403 MODULE_NOT_LICENSED'));
  });

  it('refuses all three to an organization entitled to neither', async () => {
    expect(await verdicts(503, [exportCall, ...projectCalls])).toEqual(all([exportCall, ...projectCalls], '403 MODULE_NOT_LICENSED'));
  });

  /* Fold F3 slice C (2026-10-29): the Artifacts center folded into the Vault,
     so its registry entry and claims went. /api/artifacts-center is the Vault's
     alone; /api/atoms, which had no route and no caller, is claimed by nothing.
     A module the catalogue now deprecates claims nothing, so an organization
     holding it and not the Vault is refused (every organization was granted
     both at creation: both were launch modules). */
  it('the Vault alone claims /api/artifacts-center now, and /api/concept2cure/projects is unchanged', async () => {
    const map = buildPrefixMap();
    expect([...map.get('/api/artifacts-center')!]).toEqual(['vault']);
    expect(map.has('/api/atoms')).toBe(false);
    expect([...map.get('/api/concept2cure/projects')!].sort()).toEqual(['conversation-thread', 'project-home']);
    expect(await ask(502, exportCall)).toBe('403 MODULE_NOT_LICENSED');
  });
});
