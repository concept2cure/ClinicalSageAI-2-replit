/**
 * What the registry and the device screens say about themselves is true
 * (MDX journey M11, `.design/client-journey/MDX_JOURNEY_2026-11-01.md`).
 *
 * The surface registry's `notes` are read by the screens that list surfaces
 * (Coverage, the project journeys' capability tooltips). Verified 2026-11-02:
 *   - `device-cer` said "Dashboard only today." Its Generator tab opens a
 *     section in the one editor and exports through the governed CER export.
 *   - `device-510k` said "In progress." It carries the predicate table, the SE
 *     matrix, the eSTAR section list, filing readiness, the draft package and
 *     the official eSTAR, and its sections open in the one editor.
 *   - `CerSurface.tsx` described kit fixtures "reachable only through the
 *     explicit sample-mode guard". Sample mode was removed from the MDX
 *     surfaces with every dataset it served (8067332317).
 * The build-status phrases are the ones `scripts/ci/check-catalog-copy.mjs`
 * forbids in the module catalog, which was seeded from these same notes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';

/** check-catalog-copy.mjs's build-status rule, and the removed sample mode. */
const UNFINISHED = /\b(in progress|no UI(?: yet)?|not yet (?:a|built|wired|prioriti[sz]ed)|partially built|dashboard only|kit-only|placeholder|coming soon|TODO|being assembled|sample[- ]mode)\b/i;

const deviceScreens = UI_SURFACES.filter((s) => s.id.startsWith('device-'));

describe('the device screens\' registry notes describe what the screens do', () => {
  it('covers the device screens', () => {
    expect(deviceScreens.map((s) => s.id)).toEqual(expect.arrayContaining(['device-510k', 'device-cer']));
  });

  it.each(deviceScreens.map((s) => [s.id, String(s.notes ?? '')] as const))(
    '%s says nothing that reads as unfinished',
    (_id, notes) => {
      expect(notes).not.toMatch(UNFINISHED);
    },
  );

  it('device-cer names the one editor and the governed export its Generator reaches', () => {
    const notes = String(UI_SURFACES.find((s) => s.id === 'device-cer')?.notes ?? '');
    expect(notes).toMatch(/one editor/);
    expect(notes).toMatch(/governed export/);
  });
});

describe('the CER screen describes no sample mode', () => {
  it('its header names no sample-mode guard', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../surfaces/CerSurface.tsx'), 'utf8');
    const header = source.slice(0, source.indexOf('*/'));
    expect(header).not.toMatch(UNFINISHED);
  });
});
