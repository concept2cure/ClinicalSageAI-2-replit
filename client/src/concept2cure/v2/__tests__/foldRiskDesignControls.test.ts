/**
 * Risk management and Design controls are folded into Engineering evidence, and
 * stay folded (D2, fold F1c, 2026-10-29; docs/design/DEVICE_FOLDS_2026-10-29.md
 * F1; docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/).
 *
 * `risk` was v2/surfaces/Risk.tsx and `design-controls` v2/surfaces/DesignControls.tsx:
 * each a header over a shared panel (v2/surfaces/RiskRegister.tsx and
 * v2/surfaces/DesignControlsTrace.tsx, fold F1 slice B, 79d00b348), published to
 * AnA under its own id. device-engineering (mdx/surfaces/EngineeringSurface.tsx,
 * mounted by mdx/MdxSurfaceHost.tsx) mounts both panels for the open project,
 * and the host publishes their AnA context under device-engineering.
 *
 * This pins the fold from both ends:
 *   - both old ids resolve to device-engineering through the alias, from a URL
 *     or an in-app move; AnA's kept `risk` target opens it once a project is open;
 *   - device-engineering mounts both panels and claims both families of calls,
 *     and AnA's matrix actions are registered on it only;
 *   - the old screens are gone: no view, no registry entry (so ⌘K cannot list
 *     them), no file, no client import;
 *   - neither project scope list names them, nor the rail, a focus list or the
 *     shell's group tables, and the guided tours stop at device-engineering.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, NAV_GROUP_OF, NAV_HIDDEN, SEGMENT_MODULES, SEGMENTS, SURFACE_ACTIONS } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_APPS } from '@shared/constants/launch-scope';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '@shared/constants/mdx-project-features';
import { findNavigationTarget } from '@shared/navigation';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';
import { findSurfaceAction, resolveSurfaceAction, surfaceActionIds } from '@shared/navigation/surface-actions';

const CLIENT = path.resolve(__dirname, '../../..');
const CONCEPT2CURE = path.join(CLIENT, 'concept2cure');
const SELF = path.resolve(__filename);
const read = (rel: string) => fs.readFileSync(path.join(CONCEPT2CURE, rel), 'utf8');
const FOLDED = ['risk', 'design-controls'] as const;

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

describe('risk and design-controls are folded into device-engineering', () => {
  it('resolves both old ids to device-engineering from a link and an in-app move', () => {
    for (const id of FOLDED) {
      expect(DEEP_LINK_ALIASES[id], id).toBe('device-engineering');
      expect(surfaceIdFromLocation(locationForSurface(id)), id).toBe('device-engineering');
      expect(destinationFor(id, true).surfaceId, id).toBe('device-engineering');
    }
    expect(surfaceIdFromLocation('/concept2cure/risk?view=residual')).toBe('device-engineering');
    // AnA's `risk` target is kept, so an old conversation's move still lands; it
    // is a project target, so with no project open it asks for one first.
    expect(findNavigationTarget('risk')?.scope).toBe('project');
    expect(destinationFor('risk', false).surfaceId).toBe('projects');
    expect(findNavigationTarget('design-controls')).toBeUndefined();
    expect(destinationFor('design-controls', false).surfaceId).toBe('device-engineering');
  });

  it('lands on device-engineering, which mounts the risk register and the design-control trace', () => {
    expect(getSurface('device-engineering')).toBeDefined();
    const surface = read('mdx/surfaces/EngineeringSurface.tsx');
    expect(surface).toContain('<RiskRegister register={risk}');
    expect(surface).toContain('<DesignControlsTrace dc={designControls}');
    expect(surface).toMatch(/useRiskRegister\(\{ \.\.\.scoped, surfaceId: 'device-engineering' \}\)/);
    const host = read('mdx/MdxSurfaceHost.tsx');
    expect(host).toMatch(/<EngineeringSurface [^>]*onPanelsContext=\{setEngineeringPanels\}/);
    expect(host).toContain("usePublishSurfaceContext('device-engineering', nav === 'device-engineering' ? engineeringContext : null)");
  });

  it('claims both families of calls the panels make', () => {
    const prefixes = getSurface('device-engineering')!.apiPrefixes;
    expect(prefixes).toContain('/api/mdx/risk-items');
    expect(prefixes).toContain('/api/design-controls');
  });

  it("registers AnA's matrix actions on device-engineering only", () => {
    for (const a of ['set-matrix-view', 'select-hazard', 'focus-cell']) {
      expect(resolveSurfaceAction(`device-engineering.${a}`, a === 'set-matrix-view' ? { view: 'residual' } : { hazard: 'x', severity: 'Critical', probability: 'Occasional' }).ok, a).toBe(true);
      expect(findSurfaceAction(`risk.${a}`), `risk.${a}`).toBeUndefined();
    }
    expect(surfaceActionIds().filter((id) => id.startsWith('risk.') || id.startsWith('design-controls.') || id.startsWith('ivd-completeness.'))).toEqual([]);
    expect(SURFACE_ACTIONS.risk).toBeUndefined();
    expect(SURFACE_ACTIONS['design-controls']).toBeUndefined();
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no file, no client import', () => {
    for (const id of FOLDED) {
      expect(SURFACE_VIEWS[id], id).toBeUndefined();
      expect(getSurface(id), id).toBeUndefined();
      expect(UI_SURFACES.some((s) => s.id === id), id).toBe(false);
    }
    for (const f of ['v2/surfaces/Risk.tsx', 'v2/surfaces/DesignControls.tsx']) {
      expect(fs.existsSync(path.join(CONCEPT2CURE, f)), f).toBe(false);
    }
    const importing = sourceFiles(CLIENT).filter((f) =>
      /(?:from\s+|import\(\s*)['"][^'"]*\/(?:Risk|DesignControls)['"]/.test(text(f)));
    expect(importing.map((f) => path.relative(CLIENT, f))).toEqual([]);
  });

  it('is in neither project scope list, the rail, a focus list nor the group tables', () => {
    for (const id of FOLDED) {
      expect(LAUNCH_APPS.find((a) => a.id === 'projects')!.surfaces, id).not.toContain(id);
      expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[], id).not.toContain(id);
      const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
      expect(rail, id).not.toContain(id);
      expect(SEGMENTS.flatMap((s) => s.focus ?? []), id).not.toContain(id);
      expect(Object.hasOwn(NAV_GROUP_OF, id), id).toBe(false);
      expect(NAV_HIDDEN.has(id), id).toBe(false);
    }
  });

  it('the guided tours stop at device-engineering and drive its matrix', () => {
    const steps = DEMO_SCRIPTS.flatMap((s) => s.steps);
    expect(steps.filter((s) => s.navigate && (FOLDED as readonly string[]).includes(s.navigate.target))).toEqual([]);
    expect(steps.filter((s) => s.act?.actionId.startsWith('risk.'))).toEqual([]);
    const medtech = DEMO_SCRIPTS.find((s) => s.id === 'training-medtech')!.steps;
    expect(medtech.some((s) => s.act?.actionId === 'device-engineering.set-matrix-view')).toBe(true);
    expect(medtech.some((s) => s.act?.actionId === 'device-engineering.select-hazard')).toBe(true);
  });
});
