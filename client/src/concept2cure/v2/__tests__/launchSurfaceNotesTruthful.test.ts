/**
 * Every launch surface's registry note describes what the screen does. ⌘K matches against it (Shell.tsx), and the
 * screens that list surfaces show it, so a note that reads as unfinished, or points at a design kit
 * ("See ui_kits/…"), is copy a client meets. The device screens were held to this in M11
 * (deviceScreensDescribeThemselvesTruly.test.ts), which handed on `projects`'s note; this holds every launch surface.
 */
import { describe, expect, it } from 'vitest';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { LAUNCH_SURFACE_IDS } from '@shared/constants/launch-scope';

/** check-catalog-copy.mjs's build-status rule and the removed sample mode, as in M11, plus a design-kit pointer. */
const UNFINISHED = /\b(in progress|no UI(?: yet)?|not yet (?:a|built|wired|prioriti[sz]ed)|partially built|dashboard only|kit-only|placeholder|coming soon|TODO|being assembled|sample[- ]mode)\b|\bui_kits\//i;

const launch = UI_SURFACES.filter((s) => LAUNCH_SURFACE_IDS.has(s.id));

describe('launch surfaces\' registry notes', () => {
  it('covers the launch surfaces', () => {
    expect(launch.map((s) => s.id)).toEqual(expect.arrayContaining(['projects', 'tasks', 'vault']));
  });

  it('none reads as unfinished or points at a design kit', () => {
    expect(launch.filter((s) => UNFINISHED.test(String(s.notes ?? ''))).map((s) => `${s.id}: ${s.notes}`)).toEqual([]);
  });
});
