/**
 * The device submission-packages screen is folded into Submission Center, and
 * stays folded (D2, fold F5 item 1, 2026-10-30; decision P-61 item 1: one
 * device-filing store, estar_submissions; docs/design/DEVICE_FOLDS_2026-10-29.md
 * F5; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/).
 *
 * `device-submission` was SubmissionsSurface in mdx/workbench/Workbench.tsx over
 * /api/submission-ops/packages (c2c_submission_packages, whose creator is on no
 * deploy applier): every package of the organization, a package gate, a
 * milestone log. Submission Center lists the tracked device filings
 * (v2/surfaces/DeviceFilings.tsx), with a status filter, each draft filing's
 * gate from its own readiness, and each filing's history under its record
 * (TrackedFilingHistory.tsx); AnA's create_submission_package tracks a filing
 * there.
 *
 * This pins the fold from both ends:
 *   - the old id resolves to Submission Center through the alias, from a URL,
 *     an in-app move or AnA's kept target, with or without a project open;
 *   - Submission Center mounts the device filings card, which reads the filing
 *     store, each draft's gate and each filing's history;
 *   - the old screen is gone: no view, no registry entry (so ⌘K cannot list
 *     it), no kit id, no host publish, no file, and no client call of the
 *     package store;
 *   - neither project scope list names it, nor the rail, a focus list or the
 *     shell's group tables, and no guided tour stops there.
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
const ID = 'device-submission';

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

describe('device-submission is folded into Submission Center', () => {
  it('resolves the old id to Submission Center from a link, an in-app move and AnA, with or without a project open', () => {
    expect(DEEP_LINK_ALIASES[ID]).toBe('submission-center');
    expect(surfaceIdFromLocation(locationForSurface(ID))).toBe('submission-center');
    expect(surfaceIdFromLocation('/concept2cure/device-submission?status=active')).toBe('submission-center');
    expect(destinationFor(ID, true).surfaceId).toBe('submission-center');
    expect(destinationFor(ID, false).surfaceId).toBe('submission-center');
    expect(findNavigationTarget(ID)).toBeDefined();
    expect(findNavigationTarget(ID)!.description).not.toMatch(/packages workbench/);
  });

  it('lands on Submission Center, whose device filings card reads the filing store, each draft\'s gate and each filing\'s history', () => {
    expect(SURFACE_VIEWS['submission-center']).toBeDefined();
    const center = read('v2/surfaces/SubmissionCenter.tsx');
    expect(center).toContain("'/api/510k/estar/submissions'");
    expect(center).toMatch(/<DeviceFilingsCard\s/);
    const card = read('v2/surfaces/DeviceFilings.tsx');
    expect(card).toContain('/readiness`');
    expect(card).toMatch(/aria-label="Device filing status"/);
    expect(read('v2/surfaces/TrackedFilingHistory.tsx')).toContain('/events`');
    expect(center).toMatch(/<TrackedFilingHistory filingId=\{filingTarget\} \/>/);
    expect(getSurface('submission-center')!.apiPrefixes).toContain('/api/510k/estar/submissions');
  });

  it('keeps no screen of its own: no view, no registry entry for ⌘K, no kit id, no host publish, no file', () => {
    expect(SURFACE_VIEWS[ID]).toBeUndefined();
    expect(getSurface(ID)).toBeUndefined();
    expect(UI_SURFACES.some((s) => s.id === ID)).toBe(false);
    expect(MDX_SURFACE_IDS as readonly string[]).not.toContain(ID);
    expect(SURFACE_ACTIONS[ID]).toBeUndefined();
    const host = code(path.join(CONCEPT2CURE, 'mdx/MdxSurfaceHost.tsx'));
    expect(host).not.toContain(`'${ID}'`);
    expect(host).not.toMatch(/\bSubmissionsSurface\b/);
    for (const f of ['mdx/workbench/Workbench.tsx', 'mdx/hooks/useSubmissions.ts', 'mdx/data/workbench.ts']) {
      expect(fs.existsSync(path.join(CONCEPT2CURE, f)), f).toBe(false);
    }
  });

  it('leaves no client code that names the retired screen or reads the package store', () => {
    const files = sourceFiles(CLIENT);
    const naming = files.filter((f) => /\b(SubmissionsSurface|useSubmissions|useSubmissionDetail|SUBMISSION_PIPELINE)\b/.test(code(f)));
    expect(naming.map((f) => path.relative(CLIENT, f))).toEqual([]);
    const calling = files.filter((f) => !/__tests__/.test(f) && code(f).includes('/api/submission-ops/packages'));
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
    // The tours no longer promise pre-flight validation and a transmittal chain on a screen that sent nothing.
    expect(steps.filter((s) => /submission packages are/i.test(s.say))).toEqual([]);
  });
});
