/**
 * The IVD completeness screen is folded into device-diagnostics, and stays
 * folded (D2, fold F2, 2026-10-29; docs/design/DEVICE_FOLDS_2026-10-29.md F2;
 * docs/evidence/D2-ONE-ANA/2026-10-29/grant-continuity-and-f1c-f2/; drafted at
 * fold-f2-ivd-completeness/fold/red/).
 *
 * `ivd-completeness` was v2/surfaces/IvdCompleteness.tsx: the IVDR readiness
 * board (v2/surfaces/IvdReadinessBoard.tsx) and the IVD assessment workbench
 * (v2/surfaces/IvdAssessmentWorkbench.tsx), with the readiness published to
 * AnA. device-diagnostics (mdx/surfaces/IvdSurface.tsx, mounted by
 * mdx/MdxSurfaceHost.tsx) draws the same board and the same workbench for the
 * open project, and the host publishes the readiness under device-diagnostics.
 *
 * This pins the fold from both ends:
 *   - the old id resolves to device-diagnostics through the alias, from a URL
 *     or an in-app move, with or without a project open: never a 404, never
 *     its own screen;
 *   - device-diagnostics mounts the board and the workbench, the host hands it
 *     shell navigation (the workbench's working copy needs it) and merges the
 *     readiness into its one AnA publish, and it claims the IVD calls the old
 *     screen's entry claimed;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list
 *     it), no file, no client import of IvdCompleteness;
 *   - neither project scope list names it, nor the rail, nor a segment's focus
 *     list, and its AnA actions are registered on device-diagnostics.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, SEGMENT_MODULES, SEGMENTS, SURFACE_ACTIONS } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { MDX_SURFACE_IDS } from '../../mdx/surfaceIds';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_APPS } from '@shared/constants/launch-scope';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '@shared/constants/mdx-project-features';
import { findNavigationTarget } from '@shared/navigation';

const CLIENT = path.resolve(__dirname, '../../..');
const CONCEPT2CURE = path.join(CLIENT, 'concept2cure');
const SELF = path.resolve(__filename);
const read = (rel: string) => fs.readFileSync(path.join(CONCEPT2CURE, rel), 'utf8');
/* The tree is shared with other sessions; a file gone between listing and reading names nothing. */
const text = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

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

describe('ivd-completeness is folded into device-diagnostics', () => {
  it('resolves the old id to device-diagnostics from a link and an in-app move, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES['ivd-completeness']).toBe('device-diagnostics');
    expect(surfaceIdFromLocation(locationForSurface('ivd-completeness'))).toBe('device-diagnostics');
    expect(surfaceIdFromLocation('/concept2cure/ivd-completeness?family=gspr')).toBe('device-diagnostics');
    expect(destinationFor('ivd-completeness', true).surfaceId).toBe('device-diagnostics');
    expect(destinationFor('ivd-completeness', false).surfaceId).toBe('device-diagnostics');
    // AnA has no target of its own for the old screen; it reaches the IVDR workspace by this one.
    expect(findNavigationTarget('ivd-completeness')).toBeUndefined();
    expect(findNavigationTarget('device-diagnostics')).toBeDefined();
  });

  it('lands on device-diagnostics, which draws the readiness board and the workbench with shell navigation', () => {
    expect(SURFACE_VIEWS['device-diagnostics']).toBeDefined();
    expect(getSurface('device-diagnostics')).toBeDefined();
    expect(MDX_SURFACE_IDS as readonly string[]).toContain('device-diagnostics');
    const surface = read('mdx/surfaces/IvdSurface.tsx');
    expect(surface).toContain('<IvdReadinessBoard ');
    expect(surface).toMatch(/<IvdAssessmentWorkbench programId=\{String\(program\.id\)\} onNav=\{onNav\} \/>/);
    // Without onNav the workbench's "Create working copy for review and signing" is disabled.
    const host = read('mdx/MdxSurfaceHost.tsx');
    const mount = host.slice(host.indexOf("case 'device-diagnostics':"), host.indexOf("case 'device-clinical-studies':"));
    expect(mount).toMatch(/<IvdSurface[\s\S]*\bonNav=\{onNav\}[\s\S]*\/>/);
    // The readiness rides the host's one device-diagnostics publish (the store holds one context).
    expect(mount).toMatch(/\bonReadinessContext=\{setIvdReadiness\}/);
    expect(host).toContain("usePublishSurfaceContext('device-diagnostics', nav === 'device-diagnostics' ? diagnosticsContext : null)");
  });

  it('claims the IVD calls the old screen claimed', () => {
    const prefixes = getSurface('device-diagnostics')!.apiPrefixes;
    for (const p of ['/api/ivd-completeness', '/api/ivd-assessments', '/api/ivd-lifecycle', '/api/validate-completeness']) {
      expect(prefixes, p).toContain(p);
    }
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no file, no client import', () => {
    expect(SURFACE_VIEWS['ivd-completeness']).toBeUndefined();
    expect(getSurface('ivd-completeness')).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === 'ivd-completeness')).toBe(false);
    expect(fs.existsSync(path.join(CONCEPT2CURE, 'v2/surfaces/IvdCompleteness.tsx'))).toBe(false);
    const importing = sourceFiles(CLIENT).filter((f) =>
      /(?:from\s+|import\(\s*)['"][^'"]*\/IvdCompleteness['"]/.test(text(f)));
    expect(importing.map((f) => path.relative(CLIENT, f))).toEqual([]);
  });

  it('is in neither project scope list, the rail nor a focus list, and its AnA actions moved to device-diagnostics', () => {
    expect(LAUNCH_APPS.find((a) => a.id === 'projects')!.surfaces).not.toContain('ivd-completeness');
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain('ivd-completeness');
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain('ivd-completeness');
    expect(SEGMENTS.flatMap((s) => s.focus ?? [])).not.toContain('ivd-completeness');
    expect(SURFACE_ACTIONS['ivd-completeness']).toBeUndefined();
    expect(SURFACE_ACTIONS['device-diagnostics']).toContain('assess_filing_readiness');
  });
});
