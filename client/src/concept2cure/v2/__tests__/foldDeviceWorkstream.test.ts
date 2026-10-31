/**
 * The device workstream (device-workstream) is folded into Projects, and stays
 * folded (D2, fold F6, 2026-10-30; decision P-61 item 5,
 * docs/LAUNCH_DEFINITION_OF_DONE.md; docs/design/DEVICE_FOLDS_2026-10-29.md F6;
 * docs/evidence/D2-ONE-ANA/2026-10-30/fold-f6-device-workstream/).
 *
 * `device-workstream` was the kit's portfolio, mdx/surfaces/Overview.tsx, which
 * the host drew from its `default:` branch. Its strip figures were computed in
 * the browser from a kit mapping of each program (blocked from a status
 * mapping, in flight from a stage index), not by any engine; the decision keeps
 * only figures computed from the project's own records, so they are dropped.
 * Projects already counts the device portfolio on the server (total, by
 * pathway, filing within 60 days) behind its MDX filter, and now shows each
 * project's last activity in both views. The Client Review Room, which the
 * portfolio drew for the whole organization, is mounted on the device project's
 * Review step for that project, through the room's admitted read.
 *
 * This pins the fold from both ends:
 *   - the old id resolves to Projects with the MDX filter, from a URL, an
 *     in-app move and AnA's kept target, and both device tours stop there;
 *   - the old screen is gone: no view, no registry entry, no kit id, no host
 *     publish, no portfolio branch in the host, no Overview;
 *   - neither project scope list names it, nor the rail, a focus list or the
 *     shell's group tables;
 *   - the room is reached from the project, which claims its read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { ALIAS_APPLIES, DEEP_LINK_ALIASES, NAV_GROUP_OF, NAV_HIDDEN, SEGMENT_MODULES, SEGMENTS, SURFACE_ACTIONS } from '../registryModel';
import { SURFACE_VIEWS } from '../surfaceViews';
import { MDX_SURFACE_IDS } from '../../mdx/surfaceIds';
import { getSurface, UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_APPS } from '@shared/constants/launch-scope';
import { MDX_PROJECT_FEATURE_SURFACE_IDS } from '@shared/constants/mdx-project-features';
import { findNavigationTarget } from '@shared/navigation';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';

const CLIENT = path.resolve(__dirname, '../../..');
const CONCEPT2CURE = path.join(CLIENT, 'concept2cure');
const SELF = path.resolve(__filename);
const ID = 'device-workstream';
const MDX_FILTER = { actionId: 'projects.filter', params: { workstream: 'MDX' } };

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && full !== SELF && !/\/__tests__\//.test(full)) {
      out.push(full);
    }
  }
  return out;
}
/* The tree is shared with other sessions; a file gone between listing and reading names nothing. */
const text = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const code = (f: string) => text(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const at = (rel: string) => path.join(CONCEPT2CURE, rel);

describe('device-workstream is folded into Projects', () => {
  it('resolves the old id to Projects with the MDX filter, from a link, an in-app move and AnA, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES[ID]).toBe('projects');
    expect(ALIAS_APPLIES[ID]).toEqual(MDX_FILTER);
    expect(surfaceIdFromLocation(locationForSurface(ID))).toBe('projects');
    expect(surfaceIdFromLocation('/concept2cure/device-workstream?view=list')).toBe('projects');
    expect(destinationFor(ID, true)).toEqual({ surfaceId: 'projects', applies: MDX_FILTER });
    expect(destinationFor(ID, false)).toEqual({ surfaceId: 'projects', applies: MDX_FILTER });
    // The same place the `mdx` alias already opens (A2.8).
    expect(destinationFor(ID, false)).toEqual(destinationFor('mdx', false));
    // AnA's handle is kept so an old conversation's move still lands, and says where.
    expect(findNavigationTarget(ID)!.description).toMatch(/Projects/);
    expect(findNavigationTarget(ID)!.description).not.toMatch(/portfolio health KPIs/);
  });

  it('keeps no screen of its own: no view, no registry entry, no kit id, no host publish and no portfolio in the host', () => {
    expect(SURFACE_VIEWS[ID]).toBeUndefined();
    expect(getSurface(ID)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === ID)).toBe(false);
    expect(MDX_SURFACE_IDS as readonly string[]).not.toContain(ID);
    expect(SURFACE_ACTIONS[ID]).toBeUndefined();
    expect(fs.existsSync(at('mdx/surfaces/Overview.tsx'))).toBe(false);
    const host = code(at('mdx/MdxSurfaceHost.tsx'));
    expect(host).not.toContain(`'${ID}'`);
    expect(host).not.toMatch(/\bOverview\b/);
    // No fallthrough draws anything: every id the host is given is a named case.
    expect(host).not.toMatch(/^\s*default:\s*$/m);
    // The kit's Overview only: the PDEV kit has an Overview of its own (pdev/surfaces/Overview.tsx), which stays.
    const kit = at('mdx') + path.sep;
    const naming = sourceFiles(CLIENT).filter((f) => {
      const c = code(f);
      return /mdx\/surfaces\/Overview['"]/.test(c) || (f.startsWith(kit) && /\bfrom ['"][^'"]*\/Overview['"]|<Overview\b/.test(c));
    });
    expect(naming.map((f) => path.relative(CLIENT, f))).toEqual([]);
  });

  it('is in neither project scope list, the rail, a focus list nor the group tables, and both device tours stop at filtered Projects', () => {
    expect(LAUNCH_APPS.find((a) => a.id === 'projects')!.surfaces).not.toContain(ID);
    expect(MDX_PROJECT_FEATURE_SURFACE_IDS as readonly string[]).not.toContain(ID);
    const rail = Object.values(SEGMENT_MODULES).flatMap((groups) => groups.flatMap((g) => g.items));
    expect(rail).not.toContain(ID);
    expect(SEGMENTS.flatMap((s) => s.focus ?? [])).not.toContain(ID);
    expect(SEGMENTS.map((s) => s.defaultSurface)).not.toContain(ID);
    expect(Object.hasOwn(NAV_GROUP_OF, ID)).toBe(false);
    expect(NAV_HIDDEN.has(ID)).toBe(false);
    const steps = DEMO_SCRIPTS.flatMap((s) => s.steps.map((step) => ({ script: s.id, step })));
    expect(steps.filter(({ step }) => step.navigate?.target === ID)).toEqual([]);
    // The two device tours (training and sales) opened on the kit portfolio; each now opens filtered Projects.
    for (const script of ['training-medtech', 'sales-medtech']) {
      const stops = steps.filter(({ script: id, step }) => id === script && step.navigate);
      expect(stops[0]?.step.navigate?.target, script).toBe('mdx');
      expect(stops[0]?.step.say, script).toMatch(/Projects, filtered to [a-z]+ device projects/);
      expect(steps.some(({ step }) => /device portfolio/i.test(step.say)), 'no stop names the retired portfolio').toBe(false);
    }
  });

  it('reaches the Client Review Room from the device project, for that project, and claims its read there', () => {
    const home = code(at('v2/surfaces/ProjectHome.tsx'));
    // Mounted on the Review step, with the program and the verified integer project.
    expect(home).toMatch(/stage === 'review'[\s\S]*?<ProjectClientReview programId=\{pid\} projectId=\{sharingProjectId\}/);
    const mount = code(at('v2/surfaces/ProjectClientReview.tsx'));
    expect(mount).toMatch(/import\(\s*'\.\.\/\.\.\/mdx\/ClientReviewRoom'\s*\)/);
    expect(mount).not.toMatch(/^\s*import\s+[^(]*['"][^'"]*mdx\//m);
    // The room is drawn from one place now, always for a project.
    const drawing = sourceFiles(CLIENT).filter((f) => /<ClientReviewZone\b/.test(code(f)));
    expect(drawing.map((f) => path.relative(CLIENT, f))).toEqual(['concept2cure/mdx/ClientReviewRoom.tsx']);
    expect(code(at('mdx/ClientReviewRoom.tsx'))).toMatch(/<ClientReviewZone projectId=\{projectId\} programId=\{programId\} \/>/);
    expect(getSurface('project-home')!.apiPrefixes).toContain('/api/mdx/client-review');
  });
});
