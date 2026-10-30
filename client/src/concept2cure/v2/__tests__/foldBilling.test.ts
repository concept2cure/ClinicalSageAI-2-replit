/**
 * Billing is folded into Licensing, and stays folded (D2, 2026-10-29, Part 2;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/).
 *
 * `billing` was the second id of UsageBilling.tsx, opening its Billing tab.
 * Part 1 moved that tab's invoice list to Licensing under the plan status
 * (LicensingInvoices.tsx, for billing administrators) and Part 1b gated
 * checkout and the billing portal the same way. Usage, the weekly caps and the
 * rate limits stay on `usage`. Decision P-68 gives a billing administrator one
 * account-menu entry, "Subscription & billing", opening Licensing
 * (accountMenuBilling.test.tsx).
 *
 * This pins the fold from both ends:
 *   - the old id resolves to Licensing through an alias, from a URL, an in-app
 *     move or AnA's kept navigation target, with or without a project open;
 *   - Licensing mounts the invoice list and claims every billing route;
 *   - the old id is gone: no view, no registry entry (so ⌘K cannot list it), no
 *     publisher of its own AnA context, no surface action, and `usage.open-tab`
 *     no longer offers a billing tab;
 *   - it is in no launch scope list, rail group or CI list, no tour stops on it,
 *     no catalogue writer names it, and Stripe's default return addresses do
 *     not send a customer to it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, NAV_GROUP_OF, NAV_HIDDEN, SEGMENT_MODULES } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { resolveSurfaceIdForTarget } from '../navParams';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_MODULE_IDS, LAUNCH_SHELL_SURFACES, isLaunchSurface } from '@shared/constants/launch-scope';
import { findNavigationTarget } from '@shared/navigation';
import { SURFACE_ACTIONS, findSurfaceAction, resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';

const ROOT = path.resolve(__dirname, '../../../../..');
const CLIENT = path.join(ROOT, 'client/src');
const SELF = path.resolve(__filename);
const RETIRED = 'billing';
const TARGET = 'licensing';

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
/** The code of a file, without its comments: a note that a screen retired names it, and is not a use. */
const code = (f: string) =>
  fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const naming = (pattern: RegExp) =>
  sourceFiles(CLIENT).filter((f) => pattern.test(code(f))).map((f) => path.relative(ROOT, f));
const sql = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/--.*$/gm, '');

describe('billing is folded into Licensing', () => {
  it("resolves billing to Licensing from a link, an in-app move and AnA's target, with or without a project open", () => {
    expect(DEEP_LINK_ALIASES[RETIRED]).toBe(TARGET);
    expect(surfaceIdFromLocation(locationForSurface(RETIRED))).toBe(TARGET);
    expect(surfaceIdFromLocation(`/concept2cure/${RETIRED}`)).toBe(TARGET);
    expect(destinationFor(RETIRED, true).surfaceId).toBe(TARGET);
    expect(destinationFor(RETIRED, false).surfaceId).toBe(TARGET);
    // AnA's target is kept, and it lands where the invoices now are.
    expect(findNavigationTarget(RETIRED)).toBeDefined();
    expect(resolveSurfaceIdForTarget(RETIRED)).toBe(TARGET);
  });

  it('lands on Licensing, which mounts the invoice list and claims every billing route', () => {
    expect(SURFACE_VIEWS[TARGET]).toBeDefined();
    const licensing = code(path.join(CLIENT, 'concept2cure/v2/surfaces/LicensingSurface.tsx'));
    expect(licensing).toMatch(/<LicensingInvoices invoices=\{invoices\} \/>/);
    expect(getSurface(TARGET)?.apiPrefixes ?? []).toContain('/api/billing');
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no AnA publisher, no action, no billing tab', () => {
    expect(SURFACE_VIEWS[RETIRED]).toBeUndefined();
    expect(getSurface(RETIRED)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === RETIRED)).toBe(false);
    expect(naming(/usePublishSurfaceContext\(\s*['"]billing['"]/)).toEqual([]);
    expect(naming(/useSurfaceActionHandlers\([^)]*['"]billing['"]/)).toEqual([]);
    expect(SURFACE_ACTIONS.filter((a) => a.surfaceId === RETIRED || a.id.startsWith(`${RETIRED}.`))).toEqual([]);
    // The usage screen's tab action offers the two tabs it has, and refuses the one it lost.
    expect(findSurfaceAction('usage.open-tab')?.params?.find((p) => p.name === 'tab')?.enum).toEqual(['usage', 'limits']);
    expect(resolveSurfaceAction('usage.open-tab', { tab: 'billing' }).ok).toBe(false);
    expect(resolveSurfaceAction('usage.open-tab', { tab: 'limits' }).ok).toBe(true);
  });

  it('is in no launch scope list, rail group or CI list, and no tour stops on it; Licensing and usage stay', () => {
    expect(Object.keys(LAUNCH_SHELL_SURFACES)).not.toContain(RETIRED);
    expect(isLaunchSurface(RETIRED)).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain(RETIRED);
    expect(LAUNCH_SHELL_SURFACES[TARGET]).toBeDefined();
    expect(LAUNCH_SHELL_SURFACES.usage).toBeDefined();
    expect(NAV_GROUP_OF[RETIRED]).toBeUndefined();
    expect(NAV_HIDDEN.has(RETIRED)).toBe(false);
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain(RETIRED);
    const stops = DEMO_SCRIPTS.flatMap((d) => d.steps.flatMap((s) => (s.navigate ? [s.navigate.target] : [])));
    expect(stops).not.toContain(RETIRED);
    const discoverability = fs.readFileSync(path.join(ROOT, 'scripts/ci/check-surface-discoverability.mjs'), 'utf8');
    expect(discoverability).not.toMatch(/^\s*billing:/m);
  });

  it('no catalogue writer names it, and Stripe does not return a customer to it', () => {
    for (const f of [
      'migrations/20260814j_catalog_missing_product_surfaces.sql',
      'db/migrations/20260810_reconcile_module_catalog.sql',
      'db/migrations/20260823_module_catalog_commercial_packaging.sql',
    ]) expect(sql(f), f).not.toContain(`'${RETIRED}'`);
    const routes = code(path.join(ROOT, 'server/routes/billing.ts'));
    expect(routes).not.toMatch(/\/concept2cure\/billing\b/);
    expect(routes).toMatch(/\/concept2cure\/licensing\?checkout=success/);
  });
});
