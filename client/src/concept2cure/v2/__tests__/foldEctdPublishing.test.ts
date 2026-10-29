/**
 * The eCTD publishing reference is folded into eCTD Compile, and stays folded
 * (D2, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-ectd-publishing/).
 *
 * `ectd-publishing` (PublishingCenter.tsx) was a read-only screen over three
 * GETs of server/routes/ectd-v4.ts: the spec versions, the controlled-
 * vocabulary listing and one v4.0 code list. Its code moved into eCTD Compile
 * (EctdCompileReference.tsx, and QualifiedSpecVersions in
 * EctdCompileDtdEvidence.tsx), which shows it beside the validation findings and
 * with no project open (ectdCompileReference.test.tsx).
 *
 * This pins the fold from both ends:
 *   - the old id resolves to eCTD Compile through an alias, from a URL, an
 *     in-app move or AnA's kept navigation target, with or without a project
 *     open: never a 404, never its own screen;
 *   - eCTD Compile shows the reference and claims exactly its two reads, not the
 *     retired screen's whole `/api/ectd`;
 *   - the three view-only actions are eCTD Compile's, and its handler map
 *     registers them;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list
 *     it), no inventory row, no component, no suites of its own;
 *   - it is in no launch scope list and no rail, and no tour stops on it;
 *   - no catalogue writer inserts or keeps it (the replay itself is pinned in
 *     tests/schema-contract/catalog-module-claims.contract.test.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, SEGMENT_MODULES } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { resolveSurfaceIdForTarget } from '../navParams';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { DEFERRED_CAPABILITY_INVENTORY } from '@shared/constants/deferred-capability-inventory';
import { LAUNCH_APPS, LAUNCH_MODULE_IDS, LAUNCH_SHELL_SURFACES, isLaunchSurface } from '@shared/constants/launch-scope';
import { findNavigationTarget } from '@shared/navigation';
import { SURFACE_ACTIONS, findSurfaceAction } from '@shared/navigation/surface-actions';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';

const ROOT = path.resolve(__dirname, '../../../../..');
const CLIENT = path.join(ROOT, 'client/src');
const SELF = path.resolve(__filename);
const RETIRED = 'ectd-publishing';
const TARGET = 'ectd-compile';
const CLAIMS = ['/api/ectd/controlled-vocab', '/api/ectd/qualification/spec-versions'];
const ACTIONS = ['ectd-compile.set-reference-version', 'ectd-compile.open-code-list', 'ectd-compile.filter-codes'];

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

describe('ectd-publishing is folded into eCTD Compile', () => {
  it("resolves ectd-publishing to eCTD Compile from a link, an in-app move and AnA's target, with or without a project open", () => {
    expect(DEEP_LINK_ALIASES[RETIRED]).toBe(TARGET);
    expect(surfaceIdFromLocation(locationForSurface(RETIRED))).toBe(TARGET);
    expect(surfaceIdFromLocation(`/concept2cure/${RETIRED}`)).toBe(TARGET);
    expect(destinationFor(RETIRED, true).surfaceId).toBe(TARGET);
    expect(destinationFor(RETIRED, false).surfaceId).toBe(TARGET);
    // AnA's target is kept, and it lands where the reference now is.
    expect(findNavigationTarget(RETIRED)).toBeDefined();
    expect(resolveSurfaceIdForTarget(RETIRED)).toBe(TARGET);
  });

  it('lands on eCTD Compile, which shows the reference and claims exactly its two reads', () => {
    expect(SURFACE_VIEWS[TARGET]).toBeDefined();
    const prefixes = getSurface(TARGET)?.apiPrefixes ?? [];
    for (const claim of CLAIMS) expect(prefixes, claim).toContain(claim);
    // Not the retired screen's whole namespace: /api/ectd/v4 and the rest stay refused at launch.
    expect(prefixes).not.toContain('/api/ectd');
    const compile = code(path.join(CLIENT, 'concept2cure/v2/surfaces/EctdCompile.tsx'));
    expect(compile).toMatch(/useEctdReference\(COMPILED_ECTD_VERSION, COMPILED_ECTD_VERSION\)/);
    expect(compile.match(/<EctdReferenceCards reference=\{reference\} \/>/g)).toHaveLength(2);
    expect(code(path.join(CLIENT, 'concept2cure/v2/surfaces/EctdCompileReference.tsx'))).toContain(`'${CLAIMS[1]}'`);
  });

  it("the three view-only actions are eCTD Compile's, registered by its handler map, and none is left on the retired id", () => {
    expect(SURFACE_ACTIONS.filter((a) => a.surfaceId === RETIRED || a.id.startsWith(`${RETIRED}.`))).toEqual([]);
    const compile = code(path.join(CLIENT, 'concept2cure/v2/surfaces/EctdCompile.tsx'));
    for (const id of ACTIONS) {
      expect(findSurfaceAction(id)?.surfaceId, id).toBe(TARGET);
      expect(compile, id).toContain(`'${id}'`);
    }
    expect(compile).toMatch(/\.\.\.ectdReferenceActionHandlers\(reference, \{/);
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no inventory row, no component, no suites', () => {
    expect(SURFACE_VIEWS[RETIRED]).toBeUndefined();
    expect(getSurface(RETIRED)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === RETIRED)).toBe(false);
    expect(DEFERRED_CAPABILITY_INVENTORY.some((e) => e.surfaceId === RETIRED)).toBe(false);
    expect(naming(/\bPublishingCenter\b/)).toEqual([]);
    for (const gone of [
      'client/src/concept2cure/v2/surfaces/PublishingCenter.tsx',
      'client/src/concept2cure/v2/__tests__/publishingCenterHonestReads.test.tsx',
      'client/src/concept2cure/v2/__tests__/publishingCenterSpecLabels.test.tsx',
    ]) expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
  });

  it('is in no launch scope list and no rail, and no tour stops on it', () => {
    expect(Object.keys(LAUNCH_SHELL_SURFACES)).not.toContain(RETIRED);
    expect(isLaunchSurface(RETIRED)).toBe(false);
    expect(LAUNCH_MODULE_IDS as readonly string[]).not.toContain(RETIRED);
    const submit = LAUNCH_APPS.find((a) => a.id === 'submission-center')!;
    expect(submit.surfaces).toContain(TARGET);
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain(RETIRED);
    const stops = DEMO_SCRIPTS.flatMap((d) => d.steps.flatMap((s) => (s.navigate ? [s.navigate.target] : [])));
    expect(stops).not.toContain(RETIRED);
  });

  it("no catalogue writer keeps it: not inserted by 20260814j, off 20260810's keep-list and heal step, off 20260823's packaging", () => {
    expect(sql('migrations/20260814j_catalog_missing_product_surfaces.sql')).not.toContain(`'${RETIRED}'`);
    const reconcile = sql('db/migrations/20260810_reconcile_module_catalog.sql');
    const keepList = reconcile.match(/WHERE module_id NOT IN \(([\s\S]*?)\);/)?.[1] ?? '';
    expect(keepList).toContain(`'${TARGET}'`);
    expect(keepList).not.toContain(`'${RETIRED}'`);
    // The heal step cleared step 1's deprecation for this row alone; nothing may clear it now.
    expect(reconcile).not.toMatch(/-\s*'deprecated'\)::json[\s\S]*?WHERE module_id IN \('ectd-publishing'\)/);
    expect(reconcile).not.toContain(`'${RETIRED}'`);
    expect(sql('db/migrations/20260823_module_catalog_commercial_packaging.sql')).not.toContain(`'${RETIRED}'`);
  });
});
