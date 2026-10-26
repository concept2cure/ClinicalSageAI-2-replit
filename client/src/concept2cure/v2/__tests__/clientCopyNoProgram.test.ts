/**
 * Decision 12 of docs/design/CLIENT_JOURNEY_2026-10-25.md: one word, "project", for one regulatory
 * application across its life. "Program" leaves the text a client reads.
 *
 * These shared constants reach the screen or AnA's words with no client file in between:
 *   - NAVIGATION_TARGETS labels and descriptions: the `@` menu and AnA's list_app_screens;
 *   - SURFACE_ACTIONS labels and descriptions: AnA's action chips and list_screen_actions;
 *   - SLASH_COMMAND_SUMMARIES: the composer's `/` menu;
 *   - DISCOVERY_OPTIONS labels: onboarding's questions;
 *   - NOTIFICATION_CATEGORY_LABELS: notification preferences;
 *   - DEMO_SCRIPTS descriptions and `say` lines: what AnA narrates on a tour;
 *   - the plan-of-work catalogues' phase names (services/regulatory/pyramids): Plan's "{n}. {phase name}" and
 *     AnA's get_document_section_requirements read the IND's, served by the server with no client copy.
 * No test pinned any of them, so the sweep that changed them (wording-sweep-2 evidence) would not
 * have been noticed coming back. Ids, keys and values are not scanned: `projects.open-program` and
 * `intelligenceTab` are identifiers, not copy.
 *
 * A target or action is scanned when the screen it opens is in the release, resolved the way the
 * shell resolves it (DEEP_LINK_ALIASES): the `@` menu offers only those, and AnA is told the others
 * are locked. A surface outside the release gets its words when its slice places it. The one exception is the
 * phase names of every plan-of-work catalogue, not only the IND's: the NDA, BLA and PMA catalogues named the same
 * phase 1 "Program Planning" as the IND, and Plan reads them once it projects them (section 11 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md), so one phase keeps one name now.
 *
 * A regulatory or industry name that contains the word stays (FDA's Q-Submission Program, an
 * expedited or pediatric programme, a stability programme, a qualification programme), and so does
 * "Program management", the name of a service line a consultancy offers.
 */
import { describe, expect, it } from 'vitest';

import { NAVIGATION_TARGETS } from '@shared/navigation/index';
import { SURFACE_ACTIONS } from '@shared/navigation/surface-actions';
import { DEMO_SCRIPTS } from '@shared/navigation/demo-scripts';
import { SLASH_COMMAND_SUMMARIES } from '@shared/ana/slash-commands';
import { DISCOVERY_OPTIONS } from '@shared/types/onboarding-discovery';
import { NOTIFICATION_CATEGORY_LABELS } from '@shared/constants/notifications';
import { LAUNCH_SHELL_SURFACES, LAUNCH_SURFACE_IDS } from '@shared/constants/launch-scope';
import { locationForSurface, surfaceIdFromLocation } from '../routing';
import { getAllSupportedTypes, getPyramidForProject } from '../../../../../services/regulatory/SubmissionPyramidEngine';

/** Whether the screen a navigation id opens is one a client can reach in this release. */
function reachable(targetId: string): boolean {
  const surface = surfaceIdFromLocation(locationForSurface(targetId));
  return surface === 'home' || LAUNCH_SURFACE_IDS.has(surface) || surface in LAUNCH_SHELL_SURFACES;
}

const WORD = /\bprogram(me)?s?\b/i;
const DOMAIN_TERMS = /Q-Sub(mission)? Program|expedited programs?|pediatric (study )?programs?|stability programs?|Qualification Program|Program management/i;

function offending(entries: Array<[string, string | undefined]>): string[] {
  return entries
    .filter(([, text]) => typeof text === 'string' && WORD.test(text.replace(new RegExp(DOMAIN_TERMS.source, 'gi'), '')))
    .map(([where, text]) => `${where}: ${text}`);
}

describe('shared copy a client reads says "project", not "program"', () => {
  it('navigation targets', () => {
    expect(offending(NAVIGATION_TARGETS.filter((t) => reachable(t.id)).flatMap((t) => [
      [`${t.id}.label`, t.label] as [string, string],
      [`${t.id}.description`, t.description] as [string, string],
    ]))).toEqual([]);
  });

  it('screen actions', () => {
    expect(offending(SURFACE_ACTIONS.filter((a) => reachable(a.surfaceId)).flatMap((a) => [
      [`${a.id}.label`, a.label] as [string, string],
      [`${a.id}.description`, a.description] as [string, string],
    ]))).toEqual([]);
  });

  it('slash commands, onboarding answers and notification preferences', () => {
    expect(offending([
      ...Object.entries(SLASH_COMMAND_SUMMARIES).map(([k, v]) => [`/${k}`, v] as [string, string]),
      ...Object.entries(DISCOVERY_OPTIONS).flatMap(([field, opts]) =>
        (opts as ReadonlyArray<{ value: string; label: string }>).map((o) => [`${field}.${o.value}`, o.label] as [string, string])),
      ...Object.entries(NOTIFICATION_CATEGORY_LABELS).map(([k, v]) => [k, v] as [string, string]),
    ])).toEqual([]);
  });

  it('demonstration scripts: what AnA is told to say', () => {
    expect(offending(DEMO_SCRIPTS.flatMap((d) => [
      [`${d.id}.description`, d.description] as [string, string],
      ...d.steps.map((s, i) => [`${d.id}[${i}].say`, s.say] as [string, string]),
    ]))).toEqual([]);
  });

  /* Slice A.1: phase 1 of the IND, NDA, BLA and PMA catalogues read "Program Planning" until 2026-10-26. */
  it("the plan-of-work catalogues' phase names", () => {
    expect(offending(getAllSupportedTypes().flatMap((type) => getPyramidForProject(type).phases.map((p) =>
      [`${type}.${p.id}`, p.name] as [string, string])))).toEqual([]);
  });
});
