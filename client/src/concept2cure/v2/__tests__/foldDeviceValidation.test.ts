/**
 * The organization-wide blocker list (device-validation) is retired, and stays
 * retired (D2, fold F5 item 2, 2026-10-29; decision P-61 item 2,
 * docs/LAUNCH_DEFINITION_OF_DONE.md; docs/design/DEVICE_FOLDS_2026-10-29.md F5;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/).
 *
 * `device-validation` was ValidationSurface in mdx/workbench/Workbench.tsx over
 * GET /api/submission-ops/blockers: the open c2c_blockers rows of every project,
 * with a low-severity blocker drawn as "Pass". The decision: no
 * organization-wide blocker list. A blocker belongs to a filing, from that
 * filing's deterministic readiness (EstarFilingPanel over POST
 * /api/510k/estar/filing-readiness, assessEstarFilingReadiness), and it is
 * closed by fixing it. The "Pass" is not carried.
 *
 * This pins the retirement from both ends:
 *   - the old id resolves to Submission Center through the alias, from a URL,
 *     an in-app move or AnA's kept target, with or without a project open;
 *     Submission Center lists every tracked device filing, and each filing's
 *     readiness is EstarFilingPanel's, mounted by the device pathway screens;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list
 *     it), no kit id, no host publish, no hook, no client call of the blockers
 *     list, and nothing on the client draws an open blocker as a pass;
 *   - neither project scope list names it, nor the rail, a focus list or the
 *     shell's group tables, and the guided tour does not stop there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { destinationFor, locationForSurface, surfaceIdFromLocation } from '../routing';
import { DEEP_LINK_ALIASES, NAV_GROUP_OF, NAV_HIDDEN, SEGMENT_MODULES, SEGMENTS, SURFACE_ACTIONS } from '../registryModel';
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
const read = (rel: string) => fs.readFileSync(path.join(CONCEPT2CURE, rel), 'utf8');
const ID = 'device-validation';

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

describe('device-validation is retired into each filing\'s own readiness', () => {
  it('resolves the old id to Submission Center from a link, an in-app move and AnA, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES[ID]).toBe('submission-center');
    expect(surfaceIdFromLocation(locationForSurface(ID))).toBe('submission-center');
    expect(surfaceIdFromLocation('/concept2cure/device-validation?sev=err')).toBe('submission-center');
    expect(destinationFor(ID, true).surfaceId).toBe('submission-center');
    expect(destinationFor(ID, false).surfaceId).toBe('submission-center');
    // AnA's handle is kept so an old conversation's move still lands.
    expect(findNavigationTarget(ID)).toBeDefined();
    expect(findNavigationTarget(ID)!.description).not.toMatch(/validation workbench/);
  });

  it('lands on Submission Center, which lists the tracked device filings; each filing\'s readiness is EstarFilingPanel\'s', () => {
    expect(SURFACE_VIEWS['submission-center']).toBeDefined();
    expect(getSurface('submission-center')).toBeDefined();
    expect(read('v2/surfaces/SubmissionCenter.tsx')).toContain("'/api/510k/estar/submissions'");
    // The readiness is the deterministic engine's, assessed for the open project.
    const panel = read('mdx/surfaces/EstarFilingPanel.tsx');
    expect(panel).toMatch(/assessFilingReadiness\(\{ catalogKey: key, variant, useProjectContent: true, programId \}\)/);
    for (const f of ['mdx/surfaces/K510Surface.tsx', 'mdx/surfaces/PmaSurface.tsx', 'mdx/surfaces/IvdSurface.tsx']) {
      expect(read(f), f).toMatch(/<EstarFilingPanel programId=/);
    }
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no kit id, no host publish', () => {
    expect(SURFACE_VIEWS[ID]).toBeUndefined();
    expect(getSurface(ID)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === ID)).toBe(false);
    expect(MDX_SURFACE_IDS as readonly string[]).not.toContain(ID);
    expect(SURFACE_ACTIONS[ID]).toBeUndefined();
    const host = code(path.join(CONCEPT2CURE, 'mdx/MdxSurfaceHost.tsx'));
    expect(host).not.toContain(`'${ID}'`);
    expect(host).not.toMatch(/\bValidationSurface\b/);
  });

  it('leaves no client code that lists the organization\'s blockers or names the retired screen', () => {
    expect(fs.existsSync(path.join(CONCEPT2CURE, 'mdx/hooks/useWorkbench.ts'))).toBe(false);
    const files = sourceFiles(CLIENT);
    // Code, not the notes that record what went and why.
    const naming = files.filter((f) => /\b(ValidationSurface|useWorkbenchValidation)\b/.test(code(f)));
    expect(naming.map((f) => path.relative(CLIENT, f))).toEqual([]);
    // The kit's shapes for it went too, the rule's "ok" severity (drawn as "Pass") with them.
    expect(code(path.join(CONCEPT2CURE, 'mdx/data/workbench.ts'))).not.toMatch(/interface Validation(Rule|Program|Summary)\b/);
    const calling = files.filter((f) => !/__tests__/.test(f) && code(f).includes('/api/submission-ops/blockers'));
    expect(calling.map((f) => path.relative(CLIENT, f))).toEqual([]);
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
    // The tour no longer says V&V evidence lands on a screen that read c2c_blockers.
    expect(steps.filter((s) => /validation center/i.test(s.say))).toEqual([]);
  });
});
