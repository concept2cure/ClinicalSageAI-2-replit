/**
 * Launch scope for the device features: everything their screens call is
 * served, and nothing else under the device kit's namespaces is.
 *
 * Asked of the real registry, the real catalog and the gate production builds
 * (launch scope on, unattributed paths enforced). Beside
 * launch-scope-api-gate.test.ts, which holds the gate's own rules.
 */
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/license-manager.js', () => ({ canAccessModule: vi.fn(async () => ({ allowed: true })) }));
vi.mock('../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import { invalidateEnforcementModeCache } from '../../services/entitlements/enforcement-mode';
import { LAUNCH_SURFACE_IDS } from '../../../shared/constants/launch-scope';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '../../../shared/constants/mdx-project-features';
import { UI_SURFACES } from '../../../shared/constants/ui-surface-registry';
import { checkLaunchScopeApi, REAL } from '../../../scripts/ci/check-launch-scope-api';
import { buildPrefixMap, moduleEntitlementGate } from '../moduleEntitlementGate';

async function run(gate: ReturnType<typeof moduleEntitlementGate>, p: string) {
  const res = { statusCode: 0, body: null as unknown, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  const next = vi.fn();
  await gate({ path: p, originalUrl: p, tenantContext: { organizationId: 42 } } as never, res as never, next);
  return { res, passed: next.mock.calls.length === 1 };
}

beforeEach(() => {
  invalidateEnforcementModeCache();
  vi.unstubAllEnvs();
  vi.stubEnv('MODULE_ENFORCEMENT', 'off');
});

/* The device features are Projects features (62a8d5e7, the founder's decision
   of 2026-10-23), so every call their screens name is launch. Eleven of them
   claimed the whole of /api/mdx, and device-validation and device-submission
   the whole of /api/submission-ops, so every device-kit route under them
   answered launch, the package transmit refused on 2026-10-17 among them. Each
   now claims the families its screens call (trunk-red-sweep-2, 2026-10-29).
   This block is the check that such a narrowing cut too deep: it enumerates
   each device screen's calls two ways, from the walk ci:launch-scope-api runs
   and by reading the screens' own hooks, and asks the gate production builds
   about every one. */
describe('the real registry with the device features in Projects (62a8d5e7)', () => {
  const walk = checkLaunchScopeApi(REAL, buildPrefixMap(), LAUNCH_SURFACE_IDS);
  const DEVICE: ReadonlySet<string> = new Set(MDX_PROJECT_FEATURE_SURFACE_IDS);
  /** Each device screen's own hooks, read directly so a walk that lost one cannot pass unseen. */
  const HOOKS: ReadonlyArray<readonly [string, string]> = [
    ['device-510k', 'mdx/hooks/useK510.ts'], ['device-510k', 'mdx/hooks/useDossier.ts'],
    ['device-510k', 'mdx/hooks/useEstarExport.ts'], ['device-510k', 'services/programTabsService.ts'],
    ['device-cer', 'mdx/hooks/useCerLiterature.ts'], ['device-presub', 'mdx/hooks/usePresub.ts'],
    ['device-udi', 'mdx/hooks/useUdi.ts'], ['labeling', 'v2/surfaces/Labeling.tsx'],
    // No device-vault: it folded into the Vault (fold F3, 2026-10-29), whose calls the launch walk reads as the Vault's.
    ['device-clinical-studies', 'mdx/hooks/useClinicalStudies.ts'],
    ['device-clinical-studies', 'mdx/hooks/useRbqm.ts'], ['device-clinical-studies', 'mdx/hooks/useStudyArchetypes.ts'],
    ['device-diagnostics', 'mdx/hooks/useIvd.ts'], ['device-diagnostics', 'mdx/hooks/useCdxClia.ts'],
    ['device-engineering', 'mdx/hooks/useEngineering.ts'], ['device-software', 'mdx/hooks/useSoftware.ts'],
    ['device-postmarket', 'mdx/hooks/usePostmarket.ts'], ['device-analytics', 'mdx/hooks/useAnalytics.ts'],
    ['device-workstream', 'mdx/hooks/useClientReview.ts'], ['device-submission', 'mdx/hooks/useSubmissions.ts'],
    ['device-validation', 'mdx/hooks/useWorkbench.ts'], ['human-factors', 'v2/surfaces/HumanFactors.tsx'],
    // The IVDR family board names its read, and the workbench beside it; device-diagnostics mounts both (F2, folded 2026-10-29).
    ['device-diagnostics', 'v2/surfaces/IvdReadinessBoard.tsx'], ['device-diagnostics', 'v2/surfaces/IvdAssessmentWorkbench.tsx'],
    // The risk register and the design-controls trace name their reads; Engineering mounts them (F1 slice B; F1c folded 2026-10-29).
    ['device-engineering', 'v2/surfaces/RiskRegister.tsx'], ['device-engineering', 'v2/surfaces/DesignControlsTrace.tsx'],
  ];
  const file = (f: string) => path.join(REAL.root, 'client/src/concept2cure', f);
  const named = (f: string) => [...fs.readFileSync(file(f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .matchAll(/['"`](\/api\/[^'"`\s?#]*)/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, ':p').replace(/\$\{.*$/, '').replace(/\/+$/, ''));
  /** A request puts a segment at `/${…}`, and a segment or nothing where `${…}` is joined to text (`rbm-summary${base}`). */
  const requests = (p: string) => {
    const segment = p.replace(/\/:p/g, '/1');
    return [...new Set([segment.replace(/:p/g, ''), segment.replace(/:p/g, '/1')])];
  };
  const deviceCalls = () => [...new Set([
    ...[...walk.all].filter(([, e]) => [...e.surfaces].some((id) => DEVICE.has(id))).map(([p]) => p),
    ...HOOKS.flatMap(([, f]) => named(f)),
  ])].sort();

  it('the walk reaches each device screen\'s own hooks, and each names a call', () => {
    expect(walk.unresolved).toEqual([]);
    for (const [id, f] of HOOKS) {
      expect(walk.reached.get(file(f))?.has(id), `${id} reaches ${f}`).toBe(true);
      expect(named(f).length, f).toBeGreaterThan(0);
    }
  });

  it('serves every call a device screen names, under the gate production builds', async () => {
    const gate = moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' });
    const calls = deviceCalls();
    // A wrong walk root would make the assertion below pass over nothing.
    expect(calls.length).toBeGreaterThanOrEqual(60);
    const refused: string[] = [];
    for (const p of calls) for (const r of requests(p)) if (!(await run(gate, r)).passed) refused.push(`${r} (named as ${p})`);
    expect(refused).toEqual([]);
  });

  it('claims no /api/mdx or /api/submission-ops root, nor a family no screen of it calls', () => {
    const device = UI_SURFACES.filter((s) => DEVICE.has(s.id));
    // A mount root admits every handler mounted under it, called or not.
    expect(device.flatMap((s) => s.apiPrefixes.filter((p) => p === '/api/mdx' || p === '/api/submission-ops').map((p) => `${s.id} ${p}`))).toEqual([]);
    const uncalled = device.flatMap((s) => s.apiPrefixes.filter((pre) => /^\/api\/(mdx|submission-ops)\//.test(pre))
      .filter((pre) => ![...walk.all].some(([p, e]) => e.surfaces.has(s.id) && (p === pre || p.startsWith(`${pre}/`) || p.startsWith(`${pre}:p`))))
      .map((pre) => `${s.id} ${pre}`));
    expect(uncalled).toEqual([]);
  });
});
