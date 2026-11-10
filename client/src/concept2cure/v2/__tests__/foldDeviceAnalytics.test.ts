/**
 * Device analytics (device-analytics) is folded into Reporting & analytics, and
 * stays folded (D2, fold F4, 2026-10-30; decision P-61 item 3,
 * docs/LAUNCH_DEFINITION_OF_DONE.md; docs/design/DEVICE_FOLDS_2026-10-29.md F4;
 * docs/evidence/D2-ONE-ANA/2026-10-30/fold-f4-device-analytics/).
 *
 * `device-analytics` was AnalyticsSurface (mdx/surfaces/AnalyticsSurface.tsx)
 * over GET /api/mdx/analytics (server/routes/mdx-analytics.ts): counts of every
 * program of the organization, drug programs included, whether or not the reader
 * could open them, with three facets always null. The decision: device analytics
 * joins Reporting & analytics at its tier (standard), over accessible projects
 * only. Its three real figures are the device section of the Reporting overview
 * (readDevicePortfolio over getAccessibleReportProjectIds), shown by Insights.
 *
 * This pins the fold from both ends:
 *   - the old id resolves to Reporting & analytics through the alias, from a
 *     URL, an in-app move or AnA's kept target, with or without a project open;
 *     the overview reads the device section over the accessible projects, and
 *     the canvas mounts it;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list it),
 *     no kit id, no host publish, no hook, no client call of the old route; the
 *     organization-wide kit aggregate is gone from its router, and no registry
 *     entry claims /api/mdx/analytics, so production refuses the facet routes
 *     kept there with no caller;
 *   - neither project scope list names it, nor the rail, a focus list or the
 *     shell's group tables, and no tour stops there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, NAV_GROUP_OF, NAV_HIDDEN, SEGMENT_MODULES, SEGMENTS, SURFACE_ACTIONS } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { MDX_SURFACE_IDS } from '../../mdx/surfaceIds';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { isLaunchSurface, LAUNCH_APPS } from '@shared/constants/launch-scope';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '@shared/constants/mdx-project-features';
import { findNavigationTarget } from '@shared/navigation';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';

const CLIENT = path.resolve(__dirname, '../../..');
const REPO = path.resolve(CLIENT, '../..');
const CONCEPT2CURE = path.join(CLIENT, 'concept2cure');
const SELF = path.resolve(__filename);
const read = (rel: string) => fs.readFileSync(path.join(CONCEPT2CURE, rel), 'utf8');
const ID = 'device-analytics';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && full !== SELF) {
      out.push(full);
    }
  }
  return out;
}
/* The tree is shared with other sessions; a file gone between listing and reading names nothing. */
const text = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const code = (f: string) => text(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('device-analytics is folded into Reporting & analytics', () => {
  it('resolves the old id to Reporting & analytics from a link, an in-app move and AnA, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES[ID]).toBe('insights');
    expect(surfaceIdFromLocation(locationForSurface(ID))).toBe('insights');
    expect(surfaceIdFromLocation('/concept2cure/device-analytics?pathway=all')).toBe('insights');
    expect(destinationFor(ID, true).surfaceId).toBe('insights');
    expect(destinationFor(ID, false).surfaceId).toBe('insights');
    // AnA's handle is kept so an old conversation's move still lands, and says where.
    expect(findNavigationTarget(ID)).toBeDefined();
    expect(findNavigationTarget(ID)!.description).toMatch(/Reporting/);
    expect(findNavigationTarget(ID)!.description).not.toMatch(/analytics panels/);
  });

  it('lands on Reporting & analytics, whose overview reads the device section over the projects the reader can open', () => {
    expect(SURFACE_VIEWS.insights).toBeDefined();
    expect(getSurface('insights')).toBeDefined();
    const canvas = read('v2/surfaces/Insights.tsx');
    expect(canvas).toContain("'/api/insights-canvas/overview'");
    expect(code(path.join(CONCEPT2CURE, 'v2/surfaces/Insights.tsx'))).toMatch(/<InsightsDevicePortfolio device=\{data\??\.device\}/);
    const route = code(path.join(REPO, 'server/routes/insights-canvas-routes.ts'));
    expect(route).toMatch(/readDevicePortfolio\(requestPgClient\(req\), organizationId, accessibleProjectIds,/);
    expect(route).toMatch(/const accessibleProjectIds = await getAccessibleReportProjectIds\(/);
    // Device is the Projects MDX filter's classification, from the one vocabulary.
    const engine = code(path.join(REPO, 'server/services/report-os/device-portfolio.ts'));
    expect(engine).toMatch(/workstreamSqlCase\('rp\.program_type', 'rp\.product_type'\)\} = 'MDX'/);
    expect(engine).not.toMatch(/aiComplete|unified-ai-client|callModel/);
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no kit id, no host publish', () => {
    expect(SURFACE_VIEWS[ID]).toBeUndefined();
    expect(getSurface(ID)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === ID)).toBe(false);
    expect(MDX_SURFACE_IDS as readonly string[]).not.toContain(ID);
    expect(SURFACE_ACTIONS[ID]).toBeUndefined();
    const host = code(path.join(CONCEPT2CURE, 'mdx/MdxSurfaceHost.tsx'));
    expect(host).not.toContain(`'${ID}'`);
    expect(host).not.toMatch(/\bAnalyticsSurface\b/);
  });

  it('leaves no client code, no organization-wide aggregate and no claim for the old route', () => {
    for (const gone of ['mdx/surfaces/AnalyticsSurface.tsx', 'mdx/hooks/useAnalytics.ts', 'mdx/data/analytics.ts', 'mdx/components/AnalyticsReportLibrary.tsx']) {
      expect(fs.existsSync(path.join(CONCEPT2CURE, gone)), gone).toBe(false);
    }
    const files = sourceFiles(CLIENT);
    const naming = files.filter((f) => /\b(AnalyticsSurface|useAnalytics|AnalyticsReportLibrary)\b/.test(code(f)));
    expect(naming.map((f) => path.relative(CLIENT, f))).toEqual([]);
    const calling = files.filter((f) => code(f).includes('/api/mdx/analytics'));
    expect(calling.map((f) => path.relative(CLIENT, f))).toEqual([]);
    const router = code(path.join(REPO, 'server/routes/mdx-analytics.ts'));
    expect(router).not.toMatch(/router\.get\(\s*['"]\/analytics['"]/);
    expect(router).not.toMatch(/pace24m|kpis/);
    // No launch screen claims the old family, so the production gate refuses it
    // (launch-scope-device-features.test.ts asks the gate itself).
    const OLD = '/api/mdx/analytics';
    const covers = (prefix: string) => OLD === prefix || OLD.startsWith(`${prefix}/`) || prefix.startsWith(`${OLD}/`);
    expect(UI_SURFACES.filter((s) => isLaunchSurface(s.id))
      .flatMap((s) => s.apiPrefixes.filter(covers).map((p) => `${s.id} ${p}`))).toEqual([]);
  });

  it('is in neither project scope list, the rail, a focus list nor the group tables, and no tour stops there', () => {
    expect(LAUNCH_APPS.find((a) => a.id === 'projects')!.surfaces).not.toContain(ID);
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain(ID);
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain(ID);
    expect(SEGMENTS.flatMap((s) => s.focus ?? [])).not.toContain(ID);
    expect(Object.hasOwn(NAV_GROUP_OF, ID)).toBe(false);
    expect(NAV_HIDDEN.has(ID)).toBe(false);
    const steps = DEMO_SCRIPTS.flatMap((s) => s.steps);
    expect(steps.filter((s) => s.navigate?.target === ID)).toEqual([]);
  });
});
